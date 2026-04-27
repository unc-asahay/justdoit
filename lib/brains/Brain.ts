// The Brain class — one instance per autonomous Brain on the canvas.
// Owns event subscriptions, the heartbeat ticker, and the act() plumbing.

import * as Y from 'yjs';
import type { BrainSpec, BrainEvent, CanvasOp, Point, Zone, BrainState, BrainTask } from './types';
import type { AIConnection } from '@/lib/ai/providers';
import { EventBus, makeEvent } from './events';
import { applyOps, createBubble, moveCursor, setState, getToolsMap, getNodesMap, getBrainsMap, listReadyTasks, listTasksForBrain } from './canvas-ops';
import { callBrainLLM } from './llm';
import { log } from './log';
import { executeOpsPaced } from './executor';
import { buildAgentContext, formatContextPrompt, storeAgentResponse, getPalace } from '@/lib/memory';

// Module-level throttle: only one Brain may have a heartbeat-driven LLM call
// in flight at once, and successive heartbeats are spaced by this floor. Stops
// N Brains all bursting their tickers at the same moment and turns "every Brain
// runs every 3 minutes" into a smoothly round-robined background pulse.
const HEARTBEAT_GLOBAL_FLOOR_MS = 25_000;
let _lastHeartbeatAt = 0;
let _heartbeatInFlight = false;

export interface BrainDeps {
  ydoc: Y.Doc;
  eventBus: EventBus;
  initialCursor: Point;
  initialZone: Zone;
  getConnection?: () => AIConnection | null;
  // Slug used as the MemPalace project key so each canvas's Brains share
  // their own memory store. Optional — falls back to "default".
  getProjectSlug?: () => string;
}

export class Brain {
  public readonly id: string;
  public readonly spec: BrainSpec;
  private unsubs: Array<() => void> = [];
  private disposed = false;
  private currentZone: Zone;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  // Real user input never gets dropped silently. While the Brain is mid-cycle
  // (heartbeat or prior prompt), incoming user_prompt events are buffered and
  // drained after the current cycle releases the busy flag.
  private pendingUserEvents: BrainEvent[] = [];
  // Stable hash of the b_nodes map at the last heartbeat-completion. If the
  // hash is unchanged when the next heartbeat fires, we skip the LLM call —
  // there's nothing new to react to. Saves the bulk of background tokens.
  private lastHeartbeatCanvasHash: string = '';

  constructor(spec: BrainSpec, private deps: BrainDeps) {
    this.id = spec.id;
    this.spec = spec;
    this.currentZone = deps.initialZone;
  }

  init(): void {
    if (this.disposed) return;

    // Subscribe to ALL canvas events — Brains see the whole canvas, not just
    // their zone. Zoning is now only a placement hint, not an event gate.
    // The team-collaboration model wins: every Brain sees every event and
    // decides itself whether to act (Lead orchestrates, peers respond when
    // addressed via peer_message, specialists chime in on relevant prompts).
    this.unsubs.push(
      this.deps.eventBus.subscribe(
        {
          types: [
            'user_prompt', 'user_note', 'user_edit', 'peer_message',
            'neighbor_activity', 'question_asked', 'heartbeat_tick',
            'task_assigned', 'task_unblocked', 'task_completed',
          ],
          authorNot: this.id,
        },
        (event) => this.onEvent(event),
      ),
    );

    this.scheduleHeartbeat();
  }

  // ─── Heartbeat (Tier-3) ─────────────────────────────────────────────────
  // Periodically wakes the Brain so it can patrol/refine its zone instead of
  // sitting idle. Skips when the Brain is busy or no AI connection exists.
  // Each tick re-publishes a heartbeat_tick event for self, so the same
  // event-handling path runs as for any other wake.
  private scheduleHeartbeat(): void {
    if (this.disposed) return;
    const interval = this.spec.heartbeatIntervalMs;
    if (!interval || interval <= 0) return;
    // Add 0..30s jitter so multiple Brains don't fire on the same tick.
    const jitter = Math.floor(Math.random() * 30_000);
    this.heartbeatTimer = setTimeout(() => this.fireHeartbeat(), interval + jitter);
  }

  // Cheap canvas-state hash — counts of node types + total + a rolling sum of
  // node ids' last char codes. Not cryptographic; just enough to detect
  // "anything changed since last heartbeat".
  private canvasHash(): string {
    const map = getNodesMap(this.deps.ydoc);
    let total = 0, rects = 0, shapes = 0, arrows = 0, idsig = 0;
    for (const [id, n] of map.entries()) {
      total++;
      if (n.type === 'rect') rects++;
      else if (n.type === 'customShape') shapes++;
      else if (n.type === 'arrow') arrows++;
      // Sample first + last char codes for a tiny content signal — catches
      // adds/deletes/renames cheaply.
      idsig = (idsig + id.charCodeAt(0) + id.charCodeAt(id.length - 1)) | 0;
    }
    return `${total}.${rects}.${shapes}.${arrows}.${idsig}`;
  }

  private fireHeartbeat(): void {
    if (this.disposed) return;
    const now = Date.now();
    const conn = this.deps.getConnection?.();
    // Skip the LLM call entirely when the canvas hasn't changed since the
    // last heartbeat — there's nothing new for the Brain to assess. Saves
    // the bulk of ambient tokens. New brains (empty hash) get one free pass
    // so they can introduce themselves.
    const currentHash = this.canvasHash();
    const canvasUnchanged = this.lastHeartbeatCanvasHash !== '' && this.lastHeartbeatCanvasHash === currentHash;
    const skipReason =
      this.busy ? 'busy' :
      !conn ? 'no_connection' :
      _heartbeatInFlight ? 'global_in_flight' :
      now - _lastHeartbeatAt < HEARTBEAT_GLOBAL_FLOOR_MS ? 'global_floor' :
      canvasUnchanged ? 'canvas_unchanged' :
      null;

    if (skipReason) {
      log({ level: 'debug', kind: 'heartbeat_skip', brainId: this.id, message: `heartbeat skipped: ${skipReason}` });
    } else {
      _lastHeartbeatAt = now;
      this.lastHeartbeatCanvasHash = currentHash;
      this.deps.eventBus.publish(makeEvent(
        'heartbeat_tick',
        { reason: 'tick' },
        { authorId: 'system', targetBrainId: this.id },
      ));
    }

    this.scheduleHeartbeat();
  }

  private async onEvent(event: BrainEvent): Promise<void> {
    // Ignore peer_message not addressed to me.
    if (event.type === 'peer_message' && event.targetBrainId && event.targetBrainId !== this.id) return;
    // Heartbeats from other Brains' ticks fan out to everyone via the bus
    // because EventFilter has no `authorIs` matcher. Drop ones not aimed at me.
    if (event.type === 'heartbeat_tick' && event.targetBrainId && event.targetBrainId !== this.id) return;
    // task_assigned and task_unblocked carry targetBrainId; drop if not me.
    if ((event.type === 'task_assigned' || event.type === 'task_unblocked')
        && event.targetBrainId && event.targetBrainId !== this.id) return;
    // task_completed is informational broadcast; only act if I have a ready
    // task that depended on the completed one (handled later via context).
    // For now suppress those waking the LLM unless this Brain has work pending.
    if (event.type === 'task_completed') {
      const ready = listReadyTasks(this.deps.ydoc, { forBrainId: this.id, forCapabilities: this.spec.capabilities });
      if (ready.length === 0) return;
    }
    // user_prompt audience pre-routing — submitToBrains attaches an audience
    // array of relevant brain ids based on TEMPLATE_TRIGGERS regex. Brains
    // outside the audience skip the event entirely (saves the wasted "decide
    // to be silent" LLM call). Empty/missing audience = all hear it.
    if (event.type === 'user_prompt' && Array.isArray(event.payload?.audience)) {
      const audience = event.payload.audience as string[];
      if (audience.length > 0 && !audience.includes(this.id)) return;
    }

    if (this.busy) {
      // Heartbeats are background work; safe to drop silently.
      // user_prompt and user_edit are real intent — buffer them so they run
      // as soon as the current cycle finishes.
      if (event.type === 'user_prompt' || event.type === 'user_edit' || event.type === 'user_note') {
        this.pendingUserEvents.push(event);
        log({ level: 'info', kind: 'wake', brainId: this.id, message: `queued ${event.type} — busy, will run after current cycle` });
      } else {
        log({ level: 'debug', kind: 'wake', brainId: this.id, message: `dropped ${event.type} — already busy` });
      }
      return;
    }
    this.busy = true;
    const isHeartbeat = event.type === 'heartbeat_tick';
    if (isHeartbeat) _heartbeatInFlight = true;
    log({ level: 'info', kind: 'wake', brainId: this.id, message: `woke on ${event.type}`, data: { eventType: event.type, payload: event.payload } });

    this.setState('listening');
    try {
      this.setState('thinking');
      const ops = await this.think(event);
      if (ops.length > 0) {
        this.setState('acting');
        await executeOpsPaced(this.deps.ydoc, this.id, ops, undefined, this.deps.eventBus);
        log({ level: 'info', kind: 'op_applied', brainId: this.id, message: `applied ${ops.length} ops`, data: { count: ops.length, kinds: ops.map(o => o.op) } });
      }
      if (event.type === 'user_prompt') {
        // Step the cursor off whatever flow the Brain just drew so the next
        // prompt doesn't see the Brain sitting on top of its own diagram.
        this.parkCursor();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Brain:${this.id}] think error:`, err);
      log({ level: 'error', kind: 'error', brainId: this.id, message: `think threw: ${msg}` });
    } finally {
      this.setState('idle');
      this.busy = false;
      if (isHeartbeat) _heartbeatInFlight = false;
      // Drain any user input queued while we were busy. Process one and let
      // it re-enter onEvent normally so any further queueing still works.
      if (this.pendingUserEvents.length > 0 && !this.disposed) {
        const next = this.pendingUserEvents.shift()!;
        // Microtask defer so the busy-flag release commits before the
        // recursive onEvent re-acquires it.
        Promise.resolve().then(() => this.onEvent(next));
      }
    }
  }

  // Compact text summary of what's currently in this Brain's zone, so the LLM
  // knows what's there before deciding whether to refine, connect, or skip.
  // Includes a small occupancy grid so the Brain can pick free regions when
  // placing new content instead of overlapping existing nodes.
  private summarizeZone(): string {
    const z = this.currentZone;
    const nodes = Array.from(getNodesMap(this.deps.ydoc).values());
    const brains = Array.from(getBrainsMap(this.deps.ydoc).values()).filter(b => !b.retiredAt && b.id !== this.id);

    const inZone = (x: number, y: number) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;

    const lines: string[] = [];
    lines.push(`Your zone: x=${z.x}..${z.x + z.w}, y=${z.y}..${z.y + z.h}`);
    lines.push(`Your cursor: (${Math.round((this.deps.initialCursor?.x ?? z.x))}, ${Math.round((this.deps.initialCursor?.y ?? z.y))})`);

    const idsByLabel: string[] = [];
    let nodeCount = 0;
    // Occupancy grid: 4 cols × 3 rows over the zone. Each cell tracks how
    // much of its area is covered by node bounds. Used to print a textual
    // "free regions" map below.
    const COLS = 4, ROWS = 3;
    const cellW = z.w / COLS;
    const cellH = z.h / ROWS;
    const occupancy: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

    for (const n of nodes) {
      let x: number, y: number, w = 0, h = 0, label: string | undefined;
      if (n.type === 'rect' || n.type === 'customShape' || n.type === 'image' || n.type === 'sticky') {
        x = n.x; y = n.y;
        w = (n as { w: number }).w; h = (n as { h: number }).h;
        label = (n as { label?: string }).label;
      } else if (n.type === 'arrow') {
        idsByLabel.push(`arrow ${n.fromNodeId} → ${n.toNodeId}${n.label ? ` "${n.label}"` : ''}`);
        continue;
      } else continue;
      if (!inZone(x, y)) continue;
      nodeCount++;
      if (nodeCount <= 12) {
        idsByLabel.push(`${n.type} id=${n.id} ${label ? `"${label}"` : ''} at (${Math.round(x)}, ${Math.round(y)}) ${Math.round(w)}×${Math.round(h)}`);
      }
      // Mark every grid cell the node touches.
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const cx = z.x + c * cellW;
          const cy = z.y + r * cellH;
          const ix = Math.max(0, Math.min(x + w, cx + cellW) - Math.max(x, cx));
          const iy = Math.max(0, Math.min(y + h, cy + cellH) - Math.max(y, cy));
          occupancy[r][c] += ix * iy;
        }
      }
    }

    if (nodeCount === 0) lines.push('Nodes in your zone: (none)');
    else {
      lines.push(`Nodes in your zone (${nodeCount}):`);
      lines.push(...idsByLabel.map(s => `  - ${s}`));
    }

    // Render the occupancy grid as ASCII. ` ` = free, `.` = sparse, `#` =
    // crowded. Plus an explicit list of "best free regions" with coords so
    // the Brain can pick a target without doing geometry itself.
    const cellArea = cellW * cellH;
    const freeCells: Array<{ r: number; c: number; load: number; cx: number; cy: number }> = [];
    const gridLines: string[] = [];
    for (let r = 0; r < ROWS; r++) {
      let row = '  ';
      for (let c = 0; c < COLS; c++) {
        const load = occupancy[r][c] / cellArea;
        row += load > 0.4 ? '##' : load > 0.05 ? '..' : '  ';
        freeCells.push({
          r, c, load,
          cx: Math.round(z.x + (c + 0.5) * cellW),
          cy: Math.round(z.y + (r + 0.5) * cellH),
        });
      }
      gridLines.push(row);
    }
    lines.push('Occupancy grid (## crowded, .. sparse, blank free):');
    lines.push(...gridLines);

    const empties = freeCells.filter(c => c.load < 0.05).slice(0, 4);
    if (empties.length > 0) {
      lines.push(`Free regions you can place new shapes in:`);
      for (const e of empties) {
        lines.push(`  - center (${e.cx}, ${e.cy})`);
      }
    } else if (nodeCount > 0) {
      lines.push('Zone is crowded — prefer extending below/right of the existing layout rather than overlapping.');
    }

    if (brains.length > 0) {
      lines.push(`Other Brains on this canvas (their zones are off-limits for new diagrams; use message_brain to coordinate):`);
      for (const b of brains.slice(0, 8)) {
        const z = b.zone;
        lines.push(`  - id="${b.id}" — ${b.emoji} ${b.name} · zone x=${z.x}..${z.x + z.w} y=${z.y}..${z.y + z.h} · ${b.state}`);
      }
    }
    return lines.join('\n');
  }

  // Compact text summary of tasks this Brain should care about right now.
  // Includes: tasks already assigned to me (any status), and unassigned
  // ready tasks whose required capabilities match mine. The Brain can
  // either claim+do these tasks via update_task, or ignore them and react
  // to the event at hand. This is the primary hook for the orchestrator's
  // rhythmic-wave behavior — Brains pull from here instead of guessing
  // from raw user_prompt events.
  private summarizeTasks(): string {
    try {
      const myCaps = this.spec.capabilities ?? [];
      const ready = listReadyTasks(this.deps.ydoc, { forBrainId: this.id, forCapabilities: myCaps });
      const allMine = listTasksForBrain(this.deps.ydoc, this.id);
      // Carve into "do now" vs "in progress" so the LLM picks the right one.
      const doable = ready.filter((t) => t.status === 'todo');
      const inProgress = allMine.filter((t) => t.status === 'doing');
      const blocked = allMine.filter((t) => t.status === 'blocked');
      if (doable.length === 0 && inProgress.length === 0 && blocked.length === 0) return '';

      const fmt = (t: BrainTask) => {
        const tag = t.assigneeBrainId === this.id ? 'mine' : 'pool';
        const caps = t.requiredCapabilities.length > 0 ? ` [${t.requiredCapabilities.join(', ')}]` : '';
        const desc = t.description ? ` — ${t.description.slice(0, 120)}` : '';
        return `  - ${tag} · id=${t.id} · "${t.title}"${caps}${desc}`;
      };

      const lines: string[] = ['### Tasks visible to you'];
      if (doable.length > 0) {
        lines.push('Ready to claim or already mine (deps satisfied):');
        for (const t of doable.slice(0, 6)) lines.push(fmt(t));
      }
      if (inProgress.length > 0) {
        lines.push('You marked these "doing" — finish them or update status:');
        for (const t of inProgress.slice(0, 4)) lines.push(fmt(t));
      }
      if (blocked.length > 0) {
        lines.push('You marked these "blocked" — re-check whether the blocker resolved:');
        for (const t of blocked.slice(0, 3)) lines.push(`  - id=${t.id} · "${t.title}" · reason: ${t.blockedReason ?? '(none)'}`);
      }
      lines.push('Claim a task: call update_task({taskId, status:"doing", assigneeBrainId:"<your id>"}). Mark complete: update_task({taskId, status:"done", outputNodeIds:[...]}).');
      return lines.join('\n');
    } catch {
      return '';
    }
  }

  // Move cursor up and slightly inset from the top-left corner of the zone,
  // so it stops overlapping the diagram the Brain just drew but stays on
  // screen at typical canvas viewports.
  private parkCursor(): void {
    const z = this.currentZone;
    const target: Point = {
      x: z.x + 40,
      y: z.y + 40,
    };
    this.act([moveCursor(this.id, target)]);
    log({ level: 'debug', kind: 'park', brainId: this.id, message: `parked cursor at (${target.x}, ${target.y})` });
  }

  // ─── Self-assessment loop ────────────────────────────────────────────────
  // Pulls this Brain's recent observations + actions from MemPalace and
  // renders them into a prompt fragment. The LLM uses this to NOT repeat
  // itself, to drop concerns that were addressed, and to escalate the ones
  // that persist. Replaces the rigid "checklist" prompt approach with a
  // self-aware feedback loop fed by what each Brain has already decided.
  private assessmentLoop(projectSlug: string): string {
    try {
      const palace = getPalace(projectSlug);
      const horizon = 30 * 60_000; // 30 min — recent enough to still be relevant
      const cutoff = Date.now() - horizon;

      const critiques = palace.search({
        query: 'concern flagged unaddressed missing weak risk gap',
        wings: [this.id],
        rooms: ['observations', 'critique', 'general', 'reviews', 'issues', 'suggestions'],
        limit: 5,
        minScore: 0.05,
      }).filter((r) => r.entry.timestamp >= cutoff);

      const actions = palace.search({
        query: 'placed drew added arrow connected node',
        wings: [this.id],
        rooms: ['decisions', 'general'],
        limit: 3,
        minScore: 0.05,
      }).filter((r) => r.entry.timestamp >= cutoff);

      if (critiques.length === 0 && actions.length === 0) return '';

      const fmt = (ts: number) => {
        const ago = Math.max(0, Math.round((Date.now() - ts) / 60_000));
        return ago === 0 ? 'just now' : `${ago}m ago`;
      };
      const trim = (s: string) => s.length > 160 ? s.slice(0, 160) + '…' : s;

      const lines: string[] = [];
      lines.push('### Your recent assessments / actions (last 30 min, this Brain only)');
      for (const r of critiques) {
        lines.push(`- ${fmt(r.entry.timestamp)} · [${r.roomName}] ${trim(r.entry.content)}`);
      }
      for (const r of actions) {
        lines.push(`- ${fmt(r.entry.timestamp)} · [${r.roomName}] ${trim(r.entry.content)}`);
      }
      lines.push(
        'These are YOUR prior takes. For each: is it still true on the canvas? ' +
        'If addressed, drop it silently. If still unaddressed and important, surface it again — sharper, not louder. ' +
        'If something changed and made it worse, escalate.'
      );
      return lines.join('\n');
    } catch {
      return '';
    }
  }

  // ─── LLM call ────────────────────────────────────────────────────────────
  // Calls the per-Brain stream endpoint with the Brain's system prompt +
  // event payload + tool schemas. Returns the resulting CanvasOps.
  async think(event: BrainEvent): Promise<CanvasOp[]> {
    const connection = this.deps.getConnection?.() ?? null;
    if (!connection) {
      console.warn(`[Brain:${this.id}] no active AI connection; skipping LLM call`);
      return [];
    }
    // Skip synthetic spawn heartbeats — those are just presence signals.
    if (event.type === 'heartbeat_tick' && event.payload?.reason === 'spawned') return [];

    // Every Brain sees the current registered-tools vocabulary so it can
    // reach for an existing cylinder/hexagon/etc instead of re-authoring.
    const registeredTools = Array.from(getToolsMap(this.deps.ydoc).values());

    // Pull MemPalace context for this Brain — prior decisions matching the
    // current event, plus known entities. Lets the Brain build on what it
    // (and its peers) already learned in this project.
    const projectSlug = this.deps.getProjectSlug?.() ?? 'default';
    const promptForContext = String(event.payload?.prompt ?? event.payload?.content ?? event.type);
    let palaceContext = '';
    try {
      const ctx = buildAgentContext(projectSlug, this.id, promptForContext);
      palaceContext = formatContextPrompt(ctx);
    } catch (err) {
      log({ level: 'warn', kind: 'error', brainId: this.id, message: `MemPalace context failed: ${String(err)}` });
    }
    const selfAssess = this.assessmentLoop(projectSlug);
    const taskSummary = this.summarizeTasks();
    const recentContext = [palaceContext, selfAssess, taskSummary, this.summarizeZone()].filter(Boolean).join('\n\n');

    const result = await callBrainLLM({ spec: this.spec, event, connection, registeredTools, recentContext });
    if (result.error) {
      console.warn(`[Brain:${this.id}] LLM error: ${result.error}`);
      // Surface user-prompt failures so the user isn't staring at silence.
      // Heartbeat failures stay quiet — they're background work. Detect the
      // classic "Bifrost not running" signature so the bubble tells the user
      // exactly what to do instead of a raw HTTP error.
      if (event.type === 'user_prompt') {
        const looksLikeBifrostDown =
          /Proxy failure|AI provider unreachable|fetch failed|ECONNREFUSED|ENOTFOUND/i.test(result.error);
        const content = looksLikeBifrostDown
          ? 'AI proxy is offline — run `npm run bifrost` in another terminal (or use `npm run dev:full`).'
          : `LLM error: ${result.error.slice(0, 140)}`;
        return [createBubble({
          brainId: this.id,
          content,
          durationMs: 10_000,
        })];
      }
      return [];
    }
    console.log(
      `[Brain:${this.id}] thought: ${result.toolCalls?.length ?? result.ops.length} ops, ${result.tokensUsed} tokens, finish=${result.finishReason}`,
      result.text ? `text=${JSON.stringify(result.text).slice(0, 100)}` : '',
    );

    // Store this turn's substance into MemPalace so future calls (this Brain
    // or its peers) can reference it. Skip empty heartbeats to avoid noise.
    if (event.type === 'user_prompt' || event.type === 'user_edit' || (result.ops.length > 0 && result.text)) {
      const summary = [
        `[${event.type}] ${promptForContext.slice(0, 200)}`,
        result.text ? `Response: ${result.text.slice(0, 600)}` : '',
        result.ops.length > 0 ? `Produced ${result.ops.length} ops (${result.ops.map(o => o.op).join(', ')})` : '',
      ].filter(Boolean).join('\n');
      try {
        storeAgentResponse(projectSlug, this.id, this.spec.name, summary);
      } catch (err) {
        log({ level: 'warn', kind: 'error', brainId: this.id, message: `MemPalace store failed: ${String(err)}` });
      }
    }

    return result.ops;
  }

  act(ops: CanvasOp[]): void {
    if (this.disposed) return;
    applyOps(this.deps.ydoc, ops, `brain:${this.id}`);
  }

  // ─── Convenience actions for tests + simple behaviors ────────────────────

  say(content: string, durationMs: number = 3000): void {
    this.act([createBubble({ brainId: this.id, content, durationMs })]);
  }

  moveTo(point: Point): void {
    this.act([moveCursor(this.id, point)]);
  }

  setState(state: BrainState): void {
    this.act([setState(this.id, state)]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const u of this.unsubs) u();
    this.unsubs = [];
  }
}

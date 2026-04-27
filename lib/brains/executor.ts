// Cursor-paced op executor.
//
// The LLM returns a batch of CanvasOps in one shot; if we apply them all in
// one transaction the diagram materializes as an instant dump. This module
// instead steps through them so the user watches the Brain physically build
// the diagram instead of seeing it teleport into existence:
//
//   1. PLACEMENT PASS — every create-shape op runs first, one at a time.
//      Cursor walks to the shape's anchor → holds → shape commits → holds.
//      All shapes in their final positions are on screen before any arrows
//      appear, just like a person sketching boxes before drawing connections.
//
//   2. ARROW PASS — every create-arrow op runs second, one at a time.
//      Cursor walks to the from-node's centre → holds (mimicking "click
//      source") → walks to the to-node's centre → arrow commits → holds.
//      The arrow then snaps in as the cursor "releases" on the target.
//
// The cursor itself is a CSS-transitioned <g translate(x,y)> in
// BrainsCanvasLayer, so a single move_brain_cursor write animates smoothly
// from old position to new without per-frame work here.

import * as Y from 'yjs';
import type { CanvasOp, Point, CanvasNode } from './types';
import { applyOps, createArrow } from './canvas-ops';
import { log } from './log';
import type { EventBus } from './events';
import { makeEvent } from './events';

export interface ExecutorOptions {
  // ms to hold AT the target before committing the op. Lets the user track
  // where the Brain's cursor landed before the shape pops in.
  preCommitHoldMs?: number;
  // ms to hold after committing before moving to the next op.
  postCommitHoldMs?: number;
  // ms the CSS transition takes to move the cursor between two anchors.
  // Should match the BrainsCanvasLayer's transition-duration.
  cursorTravelMs?: number;
  // ms to hold over an arrow's source node before walking to the target —
  // mimics "click to select source" beat in a connector tool.
  arrowSourceHoldMs?: number;
}

const DEFAULTS: Required<ExecutorOptions> = {
  preCommitHoldMs: 180,
  postCommitHoldMs: 240,
  cursorTravelMs: 380,
  arrowSourceHoldMs: 220,
};

const sleep = (ms: number) => new Promise<void>((res) => setTimeout(res, ms));

// Centre of a shape-like node — used when anchoring arrows.
function nodeCenter(n: CanvasNode | undefined): Point | null {
  if (!n) return null;
  if (n.type === 'rect' || n.type === 'customShape' || n.type === 'image' || n.type === 'sticky') {
    const r = n as { x: number; y: number; w: number; h: number };
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }
  if (n.type === 'brain') return { x: n.cursor.x + 6, y: n.cursor.y + 8 };
  return null;
}

function moveCursor(ydoc: Y.Doc, brainId: string, to: Point) {
  applyOps(ydoc, [{ op: 'move_brain_cursor', brainId, to }], `executor:${brainId}:travel`);
}

// Run ops with cursor animation between each. Brains call this from onEvent()
// after think() returns. The function does NOT touch state.brain.state — the
// caller already manages listening/thinking/acting/idle.
export async function executeOpsPaced(
  ydoc: Y.Doc,
  brainId: string,
  ops: CanvasOp[],
  options: ExecutorOptions = {},
  eventBus?: EventBus,
): Promise<void> {
  if (ops.length === 0) return;
  const opts = { ...DEFAULTS, ...options };

  // Split ops into four buckets:
  //   placements: rect / customShape / sticky / image creates (the "boxes")
  //   arrows:     arrow creates (the "lines")
  //   peerMsgs:   side-channel ops dispatched through EventBus (no Y.Doc state)
  //   misc:       bubbles, brain creates, updates, deletes, brain-cursor moves —
  //               applied first so a "say" runs at the start of the turn and
  //               peer spawns happen before the placements they may relate to.
  const placements: CanvasOp[] = [];
  const arrows: CanvasOp[] = [];
  const peerMsgs: CanvasOp[] = [];
  const misc: CanvasOp[] = [];
  for (const op of ops) {
    if (op.op === 'peer_message') { peerMsgs.push(op); continue; }
    if (op.op !== 'create') { misc.push(op); continue; }
    const t = op.node.type;
    if (t === 'arrow') arrows.push(op);
    else if (t === 'rect' || t === 'customShape' || t === 'sticky' || t === 'image') placements.push(op);
    else misc.push(op);
  }

  // Peer messages dispatch immediately at turn start so the target Brain can
  // start thinking in parallel with this Brain's drawing pass.
  if (eventBus && peerMsgs.length > 0) {
    for (const op of peerMsgs) {
      if (op.op !== 'peer_message') continue;
      eventBus.publish(makeEvent(
        'peer_message',
        { content: op.content, from: op.fromBrainId },
        { authorId: op.fromBrainId, targetBrainId: op.targetBrainId },
      ));
      log({
        level: 'info', kind: 'op_applied', brainId,
        message: `→ ${op.targetBrainId}: ${op.content.slice(0, 80)}`,
      });
    }
  }

  // Fallback: model emitted shapes but no arrows. Infer a left-to-right flow
  // from placement order and synthesise arrows so the diagram doesn't ship
  // disconnected. We tag these as auto-inferred so we can tune the heuristic
  // later (e.g. respect explicit "no connections" intent for sticky walls).
  if (placements.length >= 2 && arrows.length === 0) {
    const ordered = placements.slice().sort((a, b) => {
      if (a.op !== 'create' || b.op !== 'create') return 0;
      const ax = (a.node as { x?: number }).x ?? 0;
      const bx = (b.node as { x?: number }).x ?? 0;
      if (Math.abs(ax - bx) > 30) return ax - bx;
      const ay = (a.node as { y?: number }).y ?? 0;
      const by = (b.node as { y?: number }).y ?? 0;
      return ay - by;
    });
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = ordered[i]; const b = ordered[i + 1];
      if (a.op !== 'create' || b.op !== 'create') continue;
      arrows.push(createArrow({
        fromNodeId: a.node.id,
        toNodeId: b.node.id,
        owner: brainId,
      }) as CanvasOp);
    }
    log({ level: 'info', kind: 'op_applied', brainId, message: `auto-connected ${arrows.length} arrows (LLM dropped connectsFrom)` });
  }

  log({
    level: 'debug', kind: 'op_applied', brainId,
    message: `paced exec: ${placements.length} shapes, ${arrows.length} arrows, ${misc.length} misc`,
  });

  // Misc commits up front (bubbles, peer spawns, state ops) so a "say" lines
  // up with the start of the diagramming, not the end.
  if (misc.length > 0) {
    applyOps(ydoc, misc, `executor:${brainId}:misc`);
    await sleep(opts.postCommitHoldMs);
  }

  // ─── Placement pass ────────────────────────────────────────────────────
  for (const op of placements) {
    if (op.op !== 'create') continue;
    const n = op.node as { x?: number; y?: number; w?: number; h?: number };
    if (typeof n.x === 'number' && typeof n.y === 'number') {
      // Aim the cursor at the shape's top-left so it looks like the Brain
      // anchored there before drawing — same gesture as picking the shape
      // tool and clicking to drop.
      moveCursor(ydoc, brainId, { x: n.x, y: n.y });
      await sleep(opts.cursorTravelMs);
      await sleep(opts.preCommitHoldMs);
    }
    applyOps(ydoc, [op], `executor:${brainId}:place`);
    await sleep(opts.postCommitHoldMs);
  }

  // ─── Arrow pass ────────────────────────────────────────────────────────
  // Use the live nodes map at draw time — placements just committed, so the
  // map already contains every shape we just placed.
  const nodes = ydoc.getMap<CanvasNode>('b_nodes');
  for (const op of arrows) {
    if (op.op !== 'create' || op.node.type !== 'arrow') continue;
    const arrow = op.node;
    const from = nodes.get(arrow.fromNodeId);
    const to = nodes.get(arrow.toNodeId);
    const fromAnchor = nodeCenter(from);
    const toAnchor = nodeCenter(to);

    if (fromAnchor) {
      moveCursor(ydoc, brainId, fromAnchor);
      await sleep(opts.cursorTravelMs);
      await sleep(opts.arrowSourceHoldMs);
    }
    if (toAnchor) {
      moveCursor(ydoc, brainId, toAnchor);
      await sleep(opts.cursorTravelMs);
      await sleep(opts.preCommitHoldMs);
    }
    applyOps(ydoc, [op], `executor:${brainId}:connect`);
    await sleep(opts.postCommitHoldMs);
  }
}

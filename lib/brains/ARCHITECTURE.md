# Brains — Architecture

This module replaces the old `lib/orchestrator/` keyword-router + `/api/ai/stream → iframe` pipeline. It implements the Virtual Office: autonomous Brains, each with their own mind via the AI API, working canvas-natively on shared Y.Doc state.

Nothing in `lib/orchestrator/`, `lib/agents/`, or the diagram-design iframe path is modified by this module. Old code runs until `FEATURE_BRAINS` flag flips.

---

## 1. Core invariants

These are non-negotiable. Every decision downstream serves one of these.

1. **One LLM conversation per Brain.** Five Brains = five independent streaming contexts. No shared agent fan-out.
2. **Canvas-native output only.** Brains emit `CanvasOp[]` (place-shape, move-node, etc.), never HTML/SVG strings, never iframes.
3. **Events over polling.** Brains wake on Y.Doc changes. Heartbeat is a rare floor, not the primary signal.
4. **Budget-governed.** Per-Brain hourly token cap + global cap. When blown, Brains drop to patrol-only.
5. **Humane pacing.** One action at a time with visible motion. No instant dumps.
6. **Spatial zones.** Each Brain owns a rect on the canvas. Cross-zone work is allowed but requires a visible travel step.
7. **Forever present.** Brains persist in Y.Doc across reloads. Never "exit" on task finish.

---

## 2. The four specs (decisions, not questions)

### 2.1 Canvas primitive schema

Every artifact is a Y.Map node under `Y.Doc.getMap('nodes')`. Types:

| Type | Fields | Notes |
|---|---|---|
| `rect` | id, x, y, w, h, fill, stroke, label, owner, layer | Owner = brain id or 'user' |
| `ellipse` | id, x, y, rx, ry, fill, stroke, label, owner, layer | |
| `path` | id, d (SVG path string), stroke, fill, owner, layer | For arrows + freehand |
| `text` | id, x, y, content, font, size, color, owner | |
| `arrow` | id, fromNodeId, toNodeId, label, style, owner | Curves auto-computed from endpoints |
| `group` | id, childIds, bounds, label, style, owner | For Plotter-Brain categorization |
| `image` | id, x, y, w, h, src, owner | Brains can web_fetch icons into this |
| `sticky` | id, x, y, w, h, content, color, owner | User or Brain notes |
| `question` | id, x, y, content, askedBy, answeredBy[] | Drives brainstorm; Brains subscribe |
| `bubble` | id, brainId, content, expiresAt | Chat bubble above Brain cursor; ephemeral |
| `brain` | id, name, color, emoji, zone, state, modelProvider, modelId | Brain itself is a node |

Rendering stays in `InteractiveCanvas.tsx` — it already renders most of these; missing types get new renderers.

### 2.2 Brain lifecycle

```
spawn → register → subscribe to zone events → patrol
  ↓ (on event)
  wake → think (LLM call) → act (emit CanvasOps) → say (bubble) → back to patrol
  ↓ (every N min, idle)
  heartbeat_tick → LLM "anything to do?" → act or patrol
  ↓ (on user_retire or self-retire)
  unsubscribe → mark inactive in Y.Doc (kept for history, not deleted)
```

A Brain is serialized as a Y.Map. Anyone (user, another Brain, server restart) can rehydrate from Y.Doc alone. State lives there; runtime classes are projections.

Spawn is a tool call: `spawn_brain({name, emoji, color, model, systemPrompt, zone})`. Parent Brain that spawned shows as `spawnedBy` on the child. User can approve/deny via a confirmation bubble (default: auto-approve if parent is trusted; first version = always auto-approve for faster iteration).

### 2.3 Tool surface (LLM function-calling contract)

Every Brain's LLM context declares these tools. Tool schemas are the single source of truth — no freeform JSON parsing.

**Canvas tools:**
- `place_shape(type, x, y, props)` → returns nodeId
- `move_to(x, y)` → physical cursor travel (visible animation)
- `fetch_tool(type)` → fly to left toolbar, pick up (visible)
- `say(content, durationMs=3000)` → chat bubble above cursor
- `draw_arrow(fromNodeId, toNodeId, label?)`
- `group_nodes(nodeIds[], label, style)` → Plotter-style categorization
- `delete_node(nodeId)` — own nodes only unless Brain has elevated permission
- `update_node(nodeId, patch)` — same permission rule

**Social tools:**
- `message_brain(brainId, content)` — peer message, shows as bubble + logs in chat
- `ask_user(question, options?[])` — renders a question sticky; Brain waits for answer event

**Internet tools:**
- `web_fetch(url)` — server-side proxy, returns text content (HTML→markdown)
- `web_search(query)` — server-side proxy via a search API (stub for now)
- `icon_lookup(name, library)` — returns SVG source for common icon libraries (lucide, tabler, simple-icons)
- `npm_info(packageName)` — registry metadata + README

**Meta tools:**
- `spawn_brain(spec)` — create a peer
- `retire_self(reason)` — mark inactive
- `request_zone(bounds)` — ask the Zone Manager to expand/relocate

**Observation tools:**
- `read_canvas(bounds?)` — returns list of nodes in bounds (default = own zone)
- `read_brain(brainId)` — returns another Brain's state
- `subscribe(eventType, filter)` — add a listener (used during spawn/init)

### 2.4 Orchestration style

**There is no central orchestrator in the old sense.** The old one picked which agents to run from a prompt — that whole job becomes the user's initial nudge + Brains' own judgment.

What replaces it:
- **Event bus** (thin layer over Y.Doc observe): broadcasts `user_note`, `user_edit`, `peer_message`, `neighbor_activity`, `question_asked`, `heartbeat_tick`. Brains subscribe with filters (zone bounds, author, type).
- **Zone Manager** (new `lib/brains/zones.ts`): tracks zone ownership, handles spawns (assigns zones to new Brains), enforces cross-zone travel animations.
- **Lead Brain**: a specific persona (Architecture Lead) that handles *entry* — reads the user's master idea, decides which initial Brains to spawn, delegates via `message_brain`. It's a Brain, not a script. Its system prompt tells it to lead. It can be replaced or retired like any Brain.

Budget governor and heartbeat ticker are singletons on the client; they publish to the event bus.

---

## 3. Heartbeat (concrete)

Three tiers. Documented here so the code matches.

**Tier 1 — Patrol.** requestAnimationFrame loop in `InteractiveCanvas.tsx`. Zero LLM cost. Already implemented; unchanged.

**Tier 2 — Event wake.** On subscribed event, Brain's `think()` runs. Short-context LLM call:
- System prompt (Brain persona + tool schemas) — cached.
- Recent 10 events in Brain's zone — ~200 tokens.
- Event payload — ~50 tokens.
- Model returns tool calls or "stay idle".
- Cost: ~1-3k input tokens per wake (with caching, ~200 tokens incremental).

**Tier 3 — Idle tick.** Per-Brain `setInterval` at `heartbeatIntervalMs` (default 10 min, jittered ±30%). Runs only if Brain hasn't woken in the interval. Low-context LLM call:
- Same cached system prompt.
- One-line: "It's been $MINUTES minutes since you last acted. Zone summary: $SUMMARY. Anything you want to do?"
- Most ticks should return "stay idle".

**Budget governor.**
- Each Brain has `tokensPerHour` in its spec (default 20k for routine Brains, 100k for Lead).
- Global cap across all Brains: `TOTAL_TOKENS_PER_HOUR` (env var, default 200k).
- When either cap hits 80%, Brains drop to Tier 1 only. Status bar shows cost live.
- Resets on the hour.

---

## 4. File layout

```
lib/brains/
├── ARCHITECTURE.md          this file
├── types.ts                 Brain, Zone, CanvasOp, Event, Tool schemas
├── Brain.ts                 Brain class, lifecycle, think/act
├── heartbeat.ts             tier-3 ticker singleton
├── budget.ts                token governor
├── registry.ts              Brain roster, spawn/retire, Y.Doc persistence
├── zones.ts                 zone manager
├── events.ts                event bus (thin Y.Doc observe wrapper)
├── canvas-ops.ts            CanvasOp → Y.Doc mutation mapper
├── llm.ts                   per-Brain streaming LLM client (Anthropic + OpenAI + Minimax)
├── tools/
│   ├── canvas.ts            place_shape, move_to, say, ...
│   ├── social.ts            message_brain, ask_user
│   ├── internet.ts          web_fetch, web_search, icon_lookup, npm_info
│   └── meta.ts              spawn_brain, retire_self, request_zone
└── personas/
    ├── lead.ts              Architecture Lead — default initial Brain
    ├── plotter.ts           Plotter Brain — spatial organizer (kept from Phase 3)
    └── ... (grows as user/Brains create more)

app/api/brain/
├── [id]/stream/route.ts    per-Brain LLM streaming endpoint
├── fetch/route.ts           web_fetch proxy
└── search/route.ts          web_search proxy
```

Rendering stays in `scaffolds/canvas-view/InteractiveCanvas.tsx`. It reads from Y.Doc; it doesn't care whether changes come from a Brain or the user.

---

## 5. Feature flag

```ts
// lib/brains/flag.ts
export const FEATURE_BRAINS =
  process.env.NEXT_PUBLIC_FEATURE_BRAINS === '1' ||
  (typeof window !== 'undefined' && localStorage.getItem('feature_brains') === '1');
```

- When off: existing iframe/orchestrator path runs. Zero regression.
- When on: new `lib/brains/` takes over. Prompt submission goes to Lead Brain via event bus, not `/api/ai/stream`.

Users toggle via DevTools (`localStorage.setItem('feature_brains','1')`) while we're building. Ship the flag default-on once the vertical slice is solid.

---

## 6. Build order

1. **Types + Brain class skeleton + heartbeat loop** ← *current checkpoint*
2. Event bus + Y.Doc projection (Brain ↔ Y.Map.Brain)
3. Canvas ops + Brain → Y.Doc wire (Brain can place a rect end-to-end, no LLM yet)
4. Per-Brain LLM streaming client + tool-call parsing + `/api/brain/[id]/stream`
5. First Brain running LIVE: system prompt, one tool (`say`), responds to a user_note event → shows chat bubble
6. Add canvas tools; Lead Brain can place a rect when told
7. Budget governor + status-bar cost meter
8. Internet tools (web_fetch, icon_lookup) — server routes + tool impl
9. Meta tools (spawn_brain) + registry
10. Ship: kill the iframe pipeline, flag default-on
11. Phase 4 proper: self-extending tools (Brain draws custom SVG icon, registers it in toolbar) — now trivial because the foundation exists

Each step is user-visible. Not 10 days of silent plumbing.

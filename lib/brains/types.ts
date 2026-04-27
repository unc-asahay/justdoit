// Brain type definitions — single source of truth for the lib/brains module.
// See ARCHITECTURE.md for the decisions behind these shapes.

// ─── Spatial ────────────────────────────────────────────────────────────

export interface Zone {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

// ─── Canvas primitives (Y.Doc node types) ──────────────────────────────

export type NodeType =
  | 'rect'
  | 'ellipse'
  | 'path'
  | 'text'
  | 'arrow'
  | 'group'
  | 'image'
  | 'sticky'
  | 'question'
  | 'bubble'
  | 'brain'
  | 'customShape';

export interface NodeBase {
  id: string;
  type: NodeType;
  owner: string; // brain id or 'user'
  layer: number;
  createdAt: number;
  updatedAt: number;
}

export interface RectNode extends NodeBase {
  type: 'rect';
  x: number; y: number; w: number; h: number;
  fill?: string;
  stroke?: string;
  label?: string;
}

export interface EllipseNode extends NodeBase {
  type: 'ellipse';
  x: number; y: number; rx: number; ry: number;
  fill?: string;
  stroke?: string;
  label?: string;
}

export interface PathNode extends NodeBase {
  type: 'path';
  d: string;
  stroke?: string;
  fill?: string;
}

export interface TextNode extends NodeBase {
  type: 'text';
  x: number; y: number;
  content: string;
  font?: string;
  size?: number;
  color?: string;
}

export interface ArrowNode extends NodeBase {
  type: 'arrow';
  fromNodeId: string;
  toNodeId: string;
  label?: string;
  style?: 'solid' | 'dashed' | 'dotted';
  // Path routing — straight line, right-angle elbow, or smooth S-curve.
  routing?: 'straight' | 'elbow' | 'curved';
  // Arrowheads at endpoints. Default: end only.
  endStart?: 'none' | 'arrow';
  endEnd?: 'none' | 'arrow';
}

export interface GroupNode extends NodeBase {
  type: 'group';
  childIds: string[];
  bounds: Zone;
  label?: string;
  style?: 'dashed' | 'solid' | 'tint';
}

export interface ImageNode extends NodeBase {
  type: 'image';
  x: number; y: number; w: number; h: number;
  src: string; // data: URL or remote URL (fetched via web_fetch)
}

export interface StickyNode extends NodeBase {
  type: 'sticky';
  x: number; y: number; w: number; h: number;
  content: string;
  color?: string;
}

export interface QuestionNode extends NodeBase {
  type: 'question';
  x: number; y: number;
  content: string;
  askedBy: string; // brain id or 'user'
  answeredBy: string[]; // brain ids that have responded
}

export interface BubbleNode extends NodeBase {
  type: 'bubble';
  brainId: string;
  content: string;
  expiresAt: number; // epoch ms
}

export interface BrainNode extends NodeBase {
  type: 'brain';
  name: string;
  emoji: string;
  color: string;
  cursor: Point; // live position
  zone: Zone;
  state: BrainState;
  spec: BrainSpec;
  spawnedBy?: string; // parent brain id if spawned dynamically
  retiredAt?: number;
}

// A shape the Brain invented or fetched from an icon library, rendered
// inline as SVG. Either written by the LLM directly (svgContent), resolved
// from an iconify ID, or instantiated from a previously-registered tool.
export interface CustomShapeNode extends NodeBase {
  type: 'customShape';
  x: number; y: number; w: number; h: number;
  svgContent: string; // inner SVG markup, e.g. "<circle cx='50' cy='50' r='40' />"
  label?: string;
  iconId?: string;    // provenance: iconify ID like "lucide:database"
  toolId?: string;    // provenance: registered tool this was instantiated from
  // True when the SVG already paints the label (place_node primitives do).
  // The renderer skips the external <text> element to avoid duplication, but
  // the label field is still used for fuzzy arrow-endpoint resolution.
  labelInside?: boolean;
  // Diagram primitive kind (service/database/etc), set by place_node so the
  // editor can re-render the SVG with a new label when the user edits it.
  kind?: string;
}

export type CanvasNode =
  | RectNode | EllipseNode | PathNode | TextNode | ArrowNode
  | GroupNode | ImageNode | StickyNode | QuestionNode | BubbleNode | BrainNode
  | CustomShapeNode;

// A reusable Brain-authored tool. Once registered, other Brains can see it
// in their system context and place instances of it on the canvas.
// Lives in Y.Map `b_tools`.
export interface RegisteredTool {
  id: string;
  name: string;        // e.g. "database-cylinder"
  emoji: string;       // toolbar glyph
  description: string; // what other Brains see when listing available tools
  svgContent: string;  // template SVG, designed to fit a 100x60 viewBox
  defaultW: number;
  defaultH: number;
  createdBy: string;   // brain id
  createdAt: number;
}

// ─── Brain lifecycle ────────────────────────────────────────────────────

export type BrainState =
  | 'idle'         // patrolling, no LLM context loaded
  | 'listening'    // event received, about to think
  | 'thinking'     // LLM call in flight
  | 'acting'       // applying canvas ops
  | 'travelling'   // moving between points (visible animation)
  | 'retired';     // inactive but preserved in Y.Doc for history

export interface BrainBudget {
  tokensPerHour: number;
  tokensUsedThisHour: number;
  hourResetAt: number; // epoch ms
}

// A BrainSpec is what you need to rehydrate a Brain from Y.Doc.
// Identity, personality, and constraints — not runtime state.
export interface BrainSpec {
  id: string;
  name: string;
  emoji: string;
  color: string;
  modelProvider: 'anthropic' | 'openai' | 'minimax' | 'google';
  modelId: string;
  systemPrompt: string;
  allowedTools: ToolName[];
  heartbeatIntervalMs: number; // Tier-3 tick interval
  budget: BrainBudget;
  permissions: BrainPermissions;
  // Capability tags this Brain can fulfill — orchestrator matches user-prompt
  // decompositions to live Brains by intersecting BrainTask.requiredCapabilities
  // with this list. Use stable kebab-case slugs; loose taxonomy by design so
  // new Brain types can declare new tags without registry plumbing.
  // e.g. ['system-architecture', 'service-design', 'sequence-diagram']
  capabilities: string[];
}

export interface BrainPermissions {
  canSpawnBrains: boolean;
  canEditOtherBrainsNodes: boolean;
  canRequestZoneResize: boolean;
  canAskUser: boolean;
}

// ─── Tasks (orchestrator data model) ───────────────────────────────────────
// Tasks are how the Lead Brain (or any Brain) decomposes user intent into
// discrete chunks of work. They live in Y.Map `b_tasks` and carry both the
// "what" (title, description, requiredCapabilities) and the "when" (status,
// dependsOn, completedAt). Brains pull tasks they're assigned to OR tasks
// in 'todo' state whose requiredCapabilities intersect their own capabilities.

export type TaskStatus =
  | 'todo'        // unstarted, may or may not be assigned yet
  | 'doing'       // an assigned Brain is actively working on it
  | 'blocked'     // dependency unsatisfied OR external blocker
  | 'done'        // assigned Brain marked complete
  | 'cancelled';  // superseded or no longer relevant

export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface BrainTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;

  // Assignment. assigneeBrainId is null when the task is in the pool waiting
  // for a Brain whose capabilities match requiredCapabilities to claim it.
  assigneeBrainId: string | null;
  // 'user' OR a Brain id — useful for attribution and to prevent loops where
  // a Brain creates a task for itself and pulls it on the next heartbeat.
  createdByBrainId: string;

  // Capability matching for unassigned tasks. Empty array = any Brain may
  // claim. Multi-tag = ALL tags must intersect the candidate's capabilities.
  requiredCapabilities: string[];

  // DAG edges. Each entry is another BrainTask.id that must reach status
  // 'done' before this task becomes pullable.
  dependsOn: string[];
  // Set when status='blocked'. Human-readable so the UI can render it.
  blockedReason: string | null;

  // Output linking — canvas nodes produced by this task. Lets the Kanban
  // tab "fly" the camera to the work when a task card is clicked.
  outputNodeIds: string[];

  priority: TaskPriority;

  // Timestamps. createdAt + updatedAt always set. startedAt set on first
  // 'doing' transition, completedAt on first 'done' transition.
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

// ─── Events ─────────────────────────────────────────────────────────────

export type BrainEventType =
  | 'user_note'          // user dropped a sticky/question
  | 'user_edit'          // user changed a node in my zone
  | 'peer_message'       // another Brain messaged me
  | 'neighbor_activity'  // a Brain in an adjacent zone started working
  | 'question_asked'     // someone asked a question in my zone
  | 'heartbeat_tick'     // Tier-3 scheduled poke
  | 'user_prompt'        // initial master idea submitted — routes to Lead Brain
  // Orchestrator events — fire when the task graph transitions. Brains use
  // these to wake on assigned work instead of re-evaluating every user_prompt.
  | 'task_assigned'      // a task was assigned (or claimed) to targetBrainId
  | 'task_unblocked'     // all dependsOn for a task reached 'done'
  | 'task_completed';    // a task transitioned to 'done' — peers may want to react

export interface BrainEvent {
  id: string;
  type: BrainEventType;
  at: number; // epoch ms
  payload: Record<string, unknown>;
  // Routing filters (consumers subscribe with matchers on these)
  authorId?: string;
  zoneHint?: Zone;
  targetBrainId?: string; // for peer_message
}

// ─── Tool surface ───────────────────────────────────────────────────────

export type ToolName =
  // Canvas
  | 'place_node' | 'place_shape' | 'place_rect' | 'move_to' | 'fetch_tool' | 'say' | 'draw_arrow'
  | 'group_nodes' | 'delete_node' | 'update_node'
  | 'mermaid_diagram' | 'chart' | 'place_network'
  // Social
  | 'message_brain' | 'ack_brain' | 'ask_user'
  // Tasks (orchestrator)
  | 'create_task' | 'update_task'
  // Internet
  | 'web_fetch' | 'web_search' | 'icon_lookup' | 'npm_info'
  // Meta
  | 'spawn_brain' | 'retire_self' | 'request_zone' | 'register_tool'
  // Observation
  | 'read_canvas' | 'read_brain' | 'subscribe';

export interface ToolCall {
  name: ToolName;
  args: Record<string, unknown>;
  // Populated by the executor:
  startedAt?: number;
  finishedAt?: number;
  result?: unknown;
  error?: string;
}

export interface ToolSchema {
  name: ToolName;
  description: string;
  // JSON schema for args — used both for LLM function-calling and runtime validation.
  parameters: Record<string, unknown>;
  // Permission level required to invoke.
  permission: 'any' | 'owner' | 'elevated';
}

// ─── CanvasOps ──────────────────────────────────────────────────────────
// Canonical mutation language for the Y.Doc. Brains never write directly;
// they emit CanvasOps which the canvas-ops.ts mapper applies atomically.

export type CanvasOp =
  | { op: 'create'; node: CanvasNode }
  | { op: 'update'; nodeId: string; patch: Partial<CanvasNode> }
  | { op: 'delete'; nodeId: string }
  | { op: 'move_brain_cursor'; brainId: string; to: Point }
  | { op: 'set_brain_state'; brainId: string; state: BrainState }
  | { op: 'register_tool'; tool: RegisteredTool }
  // Task ops (orchestrator data model). Reach the b_tasks Y.Map atomically
  // alongside any node/brain ops in the same transaction.
  | { op: 'create_task'; task: BrainTask }
  | { op: 'update_task'; taskId: string; patch: Partial<BrainTask> }
  | { op: 'delete_task'; taskId: string }
  // Side-channel ops the executor pulls out of the placement queue and
  // routes via the EventBus. Not stored on the Y.Doc.
  | { op: 'peer_message'; fromBrainId: string; targetBrainId: string; content: string };

// ─── LLM I/O ────────────────────────────────────────────────────────────

export interface BrainTurn {
  // Input to the LLM for one wake cycle.
  brainId: string;
  eventsSinceLastTurn: BrainEvent[];
  zoneSummary: string; // compact text description of nodes in Brain's zone
  recentPeerMessages: BrainEvent[];
  budgetRemaining: number; // tokens
}

export interface BrainResponse {
  // LLM output: tool calls plus optional reasoning.
  reasoning?: string; // not shown to user; for debugging
  toolCalls: ToolCall[];
  tokensUsed: number;
}

// ─── Budget governor ────────────────────────────────────────────────────

export interface GlobalBudget {
  totalTokensPerHour: number;
  totalTokensUsedThisHour: number;
  hourResetAt: number;
  throttled: boolean; // when true, Brains drop to patrol-only
}

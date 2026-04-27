// Atomic mapper from CanvasOp[] → Y.Doc mutations.
// Brains never write Y.Doc directly; they produce CanvasOps and hand them here.

import * as Y from 'yjs';
import type { CanvasOp, CanvasNode, BrainNode, BrainState, Point, RegisteredTool, CustomShapeNode, ArrowNode, BrainTask } from './types';

// Namespaced Y.Map keys so we don't collide with the legacy InteractiveCanvas
// maps ('nodes', 'edges', 'paths'). When the canvas renderer is rebuilt to read
// from these maps directly, the legacy keys retire.
const NODES_KEY = 'b_nodes';
const BRAINS_KEY = 'b_brains';
const TOOLS_KEY = 'b_tools';
const TASKS_KEY = 'b_tasks';

export function getNodesMap(ydoc: Y.Doc): Y.Map<CanvasNode> {
  return ydoc.getMap<CanvasNode>(NODES_KEY);
}

export function getBrainsMap(ydoc: Y.Doc): Y.Map<BrainNode> {
  return ydoc.getMap<BrainNode>(BRAINS_KEY);
}

export function getToolsMap(ydoc: Y.Doc): Y.Map<RegisteredTool> {
  return ydoc.getMap<RegisteredTool>(TOOLS_KEY);
}

export function getTasksMap(ydoc: Y.Doc): Y.Map<BrainTask> {
  return ydoc.getMap<BrainTask>(TASKS_KEY);
}

export function applyOps(ydoc: Y.Doc, ops: CanvasOp[], origin: string = 'brain'): void {
  if (ops.length === 0) return;
  ydoc.transact(() => {
    for (const op of ops) applyOp(ydoc, op);
  }, origin);
}

function applyOp(ydoc: Y.Doc, op: CanvasOp): void {
  const nodes = getNodesMap(ydoc);
  const brains = getBrainsMap(ydoc);

  switch (op.op) {
    case 'create': {
      const id = op.node.id;
      if (op.node.type === 'brain') {
        brains.set(id, op.node as BrainNode);
      } else {
        nodes.set(id, op.node);
      }
      return;
    }

    case 'update': {
      const id = op.nodeId;
      if (brains.has(id)) {
        const existing = brains.get(id)!;
        brains.set(id, { ...existing, ...op.patch, updatedAt: Date.now() } as BrainNode);
      } else if (nodes.has(id)) {
        const existing = nodes.get(id)!;
        nodes.set(id, { ...existing, ...op.patch, updatedAt: Date.now() } as CanvasNode);
      }
      return;
    }

    case 'delete': {
      if (brains.has(op.nodeId)) brains.delete(op.nodeId);
      else if (nodes.has(op.nodeId)) nodes.delete(op.nodeId);
      return;
    }

    case 'move_brain_cursor': {
      const brain = brains.get(op.brainId);
      if (brain) {
        brains.set(op.brainId, { ...brain, cursor: op.to, updatedAt: Date.now() });
      }
      return;
    }

    case 'set_brain_state': {
      const brain = brains.get(op.brainId);
      if (brain) {
        brains.set(op.brainId, { ...brain, state: op.state, updatedAt: Date.now() });
      }
      return;
    }

    case 'register_tool': {
      const tools = ydoc.getMap<RegisteredTool>(TOOLS_KEY);
      tools.set(op.tool.id, op.tool);
      return;
    }

    case 'create_task': {
      const tasks = getTasksMap(ydoc);
      tasks.set(op.task.id, op.task);
      return;
    }

    case 'update_task': {
      const tasks = getTasksMap(ydoc);
      const existing = tasks.get(op.taskId);
      if (!existing) return;
      const next: BrainTask = { ...existing, ...op.patch, id: existing.id, updatedAt: Date.now() };
      // Stamp transition timestamps the first time the relevant status is hit
      // so consumers can show "started 2m ago" / "took 4m" without separate ops.
      if (op.patch.status === 'doing' && !existing.startedAt) next.startedAt = Date.now();
      if (op.patch.status === 'done' && !existing.completedAt) next.completedAt = Date.now();
      tasks.set(op.taskId, next);
      return;
    }

    case 'delete_task': {
      const tasks = getTasksMap(ydoc);
      if (tasks.has(op.taskId)) tasks.delete(op.taskId);
      return;
    }

    case 'peer_message': {
      // Side-channel op — handled by the executor, not by Y.Doc. Silent
      // pass-through here so applyOps doesn't reject it.
      return;
    }
  }
}

// ─── Convenience builders ──────────────────────────────────────────────────

export function nodeId(prefix: string = 'n'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function createRect(params: {
  x: number; y: number; w: number; h: number;
  label?: string; fill?: string; stroke?: string;
  owner: string; layer?: number;
  id?: string;
}): CanvasOp {
  const now = Date.now();
  return {
    op: 'create',
    node: {
      id: params.id ?? nodeId('rect'),
      type: 'rect',
      owner: params.owner,
      layer: params.layer ?? 1,
      createdAt: now,
      updatedAt: now,
      x: params.x, y: params.y, w: params.w, h: params.h,
      fill: params.fill, stroke: params.stroke, label: params.label,
    },
  };
}

export function createBubble(params: {
  brainId: string;
  content: string;
  durationMs?: number;
}): CanvasOp {
  const now = Date.now();
  return {
    op: 'create',
    node: {
      id: nodeId('bubble'),
      type: 'bubble',
      owner: params.brainId,
      layer: 100, // always on top
      createdAt: now,
      updatedAt: now,
      brainId: params.brainId,
      content: params.content,
      expiresAt: now + (params.durationMs ?? 3000),
    },
  };
}

export function moveCursor(brainId: string, to: Point): CanvasOp {
  return { op: 'move_brain_cursor', brainId, to };
}

export function setState(brainId: string, state: BrainState): CanvasOp {
  return { op: 'set_brain_state', brainId, state };
}

export function createCustomShape(params: {
  svgContent: string;
  x: number; y: number; w: number; h: number;
  label?: string;
  iconId?: string;
  toolId?: string;
  owner: string;
  layer?: number;
  id?: string;
  labelInside?: boolean;
  kind?: string;
}): CanvasOp {
  const now = Date.now();
  const node: CustomShapeNode = {
    id: params.id ?? nodeId('shape'),
    type: 'customShape',
    owner: params.owner,
    layer: params.layer ?? 1,
    createdAt: now,
    updatedAt: now,
    x: params.x, y: params.y, w: params.w, h: params.h,
    svgContent: params.svgContent,
    label: params.label,
    iconId: params.iconId,
    toolId: params.toolId,
    labelInside: params.labelInside,
    kind: params.kind,
  };
  return { op: 'create', node };
}

// Arrow connecting two canvas nodes by id. The renderer looks up the
// referenced nodes at paint time and anchors the endpoints on their edges,
// so the arrow auto-reroutes when either endpoint moves.
export function createArrow(params: {
  fromNodeId: string;
  toNodeId: string;
  label?: string;
  style?: 'solid' | 'dashed' | 'dotted';
  routing?: 'straight' | 'elbow' | 'curved';
  endStart?: 'none' | 'arrow';
  endEnd?: 'none' | 'arrow';
  owner: string;
  layer?: number;
  id?: string;
}): CanvasOp {
  const now = Date.now();
  const node: ArrowNode = {
    id: params.id ?? nodeId('arrow'),
    type: 'arrow',
    owner: params.owner,
    layer: params.layer ?? 2,
    createdAt: now,
    updatedAt: now,
    fromNodeId: params.fromNodeId,
    toNodeId: params.toNodeId,
    label: params.label,
    style: params.style,
    routing: params.routing,
    endStart: params.endStart,
    endEnd: params.endEnd,
  };
  return { op: 'create', node };
}

// Wipe everything drawn on the canvas (rects, shapes, arrows, bubbles) but
// leave Brains alive — they are autonomous entities, not artwork. Optionally
// clear registered tools too.
export function clearCanvasContent(ydoc: Y.Doc, opts: { tools?: boolean } = {}): { nodes: number; tools: number } {
  const nodes = getNodesMap(ydoc);
  const tools = ydoc.getMap<RegisteredTool>(TOOLS_KEY);
  let nodeCount = 0;
  let toolCount = 0;
  ydoc.transact(() => {
    for (const id of Array.from(nodes.keys())) {
      nodes.delete(id);
      nodeCount++;
    }
    if (opts.tools) {
      for (const id of Array.from(tools.keys())) {
        tools.delete(id);
        toolCount++;
      }
    }
  }, 'clear-canvas-content');
  return { nodes: nodeCount, tools: toolCount };
}

export function registerTool(params: {
  name: string;
  emoji: string;
  description: string;
  svgContent: string;
  defaultW?: number;
  defaultH?: number;
  brainId: string;
}): CanvasOp {
  const tool: RegisteredTool = {
    id: `tool_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: params.name,
    emoji: params.emoji,
    description: params.description,
    svgContent: params.svgContent,
    defaultW: params.defaultW ?? 100,
    defaultH: params.defaultH ?? 60,
    createdBy: params.brainId,
    createdAt: Date.now(),
  };
  return { op: 'register_tool', tool };
}

// ─── Task helpers (orchestrator data model) ────────────────────────────────

export function taskId(): string {
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// Builder for a `create_task` CanvasOp. All optional fields default sensibly
// so the orchestrator can write a minimal task with just title + capabilities.
export function createTask(params: {
  title: string;
  description?: string;
  createdByBrainId: string;
  requiredCapabilities?: string[];
  assigneeBrainId?: string | null;
  dependsOn?: string[];
  priority?: BrainTask['priority'];
  id?: string;
}): CanvasOp {
  const now = Date.now();
  const task: BrainTask = {
    id: params.id ?? taskId(),
    title: params.title,
    description: params.description ?? '',
    status: 'todo',
    assigneeBrainId: params.assigneeBrainId ?? null,
    createdByBrainId: params.createdByBrainId,
    requiredCapabilities: params.requiredCapabilities ?? [],
    dependsOn: params.dependsOn ?? [],
    blockedReason: null,
    outputNodeIds: [],
    priority: params.priority ?? 'normal',
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    completedAt: null,
  };
  return { op: 'create_task', task };
}

export function updateTask(taskIdArg: string, patch: Partial<BrainTask>): CanvasOp {
  return { op: 'update_task', taskId: taskIdArg, patch };
}

export function deleteTask(taskIdArg: string): CanvasOp {
  return { op: 'delete_task', taskId: taskIdArg };
}

// ─── Task queries ──────────────────────────────────────────────────────────
// Pure reads — no Y.Doc writes. Useful both inside Brain runtime (deciding
// whether to claim a task on wake) and inside the eventual Kanban view.

export function listTasks(ydoc: Y.Doc): BrainTask[] {
  return Array.from(getTasksMap(ydoc).values());
}

export function listTasksForBrain(ydoc: Y.Doc, brainId: string): BrainTask[] {
  return listTasks(ydoc).filter((t) => t.assigneeBrainId === brainId);
}

// A task is "ready" when (a) it's in 'todo' status, (b) every dependsOn task
// has reached 'done', and (c) it's either unassigned (capability-pull) or
// assigned to the asking Brain. The orchestrator and Brain runtime use this
// to gate work — never wake a Brain on a blocked task.
export function listReadyTasks(ydoc: Y.Doc, opts: { forBrainId?: string; forCapabilities?: string[] } = {}): BrainTask[] {
  const all = listTasks(ydoc);
  const byId = new Map(all.map((t) => [t.id, t]));
  return all.filter((t) => {
    if (t.status !== 'todo') return false;
    for (const depId of t.dependsOn) {
      const dep = byId.get(depId);
      if (!dep || dep.status !== 'done') return false;
    }
    if (opts.forBrainId !== undefined) {
      // assigned-to-me OR unassigned-and-my-capabilities-cover-it
      if (t.assigneeBrainId === opts.forBrainId) return true;
      if (t.assigneeBrainId !== null) return false;
      if (!opts.forCapabilities || t.requiredCapabilities.length === 0) return true;
      const caps = new Set(opts.forCapabilities);
      return t.requiredCapabilities.every((cap) => caps.has(cap));
    }
    return true;
  });
}

// Compute a fresh blockedReason string for a task — null if it's actually
// unblocked. The orchestrator can call this on every Brain heartbeat to
// keep blockedReason in sync with the dependency graph.
export function computeBlockedReason(ydoc: Y.Doc, task: BrainTask): string | null {
  if (task.dependsOn.length === 0) return null;
  const tasks = getTasksMap(ydoc);
  const pending: string[] = [];
  for (const depId of task.dependsOn) {
    const dep = tasks.get(depId);
    if (!dep) {
      pending.push(`(missing dep ${depId})`);
    } else if (dep.status !== 'done') {
      pending.push(dep.title);
    }
  }
  if (pending.length === 0) return null;
  return `Waiting on: ${pending.join(', ')}`;
}

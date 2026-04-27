// Tool catalog — single source of truth for every tool that lives on the
// FigJam-style toolbar AND is callable by Brains via place_node.
//
// A "tool" is either a built-in primitive (kind ∈ NodeKind, rendered by
// shapes.ts) OR a custom tool registered to the b_tools Y.Map (rendered
// from stored svgContent). Both flow through the same click-to-place
// pipeline. Brains use the same kinds via place_node, so what the user
// sees in the toolbar is exactly what the Brain can produce — and what a
// Brain produces appears as a tool the user can click.

import type { NodeKind } from '@/lib/brains/tools/shapes';

export type ToolBehavior =
  | { mode: 'place-node'; kind: NodeKind }
  | { mode: 'connector'; routing?: 'straight' | 'elbow' | 'curved'; style?: 'solid' | 'dashed' | 'dotted'; endStart?: 'none' | 'arrow'; endEnd?: 'none' | 'arrow' }
  | { mode: 'text' }
  | { mode: 'select' }
  | { mode: 'custom-tool'; toolId: string };

export interface ToolEntry {
  id: string;            // stable id like "shape-rectangle", "connector-arrow"
  name: string;          // display name
  icon: string;          // emoji or short symbol shown in toolbar
  shortcut?: string;     // single-key shortcut (S, R, A, ...)
  behavior: ToolBehavior;
}

export interface ToolCategory {
  id: string;
  label: string;
  icon: string;
  tools: ToolEntry[];
}

// ─── Built-in catalog ────────────────────────────────────────────────────
// Order mirrors FigJam's toolbar grouping.

export const BUILTIN_CATEGORIES: ToolCategory[] = [
  {
    id: 'select',
    label: 'Select',
    icon: '↖',
    tools: [
      { id: 'select', name: 'Select', icon: '↖', shortcut: 'V', behavior: { mode: 'select' } },
    ],
  },
  {
    id: 'sticky',
    label: 'Sticky',
    icon: '🟨',
    tools: [
      { id: 'sticky', name: 'Sticky note', icon: '🟨', shortcut: 'S', behavior: { mode: 'place-node', kind: 'sticky' } },
    ],
  },
  {
    id: 'shapes',
    label: 'Shapes',
    icon: '▢',
    tools: [
      { id: 'shape-rectangle',         name: 'Rectangle',         icon: '▭',  shortcut: 'R', behavior: { mode: 'place-node', kind: 'rectangle' } },
      { id: 'shape-rounded',           name: 'Rounded rectangle', icon: '▢',                 behavior: { mode: 'place-node', kind: 'rounded-rectangle' } },
      { id: 'shape-ellipse',           name: 'Ellipse',           icon: '◯',  shortcut: 'O', behavior: { mode: 'place-node', kind: 'ellipse' } },
      { id: 'shape-triangle',          name: 'Triangle',          icon: '△',                 behavior: { mode: 'place-node', kind: 'triangle' } },
      { id: 'shape-diamond',           name: 'Diamond',           icon: '◇',                 behavior: { mode: 'place-node', kind: 'diamond' } },
      { id: 'shape-hexagon',           name: 'Hexagon',           icon: '⬡',                 behavior: { mode: 'place-node', kind: 'hexagon' } },
      { id: 'shape-star',              name: 'Star',              icon: '★',                 behavior: { mode: 'place-node', kind: 'star' } },
      { id: 'shape-parallelogram',     name: 'Parallelogram',     icon: '▰',                 behavior: { mode: 'place-node', kind: 'parallelogram' } },
    ],
  },
  {
    id: 'flowchart',
    label: 'Flowchart',
    icon: '◆',
    tools: [
      { id: 'flow-process',     name: 'Process',      icon: '▢', behavior: { mode: 'place-node', kind: 'process' } },
      { id: 'flow-decision',    name: 'Decision',     icon: '◇', behavior: { mode: 'place-node', kind: 'decision' } },
      { id: 'flow-terminator',  name: 'Start / End',  icon: '⬭', behavior: { mode: 'place-node', kind: 'terminator' } },
      { id: 'flow-document',    name: 'Document',     icon: '📄', behavior: { mode: 'place-node', kind: 'document' } },
      { id: 'flow-data',        name: 'Data',         icon: '▱', behavior: { mode: 'place-node', kind: 'data' } },
      { id: 'flow-manual-input', name: 'Manual input', icon: '⌨️', behavior: { mode: 'place-node', kind: 'manual-input' } },
    ],
  },
  {
    id: 'architecture',
    label: 'Architecture',
    icon: '🏗️',
    tools: [
      { id: 'arch-service',  name: 'Service',  icon: '▢', behavior: { mode: 'place-node', kind: 'service' } },
      { id: 'arch-database', name: 'Database', icon: '🛢', behavior: { mode: 'place-node', kind: 'database' } },
      { id: 'arch-cache',    name: 'Cache',    icon: '⚡', behavior: { mode: 'place-node', kind: 'cache' } },
      { id: 'arch-queue',    name: 'Queue',    icon: '⫴', behavior: { mode: 'place-node', kind: 'queue' } },
      { id: 'arch-api',      name: 'API',      icon: '⬡', behavior: { mode: 'place-node', kind: 'api' } },
      { id: 'arch-external', name: 'External', icon: '☁', behavior: { mode: 'place-node', kind: 'external' } },
      { id: 'arch-actor',    name: 'Actor',    icon: '🧑', behavior: { mode: 'place-node', kind: 'actor' } },
      { id: 'arch-file',     name: 'File',     icon: '📑', behavior: { mode: 'place-node', kind: 'file' } },
    ],
  },
  {
    id: 'connector',
    label: 'Connector',
    icon: '↗',
    tools: [
      { id: 'connector-straight',       name: 'Straight arrow',       icon: '↗', shortcut: 'A', behavior: { mode: 'connector', routing: 'straight', endEnd: 'arrow' } },
      { id: 'connector-elbow',          name: 'Bent (elbow)',         icon: '⌐',                 behavior: { mode: 'connector', routing: 'elbow', endEnd: 'arrow' } },
      { id: 'connector-curved',         name: 'Curved arrow',         icon: '⌒',                 behavior: { mode: 'connector', routing: 'curved', endEnd: 'arrow' } },
      { id: 'connector-dashed',         name: 'Dashed arrow',         icon: '⇢',                 behavior: { mode: 'connector', routing: 'straight', style: 'dashed', endEnd: 'arrow' } },
      { id: 'connector-elbow-dashed',   name: 'Dashed bent',          icon: '⌐',                 behavior: { mode: 'connector', routing: 'elbow', style: 'dashed', endEnd: 'arrow' } },
      { id: 'connector-line',           name: 'Plain line (no ends)', icon: '—',                 behavior: { mode: 'connector', routing: 'straight', endEnd: 'none', endStart: 'none' } },
      { id: 'connector-double',         name: 'Double-ended',         icon: '↔',                 behavior: { mode: 'connector', routing: 'straight', endStart: 'arrow', endEnd: 'arrow' } },
    ],
  },
  {
    id: 'text',
    label: 'Text',
    icon: 'T',
    tools: [
      { id: 'text', name: 'Text', icon: 'T', shortcut: 'T', behavior: { mode: 'text' } },
    ],
  },
  {
    id: 'note',
    label: 'Callout',
    icon: '💬',
    tools: [
      { id: 'callout-note', name: 'Note callout', icon: '💬', behavior: { mode: 'place-node', kind: 'note' } },
    ],
  },
];

// Find a built-in tool by id, scanning all categories.
export function findBuiltinTool(id: string): ToolEntry | undefined {
  for (const c of BUILTIN_CATEGORIES) {
    const t = c.tools.find((x) => x.id === id);
    if (t) return t;
  }
  return undefined;
}

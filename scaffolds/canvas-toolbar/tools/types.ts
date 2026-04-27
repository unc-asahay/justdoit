/**
 * Canvas Toolbar Types
 * Defines every tool available in the toolbar.
 */

export type ToolCategory = 'drawing' | 'figjam' | 'diagram' | 'connector' | 'control';

export interface ToolDef {
  id: string;
  name: string;
  icon: string;
  shortcut?: string;
  category: ToolCategory;
  description: string;
  cursor?: string;
}

export type ActiveToolId = string | null;

// ─── Drawing Tools ───────────────────────────────────────────────────────────
// Shortcuts follow Figma conventions where possible:
//   V=Select, H=Hand, R=Rect, O=Ellipse, P=Pen, T=Text, L=Line/Timeline

export const DRAWING_TOOLS: ToolDef[] = [
  { id: 'pen',       name: 'Pen',       icon: '✏️', shortcut: 'P', category: 'drawing', description: 'Freehand drawing' },
  { id: 'rect',      name: 'Rectangle', icon: '▢',  shortcut: 'R', category: 'drawing', description: 'Draw rectangle' },
  { id: 'ellipse',   name: 'Ellipse',   icon: '○',  shortcut: 'O', category: 'drawing', description: 'Draw ellipse' },
  { id: 'triangle',  name: 'Triangle',  icon: '△',  shortcut: 'Y', category: 'drawing', description: 'Draw triangle' },
  { id: 'arrow',     name: 'Arrow',     icon: '→',  shortcut: 'A', category: 'drawing', description: 'Draw arrow' },
  { id: 'text',      name: 'Text',      icon: '📝', shortcut: 'T', category: 'drawing', description: 'Add text' },
  { id: 'image',     name: 'Image',     icon: '🖼️', shortcut: 'I', category: 'drawing', description: 'Upload image' },
];

// ─── FigJam Tools ────────────────────────────────────────────────────────────

export const FIGJAM_TOOLS: ToolDef[] = [
  { id: 'sticky',    name: 'Sticky Note', icon: '🟡', shortcut: 'S', category: 'figjam', description: 'Add sticky note' },
  { id: 'vote',      name: 'Vote',        icon: '👍', shortcut: 'D', category: 'figjam', description: 'Place vote dot' },
  { id: 'timer',     name: 'Timer',       icon: '⏱️', shortcut: 'W', category: 'figjam', description: 'Start timer' },
  { id: 'reaction',  name: 'Reaction',    icon: '😀', shortcut: 'E', category: 'figjam', description: 'Add reaction' },
  { id: 'poll',      name: 'Poll',        icon: '📊', shortcut: 'Q', category: 'figjam', description: 'Create poll' },
  { id: 'comment',   name: 'Comment',     icon: '💬', shortcut: 'C', category: 'figjam', description: 'Add comment' },
  { id: 'checklist', name: 'Checklist',   icon: '☑️', shortcut: 'K', category: 'figjam', description: 'Add checklist' },
];

// ─── Diagram Tools ───────────────────────────────────────────────────────────

export const DIAGRAM_TOOLS: ToolDef[] = [
  { id: 'flowchart', name: 'Flowchart',  icon: '◇',  shortcut: 'F', category: 'diagram', description: 'Flowchart shapes' },
  { id: 'uml',       name: 'UML Class',  icon: '◆',  shortcut: 'U', category: 'diagram', description: 'UML class diagram' },
  { id: 'sequence',  name: 'Sequence',   icon: '↕',  shortcut: 'X', category: 'diagram', description: 'Sequence diagram' },
  { id: 'mindmap',   name: 'Mind Map',   icon: '🗺️', shortcut: 'M', category: 'diagram', description: 'Mind map' },
  { id: 'timeline',  name: 'Timeline',   icon: '📅', shortcut: 'L', category: 'diagram', description: 'Timeline view' },
];

// ─── Connector Styles ────────────────────────────────────────────────────────

export type ConnectorStyle = 'solid' | 'bold' | 'dashed' | 'elbow';

export const CONNECTOR_TOOLS: ToolDef[] = [
  { id: 'conn-solid',  name: 'Solid',  icon: '──', category: 'connector', description: 'Solid line' },
  { id: 'conn-bold',   name: 'Bold',   icon: '━━', category: 'connector', description: 'Bold line' },
  { id: 'conn-dashed', name: 'Dashed', icon: '┄┄', category: 'connector', description: 'Dashed line' },
  { id: 'conn-elbow',  name: 'Elbow',  icon: '⌐',  category: 'connector', description: 'Elbow connector' },
];

// ─── Control Tools ───────────────────────────────────────────────────────────

export const CONTROL_TOOLS: ToolDef[] = [
  { id: 'select', name: 'Select',       icon: '↖', shortcut: 'V', category: 'control', description: 'Select, move & multi-select (Shift+Click or drag marquee)' },
  { id: 'hand',   name: 'Hand',         icon: '✋', shortcut: 'H', category: 'control', description: 'Pan canvas (or hold Space)' },
];

// ─── FigJam Node Kinds ────────────────────────────────────────────────────────

export type FigJamNodeKind =
  | 'sticky-note'
  | 'vote-dot'
  | 'timer-widget'
  | 'reaction'
  | 'poll-widget'
  | 'comment'
  | 'checklist';

// ─── Sticky Note Colors ─────────────────────────────────────────────────────

export type StickyColor = 'yellow' | 'blue' | 'pink' | 'green' | 'orange';

export const STICKY_COLORS: Record<StickyColor, { fill: string; border: string; text: string }> = {
  yellow: { fill: '#FEF3C7', border: '#F59E0B', text: '#92400E' },
  blue:   { fill: '#DBEAFE', border: '#3B82F6', text: '#1E40AF' },
  pink:   { fill: '#FCE7F3', border: '#EC4899', text: '#9D174D' },
  green:  { fill: '#D1FAE5', border: '#10B981', text: '#065F46' },
  orange: { fill: '#FFEDD5', border: '#F97316', text: '#9A3412' },
};

// ─── Reaction Emojis ─────────────────────────────────────────────────────────

export const REACTION_EMOJIS = ['👍', '👎', '❤️', '🔥', '🤔', '🎉', '💡', '⚠️'] as const;

// ─── Vote Dot Colors ─────────────────────────────────────────────────────────

export const VOTE_DOT_COLORS = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'] as const;

// ─── Category Accent Colors ─────────────────────────────────────────────────

export const CATEGORY_COLORS: Record<ToolCategory, string> = {
  drawing:   '#8B5CF6',
  figjam:    '#F59E0B',
  diagram:   '#3B82F6',
  connector: '#6B7280',
  control:   '#10B981',
};

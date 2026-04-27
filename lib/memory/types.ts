/**
 * MemPalace Types — self-contained memory system.
 * No external package dependency.
 */

// ─── Core Data Structures ───────────────────────────────────────────────────

/** A single memory entry stored in a room */
export interface MemoryEntry {
  id: string;
  content: string;
  timestamp: number;
  agentId: string;
  agentName?: string;
  entities: ExtractedEntity[];
  metadata: Record<string, unknown>;
}

/** A room within a wing — holds entries about a specific topic */
export interface Room {
  name: string;
  entries: MemoryEntry[];
}

/** A wing — one per agent, contains topic-based rooms */
export interface Wing {
  id: string;
  rooms: Map<string, Room>;
  metadata: Record<string, unknown>;
}

/** A palace — one per project, contains all agent wings */
export interface Palace {
  projectSlug: string;
  wings: Map<string, Wing>;
  createdAt: number;
  updatedAt: number;
}

// ─── Entity Extraction ──────────────────────────────────────────────────────

export type EntityType = 'technology' | 'architecture' | 'framework' | 'tool' | 'concept';

export interface ExtractedEntity {
  name: string;
  type: EntityType;
  mentions: number;
  firstSeen: number;
  lastSeen: number;
}

// ─── Search ─────────────────────────────────────────────────────────────────

export interface SearchOptions {
  query: string;
  wings?: string[];
  rooms?: string[];
  limit?: number;
  minScore?: number;
}

export interface SearchResult {
  entry: MemoryEntry;
  wingId: string;
  roomName: string;
  score: number;
}

// ─── Agent Context ──────────────────────────────────────────────────────────

/** Prior decisions injected into an agent's system prompt */
export interface AgentContext {
  agentId: string;
  projectSlug: string;
  priorDecisions: PriorDecision[];
  entitySummary: string;
}

export interface PriorDecision {
  content: string;
  wingId: string;
  roomName: string;
  score: number;
  timestamp: number;
}

// ─── Serialization ──────────────────────────────────────────────────────────

/** JSON-serializable version of a Palace (for GitHub sync) */
export interface SerializedPalace {
  projectSlug: string;
  version: '1.0';
  createdAt: number;
  updatedAt: number;
  wings: SerializedWing[];
}

export interface SerializedWing {
  id: string;
  metadata: Record<string, unknown>;
  rooms: SerializedRoom[];
}

export interface SerializedRoom {
  name: string;
  entries: SerializedEntry[];
}

export interface SerializedEntry {
  id: string;
  content: string;
  timestamp: number;
  agentId: string;
  agentName?: string;
  entities: ExtractedEntity[];
  metadata: Record<string, unknown>;
}

// ─── Wing Configuration ─────────────────────────────────────────────────────

/** Default wing/room structure for new palaces */
export interface WingTemplate {
  id: string;
  rooms: string[];
}

export const DEFAULT_WING_TEMPLATES: WingTemplate[] = [
  {
    id: 'design-agent',
    rooms: ['colors', 'layouts', 'typography', 'components', 'assets'],
  },
  {
    id: 'arch-agent',
    rooms: ['database', 'api-design', 'infrastructure', 'services', 'security'],
  },
  {
    id: 'tech-agent',
    rooms: ['frameworks', 'patterns', 'tooling', 'deployment', 'monitoring'],
  },
  {
    id: 'biz-agent',
    rooms: ['requirements', 'pricing', 'market', 'strategy'],
  },
  {
    id: 'validation-agent',
    rooms: ['reviews', 'issues', 'suggestions'],
  },
];

// ─── Room Auto-Categorization Patterns ──────────────────────────────────────

/** Regex patterns to auto-assign content to rooms */
export const ROOM_PATTERNS: Record<string, RegExp> = {
  colors: /color|palette|hex|brand|theme|background|foreground/i,
  layouts: /layout|grid|flexbox|positioning|responsive|mobile|desktop/i,
  typography: /font|text|heading|paragraph|line-height|letter-spacing/i,
  database: /database|sql|postgresql|mysql|mongodb|schema|table|query|index/i,
  'api-design': /api|rest|graphql|endpoint|route|request|response|webhook/i,
  infrastructure: /deploy|docker|kubernetes|aws|cloud|server|hosting|cdn/i,
  frameworks: /react|next\.js|vue|angular|svelte|node\.js|express/i,
  patterns: /pattern|singleton|factory|observer|pubsub|zustand|redux/i,
  security: /security|vulnerability|xss|csrf|injection|https|tls|auth/i,
  tooling: /eslint|prettier|jest|cypress|docker|webpack|vite|turbo/i,
};

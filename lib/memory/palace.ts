/**
 * MemPalace — self-contained memory system.
 * One palace per project. Each agent gets a wing. Each wing has topic rooms.
 */

import type {
  Palace,
  Wing,
  Room,
  MemoryEntry,
  ExtractedEntity,
  SearchOptions,
  SearchResult,
} from './types';
import {
  DEFAULT_WING_TEMPLATES,
  ROOM_PATTERNS,
} from './types';

// ─── Singleton Cache ─────────────────────────────────────────────────────────

/** One palace per project, cached in memory */
const palaceCache = new Map<string, MemPalace>();

// ─── MemPalace Class ────────────────────────────────────────────────────────

export class MemPalace {
  private palace: Palace;
  private listeners: Array<() => void> = [];

  constructor(projectSlug: string) {
    this.palace = {
      projectSlug,
      wings: new Map(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Bootstrap default wings from templates
    for (const template of DEFAULT_WING_TEMPLATES) {
      this.createWing(template.id, template.rooms);
    }
  }

  // ── Change subscription (for persistence + live UI updates) ────────────────
  onChange(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }
  private emitChanged(): void {
    for (const l of this.listeners) {
      try { l(); } catch { /* ignore listener errors */ }
    }
  }

  // ── Wing Operations ────────────────────────────────────────────────────────

  /** Create a wing with pre-defined rooms */
  createWing(wingId: string, roomNames: string[] = []): Wing {
    if (this.palace.wings.has(wingId)) {
      return this.palace.wings.get(wingId)!;
    }

    const rooms = new Map<string, Room>();
    for (const name of roomNames) {
      rooms.set(name, { name, entries: [] });
    }

    const wing: Wing = { id: wingId, rooms, metadata: {} };
    this.palace.wings.set(wingId, wing);
    return wing;
  }

  /** Get a wing by ID. Creates it if it doesn't exist. */
  getWing(wingId: string): Wing {
    if (!this.palace.wings.has(wingId)) {
      this.createWing(wingId);
    }
    return this.palace.wings.get(wingId)!;
  }

  /** List all wing IDs */
  getWingIds(): string[] {
    return [...this.palace.wings.keys()];
  }

  // ── Room Operations ────────────────────────────────────────────────────────

  /** Get or create a room within a wing */
  getRoom(wingId: string, roomName: string): Room {
    const wing = this.getWing(wingId);
    if (!wing.rooms.has(roomName)) {
      wing.rooms.set(roomName, { name: roomName, entries: [] });
    }
    return wing.rooms.get(roomName)!;
  }

  /** List all room names in a wing */
  getRoomNames(wingId: string): string[] {
    const wing = this.getWing(wingId);
    return [...wing.rooms.keys()];
  }

  // ── Store ─────────────────────────────────────────────────────────────────

  /** Store a memory entry in a specific wing/room */
  store(
    wingId: string,
    roomName: string,
    content: string,
    options?: {
      agentId?: string;
      agentName?: string;
      entities?: ExtractedEntity[];
      metadata?: Record<string, unknown>;
    },
  ): MemoryEntry {
    const room = this.getRoom(wingId, roomName);

    const entry: MemoryEntry = {
      id: crypto.randomUUID(),
      content,
      timestamp: Date.now(),
      agentId: options?.agentId ?? wingId,
      agentName: options?.agentName,
      entities: options?.entities ?? [],
      metadata: options?.metadata ?? {},
    };

    room.entries.push(entry);
    this.palace.updatedAt = Date.now();
    this.emitChanged();
    return entry;
  }

  /** Auto-categorize content into a room based on ROOM_PATTERNS */
  storeAuto(
    wingId: string,
    content: string,
    options?: {
      agentId?: string;
      agentName?: string;
      entities?: ExtractedEntity[];
      metadata?: Record<string, unknown>;
    },
  ): MemoryEntry {
    const roomName = this.categorizeContent(content);
    return this.store(wingId, roomName, content, options);
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  /**
   * Search across wings/rooms using keyword matching.
   * Returns results sorted by relevance score (descending).
   */
  search(options: SearchOptions): SearchResult[] {
    const results: SearchResult[] = [];
    const queryTerms = options.query.toLowerCase().split(/\s+/).filter(Boolean);
    const limit = options.limit ?? 10;
    const minScore = options.minScore ?? 0.1;

    // Determine which wings to search
    const wingIds = options.wings ?? this.getWingIds();

    for (const wingId of wingIds) {
      const wing = this.palace.wings.get(wingId);
      if (!wing) continue;

      // Determine which rooms to search
      const roomNames = options.rooms ?? [...wing.rooms.keys()];

      for (const roomName of roomNames) {
        const room = wing.rooms.get(roomName);
        if (!room) continue;

        for (const entry of room.entries) {
          const score = this.scoreEntry(entry, queryTerms);
          if (score >= minScore) {
            results.push({ entry, wingId, roomName, score });
          }
        }
      }
    }

    // Sort by score descending, then by timestamp descending
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.entry.timestamp - a.entry.timestamp;
    });

    return results.slice(0, limit);
  }

  /** Get recent entries across all wings */
  getRecent(limit = 10): SearchResult[] {
    const results: SearchResult[] = [];

    for (const [wingId, wing] of this.palace.wings) {
      for (const [roomName, room] of wing.rooms) {
        for (const entry of room.entries) {
          results.push({ entry, wingId, roomName, score: 1 });
        }
      }
    }

    results.sort((a, b) => b.entry.timestamp - a.entry.timestamp);
    return results.slice(0, limit);
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  /** Get a summary of the palace */
  getSummary(): {
    projectSlug: string;
    wingCount: number;
    totalEntries: number;
    lastUpdated: number;
    wings: Array<{ id: string; roomCount: number; entryCount: number }>;
  } {
    const wings: Array<{ id: string; roomCount: number; entryCount: number }> = [];
    let totalEntries = 0;

    for (const [id, wing] of this.palace.wings) {
      let entryCount = 0;
      for (const room of wing.rooms.values()) {
        entryCount += room.entries.length;
      }
      totalEntries += entryCount;
      wings.push({ id, roomCount: wing.rooms.size, entryCount });
    }

    return {
      projectSlug: this.palace.projectSlug,
      wingCount: this.palace.wings.size,
      totalEntries,
      lastUpdated: this.palace.updatedAt,
      wings,
    };
  }

  // ── Export / Import ────────────────────────────────────────────────────────

  /** Export the full palace state (used by serializer) */
  exportState(): Palace {
    return this.palace;
  }

  /** Import palace state (used by serializer on project open) */
  importState(state: Palace): void {
    this.palace = state;
  }

  // ── Internal Helpers ───────────────────────────────────────────────────────

  /** Score an entry against search query terms (0-1) */
  private scoreEntry(entry: MemoryEntry, queryTerms: string[]): number {
    if (queryTerms.length === 0) return 0;

    const content = entry.content.toLowerCase();
    const entityNames = entry.entities.map(e => e.name.toLowerCase());
    let matchedTerms = 0;

    for (const term of queryTerms) {
      if (content.includes(term)) {
        matchedTerms++;
      } else if (entityNames.some(name => name.includes(term))) {
        matchedTerms += 0.8;
      }
    }

    return matchedTerms / queryTerms.length;
  }

  /** Auto-categorize content into a room name */
  private categorizeContent(content: string): string {
    for (const [roomName, pattern] of Object.entries(ROOM_PATTERNS)) {
      if (pattern.test(content)) return roomName;
    }
    return 'general';
  }
}

// ─── Static Factory Functions ────────────────────────────────────────────────

const LS_KEY = (slug: string) => `mempalace:v1:${slug}`;
const PERSIST_DEBOUNCE_MS = 600;

// Per-project debounce timers so rapid stores don't thrash localStorage.
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

// Inline serialize/deserialize so we don't pull in serializer.ts (circular).
function persistNow(projectSlug: string) {
  const palace = palaceCache.get(projectSlug);
  if (!palace || typeof window === 'undefined') return;
  try {
    const state = palace.exportState();
    const wings = [...state.wings.values()].map((wing) => ({
      id: wing.id,
      metadata: wing.metadata,
      rooms: [...wing.rooms.values()].map((r) => ({ name: r.name, entries: r.entries })),
    }));
    const payload = {
      projectSlug: state.projectSlug,
      version: '1.0',
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      wings,
    };
    window.localStorage.setItem(LS_KEY(projectSlug), JSON.stringify(payload));
  } catch (err) {
    console.warn('[mempalace] persist failed:', err);
  }
}

function tryRehydrate(projectSlug: string): MemPalace | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY(projectSlug));
    if (!raw) return null;
    const data = JSON.parse(raw) as {
      projectSlug: string;
      createdAt: number;
      updatedAt: number;
      wings: Array<{ id: string; metadata: Record<string, unknown>; rooms: Array<{ name: string; entries: MemoryEntry[] }> }>;
    };
    const palace = new MemPalace(data.projectSlug);
    const wings = new Map<string, Wing>();
    for (const w of data.wings) {
      const rooms = new Map<string, Room>();
      for (const r of w.rooms) rooms.set(r.name, { name: r.name, entries: r.entries });
      wings.set(w.id, { id: w.id, rooms, metadata: w.metadata });
    }
    palace.importState({ projectSlug: data.projectSlug, wings, createdAt: data.createdAt, updatedAt: data.updatedAt });
    return palace;
  } catch (err) {
    console.warn('[mempalace] rehydrate failed:', err);
    return null;
  }
}

/** Get or create a MemPalace for a project. Auto-loads from localStorage and
 *  auto-persists on every change (debounced). */
export function getPalace(projectSlug: string): MemPalace {
  if (!palaceCache.has(projectSlug)) {
    const restored = tryRehydrate(projectSlug);
    const palace = restored ?? new MemPalace(projectSlug);
    palaceCache.set(projectSlug, palace);
    // Wire change → debounced persist.
    palace.onChange(() => {
      const existing = persistTimers.get(projectSlug);
      if (existing) clearTimeout(existing);
      persistTimers.set(projectSlug, setTimeout(() => persistNow(projectSlug), PERSIST_DEBOUNCE_MS));
    });
  }
  return palaceCache.get(projectSlug)!;
}

/** Close and remove a palace from cache. */
export function closePalace(projectSlug: string): void {
  palaceCache.delete(projectSlug);
}

/** Replace a palace in cache (used after deserialization). */
export function setPalace(projectSlug: string, palace: MemPalace): void {
  palaceCache.set(projectSlug, palace);
}

// Event bus for Brain wake-up events.
// Thin in-memory layer with optional Y.Doc origin-filtering.
// Brains subscribe with a filter; the bus routes events efficiently.

import type { BrainEvent, BrainEventType, Zone } from './types';

export interface EventFilter {
  types?: BrainEventType[];
  authorNot?: string;         // exclude events authored by this id (don't wake on own edits)
  targetBrainId?: string;     // for peer_message: only if addressed to me
  zone?: Zone;                // only if event.zoneHint overlaps
}

export type EventHandler = (event: BrainEvent) => void;

interface Subscription {
  id: string;
  filter: EventFilter;
  handler: EventHandler;
}

export class EventBus {
  private subs = new Map<string, Subscription>();
  private nextId = 1;

  publish(event: BrainEvent): void {
    for (const sub of this.subs.values()) {
      if (matches(event, sub.filter)) {
        try { sub.handler(event); }
        catch (err) { console.error('[EventBus] handler error:', err); }
      }
    }
  }

  subscribe(filter: EventFilter, handler: EventHandler): () => void {
    const id = `sub_${this.nextId++}`;
    this.subs.set(id, { id, filter, handler });
    return () => this.subs.delete(id);
  }

  clear(): void {
    this.subs.clear();
  }

  get size(): number {
    return this.subs.size;
  }
}

function matches(event: BrainEvent, filter: EventFilter): boolean {
  if (filter.types && !filter.types.includes(event.type)) return false;
  if (filter.authorNot && event.authorId === filter.authorNot) return false;
  if (filter.targetBrainId && event.targetBrainId && event.targetBrainId !== filter.targetBrainId) return false;
  if (filter.zone && event.zoneHint && !zonesOverlap(filter.zone, event.zoneHint)) return false;
  return true;
}

function zonesOverlap(a: Zone, b: Zone): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

// ─── Singleton ────────────────────────────────────────────────────────────
// One event bus per app instance. Export a lazily-constructed singleton for
// simple imports; tests can instantiate EventBus directly.

let _bus: EventBus | null = null;
export function getEventBus(): EventBus {
  if (!_bus) _bus = new EventBus();
  return _bus;
}

// ─── Event factory helpers ────────────────────────────────────────────────

let _eventIdCounter = 0;
export function makeEvent(
  type: BrainEventType,
  payload: Record<string, unknown> = {},
  extras: Partial<Pick<BrainEvent, 'authorId' | 'zoneHint' | 'targetBrainId'>> = {},
): BrainEvent {
  return {
    id: `evt_${Date.now().toString(36)}_${(_eventIdCounter++).toString(36)}`,
    type,
    at: Date.now(),
    payload,
    ...extras,
  };
}

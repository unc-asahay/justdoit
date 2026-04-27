/**
 * Conflict Logger — Append-Only Event Log
 *
 * Records all conflict events across all 5 layers.
 * The ConflictDashboard reads from this log.
 * Events are immutable once recorded.
 */

import type { ConflictEvent, ConflictEventType } from './types';

export class ConflictLogger {
  private events: ConflictEvent[] = [];
  private maxEvents: number = 500;
  private subscribers: Array<(event: ConflictEvent) => void> = [];

  constructor(maxEvents: number = 500) {
    this.maxEvents = maxEvents;
  }

  // ─── Subscribe ──────────────────────────────────────────────────────────

  subscribe(callback: (event: ConflictEvent) => void): () => void {
    this.subscribers.push(callback);
    return () => {
      this.subscribers = this.subscribers.filter(cb => cb !== callback);
    };
  }

  // ─── Log ────────────────────────────────────────────────────────────────

  log(event: Omit<ConflictEvent, 'id' | 'timestamp'>): void {
    const fullEvent: ConflictEvent = {
      ...event,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    this.events.push(fullEvent);

    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    for (const cb of this.subscribers) {
      cb(fullEvent);
    }
  }

  // ─── Queries ──────────────────────────────────────────────────────────

  getRecent(count: number = 20): ConflictEvent[] {
    return this.events.slice(-count).reverse();
  }

  getByType(type: ConflictEventType): ConflictEvent[] {
    return this.events.filter(e => e.type === type);
  }

  getByAgent(agentId: string): ConflictEvent[] {
    return this.events.filter(e => e.agentId === agentId);
  }

  getBySeverity(severity: 'info' | 'warning' | 'error'): ConflictEvent[] {
    return this.events.filter(e => e.severity === severity);
  }

  getDenialCount(): number {
    return this.events.filter(e => e.severity === 'error').length;
  }

  getAll(): ConflictEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}
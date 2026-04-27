/**
 * Layer 3: Lock Manager
 *
 * Provides mutex-style locking for canvas nodes.
 *
 * Rules:
 *   - Only 1 writer per node at a time
 *   - Locks have a 30-second TTL (configurable)
 *   - Agents can send heartbeats to extend TTL
 *   - Waiting agents are queued (FIFO)
 *   - Expired locks are cleaned up lazily (on next access)
 *   - Max 10 agents in queue per node (prevent unbounded growth)
 *
 * Lifecycle:
 *   acquire() → heartbeat() → release()
 *       ↓           ↓            ↓
 *   Lock held   TTL extended   Next in queue gets lock
 */

import type { Lock, LockResult } from './types';
import { LOCK_TTL_MS, LOCK_MAX_QUEUE } from './types';

export type LockEventHandler = (event: {
  type: 'acquired' | 'released' | 'expired' | 'queued';
  nodeId: string;
  agentId: string;
  queuePosition?: number;
}) => void;

export class LockManager {
  private locks: Map<string, Lock> = new Map();
  private queues: Map<string, string[]> = new Map();
  private eventHandler: LockEventHandler | null = null;

  // ─── Event Subscription ─────────────────────────────────────────────────

  onEvent(handler: LockEventHandler): void {
    this.eventHandler = handler;
  }

  private emit(event: Parameters<LockEventHandler>[0]): void {
    this.eventHandler?.(event);
  }

  // ─── Acquire Lock ────────────────────────────────────────────────────────

  acquire(nodeId: string, agentId: string): LockResult {
    this.cleanExpired(nodeId);

    const existing = this.locks.get(nodeId);

    if (existing) {
      if (existing.agentId === agentId) {
        existing.expiresAt = Date.now() + LOCK_TTL_MS;
        return { acquired: true };
      }

      const queue = this.queues.get(nodeId) || [];

      if (queue.includes(agentId)) {
        const position = queue.indexOf(agentId) + 1;
        return {
          acquired: false,
          reason: `Locked by '${existing.agentId}'`,
          queuePosition: position,
          currentHolder: existing.agentId,
        };
      }

      if (queue.length >= LOCK_MAX_QUEUE) {
        return {
          acquired: false,
          reason: `Lock queue full (max ${LOCK_MAX_QUEUE})`,
          currentHolder: existing.agentId,
        };
      }

      queue.push(agentId);
      this.queues.set(nodeId, queue);
      this.emit({ type: 'queued', nodeId, agentId, queuePosition: queue.length });

      return {
        acquired: false,
        reason: `Locked by '${existing.agentId}'`,
        queuePosition: queue.length,
        currentHolder: existing.agentId,
      };
    }

    this.locks.set(nodeId, {
      nodeId,
      agentId,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + LOCK_TTL_MS,
    });

    this.emit({ type: 'acquired', nodeId, agentId });

    return { acquired: true };
  }

  // ─── Release Lock ────────────────────────────────────────────────────────

  release(nodeId: string, agentId: string): boolean {
    const lock = this.locks.get(nodeId);
    if (!lock) return false;
    if (lock.agentId !== agentId) return false;

    this.locks.delete(nodeId);
    this.emit({ type: 'released', nodeId, agentId });
    this.promoteNext(nodeId);

    return true;
  }

  forceRelease(nodeId: string): void {
    const lock = this.locks.get(nodeId);
    if (lock) {
      this.locks.delete(nodeId);
      this.emit({ type: 'released', nodeId, agentId: lock.agentId });
      this.promoteNext(nodeId);
    }
  }

  // ─── Heartbeat ─────────────────────────────────────────────────────────

  heartbeat(nodeId: string, agentId: string): boolean {
    const lock = this.locks.get(nodeId);
    if (!lock || lock.agentId !== agentId) return false;
    lock.expiresAt = Date.now() + LOCK_TTL_MS;
    return true;
  }

  // ─── Release All (per agent) ───────────────────────────────────────────

  releaseAllByAgent(agentId: string): number {
    let released = 0;
    for (const [nodeId, lock] of this.locks.entries()) {
      if (lock.agentId === agentId) {
        this.locks.delete(nodeId);
        this.emit({ type: 'released', nodeId, agentId });
        this.promoteNext(nodeId);
        released++;
      }
    }

    for (const [nodeId, queue] of this.queues.entries()) {
      this.queues.set(nodeId, queue.filter(id => id !== agentId));
    }

    return released;
  }

  // ─── Queries ───────────────────────────────────────────────────────────

  getLock(nodeId: string): Lock | undefined {
    this.cleanExpired(nodeId);
    return this.locks.get(nodeId);
  }

  getActiveLocks(): Lock[] {
    this.cleanAllExpired();
    return Array.from(this.locks.values());
  }

  getQueue(nodeId: string): string[] {
    return this.queues.get(nodeId) || [];
  }

  getAgentLocks(agentId: string): Lock[] {
    this.cleanAllExpired();
    return Array.from(this.locks.values()).filter(l => l.agentId === agentId);
  }

  // ─── Internal Helpers ──────────────────────────────────────────────────

  private cleanExpired(nodeId: string): void {
    const lock = this.locks.get(nodeId);
    if (lock && Date.now() > lock.expiresAt) {
      this.locks.delete(nodeId);
      this.emit({ type: 'expired', nodeId, agentId: lock.agentId });
      this.promoteNext(nodeId);
    }
  }

  private cleanAllExpired(): void {
    const now = Date.now();
    for (const [nodeId, lock] of this.locks.entries()) {
      if (now > lock.expiresAt) {
        this.locks.delete(nodeId);
        this.emit({ type: 'expired', nodeId, agentId: lock.agentId });
        this.promoteNext(nodeId);
      }
    }
  }

  private promoteNext(nodeId: string): void {
    const queue = this.queues.get(nodeId);
    if (!queue || queue.length === 0) return;

    const nextAgent = queue.shift()!;
    if (queue.length === 0) {
      this.queues.delete(nodeId);
    }

    this.locks.set(nodeId, {
      nodeId,
      agentId: nextAgent,
      acquiredAt: Date.now(),
      expiresAt: Date.now() + LOCK_TTL_MS,
    });
    this.emit({ type: 'acquired', nodeId, agentId: nextAgent });
  }
}
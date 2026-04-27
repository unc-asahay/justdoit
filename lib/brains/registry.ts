// Brain lifecycle registry: spawn, retire, observe.
// Brains are persisted in Y.Doc; this class keeps a runtime projection
// (Brain class instances) in sync with the shared document.

import * as Y from 'yjs';
import type { BrainSpec, BrainNode, BrainState, Zone } from './types';
import type { AIConnection } from '@/lib/ai/providers';
import { Brain } from './Brain';
import { getBrainsMap, applyOps } from './canvas-ops';
import { EventBus, makeEvent } from './events';
import { log } from './log';

export interface RegistryDeps {
  ydoc: Y.Doc;
  eventBus: EventBus;
  getConnection?: () => AIConnection | null;
  getProjectSlug?: () => string;
}

export class BrainRegistry {
  private instances = new Map<string, Brain>();
  private observerBound = false;

  constructor(private deps: RegistryDeps) {}

  start(): void {
    if (this.observerBound) return;
    const brains = getBrainsMap(this.deps.ydoc);

    // Hydrate existing brains already in the document.
    for (const [id, node] of brains.entries()) {
      if (node.retiredAt) continue;
      this.hydrate(node);
    }

    // Observe remote spawns/retires (from other peers or cold boot).
    brains.observe((event) => {
      event.keysChanged.forEach((id) => {
        const existing = brains.get(id);
        if (!existing) {
          this.instances.get(id)?.dispose();
          this.instances.delete(id);
          return;
        }
        if (existing.retiredAt && this.instances.has(id)) {
          this.instances.get(id)?.dispose();
          this.instances.delete(id);
        } else if (!existing.retiredAt && !this.instances.has(id)) {
          this.hydrate(existing);
        }
      });
    });

    this.observerBound = true;
  }

  spawn(spec: BrainSpec, zone: Zone, cursor = { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2 }): Brain {
    const now = Date.now();
    const node: BrainNode = {
      id: spec.id,
      type: 'brain',
      owner: spec.id,
      layer: 50,
      createdAt: now,
      updatedAt: now,
      name: spec.name,
      emoji: spec.emoji,
      color: spec.color,
      cursor,
      zone,
      state: 'idle',
      spec,
    };
    applyOps(this.deps.ydoc, [{ op: 'create', node }], 'registry:spawn');
    // hydrate() runs via observer; but we also want to return the instance synchronously.
    const brain = this.hydrate(node);
    this.deps.eventBus.publish(makeEvent('heartbeat_tick', { reason: 'spawned' }, { targetBrainId: spec.id }));
    log({ level: 'info', kind: 'spawn', brainId: spec.id, message: `spawned ${spec.name}`, data: { name: spec.name, emoji: spec.emoji, model: spec.modelId } });
    return brain;
  }

  retire(brainId: string, reason: string = 'user'): void {
    const brains = getBrainsMap(this.deps.ydoc);
    const existing = brains.get(brainId);
    if (!existing) return;
    applyOps(
      this.deps.ydoc,
      [{ op: 'update', nodeId: brainId, patch: { retiredAt: Date.now(), state: 'retired' as BrainState } }],
      `registry:retire:${reason}`,
    );
    log({ level: 'info', kind: 'retire', brainId, message: `retired (${reason})` });
  }

  get(brainId: string): Brain | null {
    return this.instances.get(brainId) ?? null;
  }

  list(): Brain[] {
    return [...this.instances.values()];
  }

  private hydrate(node: BrainNode): Brain {
    if (this.instances.has(node.id)) return this.instances.get(node.id)!;
    const brain = new Brain(node.spec, {
      ydoc: this.deps.ydoc,
      eventBus: this.deps.eventBus,
      initialCursor: node.cursor,
      initialZone: node.zone,
      getConnection: this.deps.getConnection,
      getProjectSlug: this.deps.getProjectSlug,
    });
    brain.init();
    this.instances.set(node.id, brain);
    return brain;
  }

  dispose(): void {
    for (const brain of this.instances.values()) brain.dispose();
    this.instances.clear();
  }
}

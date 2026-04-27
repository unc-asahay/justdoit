'use client';

// BrainsProvider — owns the Y.Doc, EventBus, and BrainRegistry for the whole
// app. Always mounts so downstream consumers can safely `useBrains()`.
// Zero-cost when no one spawns a Brain: one Y.Doc + one event bus, no network.
//
// The singleton survives Fast Refresh/HMR and route navigation because it is
// pinned to a module-level variable (and globalThis during dev). React's
// useMemo alone is not enough — any HMR swap of this file or of any module
// upstream from the provider would otherwise tear the Y.Doc down and wipe
// every spawned Brain.

import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { BrainRegistry } from './registry';
import { EventBus, getEventBus, makeEvent } from './events';
import type { BrainNode, BrainTask } from './types';
import { getBrainsMap, getNodesMap, getToolsMap, getTasksMap } from './canvas-ops';
import { useSettings } from '@/lib/ai/settings-store';
import type { AIConnection } from '@/lib/ai/providers';

interface BrainsContextValue {
  ydoc: Y.Doc;
  eventBus: EventBus;
  registry: BrainRegistry;
  persistence: IndexeddbPersistence | null;
  ready: boolean; // true once IndexedDB has rehydrated the doc
}

const BrainsContext = createContext<BrainsContextValue | null>(null);

// Module-level singleton. Stashed on globalThis so hot-swaps of this file
// still find the same Y.Doc on the next render.
const GLOBAL_KEY = '__justdoit_brains_singleton__';
const PERSISTENCE_DB_NAME = 'justdoit-brains-v1';
const connectionRefSingleton: { current: AIConnection | null } = { current: null };
const projectSlugRefSingleton: { current: string } = { current: 'default' };

// Task transitions → BrainEvents. Watches b_tasks and fires:
//   - task_assigned   when assigneeBrainId becomes non-null (or changes Brain)
//   - task_unblocked  when status='todo' AND all dependsOn are 'done' AND
//                     at least one dependency just transitioned (so we only
//                     fire once per unblock event, not on every observer wake)
//   - task_completed  when status transitions to 'done'
// Keeps a `previous` snapshot per task id so we can compare against last seen.
function startTaskTransitionObserver(ydoc: Y.Doc, eventBus: EventBus) {
  const tasks = getTasksMap(ydoc);
  const previous = new Map<string, BrainTask>();
  // Seed from current state so we don't fire on initial hydration.
  for (const [id, t] of tasks.entries()) previous.set(id, { ...t });

  const onChange = () => {
    // Snapshot fresh state. Compare to previous and fire on transitions.
    const current = new Map<string, BrainTask>();
    for (const [id, t] of tasks.entries()) current.set(id, t);

    // Track tasks that just hit 'done' so unblock can re-evaluate dependents.
    const justCompleted: string[] = [];

    for (const [id, t] of current) {
      const prev = previous.get(id);

      // task_assigned — assignee transitioned to a non-null value or changed.
      const prevAssignee = prev?.assigneeBrainId ?? null;
      if (t.assigneeBrainId && t.assigneeBrainId !== prevAssignee) {
        eventBus.publish(makeEvent(
          'task_assigned',
          { taskId: id, title: t.title, requiredCapabilities: t.requiredCapabilities },
          { authorId: t.createdByBrainId, targetBrainId: t.assigneeBrainId },
        ));
      }

      // task_completed — status transitioned to 'done'.
      if (t.status === 'done' && prev?.status !== 'done') {
        justCompleted.push(id);
        eventBus.publish(makeEvent(
          'task_completed',
          { taskId: id, title: t.title, outputNodeIds: t.outputNodeIds },
          { authorId: t.assigneeBrainId ?? t.createdByBrainId },
        ));
      }
    }

    // task_unblocked — fire for any 'todo' task whose dependsOn list is now
    // entirely 'done'. Only fire if a dependency just completed in this tick,
    // so we don't spam events from the same already-unblocked state.
    if (justCompleted.length > 0) {
      const completedSet = new Set(justCompleted);
      for (const [id, t] of current) {
        if (t.status !== 'todo' || t.dependsOn.length === 0) continue;
        // At least one dependency just transitioned; verify all deps now done.
        const triggered = t.dependsOn.some((dep) => completedSet.has(dep));
        if (!triggered) continue;
        const allDone = t.dependsOn.every((dep) => current.get(dep)?.status === 'done');
        if (!allDone) continue;
        eventBus.publish(makeEvent(
          'task_unblocked',
          { taskId: id, title: t.title },
          { authorId: 'system', targetBrainId: t.assigneeBrainId ?? undefined },
        ));
      }
    }

    // Replace previous snapshot for next tick.
    previous.clear();
    for (const [id, t] of current) previous.set(id, { ...t });
  };

  tasks.observe(onChange);
  return () => tasks.unobserve(onChange);
}

// Idle-wander ticker: every ~10s, pick one idle Brain and nudge its cursor a
// few pixels in a random direction so the canvas doesn't feel frozen. The
// existing CSS transition smooths the nudge into an organic-looking drift.
function startIdleWanderTicker(ydoc: Y.Doc) {
  const intervalMs = 10_000;
  const driftPx = 14;
  const tick = () => {
    try {
      const brains = ydoc.getMap('b_brains');
      const candidates: Array<{ id: string; cursor: { x: number; y: number }; zone: { x: number; y: number; w: number; h: number } }> = [];
      for (const [, raw] of brains.entries()) {
        const b = raw as { id: string; cursor: { x: number; y: number }; zone: { x: number; y: number; w: number; h: number }; state: string; retiredAt?: number };
        if (b.retiredAt) continue;
        if (b.state !== 'idle') continue;
        candidates.push({ id: b.id, cursor: b.cursor, zone: b.zone });
      }
      if (candidates.length === 0) return;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      const angle = Math.random() * Math.PI * 2;
      const nx = pick.cursor.x + Math.cos(angle) * driftPx;
      const ny = pick.cursor.y + Math.sin(angle) * driftPx;
      // Stay within zone (with a 20px inset).
      const z = pick.zone;
      const cx = Math.max(z.x + 20, Math.min(z.x + z.w - 20, nx));
      const cy = Math.max(z.y + 20, Math.min(z.y + z.h - 20, ny));
      const map = ydoc.getMap('b_brains');
      const existing = map.get(pick.id) as { cursor: { x: number; y: number } } & Record<string, unknown> | undefined;
      if (!existing) return;
      ydoc.transact(() => {
        map.set(pick.id, { ...existing, cursor: { x: cx, y: cy }, updatedAt: Date.now() });
      }, 'idle-wander');
    } catch {
      // Silent — drift is cosmetic, no point alarming the user.
    }
  };
  const id = setInterval(tick, intervalMs);
  return () => clearInterval(id);
}

function getSingleton(): BrainsContextValue {
  const g = globalThis as unknown as Record<string, BrainsContextValue | undefined>;
  let s = g[GLOBAL_KEY];
  if (!s) {
    const ydoc = new Y.Doc();
    const eventBus = getEventBus();
    const registry = new BrainRegistry({
      ydoc,
      eventBus,
      getConnection: () => connectionRefSingleton.current,
      getProjectSlug: () => projectSlugRefSingleton.current,
    });

    // Bind IndexedDB persistence in the browser only. Registry hydrates
    // existing brains via its observer once the doc syncs from disk.
    let persistence: IndexeddbPersistence | null = null;
    let ready = false;
    // Bind the registry observer FIRST. y-indexeddb writes saved nodes back
    // into the doc via applyUpdate after we mount, which fires the observer
    // and hydrates each saved Brain.
    registry.start();

    if (typeof window !== 'undefined') {
      persistence = new IndexeddbPersistence(PERSISTENCE_DB_NAME, ydoc);
      persistence.once('synced', () => {
        ready = true;
        if (s) s.ready = true;
        // Bind task observer AFTER hydration so we don't fire stale-assignment
        // events for tasks that already existed in IndexedDB.
        startTaskTransitionObserver(ydoc, eventBus);
      });
      // Tamagotchi-style ambient motion so the canvas feels alive even when
      // no Brain has been prompted recently.
      startIdleWanderTicker(ydoc);
    } else {
      ready = true;
    }
    s = { ydoc, eventBus, registry, persistence, ready };
    g[GLOBAL_KEY] = s;
  }
  return s;
}

export function BrainsProvider({ children }: { children: ReactNode }) {
  const { getActiveConnection } = useSettings();
  useEffect(() => {
    connectionRefSingleton.current = getActiveConnection();
  });
  // Keep project slug in sync with whatever the canvas page is showing,
  // so MemPalace writes/reads route to the right project's wing set.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const slug = new URLSearchParams(window.location.search).get('project') || 'default';
    projectSlugRefSingleton.current = slug;
  });

  // Same instance across re-mounts — never destroyed.
  const value = getSingleton();
  // Observe the synced flag flipping from false→true so consumers re-render.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (value.ready) return;
    const p = value.persistence;
    if (!p) return;
    const onSynced = () => setTick((n) => n + 1);
    p.on('synced', onSynced);
    return () => p.off('synced', onSynced);
  }, [value]);

  return <BrainsContext.Provider value={value}>{children}</BrainsContext.Provider>;
}

export function useBrains(): BrainsContextValue {
  const ctx = useContext(BrainsContext);
  if (!ctx) throw new Error('useBrains must be used inside <BrainsProvider>');
  return ctx;
}

// Hook that returns the live list of Brain nodes from the Y.Doc and re-renders
// whenever the set changes. Use this in UI components that need to show Brains.
export function useBrainNodes(): BrainNode[] {
  const { ydoc } = useBrains();
  const [nodes, setNodes] = useState<BrainNode[]>(() => Array.from(getBrainsMap(ydoc).values()));

  useEffect(() => {
    const map = getBrainsMap(ydoc);
    const refresh = () => setNodes(Array.from(map.values()));
    map.observe(refresh);
    refresh();
    return () => map.unobserve(refresh);
  }, [ydoc]);

  return nodes;
}

// Hook that returns the live list of (non-brain) canvas nodes — rects, bubbles,
// text, etc. Use this for the debug panel's bubble preview or for a future
// canvas renderer.
export function useCanvasNodes() {
  const { ydoc } = useBrains();
  const [nodes, setNodes] = useState(() => Array.from(getNodesMap(ydoc).values()));

  useEffect(() => {
    const map = getNodesMap(ydoc);
    const refresh = () => setNodes(Array.from(map.values()));
    map.observe(refresh);
    refresh();
    return () => map.unobserve(refresh);
  }, [ydoc]);

  return nodes;
}

// Registered custom tools that Brains have authored via register_tool().
// Future canvas renderer reads this to display them in the toolbar; other
// Brains see this list in their system prompt context so they know what
// reusable shapes already exist.
export function useRegisteredTools() {
  const { ydoc } = useBrains();
  const [tools, setTools] = useState(() => Array.from(getToolsMap(ydoc).values()));

  useEffect(() => {
    const map = getToolsMap(ydoc);
    const refresh = () => setTools(Array.from(map.values()));
    map.observe(refresh);
    refresh();
    return () => map.unobserve(refresh);
  }, [ydoc]);

  return tools;
}

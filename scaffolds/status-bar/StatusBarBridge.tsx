'use client';

// Pushes live system state into the StatusBarContext so the footer in the
// canvas tab actually reflects what's running:
//   - 🧠 MemPalace entry count for the active project
//   - 🔀 active GitHub branch (when sync is wired)
//   - 💾 save status from y-indexeddb
//   - 🤖 number of live Brains on the canvas

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useBrainNodes, useBrains } from '@/lib/brains/provider';
import { getPalace } from '@/lib/memory';
import { useStatusBar } from './StatusBar';

export function StatusBarBridge() {
  const search = useSearchParams();
  const projectSlug = search.get('project') || 'default';
  const brains = useBrainNodes();
  const { update } = useStatusBar();
  const { persistence } = useBrains();

  // Live brain count → status bar.
  useEffect(() => {
    const live = brains.filter((b) => !b.retiredAt && b.state !== 'retired').length;
    update({ activeAgents: live });
  }, [brains, update]);

  // MemPalace entry count for this project. Re-counts on palace changes via
  // the onChange subscriber so the footer updates as soon as anything is fed.
  useEffect(() => {
    const palace = getPalace(projectSlug);
    const recount = () => {
      let total = 0;
      for (const wingId of palace.getWingIds()) {
        for (const roomName of palace.getRoomNames(wingId)) {
          total += palace.getRoom(wingId, roomName).entries.length;
        }
      }
      update({ memPalaceCount: total });
    };
    recount();
    return palace.onChange(recount);
  }, [projectSlug, update]);

  // Save status: track both the y-indexeddb persistence "synced" event AND
  // every Y.Doc update (which flushes to IndexedDB automatically). Without
  // the doc-update listener the timestamp froze at initial sync and the
  // footer just said "Not saved" forever.
  const { ydoc } = useBrains();
  useEffect(() => {
    const stamp = () => update({ saveStatus: 'saved', lastSavedAt: new Date() });
    if (persistence) {
      persistence.on('synced', stamp);
    }
    const onDocUpdate = () => stamp();
    ydoc.on('update', onDocUpdate);
    return () => {
      if (persistence) persistence.off('synced', stamp);
      ydoc.off('update', onDocUpdate);
    };
  }, [persistence, ydoc, update]);

  // Auto-flip "saved" timestamp every 20s so the footer's relative time
  // ("Saved 12s ago") doesn't go stale.
  useEffect(() => {
    const id = setInterval(() => {
      // Touch the context with no changes; StatusBar's own formatSaveStatus
      // re-evaluates based on lastSavedAt so we just need a re-render.
      update({});
    }, 20_000);
    return () => clearInterval(id);
  }, [update]);

  return null;
}

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { SyncEngine } from '@/lib/github/sync-engine';
import type { SyncState, SyncOptions } from '@/lib/github/sync-engine';
import type { ChangeSet } from '@/lib/github/diff-tracker';

interface UseSyncReturn {
  // Reactive state
  syncState: SyncState;
  isDirty: boolean;
  issyncing: boolean;
  lastSavedAt: Date | null;
  lastPushedAt: Date | null;
  currentBranch: string;
  errorMessage: string | null;

  // Actions
  markDirty: (change?: ChangeSet) => void;
  save: () => Promise<void>;
  push: () => Promise<void>;
  pull: () => Promise<void>;
  forceSave: () => Promise<void>;

  // Branch operations
  switchBranch: (name: string) => Promise<void>;
  createBranch: (name: string) => Promise<void>;
  listBranches: () => Promise<string[]>;
  mergeBranch: (source: string, target?: string) => Promise<void>;

  // Lifecycle
  start: () => void;
  stop: () => void;
}

export function useSync(
  projectSlug: string,
  options?: SyncOptions,
): UseSyncReturn {
  const engineRef = useRef<SyncEngine | null>(null);

  const [syncState, setSyncState] = useState<SyncState>({
    isDirty: false,
    lastSavedAt: null,
    lastPushedAt: null,
    currentBranch: 'main',
    pendingChanges: [],
    syncStatus: 'idle',
    errorMessage: null,
  });

  // Initialize engine on mount
  useEffect(() => {
    const engine = new SyncEngine(projectSlug, options);
    engineRef.current = engine;

    // Subscribe to state changes
    const unsubscribe = engine.onChange((newState) => {
      setSyncState({ ...newState });
    });

    return () => {
      unsubscribe();
      engine.stop();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectSlug]); // Only re-create if projectSlug changes — late-arriving
  //                    options are pushed in via the second effect below.

  // Push option updates into the live engine. Critical for repoFullName,
  // which arrives async from useGitHub() after auth restore. Without this,
  // the engine permanently uses the placeholder owner/repo and every API
  // call 404s.
  useEffect(() => {
    if (!engineRef.current) return;
    engineRef.current.updateOptions({
      repoFullName: options?.repoFullName,
      defaultBranch: options?.defaultBranch,
      getCanvasSnapshot: options?.getCanvasSnapshot,
    });
  }, [options?.repoFullName, options?.defaultBranch, options?.getCanvasSnapshot]);

  // ── Actions ─────────────────────────────────────────────────────────────

  const markDirty = useCallback((change?: ChangeSet) => {
    engineRef.current?.markDirty(change);
  }, []);

  const save = useCallback(async () => {
    await engineRef.current?.save();
  }, []);

  const push = useCallback(async () => {
    await engineRef.current?.push();
  }, []);

  const pull = useCallback(async () => {
    await engineRef.current?.pull();
  }, []);

  const forceSave = useCallback(async () => {
    await engineRef.current?.forceSave();
  }, []);

  // ── Branch Operations ───────────────────────────────────────────────────

  const switchBranch = useCallback(async (name: string) => {
    await engineRef.current?.switchBranch(name);
  }, []);

  const createBranch = useCallback(async (name: string) => {
    await engineRef.current?.createBranch(name);
  }, []);

  const listBranches = useCallback(async (): Promise<string[]> => {
    return (await engineRef.current?.listBranches()) ?? [];
  }, []);

  const mergeBranch = useCallback(async (source: string, target?: string) => {
    await engineRef.current?.mergeBranch(source, target);
  }, []);

  // ── Lifecycle ───────────────────────────────────────────────────────────

  const start = useCallback(() => {
    engineRef.current?.start();
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.stop();
  }, []);

  return {
    syncState,
    isDirty: syncState.isDirty,
    issyncing: syncState.syncStatus === 'syncing',
    lastSavedAt: syncState.lastSavedAt,
    lastPushedAt: syncState.lastPushedAt,
    currentBranch: syncState.currentBranch,
    errorMessage: syncState.errorMessage,
    markDirty,
    save,
    push,
    pull,
    forceSave,
    switchBranch,
    createBranch,
    listBranches,
    mergeBranch,
    start,
    stop,
  };
}

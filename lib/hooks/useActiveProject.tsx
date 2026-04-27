'use client';

/**
 * Active Project Context — Remembers the last project the user was working on.
 * Used by the navbar to always link Canvas to the right project.
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

const STORAGE_KEY = 'justdoit:active-project';

interface ActiveProjectCtx {
  /** The ID of the last active project */
  projectId: string | null;
  /** Set the active project (called when opening a project from Home) */
  setActiveProject: (id: string) => void;
}

const Ctx = createContext<ActiveProjectCtx>({
  projectId: null,
  setActiveProject: () => {},
});

export function ActiveProjectProvider({ children }: { children: ReactNode }) {
  const [projectId, setProjectId] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setProjectId(stored);
    } catch { /* ignore */ }
  }, []);

  const setActiveProject = useCallback((id: string) => {
    setProjectId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch { /* ignore */ }
  }, []);

  return (
    <Ctx.Provider value={{ projectId, setActiveProject }}>
      {children}
    </Ctx.Provider>
  );
}

export function useActiveProject() {
  return useContext(Ctx);
}

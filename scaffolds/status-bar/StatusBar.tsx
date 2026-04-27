'use client';

import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface StatusBarData {
  memPalaceCount: number | null;
  branch: string | null;
  saveStatus: 'saved' | 'dirty' | 'saving' | 'error' | null;
  lastSavedAt: Date | null;
  activeAgents: number;
}

interface StatusBarContextType {
  data: StatusBarData;
  update: (partial: Partial<StatusBarData>) => void;
}

const DEFAULT_STATUS: StatusBarData = {
  memPalaceCount: null,
  branch: null,
  saveStatus: null,
  lastSavedAt: null,
  activeAgents: 0,
};

const StatusBarContext = createContext<StatusBarContextType>({
  data: DEFAULT_STATUS,
  update: () => {},
});

export function StatusBarProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StatusBarData>(DEFAULT_STATUS);

  const update = useCallback((partial: Partial<StatusBarData>) => {
    setData(prev => ({ ...prev, ...partial }));
  }, []);

  return (
    <StatusBarContext.Provider value={{ data, update }}>
      {children}
    </StatusBarContext.Provider>
  );
}

export function useStatusBar() {
  return useContext(StatusBarContext);
}

function formatSaveStatus(data: StatusBarData): string {
  if (data.saveStatus === 'saved' && data.lastSavedAt) {
    const ago = Math.round((Date.now() - data.lastSavedAt.getTime()) / 1000);
    if (ago < 60) return `Saved ${ago}s ago`;
    return `Saved ${Math.round(ago / 60)}m ago`;
  }
  if (data.saveStatus === 'saving') return 'Saving…';
  if (data.saveStatus === 'dirty') return 'Unsaved changes';
  if (data.saveStatus === 'error') return 'Save failed';
  return 'Not saved';
}

export function StatusBar() {
  const { data } = useStatusBar();

  return (
    <footer className="flex-shrink-0 px-4 py-1.5 flex items-center gap-4 text-xs"
      style={{ backgroundColor: 'var(--statusbar-bg)', borderTop: '1px solid var(--statusbar-border)', color: 'var(--statusbar-text)' }}>
      <span className="flex items-center gap-1">
        <span>🧠</span>
        <span>MemPalace: {data.memPalaceCount !== null ? data.memPalaceCount : '--'}</span>
      </span>
      <span className="flex items-center gap-1">
        <span>🔀</span>
        <span>Branch: {data.branch || '--'}</span>
      </span>
      <span className={`flex items-center gap-1 ${
        data.saveStatus === 'dirty' ? 'text-yellow-500' :
        data.saveStatus === 'error' ? 'text-red-500' :
        data.saveStatus === 'saved' ? 'text-green-500' : ''
      }`}>
        <span>💾</span>
        <span>{formatSaveStatus(data)}</span>
      </span>
      <div className="flex items-center gap-1 hover:bg-white/10 px-1.5 py-0.5 rounded cursor-pointer transition-colors" title="Manage Active Brains">
        <span>🤖</span>
        <span>{data.activeAgents} {data.activeAgents === 1 ? 'brain' : 'brains'} active</span>
      </div>
    </footer>
  );
}

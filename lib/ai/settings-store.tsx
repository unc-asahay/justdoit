'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { type AIConnection } from './providers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ThinkingSettings {
  enabled: boolean;
  effort: 'low' | 'medium' | 'high';
  budgetTokens?: number;
}

export interface GlobalSettings {
  /** The list of user-configured API connections */
  connections: AIConnection[];
  /** The ID of the currently active connection */
  activeConnectionId: string | null;
  /** Default max_tokens for new sessions */
  defaultMaxTokens: number;
  /** Thinking configuration for compatible models */
  thinking: ThinkingSettings;
}

const DEFAULT_SETTINGS: GlobalSettings = {
  connections: [],
  activeConnectionId: null,
  defaultMaxTokens: 4096,
  thinking: {
    enabled: false,
    effort: 'medium',
    budgetTokens: 2048,
  },
};

const STORAGE_KEY = 'justdoit:ai-settings';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadFromStorage(): GlobalSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as GlobalSettings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveToStorage(s: GlobalSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // localStorage may be full or unavailable
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface SettingsStore extends GlobalSettings {
  settings: GlobalSettings;
  setSettings: (s: GlobalSettings) => void;
  updateSettings: (partial: Partial<GlobalSettings>) => void;
  
  addConnection: (conn: AIConnection) => void;
  updateConnection: (id: string, partial: Partial<AIConnection>) => void;
  removeConnection: (id: string) => void;
  setActiveConnection: (id: string) => void;
  
  getActiveConnection: () => AIConnection | null;
  
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsStore | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, _setSettings] = useState<GlobalSettings>(DEFAULT_SETTINGS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    _setSettings(loadFromStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) {
      saveToStorage(settings);
    }
  }, [settings, hydrated]);

  const setSettings = useCallback((s: GlobalSettings) => {
    _setSettings(s);
  }, []);

  const updateSettings = useCallback((partial: Partial<GlobalSettings>) => {
    _setSettings(prev => ({ ...prev, ...partial }));
  }, []);

  const addConnection = useCallback((conn: AIConnection) => {
    _setSettings(prev => {
      const isFirst = prev.connections.length === 0;
      return {
        ...prev,
        connections: [...prev.connections, conn],
        activeConnectionId: isFirst ? conn.id : prev.activeConnectionId,
      };
    });
  }, []);

  const updateConnection = useCallback((id: string, partial: Partial<AIConnection>) => {
    _setSettings(prev => ({
      ...prev,
      connections: prev.connections.map(c => c.id === id ? { ...c, ...partial } : c),
    }));
  }, []);

  const removeConnection = useCallback((id: string) => {
    _setSettings(prev => {
      const nextConnections = prev.connections.filter(c => c.id !== id);
      return {
        ...prev,
        connections: nextConnections,
        activeConnectionId: prev.activeConnectionId === id 
          ? (nextConnections[0]?.id ?? null) 
          : prev.activeConnectionId,
      };
    });
  }, []);

  const setActiveConnection = useCallback((id: string) => {
    _setSettings(prev => ({ ...prev, activeConnectionId: id }));
  }, []);

  const getActiveConnection = useCallback(() => {
    if (!settings.activeConnectionId) return null;
    return settings.connections.find(c => c.id === settings.activeConnectionId) ?? null;
  }, [settings.activeConnectionId, settings.connections]);

  const resetSettings = useCallback(() => {
    _setSettings(DEFAULT_SETTINGS);
  }, []);

  const store: SettingsStore = {
    ...settings,
    settings,
    setSettings,
    updateSettings,
    addConnection,
    updateConnection,
    removeConnection,
    setActiveConnection,
    getActiveConnection,
    resetSettings,
  };

  return (
    <SettingsContext.Provider value={store}>
      {children}
    </SettingsContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSettings(): SettingsStore {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}

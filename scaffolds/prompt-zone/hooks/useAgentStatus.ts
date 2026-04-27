'use client';

import { useState, useCallback, useEffect } from 'react';
import { getBuiltInAgents, agentToAgentDef, deserializeAgentsFile } from '@/lib/agents';
import type { AgentDef, ModelId } from '@/lib/ai/types';
import type { CustomAgent } from '@/lib/agents';

interface UseAgentStatusReturn {
  agents: AgentDef[];
  activeAgent: AgentDef | null;
  toggleAgent: (agentId: string) => void;
  setAgentModel: (agentId: string, model: ModelId) => void;
  selectAgent: (agentId: string) => void;
  getEnabledAgents: () => AgentDef[];
}

/**
 * useAgentStatus — reads agents from the same localStorage store
 * as useAgentCRUD (Agents tab), ensuring toggle state is always in sync.
 * 
 * This hook is used by the Canvas FloatingPromptBar for quick ON/OFF toggles.
 */
export function useAgentStatus(): UseAgentStatusReturn {
  const [agents, setAgents] = useState<AgentDef[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);

  // Load agents from the same source as useAgentCRUD
  useEffect(() => {
    const loadAgents = () => {
      // Built-in agents (same source as Agents tab)
      let builtIn = getBuiltInAgents();

      // ── Apply built-in overrides from localStorage (same as useAgentCRUD) ──
      try {
        const storedOverrides = localStorage.getItem('justdoit:agents-builtin:default');
        if (storedOverrides) {
          const overrides: Record<string, Partial<CustomAgent>> = JSON.parse(storedOverrides);
          builtIn = builtIn.map(agent => {
            const override = overrides[agent.id];
            if (override) {
              return { ...agent, ...override, isBuiltIn: true };
            }
            return agent;
          });
        }
      } catch { /* ignore */ }

      // ── Apply active connection model ──
      try {
        const settingsRaw = localStorage.getItem('justdoit:ai-settings');
        if (settingsRaw) {
          const settings = JSON.parse(settingsRaw);
          const conn = settings.activeConnectionId
            ? settings.connections?.find((c: any) => c.id === settings.activeConnectionId)
            : settings.connections?.[0]; // fallback to first connection
          
          if (conn) {
            builtIn = builtIn.map(agent => ({
              ...agent,
              defaultModel: conn.activeModel || agent.defaultModel,
              connectionId: conn.id,
            }));
          }
        }
      } catch { /* ignore */ }

      const builtInDefs = builtIn.map(agentToAgentDef);

      // Custom agents from localStorage (same key as useAgentCRUD)
      let custom: AgentDef[] = [];
      try {
        const stored = localStorage.getItem('justdoit:agents:default');
        if (stored) {
          const customAgents = deserializeAgentsFile(stored);
          custom = customAgents.map(agentToAgentDef);
        }
      } catch { /* ignore */ }

      const all = [...builtInDefs, ...custom];
      setAgents(all);

      // Auto-select first enabled agent
      if (!activeAgentId) {
        const firstEnabled = all.find(a => a.enabled);
        if (firstEnabled) setActiveAgentId(firstEnabled.id);
      }
    };

    loadAgents();

    // Listen for localStorage changes (cross-tab sync with Agents tab)
    const handleStorage = (e: StorageEvent) => {
      if (e.key?.startsWith('justdoit:agents')) {
        loadAgents();
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAgent = useCallback((agentId: string) => {
    setAgents(prev =>
      prev.map(a =>
        a.id === agentId ? { ...a, enabled: !a.enabled } : a
      )
    );
  }, []);

  const setAgentModel = useCallback((agentId: string, model: ModelId) => {
    setAgents(prev =>
      prev.map(a =>
        a.id === agentId ? { ...a, defaultModel: model } : a
      )
    );
  }, []);

  const selectAgent = useCallback((agentId: string) => {
    setActiveAgentId(agentId);
  }, []);

  const activeAgent = agents.find(a => a.id === activeAgentId && a.enabled) ?? null;

  const getEnabledAgents = useCallback(() => agents.filter(a => a.enabled), [agents]);

  return { agents, activeAgent, toggleAgent, setAgentModel, selectAgent, getEnabledAgents };
}

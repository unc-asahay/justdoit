'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getBuiltInAgents,
  createCustomAgent,
  serializeAgentsFile,
  deserializeAgentsFile,
} from '@/lib/agents';
import type { CustomAgent } from '@/lib/agents';
import type { AIConnection } from '@/lib/ai/providers';

interface UseAgentCRUDReturn {
  allAgents: CustomAgent[];
  customAgents: CustomAgent[];
  builtInAgents: CustomAgent[];
  isLoaded: boolean;
  createAgent: (agent: CustomAgent) => void;
  updateAgent: (agent: CustomAgent) => void;
  deleteAgent: (agentId: string) => void;
  toggleAgent: (agentId: string, enabled: boolean) => void;
  deployAgent: (agentId: string) => void;
  saveToJson: () => string;
  loadFromJson: (json: string) => void;
  getAgent: (id: string) => CustomAgent | undefined;
  getEnabledAgents: () => CustomAgent[];
}

const STORAGE_KEY_CUSTOM = (pid: string) => `justdoit:agents:${pid}`;
const STORAGE_KEY_BUILTIN = (pid: string) => `justdoit:agents-builtin:${pid}`;

export function useAgentCRUD(_projectId: string, activeConnection?: AIConnection | null): UseAgentCRUDReturn {
  const [builtInAgents, setBuiltInAgents] = useState<CustomAgent[]>([]);
  const [customAgents, setCustomAgents] = useState<CustomAgent[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load agents on mount
  useEffect(() => {
    // Start from default built-in agents
    let defaults = getBuiltInAgents();

    // Auto-assign the user's active connection to built-in agents
    // so they show the real configured model, not hardcoded defaults
    if (activeConnection) {
      defaults = defaults.map(agent => ({
        ...agent,
        defaultModel: activeConnection.activeModel as any,
        connectionId: activeConnection.id,
      }));
    }

    // Apply persisted overrides for built-in agents
    // Connection/model always comes from active connection (above);
    // overrides only persist user-intentional fields like enabled, name, prompt, etc.
    try {
      const storedOverrides = localStorage.getItem(STORAGE_KEY_BUILTIN(_projectId));
      if (storedOverrides) {
        const overrides: Record<string, Partial<CustomAgent>> = JSON.parse(storedOverrides);
        const merged = defaults.map(agent => {
          const override = overrides[agent.id];
          if (override) {
            // Apply user-intentional overrides but keep active connection for model
            const { defaultModel: _m, connectionId: _c, ...safeOverrides } = override;
            return { ...agent, ...safeOverrides, isBuiltIn: true };
          }
          return agent;
        });
        setBuiltInAgents(merged);
      } else {
        setBuiltInAgents(defaults);
      }
    } catch {
      setBuiltInAgents(defaults);
    }

    // Load custom agents
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CUSTOM(_projectId));
      if (stored) {
        setCustomAgents(deserializeAgentsFile(stored));
      }
    } catch { /* ignore */ }

    setIsLoaded(true);
  }, [_projectId, activeConnection?.id, activeConnection?.activeModel]);

  // Persist custom agents
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM(_projectId), serializeAgentsFile(customAgents));
    } catch { /* ignore */ }
  }, [customAgents, _projectId, isLoaded]);

  // Persist built-in agent overrides (enabled state, model, prompt, etc.)
  useEffect(() => {
    if (!isLoaded) return;
    try {
      const overrides: Record<string, Partial<CustomAgent>> = {};
      for (const agent of builtInAgents) {
        // Only store fields that differ from defaults or need persisting
        overrides[agent.id] = {
          enabled: agent.enabled,
          status: agent.status,
          defaultModel: agent.defaultModel,
          systemPrompt: agent.systemPrompt,
          connectionId: agent.connectionId,
          name: agent.name,
          icon: agent.icon,
          persona: agent.persona,
          description: agent.description,
          skills: agent.skills,
          zone: agent.zone,
          lastUsed: agent.lastUsed,
          totalTokens: agent.totalTokens,
        };
      }
      localStorage.setItem(STORAGE_KEY_BUILTIN(_projectId), JSON.stringify(overrides));
    } catch { /* ignore */ }
  }, [builtInAgents, _projectId, isLoaded]);

  const allAgents = [...builtInAgents, ...customAgents];

  // ─── Create ─────────────────────────────────────────────────────────────

  const createAgent = useCallback((agent: CustomAgent) => {
    setCustomAgents(prev => [...prev, agent]);
  }, []);

  // ─── Update (works for BOTH built-in and custom agents) ────────────────

  const updateAgent = useCallback((agent: CustomAgent) => {
    if (agent.isBuiltIn) {
      setBuiltInAgents(prev =>
        prev.map(a => a.id === agent.id ? { ...agent, isBuiltIn: true } : a)
      );
    } else {
      setCustomAgents(prev =>
        prev.map(a => a.id === agent.id ? agent : a)
      );
    }
  }, []);

  // ─── Delete ─────────────────────────────────────────────────────────────

  const deleteAgent = useCallback((agentId: string) => {
    setCustomAgents(prev => prev.filter(a => a.id !== agentId));
  }, []);

  // ─── Toggle (enable/disable on canvas) ──────────────────────────────────

  const toggleAgent = useCallback((agentId: string, enabled: boolean) => {
    setBuiltInAgents(prev => {
      const idx = prev.findIndex(a => a.id === agentId);
      if (idx !== -1) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], enabled, status: enabled ? 'idle' : 'disabled' };
        return updated;
      }
      return prev;
    });

    setCustomAgents(prev => {
      const idx = prev.findIndex(a => a.id === agentId);
      if (idx !== -1) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], enabled, status: enabled ? 'idle' : 'disabled' };
        return updated;
      }
      return prev;
    });
  }, []);

  // ─── Deploy (activate agent on canvas) ──────────────────────────────────

  const deployAgent = useCallback((agentId: string) => {
    // Deploy works for BOTH built-in and custom agents
    setBuiltInAgents(prev =>
      prev.map(a =>
        a.id === agentId ? { ...a, enabled: true, status: 'idle' as const } : a
      )
    );
    setCustomAgents(prev =>
      prev.map(a =>
        a.id === agentId ? { ...a, enabled: true, status: 'idle' as const } : a
      )
    );
    // In full integration, this would also:
    // 1. Register agent with orchestrator
    // 2. Create wing in MemPalace
    // 3. Trigger DiffTracker.trackAgentChange()
  }, []);

  // ─── Persistence ────────────────────────────────────────────────────────

  const saveToJson = useCallback((): string => {
    return serializeAgentsFile(customAgents);
  }, [customAgents]);

  const loadFromJson = useCallback((json: string) => {
    try {
      const agents = deserializeAgentsFile(json);
      setCustomAgents(agents);
    } catch (error) {
      console.error('[useAgentCRUD] Failed to load agents:', error);
    }
  }, []);

  // ─── Helpers ───────────────────────────────────────────────────────────

  const getAgent = useCallback((id: string): CustomAgent | undefined => {
    return allAgents.find(a => a.id === id);
  }, [allAgents]);

  const getEnabledAgents = useCallback((): CustomAgent[] => {
    return allAgents.filter(a => a.enabled);
  }, [allAgents]);

  return {
    allAgents,
    customAgents,
    builtInAgents,
    isLoaded,
    createAgent,
    updateAgent,
    deleteAgent,
    toggleAgent,
    deployAgent,
    saveToJson,
    loadFromJson,
    getAgent,
    getEnabledAgents,
  };
}

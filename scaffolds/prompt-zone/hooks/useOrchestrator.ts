'use client';

import { useState, useCallback, useRef } from 'react';
import { Orchestrator } from '@/lib/orchestrator/orchestrator';
import type { OrchestratorCallbacks } from '@/lib/orchestrator/orchestrator';
import type {
  OrchestrationResult,
  AgentStatus,
  CanvasAction,
} from '@/lib/orchestrator/types';
import type { ChatMessage, AgentDef } from '@/lib/ai/types';

export interface UseOrchestratorReturn {
  messages: ChatMessage[];
  isRunning: boolean;
  agentStatuses: Record<string, AgentStatus>;
  canvasActions: CanvasAction[];
  lastResult: OrchestrationResult | null;
  error: string | null;
  send: (prompt: string, enabledAgents: AgentDef[], canvasContext?: string) => void;
  abort: () => void;
  clear: () => void;
  clearError: () => void;
  setMode: (mode: 'sequential' | 'parallel' | 'single') => void;
}

export function useOrchestrator(projectId: string): UseOrchestratorReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentStatus>>({});
  const [canvasActions, setCanvasActions] = useState<CanvasAction[]>([]);
  const [lastResult, setLastResult] = useState<OrchestrationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'sequential' | 'parallel' | 'single'>('sequential');

  const abortRef = useRef<AbortController | null>(null);
  const orchestratorRef = useRef<Orchestrator>(new Orchestrator());
  const activeMessageIdsRef = useRef<Map<string, string>>(new Map()); // agentId → messageId

  const send = useCallback((prompt: string, enabledAgents: AgentDef[], canvasContext?: string) => {
    setIsRunning(true);
    setError(null);

    // 1. Add user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);

    // 2. Create abort controller
    const controller = new AbortController();
    abortRef.current = controller;

    // 3. Update orchestrator config
    orchestratorRef.current = new Orchestrator({ mode });

    // 4. Build callbacks
    const callbacks: OrchestratorCallbacks = {
      onAgentStart: (agentId) => {
        const msgId = crypto.randomUUID();
        activeMessageIdsRef.current.set(agentId, msgId);

        const agentDef = enabledAgents.find(a => a.id === agentId);
        const assistantMsg: ChatMessage = {
          id: msgId,
          role: 'assistant',
          content: '',
          timestamp: Date.now(),
          model: agentDef?.defaultModel,
          agentId,
          agentName: `${agentDef?.icon ?? '🤖'} ${agentDef?.name ?? 'Agent'}`,
          isStreaming: true,
        };

        setMessages(prev => [...prev, assistantMsg]);
        setAgentStatuses(prev => ({ ...prev, [agentId]: 'thinking' }));
      },

      onAgentChunk: (agentId, chunk) => {
        const msgId = activeMessageIdsRef.current.get(agentId);
        if (!msgId) return;

        setMessages(prev =>
          prev.map(m =>
            m.id === msgId ? { ...m, content: m.content + chunk } : m
          )
        );
      },

      onAgentStatusChange: (agentId, status) => {
        setAgentStatuses(prev => ({ ...prev, [agentId]: status }));
      },

      onAgentDone: (agentId, response) => {
        const msgId = activeMessageIdsRef.current.get(agentId);
        if (!msgId) return;

        setMessages(prev =>
          prev.map(m =>
            m.id === msgId ? { ...m, content: response, isStreaming: false } : m
          )
        );
        setAgentStatuses(prev => ({ ...prev, [agentId]: 'done' }));
      },

      // ── Incremental canvas action — called as each node/edge is ready ──
      onCanvasAction: (action) => {
        setCanvasActions(prev => [...prev, action]);
      },

      onAllDone: (result) => {
        setIsRunning(false);
        setLastResult(result);
        // Don't bulk-set canvas actions here — they were already streamed incrementally
        activeMessageIdsRef.current.clear();
      },

      onError: (err) => {
        setError(err.message);
        setIsRunning(false);
        activeMessageIdsRef.current.clear();
      },
    };

    // 5. Run orchestration with canvas context
    orchestratorRef.current.run(
      prompt,
      enabledAgents,
      messages,
      callbacks,
      controller.signal,
      canvasContext,
    ).catch(err => {
      setError(err instanceof Error ? err.message : 'Orchestration failed');
      setIsRunning(false);
    });

  }, [messages, mode]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
    setMessages(prev =>
      prev.map(m => m.isStreaming ? { ...m, isStreaming: false } : m)
    );
    activeMessageIdsRef.current.clear();
  }, []);

  const clear = useCallback(() => {
    abort();
    setMessages([]);
    setCanvasActions([]);
    setLastResult(null);
    setAgentStatuses({});
    setError(null);
  }, [abort]);

  const clearError = useCallback(() => setError(null), []);

  return {
    messages,
    isRunning,
    agentStatuses,
    canvasActions,
    lastResult,
    error,
    send,
    abort,
    clear,
    clearError,
    setMode,
  };
}

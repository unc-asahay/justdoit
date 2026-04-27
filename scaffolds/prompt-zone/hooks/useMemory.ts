'use client';

import { useState, useCallback, useEffect } from 'react';
import { getPalace, closePalace } from '@/lib/memory/palace';
import { buildAgentContext, formatContextPrompt, storeAgentResponse } from '@/lib/memory/context-builder';
import type { SearchResult } from '@/lib/memory/types';
import type { MemPalace } from '@/lib/memory/palace';

interface UseMemoryReturn {
  isLoaded: boolean;
  totalEntries: number;
  wingCount: number;
  storeResponse: (agentId: string, agentName: string, response: string) => void;
  search: (query: string, wings?: string[]) => SearchResult[];
  getContextForAgent: (agentId: string, prompt: string) => string;
  getRecentDecisions: (limit?: number) => SearchResult[];
  getSummary: () => ReturnType<MemPalace['getSummary']>;
  reset: () => void;
}

export function useMemory(projectId: string): UseMemoryReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [totalEntries, setTotalEntries] = useState(0);
  const [wingCount, setWingCount] = useState(0);

  useEffect(() => {
    const palace = getPalace(projectId);
    const summary = palace.getSummary();
    setTotalEntries(summary.totalEntries);
    setWingCount(summary.wingCount);
    setIsLoaded(true);
  }, [projectId]);

  const refreshStats = useCallback(() => {
    const palace = getPalace(projectId);
    const summary = palace.getSummary();
    setTotalEntries(summary.totalEntries);
    setWingCount(summary.wingCount);
  }, [projectId]);

  const storeResponse = useCallback((
    agentId: string,
    agentName: string,
    response: string,
  ) => {
    storeAgentResponse(projectId, agentId, agentName, response);
    refreshStats();
  }, [projectId, refreshStats]);

  const search = useCallback((query: string, wings?: string[]): SearchResult[] => {
    const palace = getPalace(projectId);
    return palace.search({ query, wings });
  }, [projectId]);

  const getContextForAgent = useCallback((agentId: string, prompt: string): string => {
    const context = buildAgentContext(projectId, agentId, prompt);
    return formatContextPrompt(context);
  }, [projectId]);

  const getRecentDecisions = useCallback((limit = 10): SearchResult[] => {
    const palace = getPalace(projectId);
    return palace.getRecent(limit);
  }, [projectId]);

  const getSummary = useCallback(() => {
    return getPalace(projectId).getSummary();
  }, [projectId]);

  const reset = useCallback(() => {
    closePalace(projectId);
    getPalace(projectId);
    refreshStats();
  }, [projectId, refreshStats]);

  return {
    isLoaded,
    totalEntries,
    wingCount,
    storeResponse,
    search,
    getContextForAgent,
    getRecentDecisions,
    getSummary,
    reset,
  };
}

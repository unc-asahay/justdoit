'use client';

import { useEffect, useState } from 'react';
import { useOrchestrator } from './hooks/useOrchestrator';
import { useAgentStatus } from './hooks/useAgentStatus';
import { useMemory } from './hooks/useMemory';
import { ChatWindow } from './ChatWindow';
import { PromptInput } from './PromptInput';
import { AgentStatusPanel } from './AgentStatusPanel';
import { useStatusBar } from '@/scaffolds/status-bar/StatusBar';

interface PromptZoneProps {
  projectId: string;
}

export function PromptZone({ projectId }: PromptZoneProps) {
  const orchestrator = useOrchestrator(projectId);
  const agentStatus = useAgentStatus();
  const memory = useMemory(projectId);
  const { update: updateStatusBar } = useStatusBar();
  const [agentsExpanded, setAgentsExpanded] = useState(false);

  // Push live data to status bar
  useEffect(() => {
    updateStatusBar({
      memPalaceCount: memory.totalEntries,
      activeAgents: agentStatus.agents.filter(a => a.enabled).length,
    });
  }, [memory.totalEntries, agentStatus.agents, updateStatusBar]);

  // Store responses in MemPalace
  useEffect(() => {
    if (orchestrator.lastResult) {
      for (const result of orchestrator.lastResult.agentResults) {
        if (result.response) {
          memory.storeResponse(result.agentId, result.agentName, result.response);
        }
      }
    }
  }, [orchestrator.lastResult]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSend(content: string) {
    orchestrator.send(content, agentStatus.agents);
  }

  const activeCount = agentStatus.agents.filter(a => a.enabled).length;
  const totalCount = agentStatus.agents.length;

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-panel)' }}>
      {/* Chat messages */}
      <ChatWindow
        messages={orchestrator.messages}
        isStreaming={orchestrator.isRunning}
      />

      {/* Error banner */}
      {orchestrator.error && (
        <div className="px-4 py-3 mx-2 my-2 text-xs rounded-md shadow-sm border border-red-900/50 bg-red-950/40 text-red-200">
          <div className="flex justify-between items-start">
            <div className="flex gap-2">
              <span className="text-red-400">⚠️</span>
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-red-300">API Error</span>
                <span className="leading-relaxed">{orchestrator.error}</span>
                {orchestrator.error.toLowerCase().includes('api key') && (
                  <a href="/settings" className="text-blue-400 hover:text-blue-300 underline mt-1 w-max">
                    Go to Settings to configure API Keys →
                  </a>
                )}
              </div>
            </div>
            <button onClick={orchestrator.clearError} className="text-red-400 hover:text-red-300 px-1 py-0.5 rounded transition-colors hover:bg-red-900/50">✕</button>
          </div>
        </div>
      )}

      {/* Input area */}
      <PromptInput
        onSend={handleSend}
        onAbort={orchestrator.abort}
        isStreaming={orchestrator.isRunning}
      />

      {/* ── Collapsible Agent Panel ──────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid var(--border-color)' }}>
        {/* Collapse header — always visible */}
        <button
          onClick={() => setAgentsExpanded(!agentsExpanded)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition-colors"
          style={{
            color: 'var(--text-secondary)',
            backgroundColor: 'transparent',
          }}
        >
          <span className="flex items-center gap-2">
            <span>🤖</span>
            <span>AGENTS</span>
          </span>
          <span className="flex items-center gap-2">
            <span style={{ color: 'var(--text-muted)' }}>
              {activeCount}/{totalCount} active
            </span>
            <span className="transition-transform duration-200"
              style={{ transform: agentsExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
              ▼
            </span>
          </span>
        </button>

        {/* Expanded agent list */}
        <div
          className="overflow-hidden transition-all duration-250 ease-in-out"
          style={{
            maxHeight: agentsExpanded ? '400px' : '0px',
            opacity: agentsExpanded ? 1 : 0,
          }}
        >
          <AgentStatusPanel
            agents={agentStatus.agents}
            activeAgentId={agentStatus.activeAgent?.id ?? null}
            onToggle={agentStatus.toggleAgent}
            onSelect={agentStatus.selectAgent}
            onModelChange={agentStatus.setAgentModel}
          />
        </div>
      </div>
    </div>
  );
}

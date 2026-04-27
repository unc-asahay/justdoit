'use client';

import type { AgentDef, ModelId } from '@/lib/ai/types';
import { AgentStatusCard } from './AgentStatusCard';

interface AgentStatusPanelProps {
  agents: AgentDef[];
  activeAgentId: string | null;
  onToggle: (agentId: string) => void;
  onSelect: (agentId: string) => void;
  onModelChange: (agentId: string, model: ModelId) => void;
}

export function AgentStatusPanel({
  agents,
  activeAgentId,
  onToggle,
  onSelect,
  onModelChange,
}: AgentStatusPanelProps) {
  const activeCount = agents.filter(a => a.enabled).length;

  return (
    <div className="border-t border-gray-800 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Agents</span>
        <span className="text-xs bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-full">
          {activeCount}/{agents.length} active
        </span>
      </div>

      <div className="space-y-1">
        {agents.map((agent) => (
          <AgentStatusCard
            key={agent.id}
            agent={agent}
            isActive={agent.id === activeAgentId && agent.enabled}
            onToggle={() => onToggle(agent.id)}
            onSelect={() => onSelect(agent.id)}
            onModelChange={(model) => onModelChange(agent.id, model)}
          />
        ))}
      </div>
    </div>
  );
}

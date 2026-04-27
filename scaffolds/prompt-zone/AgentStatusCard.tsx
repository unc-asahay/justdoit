'use client';

import type { AgentDef, ModelId } from '@/lib/ai/types';
import { ModelSelector } from './ModelSelector';

interface AgentStatusCardProps {
  agent: AgentDef;
  isActive: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onModelChange: (model: ModelId) => void;
}

export function AgentStatusCard({
  agent,
  isActive,
  onToggle,
  onSelect,
  onModelChange,
}: AgentStatusCardProps) {
  const bgClass = !agent.enabled
    ? 'opacity-50 bg-gray-900 border border-gray-800'
    : isActive
    ? 'bg-blue-600/10 border border-blue-600/30'
    : 'bg-gray-800/50 border border-gray-700';

  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors cursor-pointer ${bgClass}`}>
      {/* Agent icon + name — clickable to select */}
      <button
        onClick={onSelect}
        className="flex items-center gap-2 flex-1 min-w-0"
      >
        <span className="text-base">{agent.icon}</span>
        <span className={`text-xs font-medium truncate ${agent.enabled ? 'text-white' : 'text-gray-500'}`}>
          {agent.name}
        </span>
      </button>

      {/* Model selector — only when enabled */}
      {agent.enabled && (
        <ModelSelector
          value={agent.defaultModel}
          onChange={onModelChange}
          compact
        />
      )}

      {/* Toggle switch */}
      <button
        onClick={onToggle}
        className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 ${
          agent.enabled ? 'bg-green-500' : 'bg-gray-600'
        }`}
      >
        <span
          className={`block w-3 h-3 rounded-full bg-white transform transition-transform ${
            agent.enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

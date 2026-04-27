'use client';

import type { CustomAgent } from '@/lib/agents';
import type { AIConnection } from '@/lib/ai/providers';

interface AgentCardProps {
  agent: CustomAgent;
  isSelected: boolean;
  activeConnection?: AIConnection | null;
  onSelect: () => void;
  onToggle: (enabled: boolean) => void;
  onTest: () => void;
}

export function AgentCard({
  agent,
  isSelected,
  activeConnection,
  onSelect,
  onToggle,
  onTest,
}: AgentCardProps) {
  // Resolve the display model: prefer connection model if agent is linked to it
  const displayModel = (() => {
    if (agent.connectionId && activeConnection && agent.connectionId === activeConnection.id) {
      return activeConnection.activeModel;
    }
    return agent.defaultModel;
  })();

  return (
    <div
      className={`agent-card ${isSelected ? 'agent-card--selected' : ''} ${agent.enabled ? 'agent-card--enabled' : 'agent-card--disabled'}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect()}
    >
      <div className="agent-card__content">
        <div className="agent-card__header">
          <span className="agent-card__icon">{agent.icon}</span>
          <span className="agent-card__name">{agent.name}</span>
          <span className="agent-card__status-dot" style={{ color: agent.enabled ? '#10b981' : 'var(--text-muted)' }}>
            {agent.enabled ? '●' : '○'}
          </span>
        </div>
        <span className="agent-card__role">
          {displayModel.split('/').pop()}
        </span>
      </div>

      <div
        className="agent-card__toggle"
        onClick={e => {
          e.stopPropagation();
          onToggle(!agent.enabled);
        }}
        title={agent.enabled ? 'Disable' : 'Enable'}
      >
        <label className="switch" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={agent.enabled}
            onChange={e => {
              e.stopPropagation();
              onToggle(e.target.checked);
            }}
          />
          <span className="slider"></span>
        </label>
      </div>
    </div>
  );
}

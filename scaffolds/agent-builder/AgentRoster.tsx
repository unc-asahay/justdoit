'use client';

import { useMemo } from 'react';
import { AgentCard } from './AgentCard';
import type { CustomAgent } from '@/lib/agents';
import type { AIConnection } from '@/lib/ai/providers';

interface AgentRosterProps {
  agents: CustomAgent[];
  selectedId: string | null;
  activeConnection?: AIConnection | null;
  onSelect: (agent: CustomAgent) => void;
  onToggle: (agentId: string, enabled: boolean) => void;
  onNewAgent: () => void;
  onTestAgent: (agent: CustomAgent) => void;
}

export function AgentRoster({
  agents,
  selectedId,
  activeConnection,
  onSelect,
  onToggle,
  onNewAgent,
  onTestAgent,
}: AgentRosterProps) {
  const builtIn = useMemo(() => agents.filter(a => a.isBuiltIn), [agents]);
  const custom = useMemo(() => agents.filter(a => !a.isBuiltIn), [agents]);

  const activeCount = agents.filter(a => a.enabled).length;
  const totalTokens = agents.reduce((sum, a) => sum + a.totalTokens, 0);

  return (
    <div className="agent-roster">
      {/* Built-in Brains */}
      <section className="agent-roster__section">
        <h3 className="agent-roster__heading">Built-in Brains</h3>
        {builtIn.map(agent => (
          <AgentCard
            key={agent.id}
            agent={agent}
            isSelected={agent.id === selectedId}
            activeConnection={activeConnection}
            onSelect={() => onSelect(agent)}
            onToggle={enabled => onToggle(agent.id, enabled)}
            onTest={() => onTestAgent(agent)}
          />
        ))}
      </section>

      {/* Custom Brains */}
      <section className="agent-roster__section">
        <h3 className="agent-roster__heading">Custom Brains</h3>
        {custom.length === 0 ? (
          <p className="agent-roster__empty">No custom Brains yet.</p>
        ) : (
          custom.map(agent => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isSelected={agent.id === selectedId}
              activeConnection={activeConnection}
              onSelect={() => onSelect(agent)}
              onToggle={enabled => onToggle(agent.id, enabled)}
              onTest={() => onTestAgent(agent)}
            />
          ))
        )}

        <button
          className="agent-roster__new-btn"
          onClick={onNewAgent}
        >
          🆕 New Brain
        </button>
      </section>

      {/* Metrics */}
      <section className="agent-roster__metrics">
        <div className="agent-roster__metric">
          <span className="agent-roster__metric-label">Active</span>
          <span className="agent-roster__metric-value">{activeCount}</span>
        </div>
        <div className="agent-roster__metric">
          <span className="agent-roster__metric-label">Total Tokens</span>
          <span className="agent-roster__metric-value">
            {totalTokens.toLocaleString()}
          </span>
        </div>
      </section>
    </div>
  );
}

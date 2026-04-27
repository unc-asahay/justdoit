'use client';

import { useState, useMemo } from 'react';
import { AgentRoster } from './AgentRoster';
import { AgentBuilder } from './AgentBuilder';
import { AgentTestPanel } from './AgentTestPanel';
import { AgentCreationWizard } from './AgentCreationWizard';
import { useAgentCRUD } from './hooks/useAgentCRUD';
import { useSettings } from '@/lib/ai/settings-store';
import type { CustomAgent } from '@/lib/agents';
import './agents.css';

type RightPanel = 'builder' | 'test' | 'wizard' | 'none';

export function AgentsTab({ projectId }: { projectId: string }) {
  const { settings } = useSettings();
  const activeConnection = useMemo(() => {
    // Try explicit active connection first, then fallback to first available
    if (settings.activeConnectionId) {
      return settings.connections.find(c => c.id === settings.activeConnectionId) ?? null;
    }
    // Fallback: use the first configured connection
    return settings.connections.length > 0 ? settings.connections[0] : null;
  }, [settings.activeConnectionId, settings.connections]);

  const crud = useAgentCRUD(projectId, activeConnection);
  const [selectedAgent, setSelectedAgent] = useState<CustomAgent | null>(null);
  const [rightPanel, setRightPanel] = useState<RightPanel>('none');

  const handleSelectAgent = (agent: CustomAgent) => {
    setSelectedAgent(agent);
    setRightPanel('builder');
  };

  const handleNewAgent = () => {
    setSelectedAgent(null);
    setRightPanel('wizard');
  };

  const handleTestAgent = (agent: CustomAgent) => {
    setSelectedAgent(agent);
    setRightPanel('test');
  };

  const handleSave = (agent: CustomAgent) => {
    crud.updateAgent(agent);
    setSelectedAgent(agent);
  };

  const handleDelete = (agentId: string) => {
    crud.deleteAgent(agentId);
    setSelectedAgent(null);
    setRightPanel('none');
  };

  const handleDeploy = (agentId: string) => {
    crud.deployAgent(agentId);
    // Re-select the agent to refresh the builder view
    const agent = crud.allAgents.find(a => a.id === agentId);
    if (agent) setSelectedAgent({ ...agent, enabled: true, status: 'idle' });
  };

  // Wizard callbacks
  const handleWizardSave = (agent: CustomAgent) => {
    crud.createAgent(agent);
    setSelectedAgent(agent);
    setRightPanel('builder');
  };

  const handleWizardDeploy = (agent: CustomAgent) => {
    crud.createAgent(agent);
    setSelectedAgent(agent);
    setRightPanel('builder');
  };

  const handleWizardCancel = () => {
    setRightPanel('none');
    setSelectedAgent(null);
  };

  return (
    <div className="agents-tab">
      <aside className="agents-tab__roster">
        <AgentRoster
          agents={crud.allAgents}
          selectedId={selectedAgent?.id ?? null}
          activeConnection={activeConnection}
          onSelect={handleSelectAgent}
          onToggle={crud.toggleAgent}
          onNewAgent={handleNewAgent}
          onTestAgent={handleTestAgent}
        />
      </aside>

      <main className="agents-tab__detail">
        {rightPanel === 'wizard' && (
          <AgentCreationWizard
            onSave={handleWizardSave}
            onDeploy={handleWizardDeploy}
            onCancel={handleWizardCancel}
          />
        )}
        {rightPanel === 'builder' && selectedAgent && (
          <AgentBuilder
            agent={selectedAgent}
            isCreating={false}
            onSave={handleSave}
            onDelete={handleDelete}
            onTest={() => selectedAgent && handleTestAgent(selectedAgent)}
            onDeploy={() => selectedAgent && handleDeploy(selectedAgent.id)}
          />
        )}
        {rightPanel === 'test' && selectedAgent && (
          <AgentTestPanel
            agent={selectedAgent}
            projectId={projectId}
          />
        )}
        {rightPanel === 'none' && (
          <div className="agents-tab__empty">
            <div className="agents-tab__empty-content">
              <span className="agents-tab__empty-icon">🧠</span>
              <h3>Select a Brain</h3>
              <p>Choose a Brain from the roster to configure, or create a new one.</p>
              <button className="agents-tab__empty-btn" onClick={handleNewAgent}>
                ✨ Create New Brain
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

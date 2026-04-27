'use client';

import { useState } from 'react';
import { useAgentTest } from './hooks/useAgentTest';
import type { CustomAgent } from '@/lib/agents';

interface AgentTestPanelProps {
  agent: CustomAgent;
  projectId: string;
}

export function AgentTestPanel({ agent, projectId }: AgentTestPanelProps) {
  const [prompt, setPrompt] = useState('');
  const { testResult, isLoading, error, runTest, clearResult } = useAgentTest(projectId);

  const handleTest = () => {
    if (!prompt.trim() || isLoading) return;
    runTest(agent, prompt);
  };

  return (
    <div className="agent-test">
      <h2 className="agent-test__title">
        Test: {agent.icon} {agent.name}
      </h2>

      <div className="agent-test__info">
        <span>Model: {agent.defaultModel}</span>
        <span>Zone: {agent.zone.type}</span>
        <span>Priority: {agent.zone.priority}</span>
      </div>

      {/* System prompt preview */}
      <div className="agent-test__system-prompt">
        <h4>System Prompt</h4>
        <pre>{agent.systemPrompt || '(no system prompt)'}</pre>
      </div>

      {/* Test input */}
      <div className="agent-test__input-area">
        <textarea
          className="agent-test__textarea"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Type a test prompt..."
          rows={3}
        />
        <button
          className="agent-test__btn"
          onClick={handleTest}
          disabled={isLoading || !prompt.trim()}
        >
          {isLoading ? '⏳ Running...' : '▶ Run Test'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="agent-test__error">
          {error}
        </div>
      )}

      {/* Results */}
      {testResult && (
        <div className="agent-test__result">
          <h4>Response</h4>
          <div className="agent-test__response">
            {testResult.response}
          </div>

          <div className="agent-test__stats">
            <span>Tokens: {testResult.tokensUsed.toLocaleString()}</span>
            <span>Latency: {testResult.latencyMs}ms</span>
            <span>Canvas Actions: {testResult.canvasActionCount}</span>
          </div>

          {testResult.canvasActionCount > 0 && (
            <div className="agent-test__preview-note">
              ℹ️ {testResult.canvasActionCount} canvas actions would be created.
              Deploy the agent to execute them on the real canvas.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

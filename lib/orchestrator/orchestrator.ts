/**
 * Main Orchestrator — coordinate multi-agent execution.
 */

import { analyzePrompt } from './prompt-analyzer';
import { ResponseCollector } from './response-collector';
import { routeModel, getFallbackModel } from './model-router';
import { mapToCanvasActions } from './canvas-bridge/action-mapper';
import { createAgent, type BaseAgent } from './agents';
import type {
  OrchestrationConfig,
  OrchestrationResult,
  AgentStatus,
  PromptAnalysis,
  CanvasAction,
  StructuredDecision,
} from './types';
import { DEFAULT_ORCHESTRATION_CONFIG } from './types';
import type { AgentDef, ChatMessage } from '@/lib/ai/types';

export interface OrchestratorCallbacks {
  onAgentStart:        (agentId: string) => void;
  onAgentChunk:       (agentId: string, chunk: string) => void;
  onAgentStatusChange: (agentId: string, status: AgentStatus) => void;
  onAgentDone:         (agentId: string, response: string) => void;
  onCanvasAction?:     (action: CanvasAction) => void;
  onAllDone:           (result: OrchestrationResult) => void;
  onError:             (error: Error) => void;
}

export class Orchestrator {
  private config: OrchestrationConfig;
  private agents: Map<string, BaseAgent>;

  constructor(config?: Partial<OrchestrationConfig>) {
    this.config = { ...DEFAULT_ORCHESTRATION_CONFIG, ...config };
    this.agents = new Map();
  }

  /**
   * Main entry: run the orchestration pipeline.
   */
  async run(
    prompt: string,
    enabledAgentDefs: AgentDef[],
    conversationHistory: ChatMessage[],
    callbacks: OrchestratorCallbacks,
    signal?: AbortSignal,
    canvasContext?: string,
  ): Promise<OrchestrationResult> {

    // 1. Analyze the prompt
    const analysis = analyzePrompt(prompt);
    console.log('[Orchestrator] Analysis:', analysis);

    // 2. Determine which agents to use
    const agentIds = this.selectAgents(analysis, enabledAgentDefs);
    console.log('[Orchestrator] Selected agents:', agentIds);

    // 3. Create agent instances
    const agentsToRun: BaseAgent[] = [];
    for (const id of agentIds) {
      const def = enabledAgentDefs.find(a => a.id === id);
      if (!def) continue;

      let agent = this.agents.get(id);
      if (!agent) {
        agent = createAgent(def)!;
        if (!agent) {
          console.warn('[Orchestrator] Failed to create agent:', id);
          continue;
        }
        this.agents.set(id, agent);
      }

      // Set the model (with fallback if key is missing)
      const route = routeModel(def);
      agent.setModel(getFallbackModel(route.model));
      agentsToRun.push(agent);
    }

    // Fallback: if no agents available, use arch-agent
    if (agentsToRun.length === 0) {
      console.warn('[Orchestrator] No agents available, falling back to arch-agent');
      const fallbackDef = enabledAgentDefs.find(a => a.id === 'arch-agent') || {
        id: 'arch-agent',
        name: 'Architecture Agent',
        icon: '🏗️',
        defaultModel: 'gpt-4o',
        systemPrompt: 'You are an architecture expert.',
        enabled: true
      } as any;
      const fallback = createAgent(fallbackDef);
      if (fallback) agentsToRun.push(fallback);
    }

    console.log('[Orchestrator] Running', agentsToRun.length, 'agents');

    // 4. Execute agents
    const collector = new ResponseCollector(crypto.randomUUID());
    const history = conversationHistory.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Inject canvas context so the AI knows what's already on the canvas
    const historyWithContext = canvasContext
      ? [{ role: 'user' as const, content: `[CANVAS CONTEXT]\n${canvasContext}` }, ...history]
      : history;

    // Shared buffer — decisions accumulated across all agents so the action
    // mapper has the full tier context when streaming node positions.
    const streamed: StructuredDecision[] = [];

    if (this.config.mode === 'parallel' && agentsToRun.length > 1) {
      await this.executeParallel(agentsToRun, prompt, historyWithContext, collector, callbacks, signal, streamed);
    } else {
      await this.executeSequential(agentsToRun, prompt, historyWithContext, collector, callbacks, signal, streamed);
    }

    // 5. Generate canvas actions from collected decisions
    const decisions = collector.getMergedDecisions();
    console.log('[Orchestrator] Decisions extracted:', decisions.length, decisions);

    const canvasActions = this.config.enableCanvasActions
      ? mapToCanvasActions(decisions)
      : [];

    // 6. Emit ALL canvas actions — edges, groups, and any nodes that weren't
    //    already streamed incrementally
    if (callbacks.onCanvasAction) {
      for (const action of canvasActions) {
        callbacks.onCanvasAction(action);
      }
    }

    // 7. Build and return final result
    const result = collector.buildResult(prompt, analysis, canvasActions);
    callbacks.onAllDone(result);
    return result;
  }

  private selectAgents(analysis: PromptAnalysis, enabledAgents: AgentDef[]): string[] {
    const enabledIds = new Set(enabledAgents.filter(a => a.enabled).map(a => a.id));
    const suggested = analysis.suggestedAgents.filter(id => enabledIds.has(id));

    if (suggested.length === 0) {
      const first = enabledAgents.find(a => a.enabled);
      return first ? [first.id] : [];
    }

    return suggested;
  }

  private async executeSequential(
    agents: BaseAgent[],
    prompt: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    collector: ResponseCollector,
    callbacks: OrchestratorCallbacks,
    signal?: AbortSignal,
    streamed: StructuredDecision[] = [],
  ): Promise<void> {
    for (const agent of agents) {
      if (signal?.aborted) break;

      callbacks.onAgentStart(agent.id);

      const result = await agent.execute(prompt, history, {
        onChunk:        (chunk) => callbacks.onAgentChunk(agent.id, chunk),
        onStatusChange: (status) => callbacks.onAgentStatusChange(agent.id, status),
        onDecision:     callbacks.onCanvasAction
          ? (decision) => {
              // Accumulate so the mapper can tier-place this decision against
              // everything seen so far. No position override — the tier layout
              // in action-mapper owns placement.
              streamed.push(decision);
              const matchingId = `node-${decision.id}`;
              const nodeAction = mapToCanvasActions(streamed).find(
                a => a.type === 'create_node' && (a.payload as { id?: string }).id === matchingId,
              );
              if (nodeAction) callbacks.onCanvasAction!(nodeAction);
            }
          : undefined,
      }, signal);

      if (result.error) {
        throw new Error(`[${agent.name} Error]: ${result.error}`);
      }

      collector.addResult(result);
      callbacks.onAgentDone(agent.id, result.response);
    }
  }

  private async executeParallel(
    agents: BaseAgent[],
    prompt: string,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    collector: ResponseCollector,
    callbacks: OrchestratorCallbacks,
    signal?: AbortSignal,
    streamed: StructuredDecision[] = [],
  ): Promise<void> {
    const promises = agents.map(agent => {
      callbacks.onAgentStart(agent.id);

      return agent.execute(prompt, history, {
        onChunk:        (chunk) => callbacks.onAgentChunk(agent.id, chunk),
        onStatusChange: (status) => callbacks.onAgentStatusChange(agent.id, status),
        onDecision:     callbacks.onCanvasAction
          ? (decision) => {
              // Shared accumulator across all parallel agents so tier placement
              // reflects the full running picture, not this agent in isolation.
              streamed.push(decision);
              const matchingId = `node-${decision.id}`;
              const nodeAction = mapToCanvasActions(streamed).find(
                a => a.type === 'create_node' && (a.payload as { id?: string }).id === matchingId,
              );
              if (nodeAction) callbacks.onCanvasAction!(nodeAction);
            }
          : undefined,
      }, signal).then(result => {
        if (result.error) {
          throw new Error(`[${agent.name} Error]: ${result.error}`);
        }
        collector.addResult(result);
        callbacks.onAgentDone(agent.id, result.response);
      });
    });

    await Promise.all(promises);
  }
}

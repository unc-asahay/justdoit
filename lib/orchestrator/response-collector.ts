/**
 * Response Collector — collect and merge results from multiple agents.
 */

import type {
  AgentResult,
  StructuredDecision,
  OrchestrationResult,
  PromptAnalysis,
  CanvasAction,
} from './types';

function confidenceRank(c: 'high' | 'medium' | 'low'): number {
  switch (c) {
    case 'high':   return 3;
    case 'medium': return 2;
    case 'low':    return 1;
  }
}

export class ResponseCollector {
  private results: AgentResult[] = [];
  private sessionId: string;
  private startedAt: number;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.startedAt = Date.now();
  }

  /** Add a single agent's result */
  addResult(result: AgentResult): void {
    this.results.push(result);
  }

  /** Get all collected results */
  getResults(): AgentResult[] {
    return [...this.results];
  }

  /** Get the total count of decisions extracted so far (for positioning) */
  getDecisionCount(): number {
    return this.results.reduce((acc, r) => acc + (r.structuredOutput?.length ?? 0), 0);
  }

  /** Merge all decisions from all agents, deduplicate by decision text */
  getMergedDecisions(): StructuredDecision[] {
    const all = this.results.flatMap(r => r.structuredOutput ?? []);

    // Deduplicate: only remove exact duplicate decision labels,
    // but keep multiple decisions in the same category (e.g. multiple services)
    const seen = new Map<string, StructuredDecision>();

    for (const decision of all) {
      const key = `${decision.agentId}:${decision.decision.toLowerCase().trim()}`;
      const existing = seen.get(key);
      if (!existing || confidenceRank(decision.confidence) > confidenceRank(existing.confidence)) {
        seen.set(key, decision);
      }
    }

    return [...seen.values()];
  }

  /** Build the final orchestration result */
  buildResult(
    prompt: string,
    analysis: PromptAnalysis,
    canvasActions: CanvasAction[],
  ): OrchestrationResult {
    return {
      sessionId: this.sessionId,
      prompt,
      analysis,
      agentResults: this.results,
      canvasActions,
      decisions: this.getMergedDecisions(),
      startedAt: this.startedAt,
      completedAt: Date.now(),
    };
  }

  /** Check if all agents completed successfully */
  allSucceeded(): boolean {
    return this.results.every(r => r.status === 'done');
  }

  /** Get agents that failed */
  getFailedAgents(): AgentResult[] {
    return this.results.filter(r => r.status === 'error');
  }
}

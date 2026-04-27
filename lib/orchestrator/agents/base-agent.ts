/**
 * Base Agent — abstract base class for all specialist agents.
 * Handles streaming, system prompt injection, and structured output parsing.
 * Supports incremental decision extraction: as the AI streams its JSON response,
 * individual decisions are emitted via onDecision callback for real-time canvas rendering.
 */

import { streamChat } from '@/lib/ai/stream';
import type { ModelId, AgentDef } from '@/lib/ai/types';
import type {
  AgentResult,
  AgentStatus,
  StructuredDecision,
} from '../types';

// Injected at the end of every agent system prompt to enforce JSON canvas output
const CANVAS_OUTPUT_INSTRUCTION = `

---
CRITICAL SYSTEM INSTRUCTION - CANVAS OUTPUT:
You MUST output a valid JSON array at the very end of your response. This JSON is used to render the visual canvas. If you fail to provide this JSON, the canvas will be broken.

Output each JSON object on its own line to allow incremental parsing.

Format:
\`\`\`json
[
  {
    "category": "service",
    "decision": "Node Label",
    "reasoning": "Brief explanation",
    "confidence": "high"
  }
]
\`\`\`

Categories allowed: "service", "database", "api", "ui", "external", "decision"
CRITICAL: Keep your text explanation very brief (under 2 paragraphs). The JSON block MUST be the final thing you output.`;

export abstract class BaseAgent {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  protected model: ModelId;
  protected connectionId?: string;
  protected systemPrompt: string;
  protected status: AgentStatus = 'idle';

  constructor(def: AgentDef) {
    this.id = def.id;
    this.name = def.name;
    this.icon = def.icon;
    this.model = def.defaultModel;
    this.connectionId = def.connectionId;
    this.systemPrompt = def.systemPrompt;
  }

  /** Override model for this run */
  setModel(model: ModelId): void {
    this.model = model;
  }

  getStatus(): AgentStatus {
    return this.status;
  }

  /**
   * Execute the agent against a user prompt.
   * onDecision callback is called incrementally as JSON objects are detected during streaming.
   */
  async execute(
    userPrompt: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    callbacks: {
      onChunk: (chunk: string) => void;
      onStatusChange: (status: AgentStatus) => void;
      onDecision?: (decision: StructuredDecision) => void;
    },
    signal?: AbortSignal,
  ): Promise<AgentResult> {
    const startedAt = Date.now();
    this.status = 'thinking';
    callbacks.onStatusChange('thinking');

    // Build the enhanced system prompt with canvas output requirement
    const enhancedSystem = this.buildSystemPrompt(userPrompt) + CANVAS_OUTPUT_INSTRUCTION;

    const messages = [
      { role: 'system' as const, content: enhancedSystem },
      ...conversationHistory,
      { role: 'user' as const, content: userPrompt },
    ];

    let fullResponse = '';
    // Track decisions already emitted during streaming to avoid duplicates
    const emittedDecisions = new Set<string>();

    try {
      this.status = 'streaming';
      callbacks.onStatusChange('streaming');

      let streamError: Error | null = null;

      await streamChat({
        model: this.model,
        connectionId: this.connectionId,
        messages,
        signal,
        maxTokens: 8192,
        onChunk: (chunk) => {
          fullResponse += chunk;
          callbacks.onChunk(chunk);

          // ── Incremental decision extraction during streaming ──
          if (callbacks.onDecision) {
            this.extractIncrementalDecisions(fullResponse, emittedDecisions, callbacks.onDecision);
          }
        },
        onDone: (text) => {
          fullResponse = text;
        },
        onError: (err) => {
          streamError = err;
        },
      });

      if (streamError) {
        throw streamError;
      }

      this.status = 'done';
      callbacks.onStatusChange('done');

      // Parse the full structured JSON output from the complete response
      const structuredOutput = this.parseStructuredOutput(fullResponse);

      // Emit any remaining decisions that weren't caught during streaming
      if (callbacks.onDecision) {
        for (const decision of structuredOutput) {
          if (!emittedDecisions.has(decision.decision.toLowerCase().trim())) {
            callbacks.onDecision(decision);
          }
        }
      }

      return {
        agentId: this.id,
        agentName: this.name,
        status: 'done',
        response: fullResponse,
        structuredOutput,
        model: this.model,
        startedAt,
        completedAt: Date.now(),
      };
    } catch (error) {
      this.status = 'error';
      callbacks.onStatusChange('error');

      return {
        agentId: this.id,
        agentName: this.name,
        status: 'error',
        response: fullResponse,
        model: this.model,
        startedAt,
        completedAt: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Build the full system prompt for this agent.
   * Specialists add their domain expertise here.
   */
  protected abstract buildSystemPrompt(userPrompt: string): string;

  /**
   * Incrementally extract JSON objects from the streaming response.
   * Looks for complete {...} objects inside a JSON array context and emits them
   * as StructuredDecisions as soon as they're parseable.
   */
  private extractIncrementalDecisions(
    responsesSoFar: string,
    alreadyEmitted: Set<string>,
    onDecision: (decision: StructuredDecision) => void,
  ): void {
    // Look for individual JSON objects: { "category": ..., "decision": ... }
    const objectRegex = /\{\s*"category"\s*:\s*"([^"]+)"\s*,\s*"decision"\s*:\s*"([^"]+)"\s*,\s*"reasoning"\s*:\s*"([^"]*?)"\s*,\s*"confidence"\s*:\s*"([^"]*?)"\s*\}/g;

    let match: RegExpExecArray | null;
    while ((match = objectRegex.exec(responsesSoFar)) !== null) {
      const key = match[2].toLowerCase().trim();
      if (alreadyEmitted.has(key)) continue;

      alreadyEmitted.add(key);
      const decision: StructuredDecision = {
        id: crypto.randomUUID(),
        category: match[1].toLowerCase(),
        decision: match[2],
        reasoning: match[3] || '',
        confidence: (match[4] as 'low' | 'medium' | 'high') || 'medium',
        agentId: this.id,
      };

      console.log(`[${this.name}] 🔴 Streaming decision:`, decision.decision);
      onDecision(decision);
    }
  }

  /**
   * Parse the agent's response for a ```canvas-json block and extract
   * StructuredDecisions from it. Falls back to legacy markdown regex if no block found.
   */
  protected parseStructuredOutput(response: string): StructuredDecision[] {
    // ── Primary: Try to find a JSON code block (canvas-json or json) ─────────────────
    let jsonString = '';
    const jsonBlockMatch = response.match(/```(?:canvas-json|json)\s*([\s\S]*?)```/);
    
    if (jsonBlockMatch) {
      jsonString = jsonBlockMatch[1].trim();
    } else {
      // ── Fallback 1: Try to find raw JSON array brackets ──────────────────────────────
      const startIdx = response.lastIndexOf('[');
      const endIdx = response.lastIndexOf(']');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        jsonString = response.substring(startIdx, endIdx + 1).trim();
      }
    }

    if (jsonString) {
      try {
        const raw = JSON.parse(jsonString);
        if (Array.isArray(raw)) {
          return raw
            .filter((item: any) => item.category && item.decision)
            .map((item: any): StructuredDecision => ({
              id: crypto.randomUUID(),
              category: (item.category as string).toLowerCase(),
              decision: item.decision as string,
              reasoning: (item.reasoning as string) ?? '',
              confidence: (item.confidence as 'low' | 'medium' | 'high') ?? 'medium',
              agentId: this.id,
            }));
        }
      } catch (e) {
        console.warn(`[${this.name}] Failed to parse JSON canvas block.`, e);
      }
    }

    // ── Fallback 2: Legacy markdown Decision regex ───────────────────────────────────
    return this.extractDecisions(response, 'architecture');
  }

  /**
   * Generic decision parser — looks for markdown patterns like:
   * **Decision:** PostgreSQL
   * **Reasoning:** Best for relational data...
   */
  protected extractDecisions(
    response: string,
    category: string,
  ): StructuredDecision[] {
    const decisions: StructuredDecision[] = [];

    const decisionRegex = /\*\*(?:Decision|Choice|Selected):\*\*\s*(.+)/gi;
    const reasoningRegex = /\*\*(?:Reasoning|Why|Rationale):\*\*\s*(.+)/gi;

    const decisionMatches = [...response.matchAll(decisionRegex)];
    const reasoningMatches = [...response.matchAll(reasoningRegex)];

    for (let i = 0; i < decisionMatches.length; i++) {
      decisions.push({
        id: crypto.randomUUID(),
        category,
        decision: decisionMatches[i][1].trim(),
        reasoning: reasoningMatches[i]?.[1]?.trim() ?? 'No reasoning provided',
        confidence: 'medium',
        agentId: this.id,
      });
    }

    return decisions;
  }
}

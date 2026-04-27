/**
 * Orchestrator Types
 * Central type definitions for multi-agent orchestration.
 */

import type { ModelId, AgentDef, ChatMessage } from '@/lib/ai/types';

// ─── Intent Classification ──────────────────────────────────────────────────

/** What the user is trying to do */
export type PromptIntent =
  | 'design'        // UI/UX, layout, colors, typography
  | 'architecture'  // System design, databases, APIs, services
  | 'technology'    // Framework selection, libraries, tooling
  | 'business'      // Business model, pricing, strategy
  | 'validation'    // Review, check, verify decisions
  | 'diagram'       // Visual diagram generation (flowchart, sequence, etc.)
  | 'general'       // Doesn't clearly map to a specialist
  | 'multi';        // Maps to multiple intents (complex prompt)

/** Result of analyzing a user prompt */
export interface PromptAnalysis {
  intent: PromptIntent;
  subIntents: PromptIntent[];      // For 'multi' — which specific intents
  entities: ExtractedEntity[];    // Key terms/concepts from the prompt
  complexity: 'simple' | 'moderate' | 'complex';
  suggestedAgents: string[];       // Agent IDs that should handle this
  rawPrompt: string;
}

/** An entity extracted from the user's prompt */
export interface ExtractedEntity {
  text: string;
  type: 'technology' | 'concept' | 'service' | 'requirement' | 'constraint';
}

// ─── Agent Execution ────────────────────────────────────────────────────────

/** Status of an agent's execution */
export type AgentStatus = 'idle' | 'thinking' | 'streaming' | 'done' | 'error';

/** Result from a single agent's execution */
export interface AgentResult {
  agentId: string;
  agentName: string;
  status: AgentStatus;
  response: string;           // Full text response
  structuredOutput?: StructuredDecision[];  // Parsed decisions from the response
  model: ModelId;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

/** A structured decision extracted from an agent's response */
export interface StructuredDecision {
  id: string;
  category: string;           // e.g., "database", "auth", "ui-framework"
  decision: string;          // e.g., "PostgreSQL"
  reasoning: string;          // Why this was chosen
  alternatives?: string[];    // What else was considered
  confidence: 'high' | 'medium' | 'low';
  agentId: string;
}

// ─── Canvas Actions ─────────────────────────────────────────────────────────

/** An action to perform on the canvas */
export type CanvasActionType =
  | 'create_node'
  | 'create_edge'
  | 'update_node'
  | 'delete_node'
  | 'create_group'
  | 'create_diagram';

export interface CanvasAction {
  type: CanvasActionType;
  payload: NodeAction | EdgeAction | GroupAction | DiagramAction;
}

export interface DiagramAction {
  id: string;
  htmlContent: string;
  width: number;
  height: number;
  position?: { x: number; y: number };
}

export interface NodeAction {
  id: string;
  label: string;
  type: 'service' | 'database' | 'api' | 'ui' | 'external' | 'decision';
  description?: string;
  metadata?: Record<string, string>;
  position?: { x: number; y: number };
}

export interface EdgeAction {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  type: 'data_flow' | 'dependency' | 'api_call' | 'event';
}

export interface GroupAction {
  id: string;
  label: string;
  childIds: string[];
}

// ─── Orchestration Session ──────────────────────────────────────────────────

/** Execution mode for multi-agent orchestration */
export type ExecutionMode = 'sequential' | 'parallel' | 'single';

/** Configuration for an orchestration run */
export interface OrchestrationConfig {
  mode: ExecutionMode;
  maxConcurrent: number;       // For parallel mode
  timeoutMs: number;           // Per-agent timeout
  enableCanvasActions: boolean; // Whether to generate canvas nodes
  enableMemory: boolean;        // Whether to record to MemPalace (Step 06)
}

/** The full orchestration result after all agents complete */
export interface OrchestrationResult {
  sessionId: string;
  prompt: string;
  analysis: PromptAnalysis;
  agentResults: AgentResult[];
  canvasActions: CanvasAction[];
  decisions: StructuredDecision[];
  startedAt: number;
  completedAt: number;
}

// ─── Default Config ─────────────────────────────────────────────────────────

export const DEFAULT_ORCHESTRATION_CONFIG: OrchestrationConfig = {
  mode: 'sequential',
  maxConcurrent: 3,
  timeoutMs: 60000,
  enableCanvasActions: true,
  enableMemory: false,  // Enabled when Step 06 is wired in
};

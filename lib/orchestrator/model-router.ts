/**
 * Model Router — determine which model to use for an agent.
 *
 * NOTE: Since we migrated to native AIConnection-based routing, API keys
 * are no longer read from process.env. The active connection from
 * localStorage handles all authentication. This router simply reflects
 * the agent's configured model without env-based fallbacks.
 */

import type { ModelId, AgentDef } from '@/lib/ai/types';

export interface RouteResult {
  model: ModelId;
  provider: string;
  reason: string;
}

/**
 * Determine which model an agent should use.
 * Priority: override > agent default
 * The actual API credentials are provided by the active AIConnection at stream time.
 */
export function routeModel(
  agent: AgentDef,
  overrideModel?: ModelId,
): RouteResult {
  const model = overrideModel ?? agent.defaultModel;
  return {
    model,
    provider: 'connection', // resolved at stream time via active AIConnection
    reason: overrideModel
      ? `User override: ${model}`
      : `Agent default: ${model}`,
  };
}

/**
 * Previously checked env vars — now always returns the model as-is.
 * Actual availability is determined by the user's configured connection.
 */
export function isModelAvailable(_model: ModelId): boolean {
  return true;
}

/**
 * No fallback needed — the active AIConnection handles routing.
 * Returns preferred model unchanged.
 */
export function getFallbackModel(preferred: ModelId): ModelId {
  return preferred;
}

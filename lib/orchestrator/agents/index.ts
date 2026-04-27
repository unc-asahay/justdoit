/**
 * Agent Registry — create agent instances from their definitions.
 */

export { BaseAgent } from './base-agent';
export { DesignAgent } from './design-agent';
export { ArchAgent } from './arch-agent';
export { TechAgent } from './tech-agent';
export { BizAgent } from './biz-agent';
export { ValidationAgent } from './validation-agent';
export { DiagramAgent } from './diagram-agent';

import { DesignAgent } from './design-agent';
import { ArchAgent } from './arch-agent';
import { TechAgent } from './tech-agent';
import { BizAgent } from './biz-agent';
import { ValidationAgent } from './validation-agent';
import { DiagramAgent as PlotterAgent } from './diagram-agent';
import { BaseAgent } from './base-agent';
import { DEFAULT_AGENTS } from '@/lib/ai/types';

/**
 * Create an agent instance from its definition.
 * Maps AgentDef.id → concrete agent class.
 */
export function createAgent(def: AgentDef): BaseAgent | null {
  if (!def) return null;

  switch (def.id) {
    case 'design-agent':     return new DesignAgent(def);
    case 'arch-agent':       return new ArchAgent(def);
    case 'tech-agent':       return new TechAgent(def);
    case 'biz-agent':        return new BizAgent(def);
    case 'validation-agent': return new ValidationAgent(def);
    case 'plotter-agent':    return new PlotterAgent(def);
    default:                 
      // For custom agents or unknown types, fallback to TechAgent logic
      // (which is generic and relies on the system prompt)
      return new TechAgent(def);
  }
}

/**
 * Create all available agent instances (using defaults).
 */
export function createAllAgents(): Map<string, BaseAgent> {
  const agents = new Map<string, BaseAgent>();
  for (const def of DEFAULT_AGENTS) {
    const agent = createAgent(def);
    if (agent) agents.set(def.id, agent);
  }
  return agents;
}

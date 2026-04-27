/**
 * Agent Registry — CRUD + serialization for custom agents.
 * Built-in agents come from DEFAULT_AGENTS (step-04).
 */

import { DEFAULT_AGENTS } from '@/lib/ai/types';
import type { AgentDef, ModelId } from '@/lib/ai/types';
import type {
  CustomAgent,
  SerializedCustomAgent,
  CustomAgentsFile,
  AgentSkills,
  AgentZone,
} from './types';
import { DEFAULT_SKILLS, DEFAULT_ZONE } from './types';

// ─── Conversion ─────────────────────────────────────────────────────────────

export function builtInToCustomAgent(agent: AgentDef): CustomAgent {
  return {
    ...agent,
    persona: agent.name.replace(' Agent', ''),
    description: agent.systemPrompt.slice(0, 100) + '...',
    skills: { ...DEFAULT_SKILLS },
    zone: { type: 'global', priority: 1 },
    status: agent.enabled ? 'idle' : 'disabled',
    isBuiltIn: true,
    createdAt: new Date(0).toISOString(),
    lastUsed: '',
    totalTokens: 0,
  };
}

export function getBuiltInAgents(): CustomAgent[] {
  return DEFAULT_AGENTS.map(builtInToCustomAgent);
}

// ─── Create ─────────────────────────────────────────────────────────────────

export function createCustomAgent(partial: {
  name: string;
  icon?: string;
  persona?: string;
  description?: string;
  defaultModel?: ModelId;
  systemPrompt?: string;
  skills?: Partial<AgentSkills>;
  zone?: Partial<AgentZone>;
}): CustomAgent {
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    name: partial.name,
    icon: partial.icon ?? '🤖',
    persona: partial.persona ?? '',
    description: partial.description ?? '',
    defaultModel: partial.defaultModel ?? 'claude-sonnet-4-20250514',
    systemPrompt: partial.systemPrompt ?? '',
    skills: { ...DEFAULT_SKILLS, ...partial.skills },
    zone: { ...DEFAULT_ZONE, ...partial.zone } as AgentZone,
    enabled: false,
    status: 'disabled',
    isBuiltIn: false,
    createdAt: new Date().toISOString(),
    lastUsed: '',
    totalTokens: 0,
  };
}

// ─── Serialize ─────────────────────────────────────────────────────────────

export function serializeAgent(agent: CustomAgent): SerializedCustomAgent {
  return {
    id: agent.id,
    name: agent.name,
    icon: agent.icon,
    persona: agent.persona,
    description: agent.description,
    defaultModel: agent.defaultModel,
    systemPrompt: agent.systemPrompt,
    skills: { ...agent.skills },
    zone: { ...agent.zone },
    enabled: agent.enabled,
    createdAt: agent.createdAt,
    lastUsed: agent.lastUsed,
    totalTokens: agent.totalTokens,
  };
}

export function deserializeAgent(data: SerializedCustomAgent): CustomAgent {
  return {
    ...data,
    status: data.enabled ? 'idle' : 'disabled',
    isBuiltIn: false,
  };
}

export function serializeAgentsFile(agents: CustomAgent[]): string {
  const customOnly = agents.filter(a => !a.isBuiltIn);
  const file: CustomAgentsFile = {
    version: '1.0',
    agents: customOnly.map(serializeAgent),
  };
  return JSON.stringify(file, null, 2);
}

export function deserializeAgentsFile(json: string): CustomAgent[] {
  const file = JSON.parse(json) as CustomAgentsFile;
  return file.agents.map(deserializeAgent);
}

// ─── Orchestrator integration ───────────────────────────────────────────────

export function agentToAgentDef(agent: CustomAgent): AgentDef {
  return {
    id: agent.id,
    name: agent.name,
    icon: agent.icon,
    defaultModel: agent.defaultModel,
    systemPrompt: agent.systemPrompt,
    enabled: agent.enabled,
  };
}

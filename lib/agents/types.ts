/**
 * Custom Agent Types
 * Extends step-04's AgentDef with skills, zones, and builder metadata.
 */

import type { AgentDef, ModelId } from '@/lib/ai/types';

// ─── Skills (Permission Matrix) ─────────────────────────────────────────────

export interface AgentSkills {
  readCanvas: boolean;
  createShapes: boolean;
  modifyOwn: boolean;
  modifyOthers: boolean;
  deleteOwn: boolean;
  deleteOthers: boolean;
  addComments: boolean;
  queryMemory: boolean;
  storeMemory: boolean;
}

/** Default skills for new custom agents (safe defaults) */
export const DEFAULT_SKILLS: AgentSkills = {
  readCanvas: true,
  createShapes: true,
  modifyOwn: true,
  modifyOthers: false,
  deleteOwn: true,
  deleteOthers: false,
  addComments: true,
  queryMemory: true,
  storeMemory: true,
};

// ─── Zone Assignment ────────────────────────────────────────────────────────

export type ZoneType = 'sandbox' | 'assigned' | 'global';

export interface AgentZone {
  type: ZoneType;
  region?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  priority: 1 | 2 | 3 | 4 | 5;
}

export const DEFAULT_ZONE: AgentZone = {
  type: 'sandbox',
  priority: 3,
};

// ─── Agent Status ──────────────────────────────────────────────────────────

export type AgentStatus = 'idle' | 'active' | 'queued' | 'error' | 'disabled';

// ─── Custom Agent (extends AgentDef) ───────────────────────────────────────

export interface CustomAgent extends AgentDef {
  persona: string;
  description: string;
  skills: AgentSkills;
  zone: AgentZone;
  status: AgentStatus;
  isBuiltIn: boolean;
  createdAt: string;
  lastUsed: string;
  totalTokens: number;
  /** ID of the AIConnection to use for this agent. Falls back to the global active connection if not set. */
  connectionId?: string;
}

// ─── Serialized Format (for custom-agents.json) ─────────────────────────────

export interface SerializedCustomAgent {
  id: string;
  name: string;
  icon: string;
  persona: string;
  description: string;
  defaultModel: ModelId;
  systemPrompt: string;
  skills: AgentSkills;
  zone: AgentZone;
  enabled: boolean;
  createdAt: string;
  lastUsed: string;
  totalTokens: number;
  connectionId?: string;
}

export interface CustomAgentsFile {
  version: '1.0';
  agents: SerializedCustomAgent[];
}

// ─── Skill Metadata (for UI rendering) ────────────────────────────────────

export interface SkillMeta {
  key: keyof AgentSkills;
  label: string;
  description: string;
  dangerous: boolean;
}

export const SKILL_DEFINITIONS: SkillMeta[] = [
  { key: 'readCanvas',    label: 'Read Canvas',       description: 'Can view all shapes and nodes on the canvas',    dangerous: false },
  { key: 'createShapes',  label: 'Create Shapes',     description: 'Can add new shapes, text, and connectors',       dangerous: false },
  { key: 'modifyOwn',     label: 'Modify Own Work',   description: 'Can edit shapes it previously created',          dangerous: false },
  { key: 'modifyOthers',  label: "Modify Others' Work", description: 'Can edit shapes created by other agents',     dangerous: true  },
  { key: 'deleteOwn',     label: 'Delete Own Work',   description: 'Can remove shapes it previously created',         dangerous: false },
  { key: 'deleteOthers',  label: "Delete Others' Work", description: 'Can remove shapes created by other agents',     dangerous: true  },
  { key: 'addComments',   label: 'Add Comments',      description: 'Can add comment/annotation shapes',              dangerous: false },
  { key: 'queryMemory',   label: 'Query MemPalace',   description: 'Can search prior decisions in memory',            dangerous: false },
  { key: 'storeMemory',   label: 'Store to MemPalace', description: 'Can save decisions to persistent memory',         dangerous: false },
];

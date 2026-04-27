/**
 * Conflict System Types
 *
 * All types for the 5-layer conflict prevention pipeline.
 * Integrates with:
 *   - Step 05 (CanvasAction, CanvasActionType) for action payloads
 *   - Step 08 (AgentSkills, AgentZone) for permission/zone source data
 */

import type { CanvasAction } from '@/lib/orchestrator/types';
import type { AgentSkills } from '@/lib/agents/types';

// ─── Layer 1: Zone Types ─────────────────────────────────────────────────────

export interface ZoneRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasZone {
  id: string;
  name: string;
  region: ZoneRegion;
  assignedAgents: string[];
  color: string;
  locked: boolean;
}

export interface ZoneOverlay {
  region: ZoneRegion;
  color: string;
  borderColor: string;
  label: string;
}

export interface ZoneCheckResult {
  allowed: boolean;
  zoneName: string | null;
  reason: string;
}

// ─── Layer 2: Permission Types ───────────────────────────────────────────────

export type PermissionAction = 'create' | 'modify' | 'delete' | 'read';

export interface PermissionCheckInput {
  agentId: string;
  action: PermissionAction;
  targetOwnerId?: string;
}

export interface PermissionResult {
  allowed: boolean;
  reason: string;
}

// ─── Layer 3: Lock Types ─────────────────────────────────────────────────────

export interface Lock {
  nodeId: string;
  agentId: string;
  acquiredAt: number;
  expiresAt: number;
}

export interface LockResult {
  acquired: boolean;
  reason?: string;
  queuePosition?: number;
  currentHolder?: string;
}

export const LOCK_TTL_MS = 30_000;
export const LOCK_MAX_QUEUE = 10;

// ─── Layer 4: Validation Gate Types ──────────────────────────────────────────

export interface WriteRequest {
  id: string;
  agentId: string;
  action: CanvasAction;
  timestamp: number;
  targetNodeId?: string;
  targetOwnerId?: string;
  position?: { x: number; y: number };
}

export interface ValidationResult {
  allowed: boolean;
  errors: ValidationError[];
  warnings: string[];
  adjustedRequest?: WriteRequest;
  layerResults: {
    zone: ZoneCheckResult;
    permission: PermissionResult;
    lock: LockResult;
  };
}

export interface ValidationError {
  layer: 1 | 2 | 3 | 4;
  layerName: 'zone' | 'permission' | 'lock' | 'overlap';
  message: string;
  agentId: string;
}

// ─── Layer 5: Rollback Types ─────────────────────────────────────────────────

export interface ActionRecord {
  id: string;
  agentId: string;
  timestamp: number;
  action: CanvasAction;
  previousState: unknown;
  writeRequestId: string;
}

export interface AgentActionSummary {
  agentId: string;
  creates: number;
  modifies: number;
  deletes: number;
  totalActions: number;
  firstActionAt: number;
  lastActionAt: number;
}

export interface RollbackResult {
  success: boolean;
  actionsReverted: number;
  errors: string[];
}

// ─── Conflict Logger Types ───────────────────────────────────────────────────

export type ConflictEventType =
  | 'zone_denied'
  | 'permission_denied'
  | 'lock_denied'
  | 'lock_acquired'
  | 'lock_released'
  | 'lock_expired'
  | 'overlap_adjusted'
  | 'action_recorded'
  | 'rollback_executed'
  | 'validation_passed';

export interface ConflictEvent {
  id: string;
  type: ConflictEventType;
  timestamp: number;
  agentId: string;
  details: string;
  layer?: 1 | 2 | 3 | 4 | 5;
  nodeId?: string;
  severity: 'info' | 'warning' | 'error';
}

// ─── Conflict System (assembled) ────────────────────────────────────────────

export interface ConflictSystem {
  zones: ZoneManager;
  permissions: PermissionMatrix;
  locks: LockManager;
  rollback: RollbackManager;
  logger: ConflictLogger;
  gate: ValidationGate;
}

// Forward-declare for the interface above
import type { ZoneManager } from './zone-manager';
import type { PermissionMatrix } from './permission-matrix';
import type { LockManager } from './lock-manager';
import type { RollbackManager } from './rollback-manager';
import type { ConflictLogger } from './conflict-logger';
import type { ValidationGate } from './validation-gate';
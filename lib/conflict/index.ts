/**
 * Conflict System Public API
 *
 * Usage:
 *   import { createConflictSystem } from '@/lib/conflict';
 *
 *   const conflict = createConflictSystem();
 *   const result = conflict.gate.validate(writeRequest);
 */

// Layer 1
export { ZoneManager } from './zone-manager';

// Layer 2
export { PermissionMatrix } from './permission-matrix';

// Layer 3
export { LockManager } from './lock-manager';

// Layer 4
export { ValidationGate } from './validation-gate';

// Layer 5
export { RollbackManager } from './rollback-manager';

// Cross-cutting
export { ConflictLogger } from './conflict-logger';

// Types
export type {
  CanvasZone,
  ZoneRegion,
  ZoneOverlay,
  ZoneCheckResult,
  PermissionAction,
  PermissionCheckInput,
  PermissionResult,
  Lock,
  LockResult,
  WriteRequest,
  ValidationResult,
  ValidationError,
  ActionRecord,
  AgentActionSummary,
  RollbackResult,
  ConflictEvent,
  ConflictEventType,
  ConflictSystem,
} from './types';

export { LOCK_TTL_MS, LOCK_MAX_QUEUE } from './types';

// ─── Factory ──────────────────────────────────────────────────────────────

import { ZoneManager } from './zone-manager';
import { PermissionMatrix } from './permission-matrix';
import { LockManager } from './lock-manager';
import { RollbackManager } from './rollback-manager';
import { ConflictLogger } from './conflict-logger';
import { ValidationGate } from './validation-gate';
import type { ConflictSystem } from './types';

export function createConflictSystem(): ConflictSystem {
  const zoneManager = new ZoneManager();
  const permissionMatrix = new PermissionMatrix();
  const lockManager = new LockManager();
  const rollbackManager = new RollbackManager();
  const logger = new ConflictLogger();

  const gate = new ValidationGate({
    zoneManager,
    permissionMatrix,
    lockManager,
    rollbackManager,
    logger,
  });

  return {
    zones: zoneManager,
    permissions: permissionMatrix,
    locks: lockManager,
    rollback: rollbackManager,
    logger,
    gate,
  };
}
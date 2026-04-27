/**
 * Layer 4: Validation Gate — Master Pre-Write Pipeline
 *
 * This is the SINGLE entry point for ALL canvas write operations.
 * The orchestrator calls validate() before executing any CanvasAction.
 *
 * Pipeline:
 *   1. Zone check (ZoneManager)
 *   2. Permission check (PermissionMatrix)
 *   3. Lock check (LockManager)
 *   4. Overlap check (built-in to this class)
 *   5. Record action (RollbackManager) — only if layers 1-4 pass
 *
 * Short-circuits on first DENIAL (layers 2-5 won't run if layer 1 fails).
 */

import { ZoneManager } from './zone-manager';
import { PermissionMatrix } from './permission-matrix';
import { LockManager } from './lock-manager';
import { RollbackManager } from './rollback-manager';
import { ConflictLogger } from './conflict-logger';
import type {
  WriteRequest,
  ValidationResult,
  ValidationError,
  ZoneCheckResult,
  PermissionResult,
  LockResult,
  PermissionAction,
} from './types';

const OVERLAP_NUDGE_PX = 20;

export class ValidationGate {
  private zoneManager: ZoneManager;
  private permissions: PermissionMatrix;
  private locks: LockManager;
  private rollback: RollbackManager;
  private logger: ConflictLogger;

  private recentPositions: Map<string, { x: number; y: number; timestamp: number }> = new Map();

  constructor(deps: {
    zoneManager: ZoneManager;
    permissionMatrix: PermissionMatrix;
    lockManager: LockManager;
    rollbackManager: RollbackManager;
    logger: ConflictLogger;
  }) {
    this.zoneManager = deps.zoneManager;
    this.permissions = deps.permissionMatrix;
    this.locks = deps.lockManager;
    this.rollback = deps.rollbackManager;
    this.logger = deps.logger;
  }

  // ─── Main Validate Method ──────────────────────────────────────────────

  validate(request: WriteRequest): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];
    let adjustedRequest = { ...request };

    const permAction = this.mapActionType(request.action.type);

    // ─── LAYER 1: Zone Isolation ────────────────────────────────────────

    let zoneResult: ZoneCheckResult = {
      allowed: true,
      zoneName: null,
      reason: 'No position data — zone check skipped',
    };

    if (request.position) {
      zoneResult = this.zoneManager.canAgentWriteAt(
        request.agentId,
        request.position.x,
        request.position.y,
      );

      if (!zoneResult.allowed) {
        errors.push({
          layer: 1,
          layerName: 'zone',
          message: zoneResult.reason,
          agentId: request.agentId,
        });

        this.logger.log({
          type: 'zone_denied',
          agentId: request.agentId,
          details: zoneResult.reason,
          layer: 1,
          nodeId: request.targetNodeId,
          severity: 'error',
        });

        return this.buildResult(false, errors, warnings, adjustedRequest, zoneResult);
      }
    }

    // ─── LAYER 2: Permission Matrix ─────────────────────────────────────

    const permResult = this.permissions.check({
      agentId: request.agentId,
      action: permAction,
      targetOwnerId: request.targetOwnerId,
    });

    if (!permResult.allowed) {
      errors.push({
        layer: 2,
        layerName: 'permission',
        message: permResult.reason,
        agentId: request.agentId,
      });

      this.logger.log({
        type: 'permission_denied',
        agentId: request.agentId,
        details: permResult.reason,
        layer: 2,
        nodeId: request.targetNodeId,
        severity: 'error',
      });

      return this.buildResult(false, errors, warnings, adjustedRequest, zoneResult, permResult);
    }

    // ─── LAYER 3: Lock Manager ──────────────────────────────────────────

    let lockResult: LockResult = { acquired: true };

    if (request.targetNodeId && (permAction === 'modify' || permAction === 'delete')) {
      lockResult = this.locks.acquire(request.targetNodeId, request.agentId);

      if (!lockResult.acquired) {
        errors.push({
          layer: 3,
          layerName: 'lock',
          message: lockResult.reason || 'Lock denied',
          agentId: request.agentId,
        });

        this.logger.log({
          type: 'lock_denied',
          agentId: request.agentId,
          details: `Node '${request.targetNodeId}' locked by '${lockResult.currentHolder}'`,
          layer: 3,
          nodeId: request.targetNodeId,
          severity: 'warning',
        });

        return this.buildResult(false, errors, warnings, adjustedRequest, zoneResult, permResult, lockResult);
      }

      this.logger.log({
        type: 'lock_acquired',
        agentId: request.agentId,
        details: `Lock acquired on node '${request.targetNodeId}'`,
        layer: 3,
        nodeId: request.targetNodeId,
        severity: 'info',
      });
    }

    // ─── LAYER 4: Overlap Detection ─────────────────────────────────────

    if (permAction === 'create' && request.position) {
      const overlap = this.checkOverlap(request.position.x, request.position.y);
      if (overlap) {
        adjustedRequest = {
          ...adjustedRequest,
          position: {
            x: request.position.x + OVERLAP_NUDGE_PX,
            y: request.position.y + OVERLAP_NUDGE_PX,
          },
        };
        warnings.push(
          `Position adjusted by +${OVERLAP_NUDGE_PX}px to avoid overlap with existing node`,
        );

        this.logger.log({
          type: 'overlap_adjusted',
          agentId: request.agentId,
          details: `Position nudged from (${request.position.x},${request.position.y}) to (${adjustedRequest.position!.x},${adjustedRequest.position!.y})`,
          layer: 4,
          severity: 'warning',
        });
      }

      this.recentPositions.set(request.id, {
        x: adjustedRequest.position!.x,
        y: adjustedRequest.position!.y,
        timestamp: Date.now(),
      });
    }

    // ─── LAYER 5: Record for Rollback ────────────────────────────────────

    this.logger.log({
      type: 'validation_passed',
      agentId: request.agentId,
      details: `All 4 layers passed for ${request.action.type}`,
      severity: 'info',
    });

    return this.buildResult(true, errors, warnings, adjustedRequest, zoneResult, permResult, lockResult);
  }

  // ─── Post-Execution Recording ────────────────────────────────────────────

  recordAction(request: WriteRequest, previousState: unknown): void {
    this.rollback.record(
      request.agentId,
      request.action,
      previousState,
      request.id,
    );

    this.logger.log({
      type: 'action_recorded',
      agentId: request.agentId,
      details: `Recorded ${request.action.type} for rollback`,
      layer: 5,
      nodeId: request.targetNodeId,
      severity: 'info',
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private mapActionType(type: string): PermissionAction {
    switch (type) {
      case 'create_node':
      case 'create_edge':
      case 'create_group':
        return 'create';
      case 'update_node':
        return 'modify';
      case 'delete_node':
        return 'delete';
      default:
        return 'read';
    }
  }

  private checkOverlap(x: number, y: number): boolean {
    const threshold = 15;
    const now = Date.now();

    for (const [id, pos] of this.recentPositions.entries()) {
      if (now - pos.timestamp > 60_000) {
        this.recentPositions.delete(id);
      }
    }

    for (const pos of this.recentPositions.values()) {
      if (Math.abs(pos.x - x) < threshold && Math.abs(pos.y - y) < threshold) {
        return true;
      }
    }
    return false;
  }

  private buildResult(
    allowed: boolean,
    errors: ValidationError[],
    warnings: string[],
    adjustedRequest: WriteRequest,
    zoneResult?: ZoneCheckResult,
    permResult?: PermissionResult,
    lockResult?: LockResult,
  ): ValidationResult {
    return {
      allowed,
      errors,
      warnings,
      adjustedRequest: allowed ? adjustedRequest : undefined,
      layerResults: {
        zone: zoneResult ?? { allowed: true, zoneName: null, reason: 'Not checked' },
        permission: permResult ?? { allowed: true, reason: 'Not checked' },
        lock: lockResult ?? { acquired: true },
      },
    };
  }
}
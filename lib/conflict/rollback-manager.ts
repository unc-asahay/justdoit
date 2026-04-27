/**
 * Layer 5: Rollback Safety
 *
 * Records every canvas action for undo capability.
 *
 * Features:
 *   - Record action + previous state snapshot
 *   - Undo single action (last action by agent)
 *   - Undo entire agent session (all actions by one agent)
 *   - Get diff (what did this agent change?)
 *   - Get summary (creates, modifies, deletes per agent)
 *
 * Note: Rollback is in-memory only. Git provides the
 * persistent version history (Step 07).
 */

import type { CanvasAction } from '@/lib/orchestrator/types';
import type { ActionRecord, AgentActionSummary, RollbackResult } from './types';

export type RollbackEventHandler = (event: {
  type: 'recorded' | 'undone' | 'session_reverted';
  agentId: string;
  actionCount: number;
}) => void;

export class RollbackManager {
  private history: ActionRecord[] = [];
  private maxHistory: number = 1000;
  private eventHandler: RollbackEventHandler | null = null;

  constructor(maxHistory: number = 1000) {
    this.maxHistory = maxHistory;
  }

  // ─── Event Subscription ─────────────────────────────────────────────────

  onEvent(handler: RollbackEventHandler): void {
    this.eventHandler = handler;
  }

  private emit(event: Parameters<RollbackEventHandler>[0]): void {
    this.eventHandler?.(event);
  }

  // ─── Record ──────────────────────────────────────────────────────────────

  record(
    agentId: string,
    action: CanvasAction,
    previousState: unknown,
    writeRequestId: string,
  ): ActionRecord {
    const record: ActionRecord = {
      id: crypto.randomUUID(),
      agentId,
      timestamp: Date.now(),
      action,
      previousState,
      writeRequestId,
    };

    this.history.push(record);

    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    this.emit({ type: 'recorded', agentId, actionCount: 1 });
    return record;
  }

  // ─── Undo Last Action ─────────────────────────────────────────────────

  undoLast(agentId: string): ActionRecord | null {
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].agentId === agentId) {
        const [removed] = this.history.splice(i, 1);
        this.emit({ type: 'undone', agentId, actionCount: 1 });
        return removed;
      }
    }
    return null;
  }

  // ─── Undo Entire Agent Session ─────────────────────────────────────────

  undoAgent(agentId: string): RollbackResult {
    const agentActions = this.history.filter(a => a.agentId === agentId).reverse();

    if (agentActions.length === 0) {
      return { success: true, actionsReverted: 0, errors: [] };
    }

    this.history = this.history.filter(a => a.agentId !== agentId);

    this.emit({
      type: 'session_reverted',
      agentId,
      actionCount: agentActions.length,
    });

    return {
      success: true,
      actionsReverted: agentActions.length,
      errors: [],
    };
  }

  // ─── Diff & Summary ───────────────────────────────────────────────────

  getAgentDiff(agentId: string): ActionRecord[] {
    return this.history.filter(a => a.agentId === agentId);
  }

  getAgentSummary(agentId: string): AgentActionSummary {
    const actions = this.getAgentDiff(agentId);
    const summary: AgentActionSummary = {
      agentId,
      creates: 0,
      modifies: 0,
      deletes: 0,
      totalActions: actions.length,
      firstActionAt: actions[0]?.timestamp ?? 0,
      lastActionAt: actions[actions.length - 1]?.timestamp ?? 0,
    };

    for (const record of actions) {
      switch (record.action.type) {
        case 'create_node':
        case 'create_edge':
        case 'create_group':
          summary.creates++;
          break;
        case 'update_node':
          summary.modifies++;
          break;
        case 'delete_node':
          summary.deletes++;
          break;
      }
    }

    return summary;
  }

  getAllSummaries(): AgentActionSummary[] {
    const agentIds = [...new Set(this.history.map(a => a.agentId))];
    return agentIds.map(id => this.getAgentSummary(id));
  }

  // ─── Queries ──────────────────────────────────────────────────────────

  getRecentActions(count: number = 20): ActionRecord[] {
    return this.history.slice(-count).reverse();
  }

  getTotalActionCount(): number {
    return this.history.length;
  }

  clear(): void {
    this.history = [];
  }
}
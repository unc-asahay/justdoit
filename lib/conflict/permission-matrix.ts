/**
 * Layer 2: Permission Matrix
 *
 * Maps AgentSkills (from step-08) to a permission check for each
 * canvas write operation. Answers: "Does this agent have the right
 * to create / modify / delete this object?"
 *
 * Key rules:
 *   - 'read' is always allowed if readCanvas is true
 *   - 'create' requires createShapes
 *   - 'modify' depends on ownership: modifyOwn vs modifyOthers
 *   - 'delete' depends on ownership: deleteOwn vs deleteOthers
 *   - Built-in agents get full safe permissions by default
 */

import type { AgentSkills } from '@/lib/agents/types';
import type { PermissionAction, PermissionResult, PermissionCheckInput } from './types';

export class PermissionMatrix {
  private permissions: Map<string, AgentSkills> = new Map();

  // ─── Registration ─────────────────────────────────────────────────────

  registerAgent(agentId: string, skills: AgentSkills): void {
    this.permissions.set(agentId, { ...skills });
  }

  unregisterAgent(agentId: string): void {
    this.permissions.delete(agentId);
  }

  registerAll(agents: Array<{ id: string; skills: AgentSkills }>): void {
    for (const agent of agents) {
      this.registerAgent(agent.id, agent.skills);
    }
  }

  // ─── Permission Check (Layer 2 core logic) ─────────────────────────────

  check(input: PermissionCheckInput): PermissionResult {
    const { agentId, action, targetOwnerId } = input;
    const skills = this.permissions.get(agentId);

    if (!skills) {
      return {
        allowed: false,
        reason: `Agent '${agentId}' is not registered in the permission matrix`,
      };
    }

    switch (action) {
      case 'read':
        return {
          allowed: skills.readCanvas,
          reason: skills.readCanvas
            ? 'Read access granted'
            : `Agent '${agentId}' does not have readCanvas permission`,
        };

      case 'create':
        return {
          allowed: skills.createShapes,
          reason: skills.createShapes
            ? 'Create access granted'
            : `Agent '${agentId}' does not have createShapes permission`,
        };

      case 'modify': {
        const isOwner = targetOwnerId === agentId;
        const allowed = isOwner ? skills.modifyOwn : skills.modifyOthers;
        return {
          allowed,
          reason: allowed
            ? `Modify ${isOwner ? 'own' : "others'"} access granted`
            : `Agent '${agentId}' cannot modify ${isOwner ? 'own' : "others'"} work`,
        };
      }

      case 'delete': {
        const isOwner = targetOwnerId === agentId;
        const allowed = isOwner ? skills.deleteOwn : skills.deleteOthers;
        return {
          allowed,
          reason: allowed
            ? `Delete ${isOwner ? 'own' : "others'"} access granted`
            : `Agent '${agentId}' cannot delete ${isOwner ? 'own' : "others'"} work`,
        };
      }

      default:
        return { allowed: false, reason: `Unknown action: ${action}` };
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  isRegistered(agentId: string): boolean {
    return this.permissions.has(agentId);
  }

  getAgentSkills(agentId: string): AgentSkills | undefined {
    return this.permissions.get(agentId);
  }

  getRegisteredAgents(): string[] {
    return Array.from(this.permissions.keys());
  }
}
/**
 * Layer 1: Zone Isolation
 *
 * Manages canvas zones — rectangular regions where specific agents
 * are allowed to write. Agents outside their zone get DENIED.
 *
 * Rules:
 *   - Each zone has a list of assigned agents
 *   - Points outside ALL zones = free space (any agent can write)
 *   - Locked zones reject ALL writes (even assigned agents)
 *   - Sandbox zone auto-accepts any agent tagged with zone.type = 'sandbox'
 */

import type { CanvasZone, ZoneRegion, ZoneOverlay, ZoneCheckResult } from './types';

const DEFAULT_ZONES: CanvasZone[] = [
  {
    id: 'zone-design',
    name: 'Design Zone',
    region: { x: 0, y: 0, width: 2000, height: 2000 },
    assignedAgents: ['design-agent'],
    color: '#8B5CF6',
    locked: false,
  },
  {
    id: 'zone-architecture',
    name: 'Architecture Zone',
    region: { x: 2200, y: 0, width: 2000, height: 2000 },
    assignedAgents: ['arch-agent', 'tech-agent'],
    color: '#3B82F6',
    locked: false,
  },
  {
    id: 'zone-business',
    name: 'Business Zone',
    region: { x: 4400, y: 0, width: 2000, height: 2000 },
    assignedAgents: ['biz-agent'],
    color: '#10B981',
    locked: false,
  },
  {
    id: 'zone-sandbox',
    name: 'Sandbox',
    region: { x: 0, y: 2200, width: 6400, height: 2000 },
    assignedAgents: [],
    color: '#F59E0B',
    locked: false,
  },
];

export class ZoneManager {
  private zones: Map<string, CanvasZone> = new Map();

  constructor() {
    this.createDefaultZones();
  }

  // ─── Zone CRUD ──────────────────────────────────────────────────────────

  createDefaultZones(): void {
    this.zones.clear();
    for (const zone of DEFAULT_ZONES) {
      this.zones.set(zone.id, { ...zone });
    }
  }

  addZone(zone: CanvasZone): void {
    this.zones.set(zone.id, zone);
  }

  removeZone(zoneId: string): boolean {
    return this.zones.delete(zoneId);
  }

  getZone(zoneId: string): CanvasZone | undefined {
    return this.zones.get(zoneId);
  }

  getAllZones(): CanvasZone[] {
    return Array.from(this.zones.values());
  }

  // ─── Agent Assignment ────────────────────────────────────────────────────

  assignAgentToZone(agentId: string, zoneId: string): boolean {
    const zone = this.zones.get(zoneId);
    if (!zone) return false;
    if (!zone.assignedAgents.includes(agentId)) {
      zone.assignedAgents.push(agentId);
    }
    return true;
  }

  removeAgentFromZone(agentId: string, zoneId: string): boolean {
    const zone = this.zones.get(zoneId);
    if (!zone) return false;
    zone.assignedAgents = zone.assignedAgents.filter(id => id !== agentId);
    return true;
  }

  assignToSandbox(agentId: string): void {
    this.assignAgentToZone(agentId, 'zone-sandbox');
  }

  // ─── Zone Check (Layer 1 core logic) ──────────────────────────────────

  /**
   * Check if an agent can write at a specific position.
   *
   * Logic:
   *   1. If the point is inside a LOCKED zone → DENIED
   *   2. If the point is inside a zone AND agent is assigned → ALLOWED
   *   3. If the point is inside a zone AND agent is NOT assigned → DENIED
   *   4. If the point is OUTSIDE all zones → ALLOWED (free space)
   */
  canAgentWriteAt(agentId: string, x: number, y: number): ZoneCheckResult {
    for (const zone of this.zones.values()) {
      if (this.isPointInRegion(x, y, zone.region)) {
        if (zone.locked) {
          return {
            allowed: false,
            zoneName: zone.name,
            reason: `Zone '${zone.name}' is locked — no writes allowed`,
          };
        }
        if (zone.assignedAgents.includes(agentId)) {
          return {
            allowed: true,
            zoneName: zone.name,
            reason: 'Agent is assigned to this zone',
          };
        }
        return {
          allowed: false,
          zoneName: zone.name,
          reason: `Agent '${agentId}' is not assigned to zone '${zone.name}'`,
        };
      }
    }
    return {
      allowed: true,
      zoneName: null,
      reason: 'Free space — outside all defined zones',
    };
  }

  // ─── Zone Lock/Unlock ─────────────────────────────────────────────────

  lockZone(zoneId: string): boolean {
    const zone = this.zones.get(zoneId);
    if (!zone) return false;
    zone.locked = true;
    return true;
  }

  unlockZone(zoneId: string): boolean {
    const zone = this.zones.get(zoneId);
    if (!zone) return false;
    zone.locked = false;
    return true;
  }

  // ─── Visual Overlays ──────────────────────────────────────────────────

  getZoneOverlays(): ZoneOverlay[] {
    return Array.from(this.zones.values()).map(z => ({
      region: z.region,
      color: z.color + '20',
      borderColor: z.color,
      label: z.name,
    }));
  }

  // ─── Serialization (for zones.json persistence) ────────────────────────

  serialize(): string {
    const zones = Array.from(this.zones.values());
    return JSON.stringify({ version: '1.0', zones }, null, 2);
  }

  loadFromJson(json: string): void {
    const data = JSON.parse(json) as { zones: CanvasZone[] };
    this.zones.clear();
    for (const zone of data.zones) {
      this.zones.set(zone.id, zone);
    }
  }

  // ─── Internal Helpers ─────────────────────────────────────────────────

  private isPointInRegion(x: number, y: number, region: ZoneRegion): boolean {
    return (
      x >= region.x &&
      x <= region.x + region.width &&
      y >= region.y &&
      y <= region.y + region.height
    );
  }
}
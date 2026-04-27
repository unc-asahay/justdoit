// DiffTracker - Track changes since last commit with debouncing
// Watches canvas state, memory, agents, and project settings

export type ChangeType = 'canvas' | 'memory' | 'export' | 'agent' | 'project';

export interface ChangeSet {
  type: ChangeType;
  timestamp: Date;
  summary: string;
  // Canvas-specific
  nodesChanged?: number;
  layersChanged?: string[];
  // Memory-specific
  agentId?: string;
  // Export-specific
  formats?: string[];
  // Agent-specific
  agentName?: string;
  // Project-specific
  settingsChanged?: string[];
  // File paths affected
  affectedPaths?: string[];
}

export interface TrackedState {
  canvas: {
    lastNodeCount: number;
    lastLayerHash: string;
    lastTimestamp: Date | null;
  };
  memory: {
    lastAgentCount: number;
    lastMemoryHash: string;
    lastTimestamp: Date | null;
  };
  project: {
    lastSettingsHash: string;
    lastTimestamp: Date | null;
  };
}

const DEFAULT_DEBOUNCE_MS = 5000;

export class DiffTracker {
  private debounceMs: number;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingSave: (() => Promise<void>) | null = null;
  private changes: ChangeSet[] = [];
  private initialState: TrackedState;
  private currentState: TrackedState;
  private lastCommitHash: string | null = null;

  constructor(debounceMs: number = DEFAULT_DEBOUNCE_MS) {
    this.debounceMs = debounceMs;
    this.initialState = {
      canvas: { lastNodeCount: 0, lastLayerHash: '', lastTimestamp: null },
      memory: { lastAgentCount: 0, lastMemoryHash: '', lastTimestamp: null },
      project: { lastSettingsHash: '', lastTimestamp: null },
    };
    this.currentState = { ...this.initialState };
  }

  // ─── Change Tracking ──────────────────────────────────────────────────────

  /**
   * Record a change that occurred
   */
  trackChange(change: ChangeSet): void {
    this.changes.push({
      ...change,
      timestamp: new Date(),
    });
    this.updateTrackedState(change);
  }

  /**
   * Track canvas-specific changes
   */
  trackCanvasChange(nodeCount: number, layerHash: string, nodesChanged: number, layersChanged?: string[]): void {
    const change: ChangeSet = {
      type: 'canvas',
      timestamp: new Date(),
      summary: `Update canvas (${nodesChanged} nodes)`,
      nodesChanged,
      layersChanged,
    };
    this.trackChange(change);
  }

  /**
   * Track memory/MemPalace changes
   */
  trackMemoryChange(agentId: string, memoryHash: string, agentCount: number): void {
    const change: ChangeSet = {
      type: 'memory',
      timestamp: new Date(),
      summary: `Update ${agentId} memory`,
      agentId,
    };
    this.trackChange(change);
  }

  /**
   * Track export changes
   */
  trackExportChange(formats: string[]): void {
    const change: ChangeSet = {
      type: 'export',
      timestamp: new Date(),
      summary: `Re-export ${formats.join(', ')}`,
      formats,
    };
    this.trackChange(change);
  }

  /**
   * Track agent config changes
   */
  trackAgentChange(agentName: string): void {
    const change: ChangeSet = {
      type: 'agent',
      timestamp: new Date(),
      summary: `Update agent config: ${agentName}`,
      agentName,
    };
    this.trackChange(change);
  }

  /**
   * Track project settings changes
   */
  trackProjectChange(settingsChanged: string[]): void {
    const change: ChangeSet = {
      type: 'project',
      timestamp: new Date(),
      summary: `Update project settings`,
      settingsChanged,
    };
    this.trackChange(change);
  }

  // ─── State Management ──────────────────────────────────────────────────────

  private updateTrackedState(change: ChangeSet): void {
    switch (change.type) {
      case 'canvas':
        this.currentState.canvas.lastTimestamp = new Date();
        if (change.nodesChanged !== undefined) {
          this.currentState.canvas.lastNodeCount += change.nodesChanged;
        }
        break;
      case 'memory':
        this.currentState.memory.lastTimestamp = new Date();
        if (change.agentId) {
          this.currentState.memory.lastAgentCount++;
        }
        break;
      case 'project':
        this.currentState.project.lastTimestamp = new Date();
        break;
    }
  }

  /**
   * Get all tracked changes since last clear
   */
  getChanges(): ChangeSet[] {
    return [...this.changes];
  }

  /**
   * Get changes of a specific type
   */
  getChangesByType(type: ChangeType): ChangeSet[] {
    return this.changes.filter(c => c.type === type);
  }

  /**
   * Get diff summary for commit message generation
   */
  getDiffSummary(): string {
    const counts = {
      canvas: this.changes.filter(c => c.type === 'canvas').reduce((sum, c) => sum + (c.nodesChanged || 0), 0),
      memory: this.changes.filter(c => c.type === 'memory').length,
      export: this.changes.filter(c => c.type === 'export').length,
      agent: this.changes.filter(c => c.type === 'agent').length,
      project: this.changes.filter(c => c.type === 'project').length,
    };
    return JSON.stringify(counts);
  }

  /**
   * Clear all tracked changes (after commit)
   */
  clearChanges(): void {
    this.changes = [];
  }

  /**
   * Update the last commit hash (to track what's been committed)
   */
  markCommitted(hash: string): void {
    this.lastCommitHash = hash;
  }

  getLastCommitHash(): string | null {
    return this.lastCommitHash;
  }

  // ─── Debouncing ───────────────────────────────────────────────────────────

  /**
   * Debounce a save operation
   * If changes come in within debounce window, only the last one triggers save
   */
  debounceSave(saveFn: () => Promise<void>): void {
    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.pendingSave = saveFn;

    this.debounceTimer = setTimeout(async () => {
      if (this.pendingSave) {
        try {
          await this.pendingSave();
        } catch (error) {
          console.error('[DiffTracker] Debounced save failed:', error);
        }
        this.pendingSave = null;
      }
    }, this.debounceMs);
  }

  /**
   * Cancel any pending debounced save
   */
  cancelDebounce(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingSave = null;
  }

  /**
   * Flush any pending save immediately (bypass debounce)
   */
  async flush(): Promise<void> {
    this.cancelDebounce();
    if (this.pendingSave) {
      await this.pendingSave();
      this.pendingSave = null;
    }
  }

  // ─── State Comparison ─────────────────────────────────────────────────────

  /**
   * Check if canvas has changed since last snapshot
   */
  hasCanvasChanges(newNodeCount: number, newLayerHash: string): boolean {
    const last = this.initialState.canvas;
    return (
      newNodeCount !== last.lastNodeCount ||
      newLayerHash !== last.lastLayerHash
    );
  }

  /**
   * Check if memory has changed since last snapshot
   */
  hasMemoryChanges(newMemoryHash: string): boolean {
    return newMemoryHash !== this.initialState.memory.lastMemoryHash;
  }

  /**
   * Check if project settings have changed
   */
  hasProjectChanges(newSettingsHash: string): boolean {
    return newSettingsHash !== this.initialState.project.lastSettingsHash;
  }

  /**
   * Take a snapshot of current state for future comparison
   */
  snapshot(): TrackedState {
    return JSON.parse(JSON.stringify(this.currentState));
  }

  /**
   * Reset to a specific state (e.g., after loading from remote)
   */
  reset(state?: Partial<TrackedState>): void {
    this.initialState = {
      ...this.initialState,
      ...state,
    };
    this.currentState = { ...this.initialState };
    this.changes = [];
  }

  // ─── Serialization ────────────────────────────────────────────────────────

  /**
   * Serialize tracked state for persistence
   */
  serialize(): string {
    return JSON.stringify({
      initialState: this.initialState,
      currentState: this.currentState,
      lastCommitHash: this.lastCommitHash,
    });
  }

  /**
   * Restore from serialized state
   */
  static deserialize(data: string): DiffTracker {
    const parsed = JSON.parse(data);
    const tracker = new DiffTracker();
    tracker.initialState = parsed.initialState;
    tracker.currentState = parsed.currentState;
    tracker.lastCommitHash = parsed.lastCommitHash;
    return tracker;
  }
}
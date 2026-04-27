// SyncEngine - Master sync controller for auto-save, commit, push pipeline
// Coordinates DiffTracker, ExportPipeline, and Git operations

// Requires: step-02-github-auth/editor/lib/github/client.ts
// When merged into single editor, copy client.ts here or import from @/lib/github/client
import { getClient } from './client';
import { DiffTracker, ChangeSet } from './diff-tracker';
import { ExportPipeline } from './export-pipeline';
import { generateCommitMessage } from './commit-message';
import { BranchManager } from './branch-manager';

export interface SyncState {
  isDirty: boolean;
  lastSavedAt: Date | null;
  lastPushedAt: Date | null;
  currentBranch: string;
  pendingChanges: ChangeSet[];
  syncStatus: 'idle' | 'syncing' | 'error' | 'conflict';
  errorMessage: string | null;
}

export interface CanvasSnapshot {
  /** JSON of b_nodes (canvas shapes/text/arrows). */
  canvasJson: string;
  /** JSON of b_brains (per-Brain spec + state, ephemeral cursor scrubbed). */
  brainsJson: string;
  /** JSON of b_tools (registered tools). */
  toolsJson: string;
  /** JSON of b_tasks (orchestrator task graph). */
  tasksJson: string;
}

export interface SyncOptions {
  autoSaveIntervalMs?: number;
  autoPushIntervalMs?: number;
  debounceMs?: number;
  enableAutoExport?: boolean;
  /** "owner/repo". Required for real commits — without it getOwnerRepo() falls back to a useless placeholder. */
  repoFullName?: string;
  /** Defaults to 'main'. Use repo.defaultBranch from useGitHub. */
  defaultBranch?: string;
  /** Pulled at save time. The hook supplies a function that snapshots the live Y.Doc. */
  getCanvasSnapshot?: () => CanvasSnapshot | null;
}

const DEFAULT_OPTIONS: Required<Omit<SyncOptions, 'repoFullName' | 'defaultBranch' | 'getCanvasSnapshot'>> = {
  // 30-minute safety-net autosave only. The Save button is the primary save
  // path; this timer just catches the case where the user walks away with
  // unsaved changes. Anything more aggressive turns the repo history into
  // noise and triggers race-driven not-fast-forward conflicts during active
  // editing — the previous 5-minute default did exactly that.
  autoSaveIntervalMs: 1_800_000, // 30 minutes
  autoPushIntervalMs: 600_000, // unused since autopush was removed; kept for type parity
  debounceMs: 5000, // 5 seconds — used by diffTracker for change coalescing only, NOT for triggering saves anymore
  enableAutoExport: true,
};

export class SyncEngine {
  private projectSlug: string;
  private diffTracker: DiffTracker;
  private exportPipeline: ExportPipeline;
  private branchManager: BranchManager;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private autoPushTimer: ReturnType<typeof setInterval> | null = null;
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private state: SyncState;
  private options: Required<Omit<SyncOptions, 'repoFullName' | 'defaultBranch' | 'getCanvasSnapshot'>>
    & Pick<SyncOptions, 'repoFullName' | 'defaultBranch' | 'getCanvasSnapshot'>;
  private onChangeCallbacks: Array<(state: SyncState) => void> = [];
  private savePromise: Promise<void> | null = null;

  constructor(projectSlug: string, options: SyncOptions = {}) {
    this.projectSlug = projectSlug;
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };
    this.diffTracker = new DiffTracker(this.options.debounceMs);
    this.exportPipeline = new ExportPipeline(projectSlug);
    this.branchManager = new BranchManager(...this.getOwnerRepo());
    this.state = {
      isDirty: false,
      lastSavedAt: null,
      lastPushedAt: null,
      currentBranch: this.options.defaultBranch || 'main',
      pendingChanges: [],
      syncStatus: 'idle',
      errorMessage: null,
    };
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  start(): void {
    this.startAutoSave();
    // Note: no autopush — save() already commits to GitHub via the Contents
    // API. push() is just a verification call. Manually invokable but not
    // worth a recurring timer.
    console.log(`[SyncEngine] Started for project: ${this.projectSlug}`);
  }

  stop(): void {
    this.stopAutoSave();
    this.stopAutoPush();
    console.log(`[SyncEngine] Stopped for project: ${this.projectSlug}`);
  }

  // ─── Options Updates ──────────────────────────────────────────────────────

  /**
   * Update mutable options after construction. Critical for late-arriving
   * data like repoFullName (auth restore is async, so the engine is usually
   * created with repoFullName=undefined and learns the real value seconds
   * later). Without this, getOwnerRepo() permanently uses the placeholder
   * and every API call 404s against /repos/owner/repo/.
   */
  updateOptions(partial: Partial<SyncOptions>): void {
    this.options = { ...this.options, ...partial };
    if (partial.repoFullName) {
      const [owner, repo] = this.getOwnerRepo();
      this.branchManager = new BranchManager(owner, repo);
    }
    if (partial.defaultBranch && this.state.currentBranch === 'main' && !this.state.lastSavedAt) {
      // Only adopt a new default branch if we haven't already been operating
      // on main — once we've saved, switching branches is a deliberate action.
      this.state.currentBranch = partial.defaultBranch;
      this.notifyChange();
    }
  }

  // ─── State Access ─────────────────────────────────────────────────────────

  getState(): SyncState {
    return { ...this.state };
  }

  getStatus(): SyncState['syncStatus'] {
    return this.state.syncStatus;
  }

  isDirty(): boolean {
    return this.state.isDirty;
  }

  // ─── Change Tracking ──────────────────────────────────────────────────────

  /**
   * Mark that something changed. Records the change in the diff tracker so
   * the next save knows what to commit, but does NOT auto-trigger a save —
   * the user clicks the Save button (or the 30-min safety-net timer fires).
   * Auto-saving on every edit caused commit spam and not-fast-forward races
   * during active editing.
   */
  markDirty(change?: ChangeSet): void {
    if (change) {
      this.diffTracker.trackChange(change);
      this.state.pendingChanges.push(change);
    }
    this.state.isDirty = true;
    this.notifyChange();
  }

  /**
   * Register a callback for state changes (e.g., status bar updates)
   */
  onChange(callback: (state: SyncState) => void): () => void {
    this.onChangeCallbacks.push(callback);
    return () => {
      this.onChangeCallbacks = this.onChangeCallbacks.filter(cb => cb !== callback);
    };
  }

  // ─── Auto-Save Pipeline ───────────────────────────────────────────────────

  private startAutoSave(): void {
    this.autoSaveTimer = setInterval(async () => {
      if (this.state.isDirty) {
        await this.save();
      }
    }, this.options.autoSaveIntervalMs);
  }

  private stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  private startAutoPush(): void {
    this.autoPushTimer = setInterval(async () => {
      if (this.state.isDirty && this.state.lastSavedAt) {
        // Only push if we've saved since last push
        await this.push();
      }
    }, this.options.autoPushIntervalMs);
  }

  private stopAutoPush(): void {
    if (this.autoPushTimer) {
      clearInterval(this.autoPushTimer);
      this.autoPushTimer = null;
    }
  }

  /**
   * Execute the full save pipeline:
   * 1. Collect all changes
   * 2. Save canvas state (.grida + .canvas.json)
   * 3. Save memory state
   * 4. Export diagrams (if enabled)
   * 5. Commit all files with smart message
   */
  async save(): Promise<void> {
    // Prevent concurrent saves
    if (this.savePromise) {
      await this.savePromise;
      return;
    }

    this.savePromise = this._executeSave();
    await this.savePromise;
    this.savePromise = null;
  }

  private async _executeSave(): Promise<void> {
    this.state.syncStatus = 'syncing';
    this.notifyChange();

    try {
      const changes = this.diffTracker.getChanges();
      // Bail only if nothing changed AND nothing manually requested. forceSave
      // sets isDirty without populating the diff tracker — still proceed.
      if (changes.length === 0 && !this.state.isDirty) {
        this.state.syncStatus = 'idle';
        this.notifyChange();
        return;
      }

      const octokit = getClient();
      const filesToCommit: Record<string, { content: string; sha?: string }> = {};

      // 1. Canvas state - both .grida binary and JSON mirror
      const canvasFiles = await this.collectCanvasFiles();
      Object.assign(filesToCommit, canvasFiles);

      // 2. Memory/MemPalace files
      const memoryFiles = await this.collectMemoryFiles();
      Object.assign(filesToCommit, memoryFiles);

      // 3. Export diagrams if enabled
      if (this.options.enableAutoExport) {
        const exportFiles = await this.exportPipeline.exportAll();
        // Map {content, path} → {content, sha} to match filesToCommit type
        for (const [key, file] of Object.entries(exportFiles)) {
          filesToCommit[key] = { content: file.content };
        }
      }

      // 4. Project config
      const configFile = await this.collectConfigFile();
      if (configFile) {
        Object.assign(filesToCommit, configFile);
      }

      // Commit all files
      if (Object.keys(filesToCommit).length > 0) {
        const message = generateCommitMessage(changes);
        await this.commitFiles(filesToCommit, message);
      }

      this.state.isDirty = false;
      this.state.lastSavedAt = new Date();
      this.state.pendingChanges = [];
      this.diffTracker.clearChanges();
      this.state.syncStatus = 'idle';
      this.state.errorMessage = null;

    } catch (error) {
      this.state.syncStatus = 'error';
      this.state.errorMessage = error instanceof Error ? error.message : 'Save failed';
      console.error('[SyncEngine] Save error:', error);
    }

    this.notifyChange();
  }

  private async collectCanvasFiles(): Promise<Record<string, { content: string; sha?: string }>> {
    const snapshot = this.options.getCanvasSnapshot?.();
    if (!snapshot) return {};
    const base = `projects/${this.projectSlug}/canvas`;
    return {
      [`${base}/nodes.json`]: { content: snapshot.canvasJson },
      [`${base}/brains.json`]: { content: snapshot.brainsJson },
      [`${base}/tools.json`]: { content: snapshot.toolsJson },
      [`${base}/tasks.json`]: { content: snapshot.tasksJson },
    };
  }

  private async collectMemoryFiles(): Promise<Record<string, { content: string; sha?: string }>> {
    // This would call serializePalace() from MemPalace module
    // return await serializePalace(await getPalace(this.projectSlug), this.projectSlug);
    return {};
  }

  private async collectConfigFile(): Promise<Record<string, { content: string; sha?: string }> | null> {
    // Save project configuration
    const config = {
      projectSlug: this.projectSlug,
      lastUpdated: new Date().toISOString(),
      syncVersion: 1,
    };
    return {
      [`projects/${this.projectSlug}/project.json`]: {
        content: JSON.stringify(config, null, 2)
      }
    };
  }

  private async commitFiles(
    files: Record<string, { content: string; sha?: string }>,
    message: string
  ): Promise<void> {
    // One retry: if updateRef fails with "not a fast forward", the branch
    // moved under us between getRef and updateRef. Re-read and rebuild the
    // commit on the new tip. Anything beyond one retry is a real conflict
    // and surfaces to the caller.
    try {
      await this._doCommit(files, message);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/not a fast.?forward/i.test(msg)) {
        console.warn('[SyncEngine] Branch moved during save — retrying once.');
        await this._doCommit(files, message);
        return;
      }
      throw e;
    }
  }

  private async _doCommit(
    files: Record<string, { content: string; sha?: string }>,
    message: string
  ): Promise<void> {
    const octokit = getClient();
    const [owner, repo] = this.getOwnerRepo();

    // Get current commit SHA for the branch (always fresh — caller may be
    // retrying because a previous attempt's ref went stale).
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${this.state.currentBranch}`,
    });

    // Create a new tree with our changes
    const treeItems = await Promise.all(
      Object.entries(files).map(async ([path, { content }]) => {
        // Create blob for file content
        const { data: blobData } = await octokit.rest.git.createBlob({
          owner,
          repo,
          content: Buffer.from(content).toString('base64'),
          encoding: 'base64',
        });

        return {
          path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: blobData.sha,
        };
      })
    );

    // Create new tree
    const { data: newTree } = await octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: refData.object.sha,
      tree: treeItems,
    });

    // Create commit
    const { data: commit } = await octokit.rest.git.createCommit({
      owner,
      repo,
      message,
      tree: newTree.sha,
      parents: [refData.object.sha],
    });

    // Update branch reference
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${this.state.currentBranch}`,
      sha: commit.sha,
      force: false,
    });

    console.log(`[SyncEngine] Committed: ${message}`);
  }

  // ─── Push / Pull ──────────────────────────────────────────────────────────

  async push(): Promise<void> {
    this.state.syncStatus = 'syncing';
    this.notifyChange();

    try {
      const octokit = getClient();
      const [owner, repo] = this.getOwnerRepo();

      await octokit.rest.repos.get({
        owner,
        repo,
      });

      // Verify we have something to push by checking last commit
      const { data: remoteData } = await octokit.rest.repos.listCommits({
        owner,
        repo,
        sha: this.state.currentBranch,
        per_page: 1,
      });

      if (remoteData.length > 0) {
        console.log(`[SyncEngine] Push completed. Latest commit: ${remoteData[0].sha}`);
      }

      this.state.lastPushedAt = new Date();
      this.state.syncStatus = 'idle';
      this.state.errorMessage = null;

    } catch (error) {
      this.state.syncStatus = 'error';
      this.state.errorMessage = error instanceof Error ? error.message : 'Push failed';
      console.error('[SyncEngine] Push error:', error);
    }

    this.notifyChange();
  }

  async pull(): Promise<void> {
    this.state.syncStatus = 'syncing';
    this.notifyChange();

    try {
      // Pull would re-fetch and reload canvas + memory from remote
      // Implementation depends on how git operations are handled
      // For now, just update status
      this.state.syncStatus = 'idle';
      this.state.errorMessage = null;

    } catch (error) {
      this.state.syncStatus = 'error';
      this.state.errorMessage = error instanceof Error ? error.message : 'Pull failed';
      console.error('[SyncEngine] Pull error:', error);
    }

    this.notifyChange();
  }

  // ─── Branch Operations ─────────────────────────────────────────────────────

  async switchBranch(branchName: string): Promise<void> {
    await this.branchManager.switchBranch(branchName);
    this.state.currentBranch = branchName;
    this.notifyChange();
  }

  async createBranch(name: string): Promise<void> {
    await this.branchManager.createBranch(name);
  }

  async listBranches(): Promise<string[]> {
    const [owner, repo] = this.getOwnerRepo();
    const branches = await this.branchManager.listBranches({ owner, repo });
    return branches.map(b => b.name);
  }

  async mergeBranch(source: string, target?: string): Promise<void> {
    const targetBranch = target || this.state.currentBranch;
    await this.branchManager.mergeBranch(source, targetBranch);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private getOwnerRepo(): [string, string] {
    if (this.options.repoFullName) {
      const parts = this.options.repoFullName.split('/');
      if (parts.length >= 2) return [parts[0], parts[1]];
    }
    // Fallback: legacy "owner/repo" projectSlug format. Without repoFullName
    // and without a slash in projectSlug, save() will fail at the API call —
    // surfaced via syncStatus='error', not silently committed to a wrong repo.
    const parts = this.projectSlug.split('/');
    if (parts.length >= 2) return [parts[0], parts[1]];
    return ['owner', 'repo'];
  }

  private notifyChange(): void {
    const state = this.getState();
    this.onChangeCallbacks.forEach(cb => {
      try {
        cb(state);
      } catch (e) {
        console.error('[SyncEngine] Callback error:', e);
      }
    });
  }

  /**
   * Force sync even if no changes detected (useful for manual triggers)
   */
  async forceSave(): Promise<void> {
    this.state.isDirty = true;
    await this.save();
  }

  /**
   * Get diff between last saved state and current state
   */
  getDiff(): ChangeSet[] {
    return this.diffTracker.getChanges();
  }
}
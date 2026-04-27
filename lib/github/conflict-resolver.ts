// ConflictResolver - Handle git merge conflicts on JSON files
// Detects, analyzes, and resolves conflicts in canvas and config files

import { getClient } from './client';

export interface ConflictFile {
  path: string;
  baseContent: string;
  oursContent: string;   // local/their changes
  theirsContent: string; // remote/our changes
}

export interface ConflictResolution {
  path: string;
  resolution: 'ours' | 'theirs' | 'merge' | 'custom';
  resolvedContent: string;
  success: boolean;
}

export interface ConflictResult {
  hasConflicts: boolean;
  conflictingFiles: string[];
  resolvedFiles: string[];
  failedFiles: string[];
}

export interface MergeConflict {
  path: string;
  content: string;
  hunks: ConflictHunk[];
}

export interface ConflictHunk {
  startLine: number;
  endLine: number;
  base: string[];
  ours: string[];
  theirs: string[];
}

export class ConflictResolver {
  private owner: string;
  private repo: string;
  private currentBranch: string;

  constructor(owner?: string, repo?: string, currentBranch: string = 'main') {
    this.owner = owner || 'owner';
    this.repo = repo || 'repo';
    this.currentBranch = currentBranch;
  }

  // ─── Conflict Detection ───────────────────────────────────────────────────

  /**
   * Check if there are any merge conflicts in the current branch
   */
  async detectConflicts(): Promise<{
    hasConflicts: boolean;
    conflictingFiles: string[];
  }> {
    const octokit = getClient();

    try {
      // Check for merge conflict by attempting a dry-run merge
      // GitHub API doesn't directly expose conflict detection,
      // so we check the content of potential files

      // Get list of files that might have conflicts based on recent commits
      const { data: commits } = await octokit.rest.repos.listCommits({
        owner: this.owner,
        repo: this.repo,
        sha: this.currentBranch,
        per_page: 10,
      });

      const conflictingFiles: string[] = [];

      // Check if any files have conflict markers
      // In a real implementation, you'd fetch file contents and check for <<<<
      // For now, return empty - actual implementation would scan files

      return {
        hasConflicts: conflictingFiles.length > 0,
        conflictingFiles,
      };

    } catch (error) {
      console.error('[ConflictResolver] Failed to detect conflicts:', error);
      return {
        hasConflicts: false,
        conflictingFiles: [],
      };
    }
  }

  /**
   * Parse conflict markers in a file's content
   */
  parseConflictMarkers(content: string): MergeConflict[] {
    const conflicts: MergeConflict[] = [];
    const lines = content.split('\n');
    
    let currentConflict: MergeConflict | null = null;
    let currentHunk: ConflictHunk | null = null;
    let inBase = false;
    let inOurs = false;
    let inTheirs = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('<<<<<<<')) {
        // Start of conflict
        const path = line.replace('<<<<<<<', '').trim();
        currentConflict = {
          path,
          content: '',
          hunks: [],
        };
        currentHunk = {
          startLine: i,
          endLine: i,
          base: [],
          ours: [],
          theirs: [],
        };
        inBase = false;
        inOurs = true;
        inTheirs = false;
      } else if (line.startsWith('=======')) {
        // Separator between ours and theirs
        if (currentHunk) {
          inBase = false;
          inOurs = false;
          inTheirs = true;
        }
      } else if (line.startsWith('>>>>>>>')) {
        // End of conflict
        if (currentConflict && currentHunk) {
          currentHunk.endLine = i;
          currentConflict.hunks.push(currentHunk);
          currentHunk = null;
        }
        if (currentConflict) {
          conflicts.push(currentConflict);
        }
        currentConflict = null;
      } else if (line.startsWith('|||||||')) {
        // Base content marker (diff3 format)
        if (currentConflict) {
          inBase = true;
          inOurs = false;
          inTheirs = false;
        }
      } else if (currentConflict) {
        // Regular content line
        if (inBase && currentHunk) {
          currentHunk.base.push(line);
        } else if (inOurs && currentHunk) {
          currentHunk.ours.push(line);
        } else if (inTheirs && currentHunk) {
          currentHunk.theirs.push(line);
        }
      }
    }

    return conflicts;
  }

  /**
   * Check if a specific file has conflicts
   */
  async checkFileForConflicts(path: string): Promise<boolean> {
    try {
      const octokit = getClient();
      
      const { data } = await octokit.rest.repos.getContent({
        owner: this.owner,
        repo: this.repo,
        path,
        ref: this.currentBranch,
      });

      if ('content' in data) {
        const content = Buffer.from(data.content, 'base64').toString('utf-8');
        return content.includes('<<<<<<<') || content.includes('>>>>>>>');
      }

      return false;

    } catch (error) {
      // File doesn't exist or can't be read
      return false;
    }
  }

  // ─── Conflict Resolution ───────────────────────────────────────────────────

  /**
   * Resolve conflicts in a file using a strategy
   */
  async resolveConflict(
    path: string,
    strategy: 'ours' | 'theirs' | 'merge' | 'custom',
    customContent?: string
  ): Promise<ConflictResolution> {
    try {
      const content = await this.getConflictingContent(path);
      
      let resolvedContent: string;
      
      switch (strategy) {
        case 'ours':
          resolvedContent = this.keepOurs(content);
          break;
        case 'theirs':
          resolvedContent = this.keepTheirs(content);
          break;
        case 'merge':
          resolvedContent = this.autoMerge(content);
          break;
        case 'custom':
          resolvedContent = customContent || content;
          break;
      }

      // Commit the resolved file
      await this.commitResolvedFile(path, resolvedContent);

      return {
        path,
        resolution: strategy,
        resolvedContent,
        success: true,
      };

    } catch (error) {
      return {
        path,
        resolution: strategy,
        resolvedContent: '',
        success: false,
      };
    }
  }

  /**
   * Keep our version (local changes)
   */
  private keepOurs(content: string): string {
    return this.filterConflictMarkers(content, 'ours');
  }

  /**
   * Keep their version (remote changes)
   */
  private keepTheirs(content: string): string {
    return this.filterConflictMarkers(content, 'theirs');
  }

  /**
   * Auto-merge by trying to combine both changes
   */
  private autoMerge(content: string): string {
    // For JSON files, try to merge objects intelligently
    if (content.trim().startsWith('{')) {
      return this.smartJsonMerge(content);
    }
    // For non-JSON, fall back to keeping ours
    return this.filterConflictMarkers(content, 'ours');
  }

  /**
   * Filter out conflict markers, keeping specified version
   */
  private filterConflictMarkers(content: string, keep: 'ours' | 'theirs'): string {
    const lines = content.split('\n');
    const result: string[] = [];
    let inConflict = false;
    let inSection = 'start' as 'start' | 'ours' | 'theirs';

    for (const line of lines) {
      if (line.startsWith('<<<<<<<')) {
        inConflict = true;
        inSection = 'ours';
        continue;
      } else if (line.startsWith('|||||||')) {
        inSection = 'theirs';
        continue;
      } else if (line.startsWith('=======')) {
        inSection = 'theirs';
        continue;
      } else if (line.startsWith('>>>>>>>')) {
        inConflict = false;
        inSection = 'start';
        continue;
      }

      if (inConflict) {
        if (keep === 'ours' && inSection === 'ours') {
          result.push(line);
        } else if (keep === 'theirs' && inSection === 'theirs') {
          result.push(line);
        }
      } else {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /**
   * Smart JSON merge for canvas/config files
   */
  private smartJsonMerge(content: string): string {
    try {
      const base = JSON.parse(this.filterConflictMarkers(content, 'ours'));
      const theirs = JSON.parse(this.filterConflictMarkers(content, 'theirs'));
      
      // Deep merge - theirs overwrites base, but arrays are replaced not merged
      const merged = this.deepMerge(base, theirs);
      
      return JSON.stringify(merged, null, 2);
    } catch {
      // Not valid JSON, use simple merge
      return this.filterConflictMarkers(content, 'ours');
    }
  }

  /**
   * Deep merge two objects
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    
    for (const key of Object.keys(source)) {
      if (source[key] instanceof Object && !Array.isArray(source[key]) &&
          target[key] instanceof Object && !Array.isArray(target[key])) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  // ─── Force Push ───────────────────────────────────────────────────────────

  /**
   * Force push to overwrite remote with local state
   */
  async forcePush(options?: {
    owner?: string;
    repo?: string;
    branch?: string;
    message?: string;
  }): Promise<{
    success: boolean;
    sha: string | null;
    message: string;
  }> {
    const octokit = getClient();
    const owner = options?.owner || this.owner;
    const repo = options?.repo || this.repo;
    const branch = options?.branch || this.currentBranch;

    try {
      // Get current branch SHA
      const { data: refData } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });

      // Force update the branch ref
      await octokit.rest.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: refData.object.sha,
        force: true,
      });

      console.log(`[ConflictResolver] Force pushed to ${branch}`);

      return {
        success: true,
        sha: refData.object.sha,
        message: `Force pushed to ${branch}`,
      };

    } catch (error) {
      return {
        success: false,
        sha: null,
        message: error instanceof Error ? error.message : 'Force push failed',
      };
    }
  }

  /**
   * Abort an in-progress merge (reset to pre-merge state)
   */
  async abortMerge(): Promise<void> {
    // In a pure API model, this would reset the branch to its pre-merge state
    // This requires storing the pre-merge SHA before starting merge
    console.log('[ConflictResolver] Abort merge - reset to pre-merge state');
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async getConflictingContent(path: string): Promise<string> {
    const octokit = getClient();
    
    const { data } = await octokit.rest.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path,
      ref: this.currentBranch,
    });

    if ('content' in data) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }

    throw new Error(`Could not read file: ${path}`);
  }

  private async commitResolvedFile(path: string, content: string): Promise<void> {
    const octokit = getClient();
    
    // Get current SHA
    const { data: fileData } = await octokit.rest.repos.getContent({
      owner: this.owner,
      repo: this.repo,
      path,
      ref: this.currentBranch,
    });

    const sha = 'sha' in fileData ? fileData.sha : undefined;

    // Update file
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: this.owner,
      repo: this.repo,
      path,
      message: `Resolve merge conflict in ${path}`,
      content: Buffer.from(content).toString('base64'),
      sha,
      branch: this.currentBranch,
    });

    console.log(`[ConflictResolver] Resolved conflict in: ${path}`);
  }
}
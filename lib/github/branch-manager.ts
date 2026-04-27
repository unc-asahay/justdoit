// BranchManager - Git branch operations via Octokit
// Create, switch, list, merge, and delete branches

// Requires: step-02-github-auth/editor/lib/github/client.ts
import { getClient } from './client';

export interface BranchInfo {
  name: string;
  sha: string;
  isDefault: boolean;
  createdAt: string;
  protected: boolean;
}

export interface MergeResult {
  success: boolean;
  sha: string | null;
  message: string;
  hasConflicts: boolean;
}

export interface BranchProtection {
  required_status_checks: boolean;
  enforce_admins: boolean;
  required_pull_request_reviews: boolean;
  restrictions: boolean;
}

export class BranchManager {
  private owner: string;
  private repo: string;
  private currentBranch: string = 'main';
  private cachedBranches: BranchInfo[] = [];
  private cacheTime: number = 0;
  private cacheTimeout: number = 30000; // 30 seconds

  constructor(owner: string, repo: string) {
    this.owner = owner;
    this.repo = repo;
  }

  // ─── Branch Access ────────────────────────────────────────────────────────

  /**
   * Get list of all branches
   */
  async listBranches(options?: {
    owner: string;
    repo: string;
    includeProtected?: boolean;
  }): Promise<BranchInfo[]> {
    // Check cache first
    if (this.isCacheValid()) {
      return this.cachedBranches;
    }

    const octokit = getClient();
    const [owner, repo] = this.getOwnerRepo(options?.owner, options?.repo);

    const response = await octokit.rest.repos.listBranches({
      owner,
      repo,
      per_page: 100,
    });

    // Get default branch info
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
    const defaultBranch = repoData.default_branch;

    // Get branch protection status for each branch
    const branches: BranchInfo[] = await Promise.all(
      response.data.map(async (branch) => {
        let protected_ = false;
        try {
          const protection = await octokit.rest.repos.getBranchProtection({
            owner,
            repo,
            branch: branch.name,
          });
          protected_ = true;
        } catch {
          // Branch is not protected
        }

        return {
          name: branch.name,
          sha: branch.commit.sha,
          isDefault: branch.name === defaultBranch,
          createdAt: '',
          protected: protected_,
        };
      })
    );

    this.cachedBranches = branches;
    this.cacheTime = Date.now();

    return branches;
  }

  /**
   * Get current branch name
   */
  getCurrentBranch(): string {
    return this.currentBranch;
  }

  /**
   * Get info about a specific branch
   */
  async getBranch(name: string, options?: { owner?: string; repo?: string }): Promise<BranchInfo | null> {
    const octokit = getClient();
    const [owner, repo] = this.getOwnerRepo(options?.owner, options?.repo);

    try {
      const { data: branch } = await octokit.rest.repos.getBranch({
        owner,
        repo,
        branch: name,
      });

      const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
      const defaultBranch = repoData.default_branch;

      let protected_ = false;
      try {
        await octokit.rest.repos.getBranchProtection({
          owner,
          repo,
          branch: name,
        });
        protected_ = true;
      } catch {
        // Not protected
      }

      return {
        name: branch.name,
        sha: branch.commit.sha,
        isDefault: branch.name === defaultBranch,
        createdAt: branch.commit.commit.author?.date || '',
        protected: protected_,
      };
    } catch (error) {
      console.error(`[BranchManager] Failed to get branch ${name}:`, error);
      return null;
    }
  }

  // ─── Branch Creation ──────────────────────────────────────────────────────

  /**
   * Create a new branch from a ref (defaults to main)
   */
  async createBranch(
    name: string,
    options?: {
      fromRef?: string;
      owner?: string;
      repo?: string;
    }
  ): Promise<BranchInfo> {
    const octokit = getClient();
    const [owner, repo] = this.getOwnerRepo(options?.owner, options?.repo);

    // Get SHA of source ref (defaults to main branch HEAD)
    let sourceSha: string;
    if (options?.fromRef) {
      // Check if it's a full SHA, branch name, or tag
      try {
        const { data } = await octokit.rest.git.getRef({
          owner,
          repo,
          ref: `heads/${options.fromRef}`,
        });
        sourceSha = data.object.sha;
      } catch {
        // Try as full ref path
        const { data } = await octokit.rest.git.getRef({
          owner,
          repo,
          ref: options.fromRef,
        });
        sourceSha = data.object.sha;
      }
    } else {
      // Get main branch HEAD
      const { data } = await octokit.rest.repos.getBranch({
        owner,
        repo,
        branch: 'main',
      });
      sourceSha = data.commit.sha;
    }

    // Create the new branch ref
    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${name}`,
      sha: sourceSha,
    });

    console.log(`[BranchManager] Created branch: ${name}`);

    // Update current branch if this was a switch
    if (options?.fromRef === undefined) {
      this.currentBranch = name;
    }

    // Invalidate cache
    this.invalidateCache();

    return {
      name,
      sha: sourceSha,
      isDefault: false,
      createdAt: new Date().toISOString(),
      protected: false,
    };
  }

  /**
   * Create a branch from a specific commit SHA
   */
  async createBranchFromSha(
    name: string,
    sha: string,
    options?: { owner?: string; repo?: string }
  ): Promise<BranchInfo> {
    return this.createBranch(name, { fromRef: sha, ...options });
  }

  // ─── Branch Switching ─────────────────────────────────────────────────────

  /**
   * Switch to a different branch (local state tracking)
   * Note: In a pure API model, we track which branch we're "on"
   * Actual checkout would happen at the git level
   */
  async switchBranch(name: string): Promise<void> {
    // Verify branch exists
    const branch = await this.getBranch(name);
    if (!branch) {
      throw new Error(`Branch '${name}' does not exist`);
    }

    this.currentBranch = name;
    console.log(`[BranchManager] Switched to branch: ${name}`);

    // Invalidate cache since branch changed
    this.invalidateCache();
  }

  // ─── Branch Deletion ─────────────────────────────────────────────────────

  /**
   * Delete a branch
   */
  async deleteBranch(
    name: string,
    options?: { owner?: string; repo?: string; force?: boolean }
  ): Promise<void> {
    // Prevent deleting default branch
    if (name === 'main') {
      throw new Error('Cannot delete the default branch');
    }

    // Prevent deleting current branch
    if (name === this.currentBranch) {
      throw new Error(`Cannot delete current branch '${name}'`);
    }

    const octokit = getClient();
    const [owner, repo] = this.getOwnerRepo(options?.owner, options?.repo);

    await octokit.rest.git.deleteRef({
      owner,
      repo,
      ref: `heads/${name}`,
    });

    console.log(`[BranchManager] Deleted branch: ${name}`);
    this.invalidateCache();
  }

  // ─── Branch Merging ──────────────────────────────────────────────────────

  /**
   * Merge a source branch into target branch
   */
  async mergeBranch(
    source: string,
    target?: string,
    options?: { owner?: string; repo?: string; message?: string }
  ): Promise<MergeResult> {
    const octokit = getClient();
    const [owner, repo] = this.getOwnerRepo(options?.owner, options?.repo);
    const targetBranch = target || this.currentBranch;

    try {
      // Get SHA of source branch
      const { data: sourceBranch } = await octokit.rest.repos.getBranch({
        owner,
        repo,
        branch: source,
      });

      // Attempt merge
      const { data: mergeData } = await octokit.rest.repos.merge({
        owner,
        repo,
        base: targetBranch,
        head: source,
      });

      console.log(`[BranchManager] Merged ${source} into ${targetBranch}`);

      return {
        success: true,
        sha: mergeData.sha,
        message: `Successfully merged '${source}' into '${targetBranch}'`,
        hasConflicts: false,
      };

    } catch (error: any) {
      // Check if it's a merge conflict
      if (error.status === 409) {
        return {
          success: false,
          sha: null,
          message: `Merge conflict in ${targetBranch}. Please resolve conflicts manually.`,
          hasConflicts: true,
        };
      }

      throw error;
    }
  }

  /**
   * Compare two branches (get diff summary)
   */
  async compareBranches(
    base: string,
    head: string,
    options?: { owner?: string; repo?: string }
  ): Promise<{
    status: 'ahead' | 'behind' | 'diverged' | 'identical';
    ahead: number;
    behind: number;
    commits: any[];
  }> {
    const octokit = getClient();
    const [owner, repo] = this.getOwnerRepo(options?.owner, options?.repo);

    const { data } = await octokit.rest.repos.compareCommits({
      owner,
      repo,
      base,
      head,
    });

    let status: 'ahead' | 'behind' | 'diverged' | 'identical';
    if (data.ahead_by > 0 && data.behind_by > 0) {
      status = 'diverged';
    } else if (data.ahead_by > 0) {
      status = 'ahead';
    } else if (data.behind_by > 0) {
      status = 'behind';
    } else {
      status = 'identical';
    }

    return {
      status,
      ahead: data.ahead_by,
      behind: data.behind_by,
      commits: data.commits,
    };
  }

  // ─── Branch Protection ────────────────────────────────────────────────────

  /**
   * Enable branch protection on a branch
   */
  async enableProtection(
    branchName: string,
    options?: {
      owner?: string;
      repo?: string;
      required_status_checks?: boolean;
      enforce_admins?: boolean;
      require_approvals?: number;
    }
  ): Promise<void> {
    const octokit = getClient();
    const [owner, repo] = this.getOwnerRepo(options?.owner, options?.repo);

    const protectionOptions: any = {
      owner,
      repo,
      branch: branchName,
      required_status_checks: options?.required_status_checks ?? true,
      enforce_admins: options?.enforce_admins ?? true,
      required_pull_request_reviews: options?.require_approvals
        ? { required_approving_review_count: options.require_approvals }
        : null,
    };

    await octokit.rest.repos.updateBranchProtection(protectionOptions);
    console.log(`[BranchManager] Enabled protection on branch: ${branchName}`);
  }

  /**
   * Disable branch protection
   */
  async disableProtection(branchName: string, options?: { owner?: string; repo?: string }): Promise<void> {
    const octokit = getClient();
    const [owner, repo] = this.getOwnerRepo(options?.owner, options?.repo);

    await octokit.rest.repos.deleteBranchProtection({
      owner,
      repo,
      branch: branchName,
    });

    console.log(`[BranchManager] Disabled protection on branch: ${branchName}`);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private getOwnerRepo(owner?: string, repo?: string): [string, string] {
    return [owner || this.owner, repo || this.repo];
  }

  private isCacheValid(): boolean {
    return this.cacheTime > 0 && (Date.now() - this.cacheTime) < this.cacheTimeout;
  }

  private invalidateCache(): void {
    this.cachedBranches = [];
    this.cacheTime = 0;
  }
}
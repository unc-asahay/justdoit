/**
 * GitHub Activity — fetch recent commits and parse into activity items.
 */

import { getClient } from './client';
import { WORKSPACE_REPO_NAME } from './repo';

export interface ActivityItem {
  id: string;
  message: string;
  author: string;
  timestamp: string; // ISO string
  sha: string;
  type: 'commit';
}

export async function getRecentActivity(limit: number = 10): Promise<ActivityItem[]> {
  try {
    const octokit = getClient();
    const user = (await octokit.rest.users.getAuthenticated()).data;

    const { data: commits } = await octokit.rest.repos.listCommits({
      owner: user.login,
      repo: WORKSPACE_REPO_NAME,
      per_page: limit,
    });

    return commits.map(commit => ({
      id: commit.sha,
      message: commit.commit.message,
      author: commit.commit.author?.name || user.login,
      timestamp: commit.commit.author?.date || new Date().toISOString(),
      sha: commit.sha.slice(0, 7),
      type: 'commit' as const,
    }));
  } catch {
    // Repo might not exist yet — return empty activity
    return [];
  }
}

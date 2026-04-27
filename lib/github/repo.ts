// GitHub Repository Management - Create and connect workspace repo

import { getClient } from './client';
import { createWorkspace as initWorkspace } from './workspace';
import type { GitHubRepo, WorkspaceData } from './types';

export const WORKSPACE_REPO_NAME = 'justdoit-workspace';

/**
 * Create a new workspace repository for the authenticated user.
 * The repository is initialized with a workspace.json file.
 * 
 * @param isPrivate - Whether the repository should be private
 * @returns Promise<GitHubRepo> - The created repository
 */
export async function createWorkspaceRepo(isPrivate: boolean): Promise<GitHubRepo> {
  const octokit = getClient();
  
  try {
    // Create the repository
    const { data: repo } = await octokit.rest.repos.createForAuthenticatedUser({
      name: WORKSPACE_REPO_NAME,
      private: isPrivate,
      auto_init: true,
      description: 'JustDoIt Canvas Workspace - Architecture diagrams and projects',
    });
    
    // Initialize workspace structure in the repo
    await initializeWorkspace(repo.full_name, repo.default_branch || 'main');
    
    return {
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      private: repo.private,
      description: repo.description,
      defaultBranch: repo.default_branch,
      htmlUrl: repo.html_url,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to create workspace repo: ${error.message}`);
    }
    throw new Error('Failed to create workspace repo: Unknown error');
  }
}

/**
 * Connect to an existing repository by its full name (owner/repo).
 * 
 * @param fullName - The full repository name (owner/repo)
 * @returns Promise<GitHubRepo> - The connected repository
 */
export async function connectExistingRepo(fullName: string): Promise<GitHubRepo> {
  const octokit = getClient();
  const parts = fullName.split('/');
  
  if (parts.length !== 2) {
    throw new Error('Invalid repository full name. Expected format: owner/repo');
  }
  
  const [owner, repo] = parts;
  
  try {
    const { data } = await octokit.rest.repos.get({ owner, repo });
    
    return {
      id: data.id,
      name: data.name,
      fullName: data.full_name,
      private: data.private,
      description: data.description,
      defaultBranch: data.default_branch,
      htmlUrl: data.html_url,
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to connect to repo: ${error.message}`);
    }
    throw new Error('Failed to connect to repo: Unknown error');
  }
}

/**
 * Check if the workspace repository exists for the authenticated user.
 * 
 * @returns Promise<GitHubRepo | null> - The repo if it exists, null otherwise
 */
export async function getWorkspaceRepo(): Promise<GitHubRepo | null> {
  const octokit = getClient();
  
  try {
    const { data } = await octokit.rest.repos.get({
      owner: (await octokit.rest.users.getAuthenticated()).data.login,
      repo: WORKSPACE_REPO_NAME,
    });
    
    return {
      id: data.id,
      name: data.name,
      fullName: data.full_name,
      private: data.private,
      description: data.description,
      defaultBranch: data.default_branch,
      htmlUrl: data.html_url,
    };
  } catch {
    // Repository doesn't exist
    return null;
  }
}

/**
 * Initialize the workspace structure in a newly created repository.
 * Creates workspace.json and the initial folder structure.
 * 
 * @param fullName - The full repository name (owner/repo)
 * @param defaultBranch - The default branch name
 */
async function initializeWorkspace(fullName: string, defaultBranch: string): Promise<void> {
  const octokit = getClient();
  const [owner, repo] = fullName.split('/');
  
  const workspaceData: WorkspaceData = {
    name: repo,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    projects: [],
    settings: {
      defaultBranch,
      autoSave: true,
      autoSaveInterval: 30,
    },
  };
  
  // Create workspace.json
  const { data: fileData } = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: 'workspace.json',
    message: 'Initialize JustDoIt workspace',
    content: Buffer.from(JSON.stringify(workspaceData, null, 2)).toString('base64'),
    branch: defaultBranch,
  });
  
  // Create initial folder structure
  const folders = [
    { path: 'projects/.gitkeep', message: 'Add projects directory' },
    { path: 'exports/.gitkeep', message: 'Add exports directory' },
    { path: 'knowledge/.gitkeep', message: 'Add knowledge directory' },
  ];
  
  for (const folder of folders) {
    try {
      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: folder.path,
        message: folder.message,
        content: Buffer.from('').toString('base64'),
        branch: defaultBranch,
      });
    } catch {
      // Ignore errors for .gitkeep files (may already exist)
    }
  }
  
  console.log('Workspace initialized:', fileData.commit?.html_url);
}

/**
 * Get the raw content of a file from the workspace repository.
 * 
 * @param path - The path to the file in the repository
 * @param branch - The branch to read from (optional, defaults to default branch)
 * @returns Promise<string> - The file content as a string
 */
export async function getRepoFileContent(path: string, branch?: string): Promise<string> {
  const octokit = getClient();
  
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: (await octokit.rest.users.getAuthenticated()).data.login,
      repo: WORKSPACE_REPO_NAME,
      path,
      ref: branch,
    });
    
    if ('content' in data && data.content) {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    }
    
    throw new Error('File content not found');
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to get file content: ${error.message}`);
    }
    throw new Error('Failed to get file content: Unknown error');
  }
}

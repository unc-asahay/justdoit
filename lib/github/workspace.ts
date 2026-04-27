// GitHub Workspace Management - Read/write workspace JSON

import { getClient } from './client';
import { WORKSPACE_REPO_NAME } from './repo';
import type { WorkspaceData, ProjectData, CommitResult } from './types';

let cachedWorkspace: WorkspaceData | null = null;
let cachedRepoFullName: string | null = null;

/**
 * Read the workspace.json file from the connected repository.
 * Results are cached for the session.
 * 
 * @param branch - The branch to read from (optional)
 * @returns Promise<WorkspaceData> - The workspace data
 */
export async function readWorkspace(branch?: string): Promise<WorkspaceData> {
  const octokit = getClient();
  
  // Return cached data if available
  if (cachedWorkspace && !branch) {
    return cachedWorkspace;
  }
  
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: (await octokit.rest.users.getAuthenticated()).data.login,
      repo: WORKSPACE_REPO_NAME,
      path: 'workspace.json',
      ref: branch,
    });
    
    if ('content' in data && data.content) {
      const content = Buffer.from(data.content, 'base64').toString('utf-8');
      const workspace = JSON.parse(content) as WorkspaceData;
      
      // Cache the result if reading from default branch
      if (!branch) {
        cachedWorkspace = workspace;
        cachedRepoFullName = `${(await octokit.rest.users.getAuthenticated()).data.login}/${WORKSPACE_REPO_NAME}`;
      }
      
      return workspace;
    }
    
    throw new Error('workspace.json not found');
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to read workspace: ${error.message}`);
    }
    throw new Error('Failed to read workspace: Unknown error');
  }
}

/**
 * Write the workspace.json file to the connected repository.
 * 
 * @param workspace - The workspace data to write
 * @param message - The commit message
 * @param branch - The branch to write to (optional)
 * @returns Promise<CommitResult> - The commit result
 */
export async function writeWorkspace(
  workspace: WorkspaceData,
  message: string = 'Update workspace',
  branch?: string
): Promise<CommitResult> {
  const octokit = getClient();
  const user = (await octokit.rest.users.getAuthenticated()).data;
  
  // Update the updatedAt timestamp
  workspace.updatedAt = new Date().toISOString();
  
  // Get the current file SHA for update
  let sha: string | undefined;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: user.login,
      repo: WORKSPACE_REPO_NAME,
      path: 'workspace.json',
      ref: branch,
    });
    if ('sha' in data) {
      sha = data.sha;
    }
  } catch {
    // File doesn't exist yet, will create new
  }
  
  try {
    const { data } = await octokit.rest.repos.createOrUpdateFileContents({
      owner: user.login,
      repo: WORKSPACE_REPO_NAME,
      path: 'workspace.json',
      message,
      content: Buffer.from(JSON.stringify(workspace, null, 2)).toString('base64'),
      sha,
      branch: branch || undefined,
    });
    
    // Update cache
    if (!branch) {
      cachedWorkspace = workspace;
    }
    
    return {
      sha: data.commit.sha ?? '',
      url: data.commit.html_url ?? '',
      committedAt: data.commit.committer?.date ?? new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to write workspace: ${error.message}`);
    }
    throw new Error('Failed to write workspace: Unknown error');
  }
}

/**
 * Create a new project in the workspace.
 * 
 * @param project - The project data to create
 * @returns Promise<CommitResult> - The commit result
 */
export async function createProject(project: Omit<ProjectData, 'createdAt' | 'updatedAt'>): Promise<CommitResult> {
  const workspace = await readWorkspace();
  
  const newProject: ProjectData = {
    ...project,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  workspace.projects.push(newProject);
  
  return writeWorkspace(workspace, `Create project: ${project.name}`);
}

/**
 * Update an existing project in the workspace.
 * 
 * @param projectId - The ID of the project to update
 * @param updates - The partial project data to update
 * @returns Promise<CommitResult> - The commit result
 */
export async function updateProject(
  projectId: string,
  updates: Partial<ProjectData>
): Promise<CommitResult> {
  const workspace = await readWorkspace();
  
  const projectIndex = workspace.projects.findIndex(p => p.id === projectId);
  if (projectIndex === -1) {
    throw new Error(`Project not found: ${projectId}`);
  }
  
  workspace.projects[projectIndex] = {
    ...workspace.projects[projectIndex],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  
  return writeWorkspace(workspace, `Update project: ${workspace.projects[projectIndex].name}`);
}

/**
 * Delete a project from the workspace.
 * 
 * @param projectId - The ID of the project to delete
 * @returns Promise<CommitResult> - The commit result
 */
export async function deleteProject(projectId: string): Promise<CommitResult> {
  const workspace = await readWorkspace();
  
  const projectIndex = workspace.projects.findIndex(p => p.id === projectId);
  if (projectIndex === -1) {
    throw new Error(`Project not found: ${projectId}`);
  }
  
  const projectName = workspace.projects[projectIndex].name;
  workspace.projects.splice(projectIndex, 1);
  
  return writeWorkspace(workspace, `Delete project: ${projectName}`);
}

/**
 * Get a specific project by ID.
 * 
 * @param projectId - The ID of the project to retrieve
 * @returns Promise<ProjectData | null> - The project or null if not found
 */
export async function getProject(projectId: string): Promise<ProjectData | null> {
  const workspace = await readWorkspace();
  return workspace.projects.find(p => p.id === projectId) || null;
}

/**
 * List all projects in the workspace.
 * 
 * @returns Promise<ProjectData[]> - Array of all projects
 */
export async function listProjects(): Promise<ProjectData[]> {
  const workspace = await readWorkspace();
  return workspace.projects;
}

/**
 * Clear the workspace cache (useful after logout).
 */
export function clearWorkspaceCache(): void {
  cachedWorkspace = null;
  cachedRepoFullName = null;
}

/**
 * Create workspace data structure.
 * Helper function to create a new workspace object.
 * 
 * @param name - The name of the workspace
 * @returns WorkspaceData - A new workspace data object
 */
export function createWorkspace(name: string): WorkspaceData {
  return {
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    projects: [],
    settings: {
      defaultBranch: 'main',
      autoSave: true,
      autoSaveInterval: 30,
    },
  };
}

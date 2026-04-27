// GitHub Types for JustDoIt Auth Layer

export interface GitHubUser {
  login: string;
  name: string;
  avatarUrl: string;
  email: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  description: string | null;
  defaultBranch: string;
  htmlUrl: string;
}

export interface WorkspaceData {
  name: string;
  createdAt: string;
  updatedAt: string;
  projects: ProjectData[];
  settings?: WorkspaceSettings;
}

export interface ProjectData {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  canvasPath: string;
}

export interface WorkspaceSettings {
  defaultBranch: string;
  autoSave: boolean;
  autoSaveInterval: number; // in seconds
}

export interface AuthState {
  isAuthenticated: boolean;
  user: GitHubUser | null;
  repo: GitHubRepo | null;
  pat: string | null;
  isLoading: boolean;
  error: string | null;
}

export type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: { user: GitHubUser; repo: GitHubRepo; pat: string } }
  | { type: 'AUTH_FAILURE'; payload: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'AUTH_RESTORE'; payload: { user: GitHubUser; repo: GitHubRepo; pat: string } };

export interface CreateRepoOptions {
  name: string;
  description?: string;
  private: boolean;
  autoInit?: boolean;
}

export interface FileContent {
  path: string;
  content: string;
  sha?: string;
  message?: string;
}

export interface CommitResult {
  sha: string;
  url: string;
  committedAt: string;
}

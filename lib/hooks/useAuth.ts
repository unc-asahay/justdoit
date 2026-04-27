'use client';

// Auth State Management Hook

import { useState, useEffect, useCallback } from 'react';
import { validatePAT, storePAT, getPAT, clearPAT } from '../github/auth';
import { createClient, clearClient } from '../github/client';
import { getWorkspaceRepo, createWorkspaceRepo, connectExistingRepo } from '../github/repo';
import { clearWorkspaceCache } from '../github/workspace';
import type { GitHubUser, GitHubRepo, AuthState } from '../github/types';

// Re-export AuthState so useGitHub.ts can import it from here
export type { AuthState };

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  repo: null,
  pat: null,
  isLoading: true,
  error: null,
};

/**
 * Hook for managing GitHub authentication state.
 * Handles PAT validation, session persistence, and logout.
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>(initialState);

  /**
   * Attempt to restore authentication from stored PAT.
   */
  const restoreAuth = useCallback(async () => {
    const pat = getPAT();
    if (!pat) {
      setState({ ...initialState, isLoading: false });
      return;
    }

    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Validate the stored PAT
      createClient(pat);
      const user = await validatePAT(pat);
      
      // Check if workspace repo exists
      let repo = await getWorkspaceRepo();
      
      setState({
        isAuthenticated: true,
        user,
        repo,
        pat,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      // Clear invalid credentials
      clearPAT();
      clearClient();
      clearWorkspaceCache();
      
      setState({
        ...initialState,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      });
    }
  }, []);

  /**
   * Login with a GitHub PAT.
   * Validates the PAT, creates/connects workspace repo, and stores credentials.
   */
  const login = useCallback(async (pat: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Validate PAT and create client
      createClient(pat);
      const user = await validatePAT(pat);
      
      // Check if workspace repo exists
      let repo = await getWorkspaceRepo();
      
      // If no repo exists, we need to create one
      // The login page should handle this separately, but we return info
      if (!repo) {
        setState({
          isAuthenticated: true,
          user,
          repo: null,
          pat,
          isLoading: false,
          error: null,
        });
        return true;
      }
      
      // Store PAT for persistence
      storePAT(pat);
      
      setState({
        isAuthenticated: true,
        user,
        repo,
        pat,
        isLoading: false,
        error: null,
      });
      
      return true;
    } catch (error) {
      clearClient();
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Login failed',
      }));
      return false;
    }
  }, []);

  /**
   * Create a new workspace repository.
   */
  const createRepo = useCallback(async (isPrivate: boolean): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const repo = await createWorkspaceRepo(isPrivate);
      
      setState(prev => ({
        ...prev,
        repo,
        isLoading: false,
      }));
      
      return true;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to create repository',
      }));
      return false;
    }
  }, []);

  /**
   * Connect to an existing workspace repository.
   */
  const connectRepo = useCallback(async (fullName: string): Promise<boolean> => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const repo = await connectExistingRepo(fullName);
      
      setState(prev => ({
        ...prev,
        repo,
        isLoading: false,
      }));
      
      return true;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to connect repository',
      }));
      return false;
    }
  }, []);

  /**
   * Logout and clear all stored credentials.
   */
  const logout = useCallback(() => {
    clearPAT();
    clearClient();
    clearWorkspaceCache();
    
    setState({
      ...initialState,
      isLoading: false,
    });
  }, []);

  /**
   * Clear any error state.
   */
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // Restore auth on mount
  useEffect(() => {
    restoreAuth();
  }, [restoreAuth]);

  return {
    ...state,
    login,
    createRepo,
    connectRepo,
    logout,
    clearError,
  };
}

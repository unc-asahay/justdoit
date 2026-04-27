// GitHub Authentication - PAT validation and user info fetching

import { createClient } from './client';
import type { GitHubUser } from './types';

const STORAGE_KEY = 'justdoit_github_pat';

/**
 * Validate a GitHub Personal Access Token and fetch user information.
 * This function validates the PAT by calling the GitHub API and returns
 * the authenticated user's profile information.
 * 
 * @param pat - GitHub Personal Access Token (Classic PAT)
 * @returns Promise<GitHubUser> - The authenticated user's profile
 * @throws Error if the PAT is invalid or the API call fails
 */
export async function validatePAT(pat: string): Promise<GitHubUser> {
  const octokit = createClient(pat);
  
  try {
    // Verify token is valid by calling getAuthenticated
    const { data: user } = await octokit.rest.users.getAuthenticated();
    
    // Return normalized user data
    return {
      login: user.login,
      name: user.name || user.login,
      avatarUrl: user.avatar_url,
      email: user.email || '',
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`GitHub authentication failed: ${error.message}`);
    }
    throw new Error('GitHub authentication failed: Unknown error');
  }
}

/**
 * Store PAT in localStorage using base64 encoding.
 * Note: This is basic obfuscation, not encryption. For production,
 * consider using Web Crypto API for proper encryption.
 * 
 * @param pat - GitHub Personal Access Token to store
 */
export function storePAT(pat: string): void {
  if (typeof window === 'undefined') {
    throw new Error('localStorage is only available in browser environment');
  }
  localStorage.setItem(STORAGE_KEY, btoa(pat));
}

/**
 * Retrieve PAT from localStorage.
 * 
 * @returns string | null - The stored PAT or null if not found
 */
export function getPAT(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  // Older / partially-migrated entries might already be raw text. atob throws
  // InvalidCharacterError on those and bricked /home before this guard.
  try {
    return atob(stored);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

/**
 * Clear PAT from localStorage (logout).
 */
export function clearPAT(): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Check if a PAT is stored in localStorage.
 * 
 * @returns boolean - True if a PAT is stored
 */
export function hasPAT(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return localStorage.getItem(STORAGE_KEY) !== null;
}

/**
 * Get the authenticated user from a stored PAT.
 * This is a convenience function that retrieves the PAT and validates it.
 * 
 * @returns Promise<GitHubUser | null> - The user if authenticated, null otherwise
 */
export async function getAuthenticatedUser(): Promise<GitHubUser | null> {
  const pat = getPAT();
  if (!pat) {
    return null;
  }
  
  try {
    return await validatePAT(pat);
  } catch {
    // If validation fails, clear the invalid PAT
    clearPAT();
    return null;
  }
}

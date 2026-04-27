// GitHub Octokit Client Factory

import { Octokit } from 'octokit';

let octokitInstance: Octokit | null = null;

/**
 * Create a new Octokit instance with the provided PAT.
 * This will replace any existing instance.
 * 
 * @param pat - GitHub Personal Access Token
 * @returns Octokit - A new Octokit instance configured with the PAT
 */
export function createClient(pat: string): Octokit {
  octokitInstance = new Octokit({ 
    auth: pat,
    userAgent: 'JustDoIt-Canvas v1.0.0',
  });
  return octokitInstance;
}

/**
 * Get the current Octokit instance.
 * Throws an error if no client has been created yet.
 * 
 * @returns Octokit - The current Octokit instance
 * @throws Error if no client has been created (not authenticated)
 */
export function getClient(): Octokit {
  if (!octokitInstance) {
    throw new Error('Not authenticated. Please log in with your GitHub PAT.');
  }
  return octokitInstance;
}

/**
 * Check if an Octokit client instance exists.
 * 
 * @returns boolean - True if a client instance exists
 */
export function hasClient(): boolean {
  return octokitInstance !== null;
}

/**
 * Clear the current Octokit instance (logout).
 */
export function clearClient(): void {
  octokitInstance = null;
}

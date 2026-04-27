'use client';

// GitHub Context Provider Hook

import { createContext, useContext, type ReactNode } from 'react';
import { useAuth, type AuthState } from './useAuth';

// Re-export AuthState for convenience
export type { AuthState };

/**
 * GitHub Context type definition.
 */
interface GitHubContextType extends AuthState {
  login: (pat: string) => Promise<boolean>;
  createRepo: (isPrivate: boolean) => Promise<boolean>;
  connectRepo: (fullName: string) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

/**
 * Create the GitHub context with default values.
 */
const GitHubContext = createContext<GitHubContextType | null>(null);

/**
 * Provider component that wraps the application and provides GitHub auth context.
 * 
 * @example
 * ```tsx
 * // In your layout or providers file:
 * export function Providers({ children }: { children: ReactNode }) {
 *   return (
 *     <GitHubProvider>
 *       {children}
 *     </GitHubProvider>
 *   );
 * }
 * ```
 */
export function GitHubProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  
  return (
    <GitHubContext.Provider value={auth}>
      {children}
    </GitHubContext.Provider>
  );
}

/**
 * Hook to access the GitHub authentication context.
 * Must be used within a GitHubProvider.
 * 
 * @throws Error if used outside of GitHubProvider
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { user, isAuthenticated, login, logout } = useGitHub();
 *   
 *   if (!isAuthenticated) {
 *     return <LoginPrompt />;
 *   }
 *   
 *   return <Dashboard user={user} onLogout={logout} />;
 * }
 * ```
 */
export function useGitHub(): GitHubContextType {
  const context = useContext(GitHubContext);
  
  if (!context) {
    throw new Error('useGitHub must be used within a GitHubProvider');
  }
  
  return context;
}

/**
 * Hook to access the current GitHub user.
 * Shorthand for useGitHub().user
 */
export function useGitHubUser() {
  const { user, isAuthenticated } = useGitHub();
  return { user, isAuthenticated };
}

/**
 * Hook to access the current GitHub repository.
 * Shorthand for useGitHub().repo
 */
export function useGitHubRepo() {
  const { repo, isAuthenticated } = useGitHub();
  return { repo, isAuthenticated };
}

/**
 * Hook to check if the user is authenticated and ready.
 * Combines isAuthenticated and isLoading states.
 */
export function useIsAuthReady() {
  const { isAuthenticated, isLoading } = useGitHub();
  return isAuthenticated && !isLoading;
}

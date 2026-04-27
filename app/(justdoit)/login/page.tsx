// Login Page - GitHub PAT Authentication

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGitHub } from '@/lib/hooks/useGitHub';
import { Eye, EyeOff, Loader2, AlertCircle, ArrowRight } from 'lucide-react';

type LoginStep = 'pat_input' | 'repo_choice' | 'connecting';

export default function LoginPage() {
  const router = useRouter();
  const { login, createRepo, connectRepo, isLoading, error, clearError } = useGitHub();
  
  const [pat, setPat] = useState('');
  const [showPat, setShowPat] = useState(false);
  const [step, setStep] = useState<LoginStep>('pat_input');
  const [existingRepoFullName, setExistingRepoFullName] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  
  const isValidPat = pat.length > 0 && (pat.startsWith('ghp_') || pat.startsWith('github_pat_'));

  const handlePatSubmit = async () => {
    if (!isValidPat) {
      setLocalError('Invalid PAT format. GitHub PATs start with "ghp_" or "github_pat_"');
      return;
    }
    
    setLocalError(null);
    clearError();
    
    const success = await login(pat);
    if (success) {
      setStep('repo_choice');
    }
  };

  const handleCreateRepo = async (isPrivate: boolean) => {
    setLocalError(null);
    
    const success = await createRepo(isPrivate);
    if (success) {
      router.push('/home');
    }
  };

  const handleConnectRepo = async () => {
    if (!existingRepoFullName || !existingRepoFullName.includes('/')) {
      setLocalError('Please enter a valid repository name (owner/repo)');
      return;
    }
    
    setLocalError(null);
    
    const success = await connectRepo(existingRepoFullName);
    if (success) {
      router.push('/');
    }
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="w-full max-w-md px-6">
        {/* Logo and Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 mb-4">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">JustDoIt</h1>
          <p className="text-gray-400">Architecture Canvas powered by GitHub</p>
        </div>

        {/* Main Card */}
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-2xl border border-gray-700 p-8 shadow-2xl">
          {step === 'pat_input' && (
            <>
              <h2 className="text-xl font-semibold text-white mb-6">Connect with GitHub</h2>
              
              <div className="space-y-4">
                <div>
                  <label htmlFor="pat" className="block text-sm font-medium text-gray-300 mb-2">
                    GitHub Personal Access Token
                  </label>
                  <div className="relative">
                    <input
                      id="pat"
                      type={showPat ? 'text' : 'password'}
                      value={pat}
                      onChange={(e) => setPat(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handlePatSubmit()}
                      placeholder="ghp_xxxxxxxxxxxx"
                      className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPat(!showPat)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                    >
                      {showPat ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {displayError && (
                  <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-400">{displayError}</p>
                  </div>
                )}

                <button
                  onClick={handlePatSubmit}
                  disabled={!isValidPat || isLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-700">
                <p className="text-sm text-gray-400 mb-3">Need a PAT?</p>
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo,read:user&description=JustDoIt+Canvas"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                  Create GitHub PAT
                </a>
                <p className="text-xs text-gray-500 mt-2">
                  Required scopes: repo, read:user
                </p>
              </div>
            </>
          )}

          {step === 'repo_choice' && (
            <>
              <h2 className="text-xl font-semibold text-white mb-2">Set Up Workspace</h2>
              <p className="text-gray-400 mb-6">Choose how to set up your JustDoIt workspace repository.</p>

              {displayError && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-4">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-400">{displayError}</p>
                </div>
              )}

              <div className="space-y-3">
                <button
                  onClick={() => handleCreateRepo(true)}
                  disabled={isLoading}
                  className="w-full flex items-center justify-between px-4 py-4 bg-gray-900/50 border border-gray-600 hover:border-gray-500 rounded-xl transition-colors group"
                >
                  <div className="text-left">
                    <p className="text-white font-medium">Create Private Repository</p>
                    <p className="text-sm text-gray-400">Only you can see this workspace</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
                </button>

                <button
                  onClick={() => handleCreateRepo(false)}
                  disabled={isLoading}
                  className="w-full flex items-center justify-between px-4 py-4 bg-gray-900/50 border border-gray-600 hover:border-gray-500 rounded-xl transition-colors group"
                >
                  <div className="text-left">
                    <p className="text-white font-medium">Create Public Repository</p>
                    <p className="text-sm text-gray-400">Anyone can view this workspace</p>
                  </div>
                  <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-white transition-colors" />
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-700"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-gray-800 text-gray-400">or</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={existingRepoFullName}
                    onChange={(e) => setExistingRepoFullName(e.target.value)}
                    placeholder="owner/repo-name"
                    className="w-full px-4 py-3 bg-gray-900/50 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={handleConnectRepo}
                    disabled={!existingRepoFullName || isLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      'Connect Existing Repository'
                    )}
                  </button>
                </div>

                <button
                  onClick={() => {
                    setStep('pat_input');
                    setLocalError(null);
                    clearError();
                  }}
                  className="w-full text-center text-gray-400 hover:text-white text-sm transition-colors mt-4"
                >
                  Back to PAT input
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-gray-500 text-sm mt-6">
          Your PAT is stored locally and never sent to any server other than GitHub.
        </p>
      </div>
    </div>
  );
}

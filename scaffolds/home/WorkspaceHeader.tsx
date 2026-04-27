'use client';

interface WorkspaceHeaderProps {
  user: { login: string; name: string; avatarUrl: string } | null;
  repo: { fullName: string; htmlUrl: string; defaultBranch: string } | null;
  isLoading: boolean;
}

export function WorkspaceHeader({ user, repo, isLoading }: WorkspaceHeaderProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl bg-gradient-to-r from-gray-900 to-gray-800 border border-gray-700 p-4 animate-pulse">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-700" />
            <div className="space-y-2">
              <div className="w-32 h-3 bg-gray-700 rounded" />
              <div className="w-20 h-2 bg-gray-700 rounded" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-24 h-3 bg-gray-700 rounded" />
            <div className="w-16 h-5 bg-gray-700 rounded-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-xl bg-gradient-to-r from-gray-900 to-gray-800 border border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">?</div>
            <div>
              <p className="text-sm font-medium text-white">Not connected</p>
              <p className="text-xs text-amber-400">● Connect GitHub to continue</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gradient-to-r from-gray-900 to-gray-800 border border-gray-700 p-4">
      <div className="flex items-center justify-between">
        {/* Left: avatar + username */}
        <div className="flex items-center gap-3">
          <img
            src={user.avatarUrl}
            alt={user.login}
            className="w-8 h-8 rounded-full"
          />
          <div>
            <p className="text-sm font-semibold text-white">
              {user.name || user.login}
            </p>
            <p className="text-xs text-gray-400">@{user.login}</p>
          </div>
        </div>

        {/* Right: repo + branch */}
        <div className="flex items-center gap-3">
          {repo ? (
            <a
              href={repo.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-300 hover:text-white transition-colors"
            >
              {repo.fullName}
            </a>
          ) : (
            <span className="text-xs text-gray-500">No repo</span>
          )}
          <span className="px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded-full font-mono">
            {repo?.defaultBranch ?? 'main'}
          </span>
          <span className="flex items-center gap-1 text-xs text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            Connected
          </span>
        </div>
      </div>
    </div>
  );
}

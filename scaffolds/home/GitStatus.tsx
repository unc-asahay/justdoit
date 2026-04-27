'use client';

interface GitStatusProps {
  branch: string;
  lastSyncTime: string | null;
  syncStatus: 'idle' | 'syncing' | 'error';
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function GitStatus({ branch, lastSyncTime, syncStatus }: GitStatusProps) {
  return (
    <div className="inline-flex items-center gap-2">
      {/* Branch badge */}
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-800 text-gray-300 rounded-full border border-gray-700 font-mono">
        🔀 {branch}
      </span>

      {/* Sync badge */}
      {syncStatus === 'idle' && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-green-900/40 text-green-400 rounded-full border border-green-800">
          ✓ Synced
        </span>
      )}
      {syncStatus === 'syncing' && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-yellow-900/40 text-yellow-400 rounded-full border border-yellow-800">
          <span className="w-3 h-3 border border-yellow-500/50 border-t-yellow-400 rounded-full animate-spin" />
          Syncing...
        </span>
      )}
      {syncStatus === 'error' && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-red-900/40 text-red-400 rounded-full border border-red-800">
          ✗ Error
        </span>
      )}

      {/* Last sync time */}
      {lastSyncTime && syncStatus === 'idle' && (
        <span className="text-xs text-gray-500">
          {timeAgo(lastSyncTime)}
        </span>
      )}
    </div>
  );
}

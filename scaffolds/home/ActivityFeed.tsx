'use client';

import type { ActivityItem } from '../../lib/github/activity';

interface ActivityFeedProps {
  activities: ActivityItem[];
  isLoading: boolean;
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function ActivityFeed({ activities, isLoading }: ActivityFeedProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="flex flex-col items-center">
              <div className="w-2 h-2 rounded-full bg-gray-700" />
              <div className="w-px h-full bg-gray-700 mt-1" />
            </div>
            <div className="flex-1 pb-3">
              <div className="h-3 bg-gray-700 rounded w-3/4 mb-1" />
              <div className="h-2 bg-gray-700 rounded w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 text-sm">No activity yet.</p>
        <p className="text-gray-600 text-xs mt-1">Create a project to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {activities.map((item, idx) => (
        <div key={item.id} className="flex gap-3 group">
          {/* Timeline dot + line */}
          <div className="flex flex-col items-center">
            <div className="w-2 h-2 rounded-full bg-gray-600 group-hover:bg-blue-500 transition-colors mt-1.5" />
            {idx < activities.length - 1 && (
              <div className="w-px flex-1 bg-gray-800 mt-1" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 pb-4">
            <p className="text-sm text-gray-300 leading-snug">{item.message.split('\n')[0]}</p>
            <div className="flex items-center gap-2 mt-1">
              <code className="text-xs text-gray-600 font-mono bg-gray-900 px-1 py-0.5 rounded">
                {item.sha}
              </code>
              <span className="text-xs text-gray-500">{item.author}</span>
              <span className="text-xs text-gray-600 ml-auto">{timeAgo(item.timestamp)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

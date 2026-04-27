'use client';

import type { ChatMessage as ChatMessageType } from '@/lib/ai/types';
import { StreamingIndicator } from './StreamingIndicator';

interface ChatMessageProps {
  message: ChatMessageType;
}

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function getActiveModelLabel(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('justdoit:ai-settings');
    if (!raw) return null;
    const s = JSON.parse(raw);
    const conn = s.connections?.find((c: any) => c.id === s.activeConnectionId);
    return conn ? conn.activeModel : null;
  } catch { return null; }
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  // Always show the real active connection model, not the legacy agent defaultModel
  const modelLabel = isAssistant ? (getActiveModelLabel() ?? message.model) : null;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-xl px-4 py-3 ${
          isUser
            ? 'bg-blue-600/20 border border-blue-700/30'
            : 'bg-gray-800/50 border border-gray-700/50'
        }`}
      >
        {/* Top: agent name */}
        <div className="flex items-center gap-2 mb-1.5">
          {isAssistant && (
            <span className="text-xs text-gray-500">
              {message.agentName ?? 'Assistant'}
            </span>
          )}
          {isUser && (
            <span className="text-xs text-blue-400">You</span>
          )}
        </div>

        {/* Content */}
        <div className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
          {message.content.replace(/```(?:canvas-json|json)[\s\S]*?(?:```|$)/g, '').trim()}
          {message.isStreaming && <StreamingIndicator />}
        </div>

        {/* Bottom: model badge + timestamp */}
        {(isAssistant || message.timestamp) && (
          <div className="flex items-center gap-2 mt-1.5">
            {modelLabel && (
              <span className="text-[10px] bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded font-mono">
                {modelLabel}
              </span>
            )}
            <span className="text-[10px] text-gray-600">
              {timeAgo(message.timestamp)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

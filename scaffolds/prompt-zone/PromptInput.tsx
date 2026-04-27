'use client';

import { useState, useRef } from 'react';
import { useSettings } from '@/lib/ai/settings-store';

interface PromptInputProps {
  onSend: (content: string) => void;
  onAbort: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function PromptInput({
  onSend,
  onAbort,
  isStreaming,
  disabled,
}: PromptInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { getActiveConnection } = useSettings();

  const activeConn = getActiveConnection();

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || isStreaming || disabled) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
  }

  const isUnconfigured = !activeConn;

  return (
    <div className="bg-gray-900 border-t border-gray-800 p-3 space-y-2">
      {/* No connection warning */}
      {isUnconfigured && (
        <div className="flex items-center gap-2 px-3 py-2 bg-yellow-900/30 border border-yellow-700/50 rounded-lg text-xs text-yellow-300">
          <span>⚠️</span>
          <span>No API connection configured.</span>
          <a href="/settings" className="ml-auto text-yellow-200 hover:text-white underline font-medium">
            Settings →
          </a>
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        placeholder="Describe your architecture..."
        rows={1}
        disabled={disabled || isUnconfigured}
        className="w-full bg-gray-800/50 border border-gray-700 rounded-xl p-3 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
      />

      {/* Bottom bar — active connection info + send/stop */}
      <div className="flex items-center justify-between gap-2">
        {/* Active connection pill */}
        {activeConn ? (
          <a
            href="/settings"
            title={`Using: ${activeConn.baseUrl}`}
            className="flex items-center gap-1.5 px-2 py-1 bg-gray-800 border border-gray-700 hover:border-gray-500 rounded-lg text-xs text-gray-300 hover:text-white transition-colors truncate max-w-[55%]"
          >
            <span className="text-green-400">●</span>
            <span className="font-medium truncate">{activeConn.name}</span>
            <span className="text-gray-500 truncate">{activeConn.activeModel}</span>
          </a>
        ) : (
          <span className="text-xs text-gray-600 italic">Not connected</span>
        )}

        {isStreaming ? (
          <button
            onClick={onAbort}
            className="px-4 py-1.5 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0"
          >
            <span>■</span> Stop
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim() || disabled || isUnconfigured}
            className="px-4 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
          >
            Send <span>→</span>
          </button>
        )}
      </div>
    </div>
  );
}

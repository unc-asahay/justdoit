'use client';

import { useState } from 'react';
import { Eye, EyeOff, Check, Trash2, ExternalLink, Key } from 'lucide-react';
import type { ProviderMeta } from '@/lib/settings/api-keys';

interface ApiKeyRowProps {
  meta: ProviderMeta;
  currentKey: string;       // already-saved key (masked)
  envFallback: boolean;     // true if an env var key exists as fallback
  onSave: (key: string) => void;
  onRemove: () => void;
}

export function ApiKeyRow({ meta, currentKey, envFallback, onSave, onRemove }: ApiKeyRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasSavedKey = currentKey.length > 0;
  const masked = hasSavedKey ? currentKey.slice(0, 6) + '••••••••••••' + currentKey.slice(-4) : '';

  function handleSave() {
    if (!draft.trim()) return;
    onSave(draft.trim());
    setDraft('');
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') { setEditing(false); setDraft(''); }
  }

  return (
    <div className="border border-gray-700 rounded-xl p-4 bg-gray-900/40 hover:border-gray-600 transition-colors">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">{meta.icon}</span>
          <div>
            <p className="text-sm font-semibold text-white">{meta.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Unlocks: {meta.models.join(', ')}
            </p>
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasSavedKey && (
            <span className="flex items-center gap-1 text-xs text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              Saved
            </span>
          )}
          {!hasSavedKey && envFallback && (
            <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
              Env fallback
            </span>
          )}
          {!hasSavedKey && !envFallback && (
            <span className="text-xs text-gray-600 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded-full">
              Not set
            </span>
          )}
        </div>
      </div>

      {/* Key display / input */}
      {!editing && (
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-gray-950/60 rounded-lg border border-gray-800 min-h-[38px]">
            <Key className="w-3.5 h-3.5 text-gray-600 flex-shrink-0" />
            {hasSavedKey ? (
              <span className="text-sm font-mono text-gray-400">
                {showKey ? currentKey : masked}
              </span>
            ) : (
              <span className="text-sm text-gray-600 italic">No key saved</span>
            )}
          </div>

          {hasSavedKey && (
            <button
              onClick={() => setShowKey(v => !v)}
              className="p-2 text-gray-500 hover:text-gray-300 transition-colors"
              title={showKey ? 'Hide key' : 'Show key'}
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}

          <button
            onClick={() => { setEditing(true); setDraft(''); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
          >
            {hasSavedKey ? 'Update' : 'Add key'}
          </button>

          {hasSavedKey && (
            <button
              onClick={onRemove}
              className="p-2 text-gray-600 hover:text-red-400 transition-colors"
              title="Remove key"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {editing && (
        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              autoFocus
              type={showKey ? 'text' : 'password'}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={meta.placeholder}
              className="w-full px-3 py-2 bg-gray-950 border border-blue-500/50 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono pr-9"
            />
            <button
              type="button"
              onClick={() => setShowKey(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <button
            onClick={handleSave}
            disabled={!draft.trim()}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {saved ? <Check className="w-4 h-4" /> : 'Save'}
          </button>

          <button
            onClick={() => { setEditing(false); setDraft(''); }}
            className="px-3 py-2 rounded-lg text-gray-400 hover:text-white text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Docs link */}
      <div className="mt-2.5">
        <a
          href={meta.docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-blue-400 transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          Get API key from {meta.label}
        </a>
      </div>
    </div>
  );
}

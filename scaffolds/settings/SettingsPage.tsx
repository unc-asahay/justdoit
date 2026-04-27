'use client';

import { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, AlertTriangle } from 'lucide-react';
import { ApiKeyRow } from './ApiKeyRow';
import {
  PROVIDER_META,
  loadApiKeys,
  saveApiKey,
  removeApiKey,
  type StoredApiKeys,
} from '@/lib/settings/api-keys';

// Check which providers have a fallback env var baked in at build time
function getEnvFallbacks(): Record<string, boolean> {
  return {
    anthropic: !!process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY,
    openai: !!process.env.NEXT_PUBLIC_OPENAI_API_KEY,
    google: !!process.env.NEXT_PUBLIC_GOOGLE_AI_KEY,
    minimax: !!process.env.NEXT_PUBLIC_MINIMAX_API_KEY,
    together: !!process.env.NEXT_PUBLIC_TOGETHER_API_KEY,
    groq: !!process.env.NEXT_PUBLIC_GROQ_API_KEY,
    deepseek: !!process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY,
  };
}

export function SettingsPage() {
  const [keys, setKeys] = useState<StoredApiKeys>({});
  const [envFallbacks] = useState(getEnvFallbacks);
  const [flashMsg, setFlashMsg] = useState<string | null>(null);

  // Load saved keys on mount (client-only)
  useEffect(() => {
    setKeys(loadApiKeys());
  }, []);

  function flash(msg: string) {
    setFlashMsg(msg);
    setTimeout(() => setFlashMsg(null), 2500);
  }

  function handleSave(provider: string, key: string) {
    saveApiKey(provider, key);
    setKeys(loadApiKeys());
    flash(`${PROVIDER_META.find(p => p.id === provider)?.label} key saved`);
  }

  function handleRemove(provider: string) {
    removeApiKey(provider);
    setKeys(loadApiKeys());
    flash(`${PROVIDER_META.find(p => p.id === provider)?.label} key removed`);
  }

  const savedCount = Object.keys(keys).length;
  const envCount = Object.values(envFallbacks).filter(Boolean).length;

  return (
    <div className="h-full overflow-y-auto bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck className="w-6 h-6 text-blue-400" />
            <h1 className="text-xl font-bold text-white">Settings</h1>
          </div>
          <p className="text-sm text-gray-400 ml-9">
            Configure your AI provider API keys. Keys are stored in your browser only — never sent to any server.
          </p>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-4 mb-6 p-3 rounded-xl bg-gray-900 border border-gray-800 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            {savedCount} key{savedCount !== 1 ? 's' : ''} saved in browser
          </span>
          {envCount > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-yellow-400" />
              {envCount} env fallback{envCount !== 1 ? 's' : ''} available
            </span>
          )}
          <span className="ml-auto text-gray-600">Priority: Browser key &gt; .env.local</span>
        </div>

        {/* Flash message */}
        {flashMsg && (
          <div className="mb-4 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400 flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            {flashMsg}
          </div>
        )}

        {/* Security notice */}
        <div className="mb-6 px-4 py-3 rounded-xl bg-yellow-500/5 border border-yellow-500/15 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-400/80 leading-relaxed">
            API keys are stored in <strong>localStorage</strong> in your browser.
            They are sent directly from your browser to the AI provider — not through JustDoIt servers.
            Do not use this on a shared or public computer.
          </p>
        </div>

        {/* Provider sections */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
            AI Providers
          </h2>
          <div className="space-y-3">
            {PROVIDER_META.map(meta => (
              <ApiKeyRow
                key={meta.id}
                meta={meta}
                currentKey={keys[meta.id]?.key ?? ''}
                envFallback={envFallbacks[meta.id] ?? false}
                onSave={key => handleSave(meta.id, key)}
                onRemove={() => handleRemove(meta.id)}
              />
            ))}
          </div>
        </section>

        {/* GitHub PAT section */}
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
            Version Control
          </h2>
          <div className="border border-gray-700 rounded-xl p-4 bg-gray-900/40">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="text-xl">🐙</span>
              <div>
                <p className="text-sm font-semibold text-white">GitHub Personal Access Token</p>
                <p className="text-xs text-gray-500 mt-0.5">Managed separately via the Login page</p>
              </div>
              <span className="ml-auto text-xs text-gray-600 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded-full">
                {typeof window !== 'undefined' && localStorage.getItem('justdoit:pat') ? '✓ Connected' : 'Not set'}
              </span>
            </div>
            <p className="text-xs text-gray-600">
              To change your GitHub PAT, log out from the Home tab and log in again with a new token.
            </p>
          </div>
        </section>

        {/* Danger zone */}
        <section>
          <h2 className="text-xs font-semibold text-red-900 uppercase tracking-widest mb-3">
            Danger Zone
          </h2>
          <div className="border border-red-900/40 rounded-xl p-4 bg-red-950/10">
            <p className="text-sm text-gray-400 mb-3">
              Clear all API keys stored in this browser. This cannot be undone.
            </p>
            <button
              onClick={() => {
                if (confirm('Remove all saved API keys from this browser?')) {
                  PROVIDER_META.forEach(p => removeApiKey(p.id));
                  setKeys({});
                  flash('All keys cleared');
                }
              }}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-800 text-red-400 hover:bg-red-900/30 transition-colors"
            >
              Clear all API keys
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}

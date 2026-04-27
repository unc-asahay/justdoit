'use client';

/**
 * API Key Settings — wires the Settings UI to the Bifrost gateway.
 *
 * Keys are no longer stored in localStorage. Instead, they are registered
 * directly with Bifrost via the Next.js /api/bifrost proxy, which forwards
 * requests to the Bifrost gateway server-side (localhost:8080).
 *
 * Everything flows through localhost:3333 — no direct browser → 8080 calls.
 *
 * Bifrost dashboard (view keys, logs, usage): http://localhost:8080
 */

const BIFROST = '/api/bifrost';

export interface ApiKeyEntry {
  provider: string;    // e.g. 'anthropic', 'openai', 'minimax'
  key: string;         // the actual token
  savedAt: number;     // timestamp
}

export interface StoredApiKeys {
  [provider: string]: ApiKeyEntry;
}

// Custom provider network configs for non-built-in providers
const CUSTOM_PROVIDER_CONFIGS: Record<string, {
  baseUrl: string;
  baseProviderType: 'openai' | 'anthropic';
}> = {
  minimax:    { baseUrl: 'https://api.minimax.io/anthropic', baseProviderType: 'anthropic' },
  deepseek:   { baseUrl: 'https://api.deepseek.com/v1',      baseProviderType: 'openai' },
  together:   { baseUrl: 'https://api.together.xyz/v1',      baseProviderType: 'openai' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1',     baseProviderType: 'openai' },
};

/** Register a key with Bifrost's provider configuration API */
export async function saveApiKey(provider: string, key: string): Promise<void> {
  const customConfig = CUSTOM_PROVIDER_CONFIGS[provider];

  const body: Record<string, unknown> = {
    provider,
    keys: [{
      name: `${provider}-key`,
      value: key.trim(),
      models: ['*'],
      weight: 1.0,
    }],
  };

  if (customConfig) {
    body.network_config = { base_url: customConfig.baseUrl };
    body.custom_provider_config = {
      base_provider_type: customConfig.baseProviderType,
      allowed_requests: {
        chat_completion: true,
        chat_completion_stream: true,
      },
    };
  }

  const res = await fetch(`${BIFROST}/api/providers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to save key to Bifrost: ${err}`);
  }
}

/** Fetch all configured providers from Bifrost */
export async function loadApiKeys(): Promise<StoredApiKeys> {
  try {
    const res = await fetch(`${BIFROST}/api/providers`);
    if (!res.ok) return {};

    const data = await res.json() as Record<string, unknown>;
    const result: StoredApiKeys = {};

    // Bifrost returns { providers: { anthropic: { keys: [...] }, ... } }
    const providers = (data.providers ?? data) as Record<string, unknown>;
    for (const [pid, pdata] of Object.entries(providers)) {
      const keys = (pdata as { keys?: Array<{ value: string }> }).keys ?? [];
      if (keys.length > 0) {
        result[pid] = {
          provider: pid,
          key: '••••••••',  // Bifrost redacts key values in GET responses
          savedAt: Date.now(),
        };
      }
    }
    return result;
  } catch {
    return {};
  }
}

/** Remove a provider's keys from Bifrost */
export async function removeApiKey(provider: string): Promise<void> {
  await fetch(`${BIFROST}/api/providers/${provider}`, { method: 'DELETE' });
}

/** Check if a provider has any key configured (non-empty response from Bifrost) */
export async function getApiKey(provider: string): Promise<string> {
  const keys = await loadApiKeys();
  return keys[provider]?.key ?? '';
}

/** True if Bifrost has at least one provider configured */
export async function hasAnyKey(): Promise<boolean> {
  const keys = await loadApiKeys();
  return Object.keys(keys).length > 0;
}

/** Check if the Bifrost gateway is reachable */
export async function isBifrostRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${BIFROST}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

// Provider metadata for the UI (unchanged — drives the Settings form)
export interface ProviderMeta {
  id: string;
  label: string;
  icon: string;
  placeholder: string;
  docsUrl: string;
  envVar: string;
  models: string[];
}

export const PROVIDER_META: ProviderMeta[] = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    icon: '🟣',
    placeholder: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/',
    envVar: 'ANTHROPIC_API_KEY',
    models: ['Claude Sonnet 4', 'Claude 3 Haiku'],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    icon: '🟢',
    placeholder: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    envVar: 'OPENAI_API_KEY',
    models: ['GPT-4o', 'GPT-4o Mini'],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    icon: '🔵',
    placeholder: 'AIza...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    envVar: 'GEMINI_API_KEY',
    models: ['Gemini 2.0 Flash', 'Gemini 1.5 Pro'],
  },
  {
    id: 'groq',
    label: 'Groq',
    icon: '🟠',
    placeholder: 'gsk_...',
    docsUrl: 'https://console.groq.com/keys',
    envVar: 'GROQ_API_KEY',
    models: ['Llama 3 70B (ultra-fast)', 'Mixtral (ultra-fast)'],
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    icon: '🔶',
    placeholder: 'eyJ...',
    docsUrl: 'https://www.minimaxi.com/',
    envVar: 'MINIMAX_API_KEY',
    models: ['MiniMax Text 01'],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    icon: '🔷',
    placeholder: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/',
    envVar: 'DEEPSEEK_API_KEY',
    models: ['DeepSeek Chat', 'DeepSeek Coder'],
  },
  {
    id: 'together',
    label: 'Together AI',
    icon: '🟧',
    placeholder: 'your-together-key',
    docsUrl: 'https://api.together.xyz/',
    envVar: 'TOGETHER_API_KEY',
    models: ['Llama 3 70B', 'Mixtral 8x7B', '+ 50 more'],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    icon: '🌐',
    placeholder: 'sk-or-...',
    docsUrl: 'https://openrouter.ai/keys',
    envVar: 'OPENROUTER_API_KEY',
    models: ['1000+ models across all providers'],
  },
];

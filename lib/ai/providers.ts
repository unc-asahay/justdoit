/**
 * Hermes Agent Provider Registry & Models.dev Integration
 */

export type TransportProtocol = 'openai_chat' | 'anthropic_messages' | 'codex_responses';

export interface ProviderOverlay {
  id: string; // models.dev provider id OR custom hermes id
  name: string;
  transport: TransportProtocol;
  defaultBaseUrl?: string;
  isAggregator?: boolean;
}

// Hardcoded overlays for known base URLs or specific transport needs
// This mirrors the HERMES_OVERLAYS from Hermes Agent
export const HERMES_PROVIDERS: Record<string, ProviderOverlay> = {
  'anthropic': { id: 'anthropic', name: 'Anthropic', transport: 'anthropic_messages', defaultBaseUrl: 'https://api.anthropic.com/v1' },
  'openai': { id: 'openai', name: 'OpenAI', transport: 'openai_chat', defaultBaseUrl: 'https://api.openai.com/v1' },
  'google': { id: 'google', name: 'Google Gemini', transport: 'openai_chat', defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  'openrouter': { id: 'openrouter', name: 'OpenRouter', transport: 'openai_chat', defaultBaseUrl: 'https://openrouter.ai/api/v1', isAggregator: true },
  'deepseek': { id: 'deepseek', name: 'DeepSeek', transport: 'openai_chat', defaultBaseUrl: 'https://api.deepseek.com/v1' },
  'minimax': { id: 'minimax', name: 'MiniMax', transport: 'openai_chat', defaultBaseUrl: 'https://api.minimax.io/v1' },
  'minimax-cn': { id: 'minimax-cn', name: 'MiniMax (China)', transport: 'openai_chat', defaultBaseUrl: 'https://api.minimaxi.com/v1' },
  'alibaba': { id: 'alibaba', name: 'Alibaba (Dashscope)', transport: 'openai_chat', defaultBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  'xai': { id: 'xai', name: 'xAI', transport: 'codex_responses', defaultBaseUrl: 'https://api.x.ai/v1' },
  'stepfun': { id: 'stepfun', name: 'Stepfun', transport: 'openai_chat', defaultBaseUrl: 'https://api.stepfun.ai/step_plan/v1' },
  'zai': { id: 'zai', name: 'Z.ai (GLM)', transport: 'openai_chat', defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4' },
  'kimi-for-coding': { id: 'kimi-for-coding', name: 'Kimi / Moonshot', transport: 'openai_chat', defaultBaseUrl: 'https://api.moonshot.cn/v1' },
  'nvidia': { id: 'nvidia', name: 'NVIDIA', transport: 'openai_chat', defaultBaseUrl: 'https://integrate.api.nvidia.com/v1' },
  'togetherai': { id: 'togetherai', name: 'Together AI', transport: 'openai_chat', defaultBaseUrl: 'https://api.together.xyz/v1' },
  'groq': { id: 'groq', name: 'Groq', transport: 'openai_chat', defaultBaseUrl: 'https://api.groq.com/openai/v1' },
  'ollama-cloud': { id: 'ollama-cloud', name: 'Ollama', transport: 'openai_chat', defaultBaseUrl: 'http://localhost:11434/v1' },
};

export interface AIConnection {
  id: string;
  providerId: string;
  name: string;
  transport: TransportProtocol;
  baseUrl: string;
  apiKey: string;
  activeModel: string;
  discoveredModels: string[];
}

// ---------------------------------------------------------------------------
// Models.dev Integration
// ---------------------------------------------------------------------------

export interface ModelsDevProvider {
  id: string;
  name: string;
  api: string | null;
  models: string[]; // List of model IDs
}

const MODELS_DEV_URL = "https://models.dev/api.json";
let _modelsDevCache: Record<string, ModelsDevProvider> | null = null;

export async function fetchModelsDevCatalog(): Promise<Record<string, ModelsDevProvider>> {
  if (_modelsDevCache) return _modelsDevCache;

  try {
    const res = await fetch(MODELS_DEV_URL, { next: { revalidate: 3600 } });
    const rawData = await res.json();
    
    const catalog: Record<string, ModelsDevProvider> = {};
    
    for (const [providerId, providerData] of Object.entries(rawData)) {
      const data = providerData as any;
      const modelKeys = data.models ? Object.keys(data.models) : [];
      
      // Filter out some noise models (like embedding/tts) roughly
      const agenticModels = modelKeys.filter(m => {
        const mLower = m.toLowerCase();
        if (mLower.includes('tts') || mLower.includes('embedding') || mLower.includes('image')) return false;
        return true;
      });

      catalog[providerId] = {
        id: providerId,
        name: data.name || providerId,
        api: data.api || null,
        models: agenticModels.sort(),
      };
    }

    // Always ensure Custom Provider exists
    catalog['custom'] = {
      id: 'custom',
      name: 'Custom Endpoint',
      api: '',
      models: []
    };

    _modelsDevCache = catalog;
    return catalog;
  } catch (error) {
    console.error("Failed to fetch models.dev catalog", error);
    // Fallback to basic dictionary
    const fallback: Record<string, ModelsDevProvider> = {};
    for (const p of Object.values(HERMES_PROVIDERS)) {
      fallback[p.id] = { id: p.id, name: p.name, api: p.defaultBaseUrl || null, models: [] };
    }
    fallback['custom'] = { id: 'custom', name: 'Custom Endpoint', api: '', models: [] };
    return fallback;
  }
}

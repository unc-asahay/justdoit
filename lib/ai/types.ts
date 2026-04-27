// Shared types for Prompt Zone + AI integration

export type ModelProvider = 'anthropic' | 'openai' | 'google' | 'ollama' | 'openai-compatible';

export type ModelId =
  | 'claude-sonnet-4-20250514'
  | 'claude-3-haiku-20240307'
  | 'gpt-4o'
  | 'gpt-4o-mini'
  | 'gemini-2.0-flash'
  | 'ollama/llama3'
  | 'ollama/codellama'
  | (string & {});  // Allow any custom model ID for custom endpoints

export interface ModelConfig {
  id: ModelId;
  name: string;           // Display name: "Claude 3.5 Sonnet"
  provider: ModelProvider;
  maxTokens: number;
  supportsStreaming: boolean;
  icon: string;            // Emoji: "🟣" for Anthropic, "🟢" for OpenAI, etc.
  baseUrl?: string;        // Custom API base URL (for openai-compatible providers)
  apiKeyEnv?: string;      // Custom env var name for API key (default: provider-based)
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  model?: ModelId;          // Which model generated this (for assistant messages)
  agentId?: string;         // Which agent generated this (for multi-agent, Step 05)
  agentName?: string;       // Display name of agent
  isStreaming?: boolean;     // True while the message is still streaming in
}

export interface ChatSession {
  id: string;
  projectId: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// Re-export StreamOptions from stream.ts for backwards compatibility
export type { StreamOptions } from './stream';

// Built-in agent definitions (read-only in step 04, editable in step 08)
export interface AgentDef {
  id: string;
  name: string;
  icon: string;
  defaultModel: ModelId;
  systemPrompt: string;
  enabled: boolean;
  connectionId?: string;
}

// Predefined models list
export const MODELS: ModelConfig[] = [
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic', maxTokens: 8192, supportsStreaming: true, icon: '🟣' },
  { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic', maxTokens: 4096, supportsStreaming: true, icon: '🟣' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', maxTokens: 4096, supportsStreaming: true, icon: '🟢' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', maxTokens: 4096, supportsStreaming: true, icon: '🟢' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google', maxTokens: 8192, supportsStreaming: true, icon: '🔵' },
  { id: 'ollama/llama3', name: 'Llama 3 (local)', provider: 'ollama', maxTokens: 4096, supportsStreaming: true, icon: '🦙' },
  { id: 'ollama/codellama', name: 'CodeLlama (local)', provider: 'ollama', maxTokens: 4096, supportsStreaming: true, icon: '🦙' },
];

/**
 * Custom Endpoint Models — OpenAI-compatible providers.
 * Users can add models here for MiniMax, Together, Groq, Fireworks, DeepSeek, etc.
 * Any API that follows the OpenAI /v1/chat/completions format will work.
 */
export const CUSTOM_MODELS: ModelConfig[] = [
  {
    id: 'minimax/MiniMax-Text-01',
    name: 'MiniMax Text 01',
    provider: 'openai-compatible',
    maxTokens: 8192,
    supportsStreaming: true,
    icon: '🔶',
    baseUrl: 'https://api.minimaxi.chat/v1',
    apiKeyEnv: 'MINIMAX_API_KEY',
  },
  // ── Add your own custom endpoints below ──
  // {
  //   id: 'together/meta-llama/Llama-3-70b-chat-hf',
  //   name: 'Llama 3 70B (Together)',
  //   provider: 'openai-compatible',
  //   maxTokens: 4096,
  //   supportsStreaming: true,
  //   icon: '🟧',
  //   baseUrl: 'https://api.together.xyz/v1',
  //   apiKeyEnv: 'TOGETHER_API_KEY',
  // },
  // {
  //   id: 'groq/llama3-70b-8192',
  //   name: 'Llama 3 70B (Groq)',
  //   provider: 'openai-compatible',
  //   maxTokens: 8192,
  //   supportsStreaming: true,
  //   icon: '🟠',
  //   baseUrl: 'https://api.groq.com/openai/v1',
  //   apiKeyEnv: 'GROQ_API_KEY',
  // },
  // {
  //   id: 'deepseek/deepseek-chat',
  //   name: 'DeepSeek Chat',
  //   provider: 'openai-compatible',
  //   maxTokens: 8192,
  //   supportsStreaming: true,
  //   icon: '🔷',
  //   baseUrl: 'https://api.deepseek.com/v1',
  //   apiKeyEnv: 'DEEPSEEK_API_KEY',
  // },
];

/** All available models — built-in + custom */
export const ALL_MODELS: ModelConfig[] = [...MODELS, ...CUSTOM_MODELS];

// Default agents (these become customizable in Step 08)
export const DEFAULT_AGENTS: AgentDef[] = [
  {
    id: 'design-agent',
    name: 'Design Brain',
    icon: '🎨',
    defaultModel: 'claude-sonnet-4-20250514',
    systemPrompt: 'You are a UI/UX design expert. Help the user create beautiful, functional interfaces. Suggest colors, layouts, typography, and component structures. Output structured design decisions.',
    enabled: false,
  },
  {
    id: 'arch-agent',
    name: 'Architecture Brain',
    icon: '🏗️',
    defaultModel: 'gpt-4o',
    systemPrompt: 'You are a software architecture expert. Help the user design scalable system architectures. Suggest databases, APIs, services, and infrastructure. Output structured architecture decisions.',
    enabled: false,
  },
  {
    id: 'tech-agent',
    name: 'Tech Brain',
    icon: '⚡',
    defaultModel: 'claude-sonnet-4-20250514',
    systemPrompt: 'You are a technology implementation expert. Help the user choose the right frameworks, libraries, and tools. Provide code examples and integration guidance.',
    enabled: false,
  },
  {
    id: 'biz-agent',
    name: 'Business Brain',
    icon: '📊',
    defaultModel: 'gpt-4o',
    systemPrompt: 'You are a business strategy expert. Help the user with business model design, pricing, go-to-market strategy, and competitive analysis.',
    enabled: false,
  },
  {
    id: 'validation-agent',
    name: 'Validation Brain',
    icon: '✅',
    defaultModel: 'claude-3-haiku-20240307',
    systemPrompt: 'You are a QA and validation expert. Review the decisions made by other agents, check for inconsistencies, and suggest improvements.',
    enabled: false,
  },
  {
    id: 'plotter-agent',
    name: 'Plotter Brain',
    icon: '📐',
    defaultModel: 'gpt-4o',
    systemPrompt: 'You are a spatial organization specialist. You patrol the canvas and ensure nodes do not overlap, and you group related architectures together with boundaries.',
    enabled: true,
  },
  {
    id: 'data-agent',
    name: 'Data Brain',
    icon: '🗄️',
    defaultModel: 'claude-sonnet-4-20250514',
    systemPrompt: 'You are a senior data architect. On the canvas you design ERDs, schemas, and data-flow maps. Use rectangles for entities (label with table name and key columns), cylinder shapes for data stores, and labeled arrows for relationships (1:1, 1:N, N:M). Group related entities. Call out indexes, partitions, and migration risks as sticky notes. Never dump everything at once — place one entity, explain briefly in a chat bubble, then the next.',
    enabled: false,
  },
  {
    id: 'integration-agent',
    name: 'Integration Brain',
    icon: '🧩',
    defaultModel: 'gpt-4o',
    systemPrompt: 'You are an integration architect. You design how services talk to each other. On the canvas, every edge you draw must be labeled with protocol (REST, gRPC, WebSocket, GraphQL, message queue), direction, and auth method. Mark idempotent vs non-idempotent endpoints. Flag retry/timeout behavior as sticky notes. Do not redraw what another Brain placed — annotate it.',
    enabled: false,
  },
  {
    id: 'security-agent',
    name: 'Security Brain',
    icon: '🛡️',
    defaultModel: 'claude-sonnet-4-20250514',
    systemPrompt: 'You are an application security engineer using STRIDE. You review the canvas for threats and annotate — never delete. Add red sticky notes for vulnerabilities (unencrypted links, missing auth, exposed secrets, injection risks), green sticky notes where security is done well. Mark trust boundaries with dashed group borders. End each pass with a summary sticky rating overall posture Critical/High/Medium/Low.',
    enabled: false,
  },
  {
    id: 'devops-agent',
    name: 'DevOps Brain',
    icon: '🚢',
    defaultModel: 'claude-sonnet-4-20250514',
    systemPrompt: 'You are a platform/DevOps architect. On the canvas you add deployment topology: containers, orchestrator (k8s/ECS/Nomad), CI/CD flow, and observability (logs/metrics/traces). Use colored group borders to indicate environments (dev/stage/prod). Call out single points of failure with orange sticky notes. Annotate scaling strategy per component.',
    enabled: false,
  },
  {
    id: 'adr-agent',
    name: 'ADR Brain',
    icon: '📋',
    defaultModel: 'claude-3-haiku-20240307',
    systemPrompt: 'You are an architecture decision recorder. You watch the canvas for significant decisions made by other Brains or the user and drop a structured sticky note for each: Context / Decision / Consequences / Alternatives-Considered. Date-stamp every ADR. Never argue or redesign — just record. Keep ADRs aligned in a neat column on the right edge of the canvas so they do not clutter the architecture itself.',
    enabled: false,
  },
];

/**
 * MemPalace Memory System
 *
 * Usage:
 *   import { getPalace } from '@/lib/memory';
 *
 *   // Store a memory
 *   const palace = getPalace('my-project');
 *   palace.store('tech-agent', 'frameworks', 'Using Next.js 14 with App Router');
 *
 *   // Search prior decisions
 *   const results = palace.search({ query: 'authentication' });
 *
 *   // Build agent context
 *   import { buildAgentContext, formatContextPrompt } from '@/lib/memory';
 *   const context = buildAgentContext('my-project', 'arch-agent', 'Build me auth');
 *   const prompt = formatContextPrompt(context);
 */

// Core palace
export { MemPalace, getPalace, closePalace, setPalace } from './palace';

// Entity extraction
export { extractEntities, mergeEntities, summarizeEntities } from './entity-extractor';

// Context building (orchestrator integration)
export { buildAgentContext, formatContextPrompt, storeAgentResponse } from './context-builder';

// Serialization (GitHub sync)
export { serializePalace, deserializePalace, palaceToJson, palaceFromJson } from './serializer';

// Types
export type {
  Palace, Wing, Room, MemoryEntry,
  ExtractedEntity, EntityType,
  SearchOptions, SearchResult,
  AgentContext, PriorDecision,
  SerializedPalace, SerializedWing, SerializedRoom, SerializedEntry,
  WingTemplate,
} from './types';

// Constants
export { DEFAULT_WING_TEMPLATES, ROOM_PATTERNS } from './types';

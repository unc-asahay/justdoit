/**
 * Entity Extractor — extract technology/framework/tool entities from agent responses.
 */

import type { ExtractedEntity, EntityType } from './types';

const ENTITY_EXTRACTION_PATTERNS: Record<EntityType, RegExp> = {
  technology: /\b(PostgreSQL|MySQL|Redis|MongoDB|SQLite|Elasticsearch|RabbitMQ|Kafka|S3|DynamoDB|Supabase|Firebase|PlanetScale|Neon)\b/gi,
  framework: /\b(React|Next\.js|Vue|Nuxt|Angular|Svelte|SvelteKit|Express|Fastify|NestJS|Django|FastAPI|Rails|Spring|Laravel)\b/gi,
  tool: /\b(Docker|Kubernetes|Terraform|GitHub|GitLab|Jenkins|Vercel|Netlify|Cloudflare|AWS|GCP|Azure|Figma|Storybook)\b/gi,
  architecture: /\b(REST|GraphQL|gRPC|tRPC|microservices?|monolith|serverless|event[\s-]?driven|CQRS|pub[\s-]?sub|webhook|SSR|SSG|ISR|edge[\s-]?computing)\b/gi,
  concept: /\b(authentication|authorization|caching|rate[\s-]?limiting|load[\s-]?balancing|CDN|CI\/CD|WebSocket|OAuth|JWT|SSO|RBAC|multi[\s-]?tenancy)\b/gi,
};

export function extractEntities(text: string): ExtractedEntity[] {
  const seen = new Map<string, ExtractedEntity>();
  const now = Date.now();

  for (const [type, pattern] of Object.entries(ENTITY_EXTRACTION_PATTERNS)) {
    const regex = new RegExp(pattern.source, pattern.flags);

    for (const match of text.matchAll(regex)) {
      const name = match[0];
      const key = `${name.toLowerCase()}:${type}`;

      if (seen.has(key)) {
        const existing = seen.get(key)!;
        existing.mentions++;
        existing.lastSeen = now;
      } else {
        seen.set(key, {
          name,
          type: type as EntityType,
          mentions: 1,
          firstSeen: now,
          lastSeen: now,
        });
      }
    }
  }

  return [...seen.values()];
}

export function mergeEntities(
  existing: ExtractedEntity[],
  incoming: ExtractedEntity[],
): ExtractedEntity[] {
  const merged = new Map<string, ExtractedEntity>();

  for (const e of existing) {
    merged.set(`${e.name.toLowerCase()}:${e.type}`, e);
  }

  for (const e of incoming) {
    const key = `${e.name.toLowerCase()}:${e.type}`;
    const prev = merged.get(key);
    if (prev) {
      prev.mentions += e.mentions;
      prev.lastSeen = Math.max(prev.lastSeen, e.lastSeen);
    } else {
      merged.set(key, { ...e });
    }
  }

  return [...merged.values()];
}

export function summarizeEntities(entities: ExtractedEntity[]): string {
  if (entities.length === 0) return 'No entities extracted yet.';

  const grouped: Record<string, string[]> = {};
  for (const e of entities) {
    if (!grouped[e.type]) grouped[e.type] = [];
    if (!grouped[e.type].includes(e.name)) {
      grouped[e.type].push(e.name);
    }
  }

  return Object.entries(grouped)
    .map(([type, names]) => `${type}: ${names.join(', ')}`)
    .join('. ');
}

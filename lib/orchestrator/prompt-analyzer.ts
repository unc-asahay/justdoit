/**
 * Prompt Analyzer — classify user prompts and extract entities.
 * Keyword-based (no AI call needed, instant).
 */

import type { PromptAnalysis, PromptIntent, ExtractedEntity } from './types';

const INTENT_KEYWORDS: Record<PromptIntent, string[]> = {
  design: [
    'ui', 'ux', 'design', 'layout', 'color', 'theme', 'font', 'typography',
    'responsive', 'mobile', 'component', 'interface', 'visual', 'dark mode',
    'light mode', 'animation', 'icon', 'spacing', 'grid', 'flex',
  ],
  architecture: [
    'architecture', 'system', 'database', 'api', 'service', 'microservice',
    'monolith', 'schema', 'infrastructure', 'deploy', 'scale', 'cache',
    'queue', 'event', 'auth', 'security', 'backend', 'server', 'diagram', 
    'flowchart', 'flow chart', 'draw a', 'visualize'
  ],
  technology: [
    'framework', 'library', 'package', 'npm', 'react', 'next', 'vue',
    'angular', 'express', 'node', 'python', 'rust', 'go', 'typescript',
    'prisma', 'drizzle', 'stripe', 'clerk', 'supabase', 'firebase', 'aws', 'vercel',
  ],
  business: [
    'business', 'pricing', 'revenue', 'model', 'market', 'competitor',
    'strategy', 'customer', 'acquisition', 'retention', 'monetize',
    'saas', 'b2b', 'b2c', 'freemium', 'subscription',
  ],
  validation: [
    'review', 'check', 'validate', 'verify', 'test', 'audit',
    'inconsistent', 'conflict', 'problem', 'issue', 'fix',
  ],
  diagram: [
    'sequence diagram', 'state machine',
    'state diagram', 'er diagram', 'entity relationship', 'timeline',
    'swimlane', 'swim lane', 'quadrant', 'venn', 'pyramid', 'tree diagram',
    'nested diagram', 'layers diagram', 'editorial diagram'
  ],
  general: [],
  multi: [],
};

const INTENT_TO_AGENTS: Record<PromptIntent, string[]> = {
  design:       ['design-agent'],
  architecture: ['arch-agent'],
  technology:   ['tech-agent'],
  business:     ['biz-agent'],
  validation:   ['validation-agent'],
  diagram:      ['diagram-agent'],
  general:      ['arch-agent'],
  multi:       [],
};

// ── Diagram Type Classifier ──────────────────────────────────────────────────

const DIAGRAM_TYPE_PATTERNS: Array<{ slug: string; keywords: string[] }> = [
  { slug: 'flowchart',    keywords: ['flowchart', 'flow chart', 'decision flow', 'process flow'] },
  { slug: 'sequence',     keywords: ['sequence', 'sequence diagram', 'message flow', 'handshake'] },
  { slug: 'state',        keywords: ['state machine', 'state diagram', 'fsm', 'finite state'] },
  { slug: 'er',           keywords: ['er diagram', 'entity relationship', 'data model', 'schema diagram'] },
  { slug: 'timeline',     keywords: ['timeline', 'roadmap', 'milestones', 'chronolog'] },
  { slug: 'swimlane',     keywords: ['swimlane', 'swim lane', 'cross-functional', 'responsibility'] },
  { slug: 'quadrant',     keywords: ['quadrant', '2x2', 'matrix', 'impact vs effort', 'priority matrix'] },
  { slug: 'venn',         keywords: ['venn', 'overlap', 'intersection'] },
  { slug: 'pyramid',      keywords: ['pyramid', 'hierarchy', 'funnel'] },
  { slug: 'tree',         keywords: ['tree', 'org chart', 'taxonomy', 'hierarchy tree', 'tree diagram'] },
  { slug: 'nested',       keywords: ['nested', 'containment', 'russian doll', 'nested diagram'] },
  { slug: 'layers',       keywords: ['layers', 'stack', 'layer diagram', 'tech stack'] },
  { slug: 'architecture', keywords: ['architecture', 'system diagram', 'infra', 'topology'] },
];

/**
 * Detect which specific diagram type the user is asking for.
 * Returns the slug (e.g. 'flowchart') or 'architecture' as default.
 */
export function detectDiagramType(prompt: string): string {
  const lower = prompt.toLowerCase();
  let bestSlug = 'architecture'; // default
  let bestScore = 0;

  for (const { slug, keywords } of DIAGRAM_TYPE_PATTERNS) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestSlug = slug;
    }
  }

  return bestSlug;
}

function extractEntities(prompt: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];
  const lower = prompt.toLowerCase();

  // Technology names
  const techPatterns = [
    'react', 'next.js', 'nextjs', 'vue', 'angular', 'svelte',
    'express', 'fastify', 'nest.js', 'django', 'flask',
    'postgresql', 'postgres', 'mysql', 'mongodb', 'redis', 'sqlite',
    'prisma', 'drizzle', 'typeorm', 'sequelize',
    'stripe', 'clerk', 'auth0', 'supabase', 'firebase', 'aws', 'vercel',
    'docker', 'kubernetes', 'terraform',
    'graphql', 'trpc', 'rest', 'grpc',
    'tailwind', 'shadcn', 'material', 'chakra',
  ];

  for (const tech of techPatterns) {
    if (lower.includes(tech)) {
      entities.push({ text: tech, type: 'technology' });
    }
  }

  // Concept extraction
  const conceptPatterns: Array<{ pattern: RegExp; type: ExtractedEntity['type'] }> = [
    { pattern: /\b(auth(?:entication)?|login|signup|sso)\b/i, type: 'concept' },
    { pattern: /\b(billing|payment|subscription|checkout)\b/i, type: 'concept' },
    { pattern: /\b(dashboard|admin|analytics|reporting)\b/i, type: 'concept' },
    { pattern: /\b(real.?time|websocket|live|streaming)\b/i, type: 'concept' },
    { pattern: /\b(file.?upload|storage|cdn|media)\b/i, type: 'concept' },
    { pattern: /\b(email|notification|push|sms)\b/i, type: 'concept' },
    { pattern: /\b(api|endpoint|webhook|integration)\b/i, type: 'concept' },
  ];

  for (const { pattern, type } of conceptPatterns) {
    const match = prompt.match(pattern);
    if (match) {
      entities.push({ text: match[1], type });
    }
  }

  return entities;
}

function classifyComplexity(prompt: string, entities: ExtractedEntity[]): 'simple' | 'moderate' | 'complex' {
  const wordCount = prompt.split(/\s+/).length;
  if (wordCount > 50 || entities.length > 5) return 'complex';
  if (wordCount > 20 || entities.length > 2) return 'moderate';
  return 'simple';
}

export function analyzePrompt(prompt: string): PromptAnalysis {
  const lower = prompt.toLowerCase();
  const entities = extractEntities(prompt);
  const complexity = classifyComplexity(prompt, entities);

  // Score each intent
  const scores: Record<PromptIntent, number> = {
    design: 0, architecture: 0, technology: 0,
    business: 0, validation: 0, diagram: 0, general: 0, multi: 0,
  };

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (intent === 'general' || intent === 'multi') continue;
    for (const kw of keywords) {
      if (lower.includes(kw)) scores[intent as PromptIntent]++;
    }
  }

  const threshold = 2;
  const matched = (Object.entries(scores) as [PromptIntent, number][])
    .filter(([, score]) => score >= threshold);

  let intent: PromptIntent;
  let subIntents: PromptIntent[] = [];

  if (matched.length === 0) {
    intent = 'general';
  } else if (matched.length >= 2) {
    intent = 'multi';
    subIntents = matched.map(([i]) => i);
  } else {
    intent = matched[0][0];
  }

  const mapped = INTENT_TO_AGENTS[intent] ?? [];
  const suggestedAgents = mapped.length === 0
    ? subIntents.flatMap(s => INTENT_TO_AGENTS[s] ?? [])
    : mapped;

  return { intent, subIntents, entities, complexity, suggestedAgents, rawPrompt: prompt };
}

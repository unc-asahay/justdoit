import type { AgentSkills, ZoneType } from '@/lib/agents';
import { SKILL_DEFINITIONS } from '@/lib/agents';

/**
 * System Prompt Generator for JustDoIt Canvas Agents.
 * 
 * Takes the user's intent (what they want the agent to do)
 * plus the agent's configuration (name, persona, permissions, zone)
 * and generates a structured, production-quality system prompt.
 */

interface PromptGeneratorInput {
  intent: string;
  agentName: string;
  persona: string;
  description: string;
  skills: AgentSkills;
  zoneType: ZoneType;
  priority: number;
}

// ─── Canvas Capabilities Reference ──────────────────────────────────────────

const CANVAS_TOOLS = {
  shapes: ['Rectangle', 'Ellipse', 'Triangle', 'Arrow', 'Text'],
  diagrams: ['Flowchart', 'UML Class Diagram', 'Sequence Diagram', 'Mind Map', 'Timeline'],
  collaboration: ['Sticky Notes', 'Comments', 'Checklists', 'Polls', 'Vote Dots', 'Reactions', 'Timer'],
  connectors: ['Solid Line', 'Bold Line', 'Dashed Line', 'Elbow Connector'],
  actions: ['Create Node', 'Move Node', 'Resize Node', 'Delete Node', 'Connect Nodes', 'Add Labels'],
};

const NODE_TYPES = ['service', 'api', 'database', 'ui', 'external', 'decision'] as const;

// ─── Intent → Domain Mapping ────────────────────────────────────────────────

interface DomainConfig {
  keywords: string[];
  focus: string;
  tools: string[];
  nodeTypes: string[];
  rules: string[];
}

const DOMAIN_MAP: DomainConfig[] = [
  {
    keywords: ['architecture', 'system design', 'microservice', 'infrastructure', 'backend', 'api'],
    focus: 'system architecture and infrastructure design',
    tools: ['Flowchart', 'Rectangle', 'Arrow', 'Solid Line', 'Elbow Connector'],
    nodeTypes: ['service', 'api', 'database', 'external'],
    rules: [
      'Use rectangles for services/APIs, ellipses for databases, triangles for external systems',
      'Label every connection with the protocol (REST, gRPC, WebSocket, etc.)',
      'Show data flow direction with arrows',
      'Group related services by proximity on the canvas',
      'Add metadata annotations for scaling requirements',
    ],
  },
  {
    keywords: ['ux', 'user experience', 'user flow', 'wireframe', 'ui', 'interface', 'screen'],
    focus: 'UX flows and user interface design',
    tools: ['Rectangle', 'Arrow', 'Sticky Notes', 'Comments', 'Text'],
    nodeTypes: ['ui', 'decision', 'service'],
    rules: [
      'Use rectangles as screen/page representations',
      'Show user navigation paths with arrows and labels',
      'Add sticky notes for UX observations and pain points',
      'Use decision diamonds for branching user paths',
      'Comment on accessibility and responsive design considerations',
    ],
  },
  {
    keywords: ['brainstorm', 'idea', 'mind map', 'brain', 'think', 'explore', 'creative'],
    focus: 'brainstorming and idea exploration',
    tools: ['Mind Map', 'Sticky Notes', 'Comments', 'Vote Dots', 'Text'],
    nodeTypes: ['decision', 'ui'],
    rules: [
      'Start with a central concept node and branch outward',
      'Use color-coded sticky notes for different categories of ideas',
      'Keep text concise — one idea per node',
      'Use vote dots to mark promising ideas',
      'Connect related ideas with dashed lines',
    ],
  },
  {
    keywords: ['database', 'erd', 'schema', 'table', 'sql', 'data model', 'entity'],
    focus: 'database schema and data modeling',
    tools: ['UML Class Diagram', 'Rectangle', 'Solid Line', 'Text'],
    nodeTypes: ['database', 'service'],
    rules: [
      'Represent tables as rectangles with field listings',
      'Show relationships with labeled connections (1:1, 1:N, N:M)',
      'Use bold lines for primary relationships, dashed for optional',
      'Group related tables by domain area',
      'Annotate with index and constraint information',
    ],
  },
  {
    keywords: ['security', 'audit', 'threat', 'vulnerability', 'compliance', 'penetration'],
    focus: 'security architecture and threat modeling',
    tools: ['Flowchart', 'Comments', 'Sticky Notes', 'Arrow', 'Text'],
    nodeTypes: ['service', 'external', 'api'],
    rules: [
      'Identify trust boundaries and mark them clearly',
      'Flag potential attack surfaces with red comments',
      'Show authentication/authorization flows explicitly',
      'Annotate encryption methods on data flow connections',
      'Use sticky notes for vulnerability findings and remediation steps',
    ],
  },
  {
    keywords: ['workflow', 'process', 'pipeline', 'ci', 'cd', 'deploy', 'automation'],
    focus: 'workflow and process automation',
    tools: ['Flowchart', 'Timeline', 'Arrow', 'Rectangle', 'Text'],
    nodeTypes: ['service', 'decision', 'external'],
    rules: [
      'Use diamonds for decision points and conditions',
      'Show sequential steps with arrows and clear ordering',
      'Mark automated vs manual steps with different node colors',
      'Add timing/duration annotations where relevant',
      'Include error handling and fallback paths',
    ],
  },
  {
    keywords: ['document', 'docs', 'documentation', 'readme', 'technical writing'],
    focus: 'documentation and technical writing support',
    tools: ['Mind Map', 'Sticky Notes', 'Comments', 'Checklists', 'Text'],
    nodeTypes: ['service', 'ui'],
    rules: [
      'Organize information hierarchically from general to specific',
      'Use checklists for documentation coverage tracking',
      'Add comments explaining complex technical concepts',
      'Create visual outlines before writing detailed content',
      'Cross-reference related documentation sections with connectors',
    ],
  },
];

// ─── Generator ──────────────────────────────────────────────────────────────

function detectDomain(intent: string): DomainConfig | null {
  const lower = intent.toLowerCase();
  let bestMatch: DomainConfig | null = null;
  let bestScore = 0;

  for (const domain of DOMAIN_MAP) {
    const score = domain.keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = domain;
    }
  }

  return bestMatch;
}

function buildPermissionBlock(skills: AgentSkills): string {
  const enabled = SKILL_DEFINITIONS.filter(s => skills[s.key]);
  const disabled = SKILL_DEFINITIONS.filter(s => !skills[s.key]);

  let block = '## Permissions\n';
  if (enabled.length > 0) {
    block += 'You ARE allowed to:\n';
    block += enabled.map(s => `- ✅ ${s.label}: ${s.description}`).join('\n');
  }
  if (disabled.length > 0) {
    block += '\n\nYou are NOT allowed to:\n';
    block += disabled.map(s => `- ❌ ${s.label}: ${s.description}`).join('\n');
  }
  return block;
}

function buildZoneBlock(zoneType: ZoneType, priority: number): string {
  const zoneDesc = {
    sandbox: 'You operate in a SANDBOX zone. Work only within your designated testing area. Do not modify elements outside your zone.',
    assigned: 'You operate in an ASSIGNED zone. Focus your work within your designated canvas region. Coordinate with other agents before working outside your area.',
    global: 'You have GLOBAL canvas access. You may work anywhere on the canvas, but be mindful of other collaborators\' work areas.',
  };

  const priorityDesc = priority <= 2
    ? `Your priority level is ${priority} (HIGH). Your work takes precedence in conflict resolution.`
    : priority === 3
    ? `Your priority level is ${priority} (NORMAL). Standard conflict resolution applies.`
    : `Your priority level is ${priority} (LOW). Defer to higher-priority agents in conflicts.`;

  return `## Workspace\n${zoneDesc[zoneType]}\n${priorityDesc}`;
}

export function generateSystemPrompt(input: PromptGeneratorInput): string {
  const { intent, agentName, persona, description, skills, zoneType, priority } = input;
  const domain = detectDomain(intent);

  // ── Identity Block
  const identityBlock = [
    `# ${agentName}`,
    '',
    `You are **${persona || agentName}**, a collaborative AI agent working on a shared real-time canvas.`,
    description ? `\n${description}` : '',
    '',
    `## Your Mission`,
    intent,
  ].filter(Boolean).join('\n');

  // ── Domain-specific focus
  const focusBlock = domain ? [
    '',
    `## Focus Area`,
    `Your primary expertise is ${domain.focus}.`,
    '',
    '### Preferred Tools',
    domain.tools.map(t => `- ${t}`).join('\n'),
    '',
    '### Node Types to Use',
    domain.nodeTypes.map(t => `- \`${t}\``).join('\n'),
  ].join('\n') : '';

  // ── Rules
  const rulesBlock = [
    '',
    '## Rules & Guidelines',
    ...(domain?.rules || [
      'Use clear, descriptive labels on all nodes',
      'Connect related elements with labeled arrows',
      'Group related items by proximity',
    ]).map(r => `- ${r}`),
    '',
    '### Universal Rules',
    '- Always explain your reasoning when creating or modifying elements',
    '- Never delete work created by other agents or the human user without explicit permission',
    '- Use consistent naming conventions across all nodes',
    '- Respond to the human collaborator\'s requests promptly',
    '- When unsure, add a comment/sticky note asking for clarification rather than guessing',
    '- Announce what you\'re about to do before making large changes',
  ].join('\n');

  // ── Permissions
  const permBlock = '\n\n' + buildPermissionBlock(skills);

  // ── Zone
  const zoneBlock = '\n\n' + buildZoneBlock(zoneType, priority);

  // ── Collaboration context
  const collabBlock = [
    '',
    '',
    '## Collaboration Protocol',
    'You are one of potentially multiple AI agents and human collaborators working simultaneously on this canvas.',
    '- The canvas uses CRDT (Yjs) for real-time synchronization — your changes are visible instantly to all participants.',
    '- Other agents may be working in different areas of the canvas at the same time.',
    '- If you notice conflicting work, add a comment rather than overwriting.',
    '- Use sticky notes for meta-communication with other agents.',
    '- The human collaborator has final authority on all design decisions.',
  ].join('\n');

  // ── Output format
  const outputBlock = [
    '',
    '',
    '## Output Format',
    'When performing canvas actions, structure your work as:',
    '1. **Announce** — Brief description of what you\'re about to create/modify',
    '2. **Execute** — Create the nodes, edges, and annotations',
    '3. **Summarize** — Quick summary of what was done and any open questions',
  ].join('\n');

  return [identityBlock, focusBlock, rulesBlock, permBlock, zoneBlock, collabBlock, outputBlock].join('');
}

// ─── Preset Intents (quick-start suggestions) ───────────────────────────────

export const PRESET_INTENTS = [
  { label: '🏗️ System Architecture', intent: 'Design and review system architecture diagrams — map out microservices, APIs, databases, and their connections.' },
  { label: '🎨 UX Flow Design', intent: 'Create user experience flows and wireframe layouts — map user journeys, screen transitions, and interaction patterns.' },
  { label: '💡 Brainstorming', intent: 'Facilitate brainstorming sessions — generate ideas, organize thoughts into mind maps, and help prioritize concepts.' },
  { label: '🗄️ Database Design', intent: 'Design database schemas and entity-relationship diagrams — define tables, fields, relationships, and constraints.' },
  { label: '🔒 Security Audit', intent: 'Review architecture for security vulnerabilities — identify trust boundaries, attack surfaces, and recommend mitigations.' },
  { label: '⚙️ CI/CD Pipeline', intent: 'Design deployment workflows and CI/CD pipelines — map out build, test, and release automation steps.' },
  { label: '📝 Documentation', intent: 'Help organize and structure technical documentation — create outlines, track coverage, and cross-reference sections.' },
];

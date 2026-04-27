/**
 * Canvas Bridge — convert structured decisions into canvas actions.
 * Improved edge inference with sequential architecture chains.
 */

import type {
  StructuredDecision,
  CanvasAction,
  NodeAction,
  EdgeAction,
  GroupAction,
  DiagramAction,
} from '../types';

function categoryToNodeType(category: string): NodeAction['type'] {
  const map: Record<string, NodeAction['type']> = {
    'database':     'database',
    'db':           'database',
    'storage':      'database',
    'api':          'api',
    'endpoint':     'api',
    'auth':         'service',
    'service':      'service',
    'backend':      'service',
    'frontend':     'ui',
    'design':       'ui',
    'ui':           'ui',
    'component':    'ui',
    'external':     'external',
    'third-party':  'external',
    'integration':  'external',
    'architecture':'service',
    'technology':   'service',
  };
  return map[category.toLowerCase()] ?? 'decision';
}

// Tier-lane layout: every decision's category maps to a tier, each tier is a
// horizontal lane at a fixed Y. Within a lane, items stack left-to-right in
// the order they arrive. No overlap by construction — lanes are 220px apart
// (node height 72 + group padding), items 280px apart (node width 200 + gap).

const LANE_Y: Record<number, number> = { 0: 100, 1: 320, 2: 540, 3: 760, 4: 980 };
const FALLBACK_LANE_Y = 1200;
const LANE_X_START = 100;
const NODE_SPACING = 280;

function tierFor(category: string): number {
  return TIER_ORDER[category.toLowerCase()] ?? 5;
}

function computePositions(decisions: StructuredDecision[]): Map<string, { x: number; y: number }> {
  const byTier = new Map<number, StructuredDecision[]>();
  for (const d of decisions) {
    const t = tierFor(d.category);
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t)!.push(d);
  }
  const positions = new Map<string, { x: number; y: number }>();
  for (const [tier, lane] of byTier) {
    const y = LANE_Y[tier] ?? FALLBACK_LANE_Y + (tier - 5) * 220;
    lane.forEach((d, idx) => {
      positions.set(d.id, { x: LANE_X_START + idx * NODE_SPACING, y });
    });
  }
  return positions;
}

// Shared tier map — used by both positioning and inferEdges (below).
const TIER_ORDER: Record<string, number> = {
  'ui': 0, 'frontend': 0, 'design': 0, 'component': 0,
  'api': 1, 'endpoint': 1, 'auth': 1,
  'service': 2, 'backend': 2, 'architecture': 2, 'technology': 2,
  'database': 3, 'db': 3, 'storage': 3,
  'external': 4, 'third-party': 4, 'integration': 4,
};

function inferEdgeType(
  sourceCategory: string,
  targetCategory: string,
): EdgeAction['type'] {
  if (sourceCategory === 'api' || targetCategory === 'api') return 'api_call';
  if (sourceCategory === 'database' || targetCategory === 'database') return 'data_flow';
  return 'dependency';
}

/**
 * Improved edge inference:
 * 1. Creates a logical architecture flow: UI → API → Service → Database
 * 2. Links decisions that mention each other by name
 * 3. Links sequential items within the same category
 */
function inferEdges(decisions: StructuredDecision[]): EdgeAction[] {
  const edges: EdgeAction[] = [];
  const edgeKeys = new Set<string>();
  
  const addEdge = (srcId: string, tgtId: string, label: string, type: EdgeAction['type']) => {
    const key = `${srcId}-${tgtId}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    edges.push({
      id: `edge-${srcId}-${tgtId}`,
      sourceId: `node-${srcId}`,
      targetId: `node-${tgtId}`,
      label,
      type,
    });
  };

  // ── Strategy 1: Architecture layer flow ──
  // Uses the shared TIER_ORDER constant defined above.
  const sorted = [...decisions].sort((a, b) => tierFor(a.category) - tierFor(b.category));

  // Connect adjacent tiers
  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (tierFor(current.category) !== tierFor(next.category)) {
      addEdge(current.id, next.id, '', inferEdgeType(current.category, next.category));
    }
  }

  // ── Strategy 2: Text-based cross-references ──
  for (let i = 0; i < decisions.length; i++) {
    for (let j = i + 1; j < decisions.length; j++) {
      const a = decisions[i];
      const b = decisions[j];

      const aText = `${a.decision} ${a.reasoning}`.toLowerCase();
      const bText = `${b.decision} ${b.reasoning}`.toLowerCase();

      if (
        aText.includes(b.decision.toLowerCase()) ||
        bText.includes(a.decision.toLowerCase())
      ) {
        addEdge(a.id, b.id, 'uses', inferEdgeType(a.category, b.category));
      }
    }
  }

  // ── Strategy 3: Same-category sequential links ──
  const byCategory = new Map<string, StructuredDecision[]>();
  for (const d of decisions) {
    const list = byCategory.get(d.category) ?? [];
    list.push(d);
    byCategory.set(d.category, list);
  }

  for (const [, list] of byCategory) {
    for (let i = 0; i < list.length - 1; i++) {
      addEdge(list[i].id, list[i + 1].id, '', 'dependency');
    }
  }

  return edges;
}

function groupByCategory(decisions: StructuredDecision[]): GroupAction[] {
  const groups = new Map<string, string[]>();

  for (const d of decisions) {
    const key = d.category;
    const list = groups.get(key) ?? [];
    list.push(`node-${d.id}`);
    groups.set(key, list);
  }

  return [...groups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([category, childIds]) => ({
      id: `group-${category}`,
      label: category.charAt(0).toUpperCase() + category.slice(1),
      childIds,
    }));
}

export function mapToCanvasActions(decisions: StructuredDecision[]): CanvasAction[] {
  const actions: CanvasAction[] = [];
  const positions = computePositions(decisions);

  // 1. Create a node for each decision (or a diagram for diagram-type decisions)
  decisions.forEach((decision) => {
    // Diagram decisions contain raw HTML — emit as create_diagram instead of create_node
    if (decision.category === 'diagram') {
      const diagramAction: DiagramAction = {
        id: `diagram-${decision.id}`,
        htmlContent: decision.decision,
        width: 800,
        height: 600,
        position: { x: 100, y: 100 },
      };
      actions.push({ type: 'create_diagram', payload: diagramAction });
      return;
    }

    const nodeAction: NodeAction = {
      id: `node-${decision.id}`,
      label: decision.decision,
      type: categoryToNodeType(decision.category),
      description: decision.reasoning,
      metadata: {
        category: decision.category,
        confidence: decision.confidence,
        agentId: decision.agentId,
      },
      position: positions.get(decision.id) ?? { x: 100, y: 100 },
    };

    actions.push({ type: 'create_node', payload: nodeAction });
  });

  // 2. Create edges between related decisions
  const edges = inferEdges(decisions);
  for (const edge of edges) {
    actions.push({ type: 'create_edge', payload: edge });
  }

  // 3. Group related nodes by category
  const groups = groupByCategory(decisions);
  for (const group of groups) {
    actions.push({ type: 'create_group', payload: group });
  }

  return actions;
}

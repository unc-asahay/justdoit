'use client';

import { useCallback, useRef } from 'react';

interface CanvasNode {
  id: string;
  label: string;
  type: string;
  description?: string;
  x: number;
  y: number;
}

interface CanvasEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
  type: string;
}

/**
 * useCanvasContext — serializes the current canvas state into a compact
 * text summary that gets injected into AI prompts so the AI knows
 * what's already on the canvas and can reference/connect to existing nodes.
 */
export function useCanvasContext() {
  // Refs to the current Yjs maps, set by InteractiveCanvas
  const nodesRef = useRef<Map<string, CanvasNode>>(new Map());
  const edgesRef = useRef<Map<string, CanvasEdge>>(new Map());

  /** Called by InteractiveCanvas to update the context refs */
  const syncCanvas = useCallback((
    nodes: CanvasNode[],
    edges: CanvasEdge[],
  ) => {
    nodesRef.current = new Map(nodes.map(n => [n.id, n]));
    edgesRef.current = new Map(edges.map(e => [e.id, e]));
  }, []);

  /** Generate a compact text summary of the canvas for AI context */
  const getCanvasContext = useCallback((): string => {
    const nodes = Array.from(nodesRef.current.values());
    const edges = Array.from(edgesRef.current.values());

    if (nodes.length === 0) return '';

    const lines: string[] = [
      `Current canvas has ${nodes.length} node(s) and ${edges.length} connection(s):`,
      '',
      'NODES:',
    ];

    for (const node of nodes) {
      const label = node.label || '(unnamed)';
      lines.push(`  - [${node.id}] "${label}" (type: ${node.type}, position: ${Math.round(node.x)},${Math.round(node.y)})`);
    }

    if (edges.length > 0) {
      lines.push('');
      lines.push('CONNECTIONS:');
      for (const edge of edges) {
        const src = nodesRef.current.get(edge.sourceId);
        const tgt = nodesRef.current.get(edge.targetId);
        const srcLabel = src?.label || edge.sourceId;
        const tgtLabel = tgt?.label || edge.targetId;
        lines.push(`  - "${srcLabel}" → "${tgtLabel}" (${edge.type}${edge.label ? `, label: "${edge.label}"` : ''})`);
      }
    }

    lines.push('');
    lines.push('INSTRUCTIONS: Reference existing nodes by their labels when adding connections. Place new nodes in positions that avoid overlap with existing ones.');

    return lines.join('\n');
  }, []);

  return { syncCanvas, getCanvasContext };
}

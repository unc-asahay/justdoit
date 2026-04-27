'use client';

/**
 * Canvas Bridge — Tool → WriteRequest → ValidationGate → Canvas
 *
 * Converts toolbar tool activations into validated canvas actions.
 * Integrates with the conflict system (step-09) to ensure all
 * tool actions pass through the 5-layer validation pipeline.
 */

import { useCallback } from 'react';
import type { WriteRequest } from '@/lib/conflict';
import type { CanvasAction, NodeAction } from '@/lib/orchestrator/types';
import type { FigJamNodeKind, StickyColor } from '../tools/types';
import { STICKY_COLORS } from '../tools/types';

interface UseToolbarActionsReturn {
  createStickyNote: (x: number, y: number, text: string, color: StickyColor) => WriteRequest;
  createVoteDot: (x: number, y: number, color: string) => WriteRequest;
  createReaction: (x: number, y: number, emoji: string) => WriteRequest;
  createComment: (x: number, y: number, text: string, author: string) => WriteRequest;
  createPoll: (x: number, y: number, title: string, options: string[]) => WriteRequest;
  createChecklist: (x: number, y: number, title: string, items: string[]) => WriteRequest;
  createDiagramShape: (x: number, y: number, diagramType: string) => WriteRequest;
}

function requestId(): string {
  return `wr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nodeId(kind: string): string {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useToolbarActions(agentId: string = 'user'): UseToolbarActionsReturn {

  const createStickyNote = useCallback((x: number, y: number, text: string, color: StickyColor): WriteRequest => {
    const id = nodeId('sticky');
    const colors = STICKY_COLORS[color];
    return {
      id: requestId(),
      agentId,
      timestamp: Date.now(),
      position: { x, y },
      action: {
        type: 'create_node',
        payload: {
          id,
          label: text || 'New Sticky',
          type: 'ui',
          description: text,
          metadata: {
            nodeKind: 'sticky-note' as FigJamNodeKind,
            color,
            fill: colors.fill,
            border: colors.border,
            author: agentId,
          },
          position: { x, y },
        } as unknown as CanvasAction['payload'],
      } as CanvasAction,
    };
  }, [agentId]);

  const createVoteDot = useCallback((x: number, y: number, color: string): WriteRequest => {
    return {
      id: requestId(),
      agentId,
      timestamp: Date.now(),
      position: { x, y },
      action: {
        type: 'create_node',
        payload: {
          id: nodeId('vote'),
          label: '●',
          type: 'ui',
          metadata: { nodeKind: 'vote-dot' as FigJamNodeKind, color, voter: agentId },
          position: { x, y },
        } as unknown as CanvasAction['payload'],
      } as CanvasAction,
    };
  }, [agentId]);

  const createReaction = useCallback((x: number, y: number, emoji: string): WriteRequest => {
    return {
      id: requestId(),
      agentId,
      timestamp: Date.now(),
      position: { x, y },
      action: {
        type: 'create_node',
        payload: {
          id: nodeId('reaction'),
          label: emoji,
          type: 'ui',
          metadata: { nodeKind: 'reaction' as FigJamNodeKind, emoji, reactor: agentId },
          position: { x, y },
        } as unknown as CanvasAction['payload'],
      } as CanvasAction,
    };
  }, [agentId]);

  const createComment = useCallback((x: number, y: number, text: string, author: string): WriteRequest => {
    return {
      id: requestId(),
      agentId,
      timestamp: Date.now(),
      position: { x, y },
      action: {
        type: 'create_node',
        payload: {
          id: nodeId('comment'),
          label: text,
          type: 'ui',
          description: text,
          metadata: { nodeKind: 'comment' as FigJamNodeKind, author, timestamp: String(Date.now()) },
          position: { x, y },
        } as unknown as CanvasAction['payload'],
      } as CanvasAction,
    };
  }, [agentId]);

  const createPoll = useCallback((x: number, y: number, title: string, options: string[]): WriteRequest => {
    return {
      id: requestId(),
      agentId,
      timestamp: Date.now(),
      position: { x, y },
      action: {
        type: 'create_node',
        payload: {
          id: nodeId('poll'),
          label: title,
          type: 'ui',
          metadata: {
            nodeKind: 'poll-widget' as FigJamNodeKind,
            options: JSON.stringify(options),
          },
          position: { x, y },
        } as unknown as CanvasAction['payload'],
      } as CanvasAction,
    };
  }, [agentId]);

  const createChecklist = useCallback((x: number, y: number, title: string, items: string[]): WriteRequest => {
    return {
      id: requestId(),
      agentId,
      timestamp: Date.now(),
      position: { x, y },
      action: {
        type: 'create_node',
        payload: {
          id: nodeId('checklist'),
          label: title,
          type: 'ui',
          metadata: {
            nodeKind: 'checklist' as FigJamNodeKind,
            items: JSON.stringify(items),
          },
          position: { x, y },
        } as unknown as CanvasAction['payload'],
      } as CanvasAction,
    };
  }, [agentId]);

  const createDiagramShape = useCallback((x: number, y: number, diagramType: string): WriteRequest => {
    const shapeLabels: Record<string, string> = {
      flowchart: 'Decision',
      uml: 'ClassName',
      sequence: 'Lifeline',
      mindmap: 'Central Idea',
      timeline: 'Event',
    };
    return {
      id: requestId(),
      agentId,
      timestamp: Date.now(),
      position: { x, y },
      action: {
        type: 'create_node',
        payload: {
          id: nodeId(diagramType),
          label: shapeLabels[diagramType] ?? 'Shape',
          type: 'ui',
          metadata: { diagramType },
          position: { x, y },
        } as unknown as CanvasAction['payload'],
      } as CanvasAction,
    };
  }, [agentId]);

  return {
    createStickyNote,
    createVoteDot,
    createReaction,
    createComment,
    createPoll,
    createChecklist,
    createDiagramShape,
  };
}

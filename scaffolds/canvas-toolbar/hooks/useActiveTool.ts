'use client';

/**
 * Tool Selection State Machine
 *
 * Manages which tool is currently active.
 * Tools can be toggled (click active tool = deselect).
 * Only one tool active at a time.
 */

import { useState, useCallback } from 'react';
import type { ActiveToolId, ToolDef } from '../tools/types';
import { DRAWING_TOOLS, FIGJAM_TOOLS, DIAGRAM_TOOLS, CONNECTOR_TOOLS, CONTROL_TOOLS } from '../tools/types';

interface UseActiveToolReturn {
  activeTool: ActiveToolId;
  setActiveTool: (toolId: ActiveToolId) => void;
  isDrawingTool: boolean;
  isFigJamTool: boolean;
  isDiagramTool: boolean;
  isConnectorTool: boolean;
  getActiveDef: () => ToolDef | null;
  clearTool: () => void;
}

export function useActiveTool(): UseActiveToolReturn {
  const [activeTool, setActiveToolState] = useState<ActiveToolId>('select');

  const setActiveTool = useCallback((toolId: ActiveToolId) => {
    setActiveToolState(prev => (prev === toolId ? null : toolId));
  }, []);

  const clearTool = useCallback(() => {
    setActiveToolState(null);
  }, []);

  const isDrawingTool = DRAWING_TOOLS.some(t => t.id === activeTool);
  const isFigJamTool = FIGJAM_TOOLS.some(t => t.id === activeTool);
  const isDiagramTool = DIAGRAM_TOOLS.some(t => t.id === activeTool);
  const isConnectorTool = CONNECTOR_TOOLS.some(t => t.id === activeTool);
  const isControlTool = CONTROL_TOOLS.some(t => t.id === activeTool);

  const getActiveDef = useCallback((): ToolDef | null => {
    if (!activeTool) return null;
    const allTools = [...DRAWING_TOOLS, ...FIGJAM_TOOLS, ...DIAGRAM_TOOLS, ...CONNECTOR_TOOLS, ...CONTROL_TOOLS];
    return allTools.find(t => t.id === activeTool) ?? null;
  }, [activeTool]);

  return {
    activeTool,
    setActiveTool,
    isDrawingTool,
    isFigJamTool,
    isDiagramTool,
    isConnectorTool,
    getActiveDef,
    clearTool,
  };
}

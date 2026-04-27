'use client';

import { useCallback, useEffect } from 'react';
import { ToolButton } from './ToolButton';
import { useActiveTool } from './hooks/useActiveTool';
import {
  DRAWING_TOOLS,
  FIGJAM_TOOLS,
  DIAGRAM_TOOLS,
  CONNECTOR_TOOLS,
} from './tools/types';
import type { ToolDef } from './tools/types';
import './toolbar.css';

interface CanvasToolbarProps {
  onToolChange?: (toolId: string | null) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomFit?: () => void;
}

export function CanvasToolbar({
  onToolChange,
  onUndo,
  onRedo,
  onZoomIn,
  onZoomOut,
  onZoomFit,
}: CanvasToolbarProps) {
  const { activeTool, setActiveTool } = useActiveTool();

  const handleToolClick = useCallback((tool: ToolDef) => {
    const newTool = activeTool === tool.id ? null : tool.id;
    setActiveTool(newTool);
    onToolChange?.(newTool);
  }, [activeTool, setActiveTool, onToolChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const allTools = [...DRAWING_TOOLS, ...FIGJAM_TOOLS, ...DIAGRAM_TOOLS];
    const shortcutMap = new Map(
      allTools.filter(t => t.shortcut).map(t => [t.shortcut!.toLowerCase(), t])
    );

    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const tool = shortcutMap.get(e.key.toLowerCase());
      if (tool) {
        e.preventDefault();
        handleToolClick(tool);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleToolClick]);

  const renderTools = (tools: ToolDef[]) =>
    tools.map(tool => (
      <ToolButton
        key={tool.id}
        tool={tool}
        isActive={activeTool === tool.id}
        accentColor="#2563eb"
        onClick={() => handleToolClick(tool)}
      />
    ));

  return (
    <div
      className="flex items-center gap-0.5 px-2 py-1.5 rounded-xl"
      role="toolbar"
      aria-label="Canvas tools"
      style={{
        backgroundColor: 'var(--toolbar-bg)',
        border: '1px solid var(--toolbar-border)',
        boxShadow: '0 4px 24px var(--toolbar-shadow)',
      }}
    >
      {/* Drawing tools */}
      <div className="flex items-center gap-0.5">
        {renderTools(DRAWING_TOOLS)}
      </div>

      <div className="w-px h-6 mx-1" style={{ backgroundColor: 'var(--border-color)' }} />

      {/* FigJam tools */}
      <div className="flex items-center gap-0.5">
        {renderTools(FIGJAM_TOOLS)}
      </div>

      <div className="w-px h-6 mx-1" style={{ backgroundColor: 'var(--border-color)' }} />

      {/* Diagram tools */}
      <div className="flex items-center gap-0.5">
        {renderTools(DIAGRAM_TOOLS)}
      </div>

      <div className="w-px h-6 mx-1" style={{ backgroundColor: 'var(--border-color)' }} />

      {/* Connector tools */}
      <div className="flex items-center gap-0.5">
        {renderTools(CONNECTOR_TOOLS)}
      </div>

      <div className="w-px h-6 mx-1" style={{ backgroundColor: 'var(--border-color)' }} />

      {/* Controls */}
      <div className="flex items-center gap-0.5">
        <button className="tool-btn tool-btn--control" onClick={onUndo} title="Undo (⌘Z)">
          <span className="tool-btn__icon">⤺</span>
        </button>
        <button className="tool-btn tool-btn--control" onClick={onRedo} title="Redo (⌘⇧Z)">
          <span className="tool-btn__icon">⤻</span>
        </button>
        <button className="tool-btn tool-btn--control tool-btn--small" onClick={onZoomOut} title="Zoom Out">
          <span className="tool-btn__icon">−</span>
        </button>
        <button className="tool-btn tool-btn--control tool-btn--small" onClick={onZoomFit} title="Fit">
          <span className="tool-btn__icon">⊡</span>
        </button>
        <button className="tool-btn tool-btn--control tool-btn--small" onClick={onZoomIn} title="Zoom In">
          <span className="tool-btn__icon">+</span>
        </button>
      </div>
    </div>
  );
}

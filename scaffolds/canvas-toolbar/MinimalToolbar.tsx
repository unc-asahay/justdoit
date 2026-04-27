'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { ToolDef } from './tools/types';
import {
  DRAWING_TOOLS,
  FIGJAM_TOOLS,
  DIAGRAM_TOOLS,
  CONNECTOR_TOOLS,
  CONTROL_TOOLS,
  CATEGORY_COLORS,
} from './tools/types';
import './toolbar.css';

/**
 * Figma-style minimal toolbar.
 * Shows ~7 compact category icons in a vertical left-side bar.
 * Each category with multiple tools shows a flyout on hover/click.
 */

interface ToolbarCategory {
  id: string;
  label: string;
  icon: string;
  color: string;
  tools: ToolDef[];
}

const CATEGORIES: ToolbarCategory[] = [
  { id: 'select',    label: 'Select',     icon: '↖', color: CATEGORY_COLORS.control,   tools: CONTROL_TOOLS },
  { id: 'shapes',    label: 'Shapes',     icon: '▢', color: CATEGORY_COLORS.drawing,   tools: DRAWING_TOOLS.filter(t => ['rect', 'ellipse', 'triangle'].includes(t.id)) },
  { id: 'draw',      label: 'Draw',       icon: '✏️', color: CATEGORY_COLORS.drawing,  tools: [...DRAWING_TOOLS.filter(t => ['pen', 'arrow'].includes(t.id)), ...CONNECTOR_TOOLS] },
  { id: 'text',      label: 'Text',       icon: 'T', color: '#f59e0b',                 tools: DRAWING_TOOLS.filter(t => t.id === 'text') },
  { id: 'sticky',    label: 'Collaborate', icon: '🟡', color: CATEGORY_COLORS.figjam,  tools: FIGJAM_TOOLS },
  { id: 'diagram',   label: 'Diagrams',   icon: '◇', color: CATEGORY_COLORS.diagram,   tools: DIAGRAM_TOOLS },
  { id: 'media',     label: 'Media',      icon: '🖼️', color: '#ec4899',               tools: DRAWING_TOOLS.filter(t => t.id === 'image') },
];

interface MinimalToolbarProps {
  onToolChange?: (toolId: string | null) => void;
}

export function MinimalToolbar({ onToolChange }: MinimalToolbarProps) {
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [openFlyout, setOpenFlyout] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const flyoutTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Close flyout on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setOpenFlyout(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const allTools = CATEGORIES.flatMap(c => c.tools);
    const shortcutMap = new Map(
      allTools.filter(t => t.shortcut).map(t => [t.shortcut!.toLowerCase(), t])
    );

    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const tool = shortcutMap.get(e.key.toLowerCase());
      if (tool) {
        e.preventDefault();
        handleToolSelect(tool);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeTool]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToolSelect = useCallback((tool: ToolDef) => {
    const newTool = activeTool === tool.id ? null : tool.id;
    setActiveTool(newTool);
    onToolChange?.(newTool);
    setOpenFlyout(null);

    // Track which category this tool belongs to
    const cat = CATEGORIES.find(c => c.tools.some(t => t.id === tool.id));
    setActiveCategory(cat?.id ?? null);
  }, [activeTool, onToolChange]);

  const handleCategoryClick = useCallback((cat: ToolbarCategory) => {
    if (cat.tools.length === 1) {
      // Single tool — select directly
      handleToolSelect(cat.tools[0]);
    } else {
      // Multiple tools — toggle flyout
      setOpenFlyout(prev => prev === cat.id ? null : cat.id);
    }
  }, [handleToolSelect]);

  const handleCategoryEnter = useCallback((catId: string) => {
    if (flyoutTimeout.current) clearTimeout(flyoutTimeout.current);
    const cat = CATEGORIES.find(c => c.id === catId);
    if (cat && cat.tools.length > 1) {
      setOpenFlyout(catId);
    }
  }, []);

  const handleCategoryLeave = useCallback(() => {
    flyoutTimeout.current = setTimeout(() => setOpenFlyout(null), 300);
  }, []);

  const handleFlyoutEnter = useCallback(() => {
    if (flyoutTimeout.current) clearTimeout(flyoutTimeout.current);
  }, []);

  // Get the active tool's icon for a category (show the last-selected sub-tool)
  const getCategoryIcon = (cat: ToolbarCategory) => {
    const activeInCat = cat.tools.find(t => t.id === activeTool);
    return activeInCat?.icon ?? cat.icon;
  };

  return (
    <div className="minimal-toolbar" ref={toolbarRef}>
      {CATEGORIES.map(cat => {
        const isActive = activeCategory === cat.id;
        const hasFlyout = cat.tools.length > 1;
        const isFlyoutOpen = openFlyout === cat.id;

        return (
          <div
            key={cat.id}
            className="minimal-toolbar__item"
            onMouseEnter={() => handleCategoryEnter(cat.id)}
            onMouseLeave={handleCategoryLeave}
          >
            {/* Category Button */}
            <button
              className={`minimal-toolbar__btn ${isActive ? 'minimal-toolbar__btn--active' : ''}`}
              onClick={() => handleCategoryClick(cat)}
              title={`${cat.label}${cat.tools[0]?.shortcut ? ` (${cat.tools[0].shortcut})` : ''}`}
              style={{
                '--cat-color': cat.color,
                '--cat-glow': `${cat.color}40`,
              } as React.CSSProperties}
            >
              <span className="minimal-toolbar__icon">{getCategoryIcon(cat)}</span>
              {hasFlyout && <span className="minimal-toolbar__chevron">▸</span>}
            </button>

            {/* Flyout */}
            {hasFlyout && isFlyoutOpen && (
              <div
                className="minimal-toolbar__flyout"
                onMouseEnter={handleFlyoutEnter}
                onMouseLeave={handleCategoryLeave}
              >
                <div className="minimal-toolbar__flyout-label">{cat.label}</div>
                <div className="minimal-toolbar__flyout-grid">
                  {cat.tools.map(tool => (
                    <button
                      key={tool.id}
                      className={`minimal-toolbar__flyout-btn ${activeTool === tool.id ? 'minimal-toolbar__flyout-btn--active' : ''}`}
                      onClick={() => handleToolSelect(tool)}
                      title={`${tool.name}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
                    >
                      <span className="minimal-toolbar__flyout-icon">{tool.icon}</span>
                      <span className="minimal-toolbar__flyout-name">{tool.name}</span>
                      {tool.shortcut && (
                        <kbd className="minimal-toolbar__flyout-key">{tool.shortcut}</kbd>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Divider */}
      <div className="minimal-toolbar__divider" />

      {/* Zoom / Undo controls */}
      <button className="minimal-toolbar__btn minimal-toolbar__btn--subtle" title="Undo (⌘Z)">
        <span className="minimal-toolbar__icon">⤺</span>
      </button>
      <button className="minimal-toolbar__btn minimal-toolbar__btn--subtle" title="Redo (⌘⇧Z)">
        <span className="minimal-toolbar__icon">⤻</span>
      </button>
    </div>
  );
}

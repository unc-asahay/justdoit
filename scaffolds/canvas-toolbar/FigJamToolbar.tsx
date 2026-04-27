'use client';

// FigJam-style toolbar — bottom-center pill with category buttons.
// Each category opens a popover of individual tools. The Custom category
// surfaces tools registered to b_tools (by Brains via register_tool, or by
// the user via "Save as tool"), so what Brains create becomes available
// for the user to click, and vice versa.

import { useEffect, useRef, useState } from 'react';
import { BUILTIN_CATEGORIES, type ToolEntry, type ToolCategory, type ToolBehavior } from '@/lib/canvas/tool-catalog';
import { useRegisteredTools } from '@/lib/brains/provider';

interface FigJamToolbarProps {
  activeToolId: string | null;
  onToolChange: (id: string | null, behavior: ToolBehavior | null) => void;
}

export function FigJamToolbar({ activeToolId, onToolChange }: FigJamToolbarProps) {
  const registered = useRegisteredTools();
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close popover on outside click or Escape.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpenCategory(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenCategory(null);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // Single-key shortcut handler — built-in tools only. Skipped while typing
  // in inputs.
  useEffect(() => {
    const allTools = BUILTIN_CATEGORIES.flatMap((c) => c.tools);
    const byKey = new Map<string, ToolEntry>();
    for (const t of allTools) if (t.shortcut) byKey.set(t.shortcut.toLowerCase(), t);

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tool = byKey.get(e.key.toLowerCase());
      if (!tool) return;
      e.preventDefault();
      const next = activeToolId === tool.id ? null : tool.id;
      onToolChange(next, next ? tool.behavior : null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeToolId, onToolChange]);

  const customCategory: ToolCategory = {
    id: 'custom',
    label: 'Custom tools',
    icon: '✨',
    tools: registered.map((rt) => ({
      id: `custom-${rt.id}`,
      name: rt.name,
      icon: rt.emoji || '🧩',
      behavior: { mode: 'custom-tool', toolId: rt.id } as ToolBehavior,
    })),
  };

  const allCategories: ToolCategory[] = [
    ...BUILTIN_CATEGORIES,
    ...(customCategory.tools.length > 0 ? [customCategory] : []),
  ];

  const activeBehaviorTool = activeToolId
    ? allCategories.flatMap((c) => c.tools).find((t) => t.id === activeToolId)
    : null;

  return (
    <div
      ref={ref}
      className="figjam-toolbar"
      style={{
        position: 'absolute',
        bottom: 90,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 4,
        padding: '6px 8px',
        background: 'var(--bg-panel, #ffffff)',
        border: '1px solid var(--border-color, #e2e8f0)',
        borderRadius: 12,
        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.15)',
        zIndex: 20,
        userSelect: 'none',
      }}
    >
      {allCategories.map((cat) => {
        const isOpen = openCategory === cat.id;
        const activeInCat = activeBehaviorTool && cat.tools.some((t) => t.id === activeBehaviorTool.id);
        return (
          <div key={cat.id} style={{ position: 'relative' }}>
            <button
              onClick={() => {
                if (cat.tools.length === 1) {
                  const tool = cat.tools[0];
                  const next = activeToolId === tool.id ? null : tool.id;
                  onToolChange(next, next ? tool.behavior : null);
                  setOpenCategory(null);
                } else {
                  setOpenCategory(isOpen ? null : cat.id);
                }
              }}
              title={cat.label}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '8px 10px', fontSize: 16,
                background: activeInCat || isOpen ? '#dbeafe' : 'transparent',
                color: activeInCat || isOpen ? '#1d4ed8' : 'var(--text-primary, #0f172a)',
                border: 'none', borderRadius: 8, cursor: 'pointer',
                lineHeight: 1, minHeight: 36,
              }}
            >
              <span>{activeInCat ? activeBehaviorTool!.icon : cat.icon}</span>
              {cat.tools.length > 1 && <span style={{ fontSize: 9, opacity: 0.6 }}>▾</span>}
            </button>

            {isOpen && cat.tools.length > 1 && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 8px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'var(--bg-panel, #ffffff)',
                  border: '1px solid var(--border-color, #e2e8f0)',
                  borderRadius: 10,
                  padding: 6,
                  boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(140px, 1fr))',
                  gap: 4,
                  minWidth: 280,
                }}
              >
                <div style={{ gridColumn: '1 / -1', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', padding: '4px 8px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {cat.label}
                </div>
                {cat.tools.map((tool) => {
                  const isActive = activeToolId === tool.id;
                  return (
                    <button
                      key={tool.id}
                      onClick={() => {
                        const next = isActive ? null : tool.id;
                        onToolChange(next, next ? tool.behavior : null);
                        setOpenCategory(null);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 10px',
                        background: isActive ? '#dbeafe' : 'transparent',
                        color: isActive ? '#1d4ed8' : 'var(--text-primary, #0f172a)',
                        border: 'none', borderRadius: 6, cursor: 'pointer',
                        fontSize: 13, textAlign: 'left',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-card-hover, #f1f5f9)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                      }}
                    >
                      <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{tool.icon}</span>
                      <span style={{ flex: 1 }}>{tool.name}</span>
                      {tool.shortcut && (
                        <kbd style={{ fontSize: 10, padding: '1px 5px', background: 'var(--bg-app, #f8fafc)', border: '1px solid var(--border-color)', borderRadius: 3, color: 'var(--text-muted)' }}>
                          {tool.shortcut}
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

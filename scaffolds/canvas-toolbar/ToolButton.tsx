'use client';

import type { ToolDef } from './tools/types';

interface ToolButtonProps {
  tool: ToolDef;
  isActive: boolean;
  accentColor: string;
  onClick: () => void;
}

export function ToolButton({ tool, isActive, accentColor, onClick }: ToolButtonProps) {
  return (
    <button
      className={`tool-btn ${isActive ? 'tool-btn--active' : ''}`}
      onClick={onClick}
      title={`${tool.name}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
      aria-label={tool.name}
      data-tool-id={tool.id}
      style={{
        '--accent': accentColor,
        '--accent-glow': `${accentColor}40`,
      } as React.CSSProperties}
    >
      <span className="tool-btn__icon">{tool.icon}</span>

      {/* Tooltip — shown on hover only */}
      <div className="tool-btn__tooltip">
        <span className="tool-btn__tooltip-name">{tool.name}</span>
        {tool.shortcut && (
          <kbd className="tool-btn__tooltip-key">{tool.shortcut}</kbd>
        )}
      </div>
    </button>
  );
}

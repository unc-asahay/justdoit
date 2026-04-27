'use client';

/**
 * FigJam Tools — Collaboration widgets.
 * Each tool creates a custom composite node on the canvas.
 */

import { ToolGroup } from '../ToolGroup';
import { ToolButton } from '../ToolButton';
import { FIGJAM_TOOLS, CATEGORY_COLORS } from './types';
import type { ActiveToolId } from './types';

interface FigJamToolsProps {
  activeTool: ActiveToolId;
  onToolSelect: (toolId: string) => void;
}

export function FigJamTools({ activeTool, onToolSelect }: FigJamToolsProps) {
  return (
    <ToolGroup label="FigJam" accentColor={CATEGORY_COLORS.figjam}>
      {FIGJAM_TOOLS.map(tool => (
        <ToolButton
          key={tool.id}
          tool={tool}
          isActive={activeTool === tool.id}
          accentColor={CATEGORY_COLORS.figjam}
          onClick={() => onToolSelect(tool.id)}
        />
      ))}
    </ToolGroup>
  );
}

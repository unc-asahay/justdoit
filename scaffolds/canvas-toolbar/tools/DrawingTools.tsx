'use client';

/**
 * Drawing Tools — Standard canvas primitives.
 * Maps directly to Grida canvas tool API.
 */

import { ToolGroup } from '../ToolGroup';
import { ToolButton } from '../ToolButton';
import { DRAWING_TOOLS, CATEGORY_COLORS } from './types';
import type { ActiveToolId } from './types';

interface DrawingToolsProps {
  activeTool: ActiveToolId;
  onToolSelect: (toolId: string) => void;
}

export function DrawingTools({ activeTool, onToolSelect }: DrawingToolsProps) {
  return (
    <ToolGroup label="Draw" accentColor={CATEGORY_COLORS.drawing}>
      {DRAWING_TOOLS.map(tool => (
        <ToolButton
          key={tool.id}
          tool={tool}
          isActive={activeTool === tool.id}
          accentColor={CATEGORY_COLORS.drawing}
          onClick={() => onToolSelect(tool.id)}
        />
      ))}
    </ToolGroup>
  );
}

/** Map tool ID to Grida canvas API call */
export function activateDrawingTool(toolId: string, canvas: any): void {
  const mapping: Record<string, () => void> = {
    pen:      () => canvas.setTool('pen'),
    rect:     () => canvas.setTool('rectangle'),
    ellipse:  () => canvas.setTool('ellipse'),
    triangle: () => canvas.setTool('polygon', { sides: 3 }),
    arrow:    () => canvas.setTool('arrow'),
    text:     () => canvas.setTool('text'),
    image:    () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = () => canvas.addImage(reader.result);
          reader.readAsArrayBuffer(file);
        }
      };
      input.click();
    },
  };
  mapping[toolId]?.();
}

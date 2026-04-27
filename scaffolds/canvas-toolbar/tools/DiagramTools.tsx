'use client';

/**
 * Diagram Tools — Phase 1 placeholders.
 * Buttons are live, but create basic shapes only.
 * Full diagram engines come in Phase 2.
 */

import { ToolGroup } from '../ToolGroup';
import { ToolButton } from '../ToolButton';
import { DIAGRAM_TOOLS, CATEGORY_COLORS } from './types';
import type { ActiveToolId } from './types';

interface DiagramToolsProps {
  activeTool: ActiveToolId;
  onToolSelect: (toolId: string) => void;
}

export function DiagramTools({ activeTool, onToolSelect }: DiagramToolsProps) {
  return (
    <ToolGroup label="Diagrams" accentColor={CATEGORY_COLORS.diagram}>
      {DIAGRAM_TOOLS.map(tool => (
        <ToolButton
          key={tool.id}
          tool={tool}
          isActive={activeTool === tool.id}
          accentColor={CATEGORY_COLORS.diagram}
          onClick={() => onToolSelect(tool.id)}
        />
      ))}
    </ToolGroup>
  );
}

/** Create basic placeholder shapes for diagram tools */
export function createDiagramPlaceholder(toolId: string): { type: string; props: Record<string, unknown> } {
  switch (toolId) {
    case 'flowchart':
      return { type: 'diamond', props: { width: 120, height: 80, fill: '#DBEAFE', stroke: '#3B82F6', label: 'Decision' } };
    case 'uml':
      return { type: 'rect', props: { width: 200, height: 120, fill: '#F0FDF4', stroke: '#10B981', sections: 3, label: 'ClassName' } };
    case 'sequence':
      return { type: 'line', props: { width: 2, height: 300, stroke: '#6B7280', style: 'dashed', label: 'Lifeline' } };
    case 'mindmap':
      return { type: 'ellipse', props: { width: 160, height: 80, fill: '#FEF3C7', stroke: '#F59E0B', label: 'Central Idea' } };
    case 'timeline':
      return { type: 'line', props: { width: 500, height: 2, stroke: '#8B5CF6', markers: true, label: 'Timeline' } };
    default:
      return { type: 'rect', props: { width: 100, height: 60, fill: '#fff', stroke: '#ccc' } };
  }
}

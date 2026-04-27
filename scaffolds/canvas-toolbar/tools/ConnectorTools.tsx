'use client';

/**
 * Connector Tools — Line styles for connecting nodes.
 * Maps to Grida edge/connector API.
 */

import { ToolGroup } from '../ToolGroup';
import { ToolButton } from '../ToolButton';
import { CONNECTOR_TOOLS, CATEGORY_COLORS } from './types';
import type { ActiveToolId, ConnectorStyle } from './types';

interface ConnectorToolsProps {
  activeTool: ActiveToolId;
  onToolSelect: (toolId: string) => void;
}

export function ConnectorTools({ activeTool, onToolSelect }: ConnectorToolsProps) {
  return (
    <ToolGroup label="Connect" accentColor={CATEGORY_COLORS.connector}>
      {CONNECTOR_TOOLS.map(tool => (
        <ToolButton
          key={tool.id}
          tool={tool}
          isActive={activeTool === tool.id}
          accentColor={CATEGORY_COLORS.connector}
          onClick={() => onToolSelect(tool.id)}
        />
      ))}
    </ToolGroup>
  );
}

/** Extract connector style from tool ID */
export function getConnectorStyle(toolId: string): ConnectorStyle {
  const map: Record<string, ConnectorStyle> = {
    'conn-solid': 'solid',
    'conn-bold': 'bold',
    'conn-dashed': 'dashed',
    'conn-elbow': 'elbow',
  };
  return map[toolId] ?? 'solid';
}

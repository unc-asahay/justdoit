// Smart Commit Message Generation
// Analyzes changes and generates descriptive commit messages

import { ChangeSet, ChangeType } from './diff-tracker';

export interface CommitMessageOptions {
  prefix?: string;
  maxLength?: number;
  includeTimestamp?: boolean;
  detailed?: boolean;
}

const DEFAULT_OPTIONS: Required<CommitMessageOptions> = {
  prefix: '[JustDoIt]',
  maxLength: 100,
  includeTimestamp: false,
  detailed: false,
};

/**
 * Generate a smart commit message based on the changes that occurred
 */
export function generateCommitMessage(changes: ChangeSet[], options?: CommitMessageOptions): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (changes.length === 0) {
    return `${opts.prefix} Empty commit`;
  }

  // Group changes by type
  const grouped = groupByType(changes);

  // Generate summary for each type
  const summaries: string[] = [];

  if (grouped.canvas.length > 0) {
    summaries.push(generateCanvasSummary(grouped.canvas));
  }

  if (grouped.memory.length > 0) {
    summaries.push(generateMemorySummary(grouped.memory));
  }

  if (grouped.export.length > 0) {
    summaries.push(generateExportSummary(grouped.export));
  }

  if (grouped.agent.length > 0) {
    summaries.push(generateAgentSummary(grouped.agent));
  }

  if (grouped.project.length > 0) {
    summaries.push(generateProjectSummary(grouped.project));
  }

  // Combine into final message
  let message = `${opts.prefix} ${summaries.join(' | ')}`;

  // Truncate if too long
  if (message.length > opts.maxLength) {
    message = truncateMessage(message, opts.maxLength);
  }

  return message;
}

/**
 * Generate a commit message from a single change
 */
export function generateSingleChangeMessage(change: ChangeSet): string {
  switch (change.type) {
    case 'canvas':
      return `Update canvas (${change.nodesChanged || 'several'} nodes)`;
    case 'memory':
      return `Update ${change.agentId || 'agent'} memory`;
    case 'export':
      return `Re-export ${(change.formats || []).join(', ')}`;
    case 'agent':
      return `Update agent config: ${change.agentName || 'unknown'}`;
    case 'project':
      return `Update project settings`;
    default:
      return 'Update';
  }
}

/**
 * Generate a detailed commit body with change breakdown
 */
export function generateDetailedCommitMessage(changes: ChangeSet[]): string {
  const subject = generateCommitMessage(changes, { detailed: false });
  
  const lines: string[] = [subject, ''];
  
  const grouped = groupByType(changes);

  if (grouped.canvas.length > 0) {
    lines.push('## Canvas Changes');
    grouped.canvas.forEach(change => {
      const details = [
        change.nodesChanged ? `  - ${change.nodesChanged} nodes changed` : '',
        change.layersChanged?.length ? `  - Layers: ${change.layersChanged.join(', ')}` : '',
      ].filter(Boolean);
      if (details.length > 0) {
        lines.push(...details);
      } else {
        lines.push('  - Canvas updated');
      }
    });
    lines.push('');
  }

  if (grouped.memory.length > 0) {
    lines.push('## Memory Changes');
    const agents = [...new Set(grouped.memory.map(c => c.agentId).filter(Boolean))];
    lines.push(`  - Updated memory for: ${agents.join(', ')}`);
    lines.push('');
  }

  if (grouped.export.length > 0) {
    lines.push('## Export Changes');
    grouped.export.forEach(change => {
      lines.push(`  - Re-exported: ${(change.formats || []).join(', ')}`);
    });
    lines.push('');
  }

  if (grouped.agent.length > 0) {
    lines.push('## Agent Changes');
    grouped.agent.forEach(change => {
      lines.push(`  - Updated: ${change.agentName || 'unknown agent'}`);
    });
    lines.push('');
  }

  if (grouped.project.length > 0) {
    lines.push('## Project Changes');
    grouped.project.forEach(change => {
      const settings = change.settingsChanged?.join(', ') || 'general';
      lines.push(`  - Settings updated: ${settings}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

// ─── Helper Functions ──────────────────────────────────────────────────────

interface GroupedChanges {
  canvas: ChangeSet[];
  memory: ChangeSet[];
  export: ChangeSet[];
  agent: ChangeSet[];
  project: ChangeSet[];
}

function groupByType(changes: ChangeSet[]): GroupedChanges {
  const grouped: GroupedChanges = {
    canvas: [],
    memory: [],
    export: [],
    agent: [],
    project: [],
  };

  for (const change of changes) {
    switch (change.type) {
      case 'canvas':
        grouped.canvas.push(change);
        break;
      case 'memory':
        grouped.memory.push(change);
        break;
      case 'export':
        grouped.export.push(change);
        break;
      case 'agent':
        grouped.agent.push(change);
        break;
      case 'project':
        grouped.project.push(change);
        break;
    }
  }

  return grouped;
}

function generateCanvasSummary(changes: ChangeSet[]): string {
  const totalNodes = changes.reduce((sum, c) => sum + (c.nodesChanged || 0), 0);
  const layers = changes.flatMap(c => c.layersChanged || []);
  const uniqueLayers = [...new Set(layers)];

  if (totalNodes > 0) {
    return `Update canvas (${totalNodes} nodes)`;
  } else if (uniqueLayers.length > 0) {
    return `Update canvas (${uniqueLayers.length} layers)`;
  }
  return 'Update canvas';
}

function generateMemorySummary(changes: ChangeSet[]): string {
  const agents = [...new Set(changes.map(c => c.agentId).filter(Boolean))];
  if (agents.length === 1) {
    return `Update ${agents[0]} memory`;
  } else if (agents.length > 1) {
    return `Update ${agents.length} agents memory`;
  }
  return 'Update memory';
}

function generateExportSummary(changes: ChangeSet[]): string {
  const allFormats = changes.flatMap(c => c.formats || []);
  const uniqueFormats = [...new Set(allFormats)];
  return `Re-export ${uniqueFormats.join(', ')}`;
}

function generateAgentSummary(changes: ChangeSet[]): string {
  const agents = [...new Set(changes.map(c => c.agentName).filter(Boolean))];
  if (agents.length === 1) {
    return `Update agent config: ${agents[0]}`;
  } else if (agents.length > 1) {
    return `Update ${agents.length} agents`;
  }
  return 'Update agents';
}

function generateProjectSummary(changes: ChangeSet[]): string {
  return 'Update project settings';
}

function truncateMessage(message: string, maxLength: number): string {
  // Try to truncate at a word boundary
  const truncated = message.substring(0, maxLength - 3);
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastSpace > maxLength * 0.7) {
    return truncated.substring(0, lastSpace) + '...';
  }
  
  return truncated + '...';
}

// ─── Conventional Commit Support ────────────────────────────────────────────

export type ConventionalType = 
  | 'feat'     // New feature
  | 'fix'      // Bug fix
  | 'docs'     // Documentation
  | 'style'    // Formatting
  | 'refactor' // Code restructuring
  | 'perf'     // Performance
  | 'test'     // Tests
  | 'build'    // Build
  | 'ci'       // CI/CD
  | 'chore';   // Maintenance

/**
 * Generate a conventional commit message
 */
export function generateConventionalMessage(
  type: ConventionalType,
  changes: ChangeSet[],
  scope?: string
): string {
  const scopePart = scope ? `(${scope})` : '';
  const subject = generateCommitMessage(changes, { prefix: '' });
  return `${type}${scopePart}: ${subject}`;
}
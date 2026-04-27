/**
 * GitHub Sync Module
 *
 * Usage:
 *   import { SyncEngine } from '@/lib/github';
 *
 *   const engine = new SyncEngine('owner/repo');
 *   engine.start();
 *   engine.markDirty({ type: 'canvas', timestamp: new Date(), summary: 'Update layout' });
 */

// Core sync engine
export { SyncEngine } from './sync-engine';
export type { SyncState, SyncOptions } from './sync-engine';

// Change tracking
export { DiffTracker } from './diff-tracker';
export type { ChangeSet, ChangeType, TrackedState } from './diff-tracker';

// Branch management
export { BranchManager } from './branch-manager';
export type { BranchInfo, MergeResult, BranchProtection } from './branch-manager';

// Commit messages
export {
  generateCommitMessage,
  generateSingleChangeMessage,
  generateDetailedCommitMessage,
  generateConventionalMessage,
} from './commit-message';
export type { CommitMessageOptions, ConventionalType } from './commit-message';

// Conflict resolution
export { ConflictResolver } from './conflict-resolver';
export type {
  ConflictFile,
  ConflictResolution,
  ConflictResult,
  MergeConflict,
  ConflictHunk,
} from './conflict-resolver';

// Export pipeline
export { ExportPipeline } from './export-pipeline';
export type { ExportOptions, ExportResult, ExportFormats } from './export-pipeline';

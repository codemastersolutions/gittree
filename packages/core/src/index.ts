export * from './git-tree.js';
export type { GitTreeOptions, GitTree } from './git-tree.js';

export { RealGitAdapter } from './adapters/real-git-adapter.js';
export type {
  GitAdapter,
  GitExecOptions,
  GitExecResult,
  GitLocale,
  GitVersion,
} from './adapters/types.js';

export {
  GitTreeError,
  GitVersionError,
  GitExecutionError,
  DirtyWorktreeError,
  BranchLockedError,
  BranchAheadError,
  ConfigParseError,
} from './errors/index.js';

export { I18n } from './i18n/index.js';

export { parseWorktreePorcelain } from './parsers/worktree-porcelain.js';
export { parseStatusPorcelainV2 } from './parsers/status-porcelain-v2.js';

export { WorktreeService } from './services/worktree-service.js';
export type { WorktreeEvents } from './services/worktree-service.js';

export { BranchService } from './services/branch-service.js';
export { SyncService, countSyncFailed, countByResult } from './services/sync-service.js';
export { RepoService } from './services/repo-service.js';
export type { CommitLogEntry } from './services/repo-service.js';
export { SetupScriptService } from './services/setup-script-service.js';
export type { SetupApplyResult } from './services/setup-script-service.js';

export {
  PathTraversalError,
  assertPathInsideRoot,
  safeExistsInsideRoot,
  safeReadFileInsideRoot,
  safeWriteFileInsideRoot,
  safeMkdirInsideRoot,
  safeStatInsideRoot,
  safeAccessInsideRoot,
  safeCopyFileInsideRoot,
  safeSymlinkInsideRoot,
  safeExistsAnywhere,
  safeReadFileAnywhere,
  safeWriteFileAnywhere,
  safeMkdirAnywhere,
} from './utils/fs-safe.js';

export type {
  Worktree,
  WorktreeState,
  WorktreeStateKind,
  SyncStrategy,
  SyncResult,
  SyncOptions,
  AddWorktreeOptions,
  AddWorktreeKind,
  WorktreeAddResult,
  RemoveWorktreeOptions,
  WorktreeRemoveResult,
  PruneResult,
  DeleteBranchResult,
  OperationResult,
  Branch,
  Remote,
  RepoStatusReport,
  GitTreeSetupConfig,
} from './types/index.js';

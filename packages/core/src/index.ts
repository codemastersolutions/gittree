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

export type {
  Worktree,
  WorktreeState,
  WorktreeStateKind,
  SyncStrategy,
  SyncResult,
  SyncOptions,
  AddWorktreeOptions,
  RemoveWorktreeOptions,
  OperationResult,
  Branch,
  Remote,
  RepoStatusReport,
} from './types/index.js';

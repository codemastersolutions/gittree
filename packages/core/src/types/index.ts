export type WorktreeStateKind = 'clean' | 'dirty' | 'ahead' | 'behind' | 'diverged' | 'detached';

export interface WorktreeState {
  readonly dirty: boolean;
  readonly kind: WorktreeStateKind;
  readonly aheadBy: number;
  readonly behindBy: number;
  readonly branch: string | undefined;
  readonly upstream: string | undefined;
  readonly modifiedFiles: readonly string[];
  readonly untrackedFiles: readonly string[];
  readonly deletedFiles: readonly string[];
}

export interface Worktree {
  readonly path: string;
  readonly head: string;
  readonly branch: string | undefined;
  readonly isMain: boolean;
  readonly isDetached: boolean;
  readonly isBare: boolean;
  readonly isPrunable: boolean;
  readonly lockReason?: string;
}

export type SyncStrategy = 'ff-only' | 'merge' | 'rebase';

export interface Branch {
  readonly name: string;
  readonly remote: string | undefined;
  readonly isCurrent: boolean;
  readonly isRemote: boolean;
  readonly upToDate: boolean | undefined;
  readonly aheadBy: number;
  readonly behindBy: number;
}

export interface Remote {
  readonly name: string;
  readonly url: string;
}

export interface RepoStatusReport {
  readonly mainWorktree: Worktree | undefined;
  readonly worktrees: readonly Worktree[];
  readonly states: ReadonlyMap<string, WorktreeState>;
  readonly countByState: Readonly<Record<WorktreeStateKind, number>>;
  readonly remotes: readonly Remote[];
  readonly totalAheadBy: number;
  readonly totalDirty: number;
}

export interface AddWorktreeOptions {
  readonly path: string;
  readonly branchNewName?: string;
  readonly branchExistingName?: string;
  readonly remoteBranch?: string;
  readonly forceBranchCreate?: boolean;
  readonly skipSetup?: boolean;
}

export interface RemoveWorktreeOptions {
  readonly force?: boolean;
  readonly deleteBranch?: boolean;
  readonly deleteRemoteBranch?: boolean;
  readonly skipPushCheck?: boolean;
}

export interface OperationResult {
  readonly ok: boolean;
  readonly warnings: readonly string[];
  readonly message?: string;
}

export interface SyncOptions {
  readonly strategy: SyncStrategy;
  readonly fetchFirst?: boolean;
}

export interface SyncResult {
  readonly worktreePath: string;
  readonly ok: boolean;
  readonly strategy: SyncStrategy;
  readonly conflicted: boolean;
  readonly details?: string;
  readonly warnings: readonly string[];
}

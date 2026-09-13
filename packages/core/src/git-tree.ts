import type { GitAdapter, GitLocale } from './adapters/types.js';
import { RealGitAdapter } from './adapters/real-git-adapter.js';
import { I18n } from './i18n/index.js';
import { WorktreeService } from './services/worktree-service.js';
import { BranchService } from './services/branch-service.js';
import { SyncService } from './services/sync-service.js';
import { RepoService } from './services/repo-service.js';
import { SetupScriptService } from './services/setup-script-service.js';

export interface GitTreeOptions {
  readonly cwd: string;
  readonly adapter?: GitAdapter;
  readonly locale?: GitLocale;
}

export interface GitTree {
  readonly worktree: WorktreeService;
  readonly branch: BranchService;
  readonly sync: SyncService;
  readonly repo: RepoService;
  readonly setup: SetupScriptService;
  readonly locale: GitLocale;
  readonly cwd: string;
}

export function createGitTree(options: GitTreeOptions): GitTree {
  const locale: GitLocale = options.locale ?? 'en';
  const adapter = options.adapter ?? new RealGitAdapter({ cwd: options.cwd, locale });
  const i18n = new I18n(locale);
  const worktree = new WorktreeService(adapter, i18n);
  const sync = new SyncService(adapter, i18n, worktree);
  return {
    worktree,
    branch: new BranchService(adapter, i18n),
    sync,
    repo: new RepoService(adapter, worktree),
    setup: new SetupScriptService(adapter),
    locale,
    cwd: options.cwd,
  };
}

export type { WorktreeService, BranchService, SyncService, RepoService, SetupScriptService };

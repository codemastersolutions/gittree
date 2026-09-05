import type { GitLocale } from './adapters/types.js';
import { RealGitAdapter } from './adapters/real-git-adapter.js';
import type { GitAdapter } from './adapters/types.js';
import { I18n } from './i18n/index.js';
import { WorktreeService } from './services/worktree-service.js';

export interface GitTreeOptions {
  readonly cwd: string;
  readonly adapter?: GitAdapter;
  readonly locale?: GitLocale;
}

export interface GitTree {
  readonly worktree: WorktreeService;
  readonly locale: GitLocale;
  readonly cwd: string;
}

export function createGitTree(options: GitTreeOptions): GitTree {
  const locale: GitLocale = options.locale ?? 'en';
  const adapter = options.adapter ?? new RealGitAdapter({ cwd: options.cwd, locale });
  const i18n = new I18n(locale);
  return {
    worktree: new WorktreeService(adapter, i18n),
    locale,
    cwd: options.cwd,
  };
}

export type { WorktreeService };

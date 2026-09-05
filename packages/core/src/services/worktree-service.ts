import { EventEmitter } from 'eventemitter3';

import type { GitAdapter } from '../adapters/types.js';
import { I18n } from '../i18n/index.js';
import { parseWorktreePorcelain } from '../parsers/worktree-porcelain.js';
import { parseStatusPorcelainV2 } from '../parsers/status-porcelain-v2.js';
import type { Worktree, WorktreeState } from '../types/index.js';

export type WorktreeEvents = {
  'worktree:listed': [readonly Worktree[]];
  'worktree:status': [worktreePath: string, state: WorktreeState];
};

export class WorktreeService {
  public readonly events: EventEmitter<WorktreeEvents>;

  private readonly adapter: GitAdapter;
  private readonly i18n: I18n;
  private listCache?: { readonly data: readonly Worktree[]; readonly at: number };
  private readonly listCacheTtlMs = 2000;

  public constructor(adapter: GitAdapter, i18n?: I18n) {
    this.adapter = adapter;
    this.i18n = i18n ?? new I18n(adapter.locale);
    this.events = new EventEmitter<WorktreeEvents>();
  }

  public invalidateCaches(): void {
    this.listCache = undefined;
  }

  public async list(options?: { readonly skipCache?: boolean }): Promise<readonly Worktree[]> {
    if (!options?.skipCache && this.listCache) {
      if (Date.now() - this.listCache.at < this.listCacheTtlMs) {
        return this.listCache.data;
      }
    }
    const { stdout } = await this.adapter.exec('worktree list --porcelain');
    const parsed = parseWorktreePorcelain(stdout, this.adapter.cwd());
    this.listCache = { data: parsed, at: Date.now() };
    this.events.emit('worktree:listed', parsed);
    return parsed;
  }

  public async getStatus(worktreePath: string): Promise<WorktreeState> {
    const { stdout } = await this.adapter.exec('status --porcelain=v2 --branch', {
      cwd: worktreePath,
    });
    const state = parseStatusPorcelainV2(stdout);
    this.events.emit('worktree:status', worktreePath, state);
    return state;
  }

  public async detectMainWorktree(worktrees?: readonly Worktree[]): Promise<Worktree | undefined> {
    const list = worktrees ?? (await this.list());
    return list.find((w) => w.isMain) ?? list[0];
  }

  public i18n_t(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }
}

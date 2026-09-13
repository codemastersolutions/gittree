import type { GitAdapter } from '../adapters/types.js';
import type { I18n } from '../i18n/index.js';
import { GitExecutionError } from '../errors/index.js';
import type { SyncOptions, SyncResult, SyncStrategy, Worktree } from '../types/index.js';
import { WorktreeService } from './worktree-service.js';

export class SyncService {
  private readonly adapter: GitAdapter;
  private readonly i18n: I18n;
  private readonly worktreeService: WorktreeService;

  public constructor(adapter: GitAdapter, i18n: I18n, worktreeService: WorktreeService) {
    this.adapter = adapter;
    this.i18n = i18n;
    this.worktreeService = worktreeService;
  }

  public async fetchAll(options?: {
    readonly prune?: boolean;
    readonly remote?: string;
  }): Promise<void> {
    const prune = options?.prune !== false;
    const remote = options?.remote;
    const cmd = remote ? `fetch ${quote(remote)}` : 'fetch --all';
    const withPrune = prune ? `${cmd} --prune` : cmd;
    const res = await this.adapter.exec(withPrune);
    if (res.exitCode !== 0) {
      throw new GitExecutionError('git fetch failed', {
        exitCode: res.exitCode,
        stdout: res.stdout,
        stderr: res.stderr,
        command: withPrune,
      });
    }
  }

  public async pullWorktree(
    worktreePath: string,
    strategy: SyncStrategy = 'ff-only',
  ): Promise<SyncResult> {
    const flag =
      strategy === 'ff-only' ? '--ff-only' : strategy === 'rebase' ? '--rebase' : '--no-rebase';
    const res = await this.adapter.exec(`pull ${flag}`, { cwd: worktreePath });
    const conflicted = isConflictedPull(res, strategy);
    const ok = res.exitCode === 0 && !conflicted;
    const warnings: string[] = [];
    if (res.stderr.trim()) warnings.push(res.stderr.trim().split('\n')[0]!);
    const out = res.stdout.trim();
    return {
      worktreePath,
      ok,
      strategy,
      conflicted,
      warnings,
      details: ok ? (out.length > 0 ? out : undefined) : res.stderr.trim(),
    };
  }

  public async pullAll(options?: SyncOptions): Promise<readonly SyncResult[]> {
    const strat = options?.strategy ?? 'ff-only';
    if (options?.fetchFirst !== false) await this.fetchAll();
    const list = await this.worktreeService.list({ skipCache: true });
    const results: SyncResult[] = [];
    for (const w of list) {
      if (w.isBare) continue;
      if (w.isDetached && (w.branch === undefined || w.branch.startsWith('HEAD'))) {
        results.push({
          worktreePath: w.path,
          ok: true,
          strategy: strat,
          conflicted: false,
          warnings: ['skipped: detached HEAD, no branch to pull'],
        });
        continue;
      }
      results.push(await this.pullWorktree(w.path, strat));
    }
    return results;
  }

  public async pushWorktree(
    worktreePath: string,
    options?: { readonly setUpstreamIfMissing?: boolean },
  ): Promise<{ readonly ok: boolean; readonly worktreePath: string }> {
    const setUpstream = options?.setUpstreamIfMissing === true;
    const branchRev = await this.adapter.exec('rev-parse --abbrev-ref HEAD', { cwd: worktreePath });
    if (branchRev.exitCode !== 0 || !branchRev.stdout.trim()) {
      return { ok: false, worktreePath };
    }
    const branch = branchRev.stdout.trim();
    let hasUpstream = false;
    try {
      const up = await this.adapter.exec('rev-parse --abbrev-ref --symbolic-full-name @{u}', {
        cwd: worktreePath,
      });
      hasUpstream =
        up.exitCode === 0 && Boolean(up.stdout.trim()) && !up.stdout.trim().startsWith('@');
    } catch {
      hasUpstream = false;
    }
    const cmd = setUpstream && !hasUpstream ? `push -u origin ${quote(branch)}` : 'push';
    const res = await this.adapter.exec(cmd, { cwd: worktreePath });
    if (res.exitCode !== 0) {
      return { ok: false, worktreePath };
    }
    return { ok: true, worktreePath };
  }

  public async syncWithMain(
    worktreePath: string,
    options?: {
      readonly strategy?: Exclude<SyncStrategy, 'ff-only'>;
      readonly mainRef?: string;
    },
  ): Promise<SyncResult> {
    const strategy = options?.strategy ?? 'rebase';
    const mainRef = options?.mainRef ?? 'origin/main';
    if ((strategy as string) === 'ff-only') {
      throw new GitExecutionError('syncWithMain: strategy must be merge or rebase', {
        exitCode: 2,
        stdout: '',
        stderr: 'invalid strategy',
        command: 'syncWithMain',
      });
    }
    const args = strategy === 'rebase' ? `rebase ${quote(mainRef)}` : `merge ${quote(mainRef)}`;
    const res = await this.adapter.exec(args, { cwd: worktreePath });
    const conflicted =
      res.exitCode !== 0 &&
      /CONFLICT|Merge conflict|error: (?:Failed to merge in the changes|could not apply)/i.test(
        res.stderr + res.stdout,
      );
    const ok = res.exitCode === 0 && !conflicted;
    return {
      worktreePath,
      ok,
      strategy,
      conflicted,
      warnings: conflicted ? [this.i18n.t('sync.conflict', { ref: mainRef, strategy })] : [],
      details: ok ? res.stdout.trim() : res.stderr.trim(),
    };
  }
}

export function countSyncFailed(results: readonly SyncResult[]): number {
  return results.filter((r) => !r.ok).length;
}

export function countByResult(results: readonly SyncResult[]): {
  readonly ok: number;
  readonly conflicted: number;
  readonly failed: number;
  readonly skipped: number;
  readonly total: number;
} {
  let ok = 0;
  let conflicted = 0;
  let failed = 0;
  let skipped = 0;
  for (const r of results) {
    if (r.conflicted) conflicted++;
    if (r.ok) {
      ok++;
      if (r.warnings.some((w) => w.includes('skipped:'))) skipped++;
    } else failed++;
  }
  return { ok, conflicted, failed, skipped, total: results.length };
}

export type { Worktree };

function quote(s: string): string {
  if (/^[a-zA-Z0-9@/+_:.-]+$/.test(s)) return s;
  const escaped = s.replace(/'/g, "'\\''");
  return `'${escaped}'`;
}

function isConflictedPull(
  res: { exitCode: number; stdout: string; stderr: string },
  strategy: SyncStrategy,
): boolean {
  if (res.exitCode === 0) return false;
  const combined = (res.stdout + ' ' + res.stderr).toLowerCase();
  if (
    strategy === 'ff-only' &&
    /not possible|refusing to merge unrelated histories|cannot be fast-forwarded/i.test(combined)
  ) {
    return true;
  }
  return /conflict/i.test(combined);
}

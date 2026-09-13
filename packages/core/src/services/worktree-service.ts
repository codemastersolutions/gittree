import { EventEmitter } from 'node:events';
import { isAbsolute, resolve } from 'node:path';

import type { GitAdapter } from '../adapters/types.js';
import {
  BranchAheadError,
  BranchLockedError,
  DirtyWorktreeError,
  GitExecutionError,
} from '../errors/index.js';
import { I18n } from '../i18n/index.js';
import { parseWorktreePorcelain } from '../parsers/worktree-porcelain.js';
import { parseStatusPorcelainV2 } from '../parsers/status-porcelain-v2.js';
import type {
  AddWorktreeKind,
  AddWorktreeOptions,
  PruneResult,
  RemoveWorktreeOptions,
  Worktree,
  WorktreeAddResult,
  WorktreeRemoveResult,
  WorktreeState,
} from '../types/index.js';
import { SetupScriptService, type SetupApplyResult } from './setup-script-service.js';
import { BranchService } from './branch-service.js';
import { safeExistsAnywhere } from '../utils/fs-safe.js';

export type WorktreeEvents = {
  'worktree:listed': [readonly Worktree[]];
  'worktree:status': [worktreePath: string, state: WorktreeState];
  'worktree:added': [result: WorktreeAddResult];
  'worktree:removed': [path: string, opts: RemoveWorktreeOptions];
  'worktree:pruned': [prunedPaths: readonly string[]];
};

export class WorktreeService {
  public readonly events: EventEmitter<WorktreeEvents>;

  private readonly adapter: GitAdapter;
  private readonly i18n: I18n;
  private readonly setup: SetupScriptService;
  private readonly branch: BranchService;
  private listCache?: { readonly data: readonly Worktree[]; readonly at: number };
  private readonly listCacheTtlMs = 2000;

  public constructor(adapter: GitAdapter, i18n?: I18n) {
    this.adapter = adapter;
    this.i18n = i18n ?? new I18n(adapter.locale);
    this.events = new EventEmitter<WorktreeEvents>();
    this.setup = new SetupScriptService(adapter);
    this.branch = new BranchService(adapter, this.i18n);
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

  public async add(options: AddWorktreeOptions): Promise<WorktreeAddResult> {
    const root = this.adapter.cwd();
    const path = isAbsolute(options.path) ? options.path : resolve(root, options.path);

    if (safeExistsAnywhere(path)) {
      throw new GitExecutionError(this.i18n.t('errors.worktreePathExists', { path }), {
        exitCode: 2,
        stdout: '',
        stderr: `path already exists: ${path}`,
        command: 'worktree add',
      });
    }

    const kind: AddWorktreeKind = options.branchNewName
      ? 'new-branch'
      : options.remoteBranch
        ? 'remote-branch'
        : 'existing-branch';

    const branchName =
      options.branchNewName ??
      options.branchExistingName ??
      extractLocalBranchName(options.remoteBranch);

    const existing = await this.list({ skipCache: true });

    if (kind !== 'remote-branch' && branchName) {
      const locked = existing.find((w) => w.branch === `refs/heads/${branchName}` && !w.isPrunable);
      if (locked) {
        throw new BranchLockedError(
          this.i18n.t('errors.branchLocked', {
            branch: branchName,
            path: locked.path,
          }),
          { branch: branchName, alreadyAtPath: locked.path },
        );
      }
    }

    const cmd = buildWorktreeAddCommand(options, path);
    const res = await this.adapter.exec(cmd);
    if (res.exitCode !== 0) {
      throw new GitExecutionError(
        this.i18n.t('errors.worktreeAddFailed', {
          stderr: res.stderr || 'unknown error',
        }),
        { exitCode: res.exitCode, stdout: res.stdout, stderr: res.stderr, command: cmd },
      );
    }

    this.invalidateCaches();
    const freshList = await this.list({ skipCache: true });
    const created = findByPath(freshList, path) ?? freshList[freshList.length - 1];
    if (!created) {
      throw new GitExecutionError(this.i18n.t('errors.worktreeAddMissingResult', { path }), {
        exitCode: 2,
        stdout: res.stdout,
        stderr: res.stderr,
        command: cmd,
      });
    }

    let setupApplied: SetupApplyResult | undefined;
    if (!options.skipSetup) {
      const cfg = await this.setup.loadConfig().catch(() => undefined);
      if (cfg?.setup) setupApplied = await this.setup.apply(cfg, created.path);
    }

    const result: WorktreeAddResult = {
      worktree: created,
      kind,
      branchName,
      newBranchCreated: kind === 'new-branch',
      setup: setupApplied
        ? {
            copied: setupApplied.copied,
            symlinked: setupApplied.symlinked,
            warnings: setupApplied.warnings,
          }
        : undefined,
    };
    this.events.emit('worktree:added', result);
    return result;
  }

  public async remove(
    path: string,
    options: RemoveWorktreeOptions = {},
  ): Promise<WorktreeRemoveResult> {
    const root = this.adapter.cwd();
    const worktreePath = isAbsolute(path) ? path : resolve(root, path);
    const list = await this.list({ skipCache: true });
    const target = findByPath(list, worktreePath);
    if (!target) {
      throw new GitExecutionError(this.i18n.t('errors.worktreeNotFound', { path: worktreePath }), {
        exitCode: 1,
        stdout: '',
        stderr: 'not in worktree list',
        command: 'worktree remove',
      });
    }

    const state = target.isBare
      ? undefined
      : await this.getStatus(worktreePath).catch(() => undefined);

    if (state && state.dirty && options.force !== true) {
      const files = [...state.modifiedFiles, ...state.untrackedFiles, ...state.deletedFiles];
      throw new DirtyWorktreeError(
        this.i18n.t('errors.dirtyWorktree', {
          path: worktreePath,
          count: String(files.length),
        }),
        { worktreePath, files },
      );
    }

    if (!options.skipPushCheck && options.force !== true) {
      const ahead = state?.aheadBy ?? 0;
      if (ahead > 0 && target.branch) {
        const branchShort = target.branch.replace(/^refs\/heads\//, '');
        throw new BranchAheadError(
          this.i18n.t('errors.branchAheadBeforeRemove', {
            branch: branchShort,
            ahead: String(ahead),
          }),
          { branch: branchShort, aheadBy: ahead },
        );
      }
    }

    const removeCmd = options.force
      ? `worktree remove --force ${quote(worktreePath)}`
      : `worktree remove ${quote(worktreePath)}`;
    const removeRes = await this.adapter.exec(removeCmd);
    if (removeRes.exitCode !== 0) {
      throw new GitExecutionError(
        this.i18n.t('errors.worktreeRemoveFailed', { stderr: removeRes.stderr || 'unknown' }),
        {
          exitCode: removeRes.exitCode,
          stdout: removeRes.stdout,
          stderr: removeRes.stderr,
          command: removeCmd,
        },
      );
    }

    const branchDeleted: { local?: boolean; remote?: boolean } = {};
    const branchShort = target.branch?.replace(/^refs\/heads\//, '');
    if (options.deleteBranch === true && branchShort && !target.isDetached) {
      await this.branch.deleteLocal(branchShort, { force: options.force });
      branchDeleted.local = true;
    }
    if (options.deleteRemoteBranch === true && branchShort && !target.isDetached) {
      await this.branch.deleteRemote(branchShort);
      branchDeleted.remote = true;
    }

    this.invalidateCaches();
    this.events.emit('worktree:removed', worktreePath, options);

    return {
      ok: true,
      removedPath: worktreePath,
      force: options.force === true,
      skippedPushCheck: options.skipPushCheck === true,
      warnings:
        state?.dirty && options.force ? [`removed dirty worktree (force=${options.force})`] : [],
      branchDeleted,
      message: `worktree at ${worktreePath} removed`,
    };
  }

  public async prune(options?: { readonly dryRun?: boolean }): Promise<PruneResult> {
    const before = await this.list({ skipCache: true });
    const cmd = options?.dryRun === true ? 'worktree prune --dry-run' : 'worktree prune';
    const res = await this.adapter.exec(cmd);
    if (res.exitCode !== 0) {
      throw new GitExecutionError(
        this.i18n.t('errors.worktreePruneFailed', { stderr: res.stderr || 'unknown' }),
        { exitCode: res.exitCode, stdout: res.stdout, stderr: res.stderr, command: cmd },
      );
    }
    if (options?.dryRun === true) {
      const prunedPaths = parseDryRunPrunedPaths(res.stdout + ' ' + res.stderr);
      this.events.emit('worktree:pruned', prunedPaths);
      return {
        ok: true,
        warnings: prunedPaths.length > 0 ? [`${prunedPaths.length} path(s) would be pruned`] : [],
        prunedPaths,
        message: 'dry-run: no files actually removed',
      };
    }
    const after = await this.list({ skipCache: true });
    const prunedPaths = before.filter((w) => !findByPath(after, w.path)).map((w) => w.path);
    this.events.emit('worktree:pruned', prunedPaths);
    return {
      ok: true,
      prunedPaths,
      warnings: [],
      message: prunedPaths.length
        ? `${prunedPaths.length} stale worktree reference(s) pruned`
        : 'nothing to prune',
    };
  }
}

function buildWorktreeAddCommand(options: AddWorktreeOptions, resolvedPath: string): string {
  const p = quote(resolvedPath);
  if (options.branchNewName) {
    const forceFlag = options.forceBranchCreate ? '-B' : '-b';
    const startPoint = options.remoteBranch ? ` ${quote(options.remoteBranch)}` : '';
    return `worktree add ${forceFlag} ${quote(options.branchNewName)} ${p}${startPoint}`;
  }
  if (options.remoteBranch) {
    return `worktree add ${p} ${quote(options.remoteBranch)}`;
  }
  if (options.branchExistingName) {
    return `worktree add ${p} ${quote(options.branchExistingName)}`;
  }
  return `worktree add --detach ${p} HEAD`;
}

function extractLocalBranchName(remoteBranch: string | undefined): string | undefined {
  if (!remoteBranch) return undefined;
  const parts = remoteBranch.split('/');
  if (parts.length === 1) return parts[0];
  return parts.slice(1).join('/');
}

function findByPath(list: readonly Worktree[], path: string): Worktree | undefined {
  const sameFs = (a: string, b: string): boolean => a === b;
  return (
    list.find((w) => sameFs(w.path, path)) ?? list.find((w) => realpathLikeEqual(w.path, path))
  );
}

function realpathLikeEqual(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/\/$/, '').replace(/\/\.?$/, '');
  return norm(a) === norm(b);
}

function quote(s: string): string {
  if (/^[a-zA-Z0-9@/+_:.\-~]+$/.test(s)) return s;
  const escaped = s.replaceAll("'", String.raw`'\''`);
  return `'${escaped}'`;
}

function parseDryRunPrunedPaths(output: string): readonly string[] {
  const results: string[] = [];
  for (const rawLine of output.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^Pruning (?:worktree |directory |gitfile )?/i.test(line)) {
      const path = line
        .replace(/^Pruning (?:worktree |directory |gitfile )?/i, '')
        .replace(/[.:']+$/g, '')
        .replace(/^\s*'?/, '')
        .replace(/'?$/, '')
        .trim();
      if (path) results.push(path);
      continue;
    }
    if (safeExistsAnywhere(line)) results.push(line);
  }
  return results;
}

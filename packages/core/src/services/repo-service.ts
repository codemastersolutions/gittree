import type { GitAdapter } from '../adapters/types.js';
import type { WorktreeService } from './worktree-service.js';
import type {
  RepoStatusReport,
  Worktree,
  WorktreeState,
  WorktreeStateKind,
} from '../types/index.js';

export interface CommitLogEntry {
  readonly hashShort: string;
  readonly hash: string;
  readonly author: string;
  readonly dateIso: string;
  readonly subject: string;
}

const EMPTY_COUNT: Record<WorktreeStateKind, number> = {
  clean: 0,
  dirty: 0,
  ahead: 0,
  behind: 0,
  diverged: 0,
  detached: 0,
};

export class RepoService {
  private readonly adapter: GitAdapter;
  private readonly worktreeService: WorktreeService;

  public constructor(adapter: GitAdapter, worktreeService: WorktreeService) {
    this.adapter = adapter;
    this.worktreeService = worktreeService;
  }

  public async getGlobalStatus(): Promise<RepoStatusReport> {
    const worktrees = await this.worktreeService.list({ skipCache: true });
    const main = await this.worktreeService.detectMainWorktree(worktrees);
    const states = new Map<string, WorktreeState>();
    const countByState: Record<WorktreeStateKind, number> = { ...EMPTY_COUNT };

    let totalAheadBy = 0;
    let totalDirty = 0;

    for (const w of worktrees) {
      if (w.isBare) continue;
      const s = await this.worktreeService.getStatus(w.path);
      states.set(w.path, s);
      countByState[s.kind] = countByState[s.kind] + 1;
      if (s.aheadBy > 0) totalAheadBy += s.aheadBy;
      if (s.dirty) totalDirty++;
    }

    const remotes = await this.listRemotes().catch(() => []);

    return {
      mainWorktree: main,
      worktrees,
      states,
      countByState,
      remotes,
      totalAheadBy,
      totalDirty,
    };
  }

  public async logRecent(
    opts: {
      readonly path?: string;
      readonly limit?: number;
    } = {},
  ): Promise<readonly CommitLogEntry[]> {
    const limit = typeof opts.limit === 'number' && opts.limit > 0 ? opts.limit : 10;
    const args = [
      'log',
      '-n',
      String(limit),
      '--pretty=format:%h|%H|%an|%ai|%s',
      '--no-color',
      '--',
    ];
    if (opts.path && opts.path.length > 0) {
      args.push(opts.path);
      const { stdout, exitCode } = await this.adapter.exec(args.join(' '));
      if (exitCode !== 0) return [];
      return parseCommitLog(stdout);
    }
    const { stdout, exitCode } = await this.adapter.exec(args.join(' '));
    if (exitCode !== 0) return [];
    return parseCommitLog(stdout);
  }

  private async listRemotes(): Promise<readonly { readonly name: string; readonly url: string }[]> {
    const { stdout, exitCode } = await this.adapter.exec('remote -v');
    if (exitCode !== 0 || !stdout.trim()) return [];
    const seen = new Map<string, string>();
    for (const line of stdout.split('\n')) {
      const match = /^(\S+)\s+(\S+)\s+\((push|fetch)\)$/.exec(line.trim());
      if (!match) continue;
      const [, name, url] = match;
      if (!seen.has(name!)) seen.set(name!, url!);
    }
    return Array.from(seen.entries()).map(([name, url]) => ({ name, url }));
  }

  public cwd(): string {
    return this.adapter.cwd();
  }
}

function parseCommitLog(stdout: string): readonly CommitLogEntry[] {
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const entries: CommitLogEntry[] = [];
  for (const line of lines) {
    const idx1 = line.indexOf('|');
    if (idx1 < 0) continue;
    const hashShort = line.slice(0, idx1);
    const rest = line.slice(idx1 + 1);
    const idx2 = rest.indexOf('|');
    if (idx2 < 0) continue;
    const hash = rest.slice(0, idx2);
    const rest2 = rest.slice(idx2 + 1);
    const idx3 = rest2.indexOf('|');
    if (idx3 < 0) continue;
    const author = rest2.slice(0, idx3);
    const rest3 = rest2.slice(idx3 + 1);
    const idx4 = rest3.indexOf('|');
    if (idx4 < 0) continue;
    const dateIso = rest3.slice(0, idx4);
    const subject = rest3.slice(idx4 + 1);
    entries.push({ hashShort, hash, author, dateIso, subject });
  }
  return entries;
}

export type { Worktree };

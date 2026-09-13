import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MockGitAdapter } from '../testing/index.js';
import {
  WorktreeService,
  SyncService,
  RepoService,
  createGitTree,
  countSyncFailed,
  countByResult,
  type I18n,
} from '../index.js';

function oncePred(cmd: string | RegExp | ((c: string) => boolean)): (c: string) => boolean {
  let used = false;
  const base =
    typeof cmd === 'string'
      ? (c: string) => c === cmd
      : cmd instanceof RegExp
        ? (c: string) => cmd.test(c)
        : cmd;
  return (c: string) => {
    if (used) return false;
    const hit = base(c);
    if (hit) used = true;
    return hit;
  };
}

const LIST_2 = `worktree /tmp/repo/main
HEAD aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
branch refs/heads/main

worktree /tmp/repo/feat
HEAD bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
branch refs/heads/feat
`;

const STATUS_MAIN = `# branch.oid aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
# branch.head main
# branch.upstream origin/main
# branch.ab +0 -0
`;

const STATUS_FEAT = `# branch.oid bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
# branch.head feat
# branch.upstream origin/feat
# branch.ab +0 -0
`;

describe('Task 6 — SyncService + RepoService (Fase 2)', () => {
  let tmp: string;
  let adapter: MockGitAdapter;
  let svc: SyncService;
  let wtsvc: WorktreeService;
  let repo: RepoService;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'gittree-t6-'));
    adapter = new MockGitAdapter({ cwd: tmp, locale: 'en' });
    const gt = createGitTree({ cwd: tmp, adapter });
    wtsvc = gt.worktree as WorktreeService;
    svc = gt.sync;
    repo = gt.repo;
    void (undefined as unknown as I18n);
  });

  it('TR-6.1: pullWorktree modo ff-only → conflict:true quando não é fast-forward (saida stderr "not possible")', async () => {
    adapter.queueOutput(
      oncePred(/^pull --ff-only$/),
      '',
      'fatal: Not possible to fast-forward, aborting.',
      128,
    );
    const r = await svc.pullWorktree('/tmp/repo/feat', 'ff-only');
    expect(r.strategy).toBe('ff-only');
    expect(r.ok).toBe(false);
    expect(r.conflicted).toBe(true);
    expect(r.worktreePath).toBe('/tmp/repo/feat');
  });

  it('pullWorktree ff-only sucesso → ok=true, conflicted=false', async () => {
    adapter.queueOutput(oncePred(/^pull --ff-only$/), 'Updating aaa..bbb\nFast-forward\n', '', 0);
    const r = await svc.pullWorktree('/tmp/repo/main', 'ff-only');
    expect(r.ok).toBe(true);
    expect(r.conflicted).toBe(false);
    expect(r.details).toContain('Fast-forward');
  });

  it('pullWorktree modo rebase conflict → conflicted=true', async () => {
    adapter.queueOutput(
      oncePred(/^pull --rebase$/),
      '',
      'error: Failed to merge in the changes.\nCONFLICT (content): x\n',
      1,
    );
    const r = await svc.pullWorktree('/tmp/repo/feat', 'rebase');
    expect(r.ok).toBe(false);
    expect(r.conflicted).toBe(true);
  });

  it('TR-6.2: pullAll retorna SyncResult[] por worktree', async () => {
    adapter.queueOutput(oncePred(/^fetch --all --prune/), '', '', 0);
    adapter.queueOutput(oncePred('worktree list --porcelain'), LIST_2);
    adapter.queueOutput(oncePred(/^pull --ff-only$/), 'Fast-forward\n', '', 0); // main
    adapter.queueOutput(
      oncePred(/^pull --ff-only$/),
      '',
      'fatal: Not possible to fast-forward, aborting.',
      128,
    ); // feat conflict
    const results = await svc.pullAll({ strategy: 'ff-only', fetchFirst: true });
    expect(results.length).toBe(2);
    expect(results[0]!.ok).toBe(true);
    expect(results[1]!.conflicted).toBe(true);
    expect(countSyncFailed(results)).toBe(1);
    const counts = countByResult(results);
    expect(counts.ok).toBe(1);
    expect(counts.conflicted).toBe(1);
    expect(counts.failed).toBe(1);
    expect(counts.total).toBe(2);
  });

  it('fetchAll chama git fetch --all --prune por padrão', async () => {
    adapter.queueOutput(oncePred('fetch --all --prune'), '', '', 0);
    await svc.fetchAll();
    expect(adapter.wasCalled('fetch --all --prune')).toBe(true);
  });

  it('syncWithMain strategy=rebase contra origin/main → CONFLICT detecta', async () => {
    adapter.queueOutput(
      oncePred(/^rebase origin\/main$/),
      '',
      'CONFLICT (content): Merge conflict in file.ts\n',
      1,
    );
    const r = await svc.syncWithMain('/tmp/repo/feat', {
      strategy: 'rebase',
      mainRef: 'origin/main',
    });
    expect(r.strategy).toBe('rebase');
    expect(r.conflicted).toBe(true);
    expect(r.warnings[0]).toContain('origin/main');
  });

  it('syncWithMain merge sucesso → ok=true, conflicted=false', async () => {
    adapter.queueOutput(
      oncePred(/^merge origin\/main$/),
      'Merge made by the ort strategy.\n',
      '',
      0,
    );
    const r = await svc.syncWithMain('/tmp/repo/feat', { strategy: 'merge' });
    expect(r.ok).toBe(true);
    expect(r.conflicted).toBe(false);
  });

  it('TR-6.3 base: getGlobalStatus agrega states, countByState e totals', async () => {
    adapter.queueOutput(oncePred('worktree list --porcelain'), LIST_2);
    adapter.queueOutput(oncePred(/^status --porcelain=v2 --branch/), STATUS_MAIN, '', 0); // main clean
    adapter.queueOutput(
      oncePred(/^status --porcelain=v2 --branch/),
      STATUS_FEAT + '? new.ts\n',
      '',
      0,
    ); // feat dirty untracked
    adapter.queueOutput(
      oncePred('remote -v'),
      'origin  https://x.git (fetch)\norigin  https://x.git (push)\n',
      '',
      0,
    );
    const status = await repo.getGlobalStatus();
    expect(status.mainWorktree?.path).toBe('/tmp/repo/main');
    expect(status.worktrees.length).toBe(2);
    expect(status.totalDirty).toBe(1);
    expect(status.countByState.clean).toBe(1);
    expect(status.countByState.dirty).toBe(1);
    expect(status.remotes[0]?.name).toBe('origin');
  });

  it('RepoService getGlobalStatus dispara worktree:status por worktree via cache skip', async () => {
    adapter.queueOutput(oncePred('worktree list --porcelain'), LIST_2);
    adapter.queueOutput(oncePred(/^status --porcelain=v2 --branch/), STATUS_MAIN, '', 0);
    adapter.queueOutput(oncePred(/^status --porcelain=v2 --branch/), STATUS_FEAT, '', 0);
    adapter.queueOutput(oncePred('remote -v'), '', '', 0);
    const onStatus = vi.fn();
    wtsvc.events.on('worktree:status', onStatus);
    await repo.getGlobalStatus();
    expect(onStatus).toHaveBeenCalledTimes(2);
  });

  it('syncWithMain strategy=ff-only lança erro (inválido, só merge/rebase permitidos)', async () => {
    await expect(
      svc.syncWithMain('/tmp/repo/feat', {
        strategy: 'ff-only' as unknown as 'merge',
      }),
    ).rejects.toThrow();
  });

  it('pullAll skip worktree bare e detached (adiciona skipped warning só no detached)', async () => {
    const listWithDetached = `worktree /tmp/repo/main
HEAD aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
branch refs/heads/main

worktree /tmp/repo/.git
HEAD bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
bare

worktree /tmp/repo/detached
HEAD cccccccccccccccccccccccccccccccccccccccc
detached
`;
    adapter.queueOutput(oncePred(/^fetch --all --prune/), '', '', 0);
    adapter.queueOutput(oncePred('worktree list --porcelain'), listWithDetached);
    adapter.queueOutput(oncePred(/^pull --ff-only$/), 'Fast-forward\n', '', 0);
    const results = await svc.pullAll({ strategy: 'ff-only', fetchFirst: true });
    expect(results.length).toBe(2);
    expect(results[0]!.ok).toBe(true);
    expect(results[1]!.warnings.some((w) => w.includes('skipped'))).toBe(true);
  });

  it('fetchAll com remote específico e prune=false usa só aquele remote sem --prune', async () => {
    adapter.queueOutput(oncePred('fetch upstream'), '', '', 0);
    await svc.fetchAll({ remote: 'upstream', prune: false });
    expect(adapter.wasCalled('fetch upstream')).toBe(true);
  });

  it('pushWorktree: branch com upstream → executa push simples, ok=true', async () => {
    adapter.queueOutput(oncePred('rev-parse --abbrev-ref HEAD'), 'feat\n', '', 0);
    adapter.queueOutput(
      oncePred('rev-parse --abbrev-ref --symbolic-full-name @{u}'),
      'origin/feat\n',
      '',
      0,
    );
    adapter.queueOutput(oncePred('push'), '', '', 0);
    const res = await svc.pushWorktree('/repo/feat', { setUpstreamIfMissing: false });
    expect(res.ok).toBe(true);
    expect(res.worktreePath).toBe('/repo/feat');
    expect(adapter.wasCalled('push')).toBe(true);
  });

  it('pushWorktree: sem upstream + setUpstreamIfMissing=true → executa push -u origin <branch>', async () => {
    adapter.queueOutput(oncePred('rev-parse --abbrev-ref HEAD'), 'feature-new\n', '', 0);
    adapter.queueOutput(
      oncePred('rev-parse --abbrev-ref --symbolic-full-name @{u}'),
      '',
      'fatal: no upstream configured',
      128,
    );
    adapter.queueOutput(
      oncePred((c) => c.startsWith('push -u origin ')),
      '',
      '',
      0,
    );
    const res = await svc.pushWorktree('/repo/feat', { setUpstreamIfMissing: true });
    expect(res.ok).toBe(true);
    expect(
      adapter.recordedCalls().some((c) => c.command.startsWith('push -u origin feature-new')),
    ).toBe(true);
    expect(adapter.recordedCalls().some((c) => c.command === 'push')).toBe(false);
  });

  it('pushWorktree: rev-parse HEAD retorna vazio/exit!=0 → ok=false', async () => {
    adapter.queueOutput(oncePred('rev-parse --abbrev-ref HEAD'), '', '', 128);
    const res = await svc.pushWorktree('/repo/detached');
    expect(res.ok).toBe(false);
  });

  it('pushWorktree: push exit!=0 → ok=false', async () => {
    adapter.queueOutput(oncePred('rev-parse --abbrev-ref HEAD'), 'main\n', '', 0);
    adapter.queueOutput(
      oncePred('rev-parse --abbrev-ref --symbolic-full-name @{u}'),
      'origin/main\n',
      '',
      0,
    );
    adapter.queueOutput(oncePred('push'), '', 'fatal: permission denied', 128);
    const res = await svc.pushWorktree('/repo/main');
    expect(res.ok).toBe(false);
  });
});

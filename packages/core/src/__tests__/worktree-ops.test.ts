/* eslint security/detect-non-literal-fs-filename: off -- integration tests rely on mkdtemp + random UUID paths; these are 100% false positives for the rule. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { MockGitAdapter } from '../testing/index.js';
import {
  WorktreeService,
  BranchLockedError,
  DirtyWorktreeError,
  BranchAheadError,
  GitExecutionError,
  createGitTree,
} from '../index.js';
import type { Worktree } from '../types/index.js';

const BASE_WORKTREES_PORCELAIN = `worktree /tmp/repo/main
HEAD abcdef1234567890abcdef1234567890abcdef12
branch refs/heads/main

worktree /tmp/repo/feature-auth
HEAD 1111111111111111111111111111111111111111
branch refs/heads/feature/auth
`;

const STATUS_CLEAN = `# branch.oid abcdef1234567890abcdef1234567890abcdef12
# branch.head main
# branch.upstream origin/main
# branch.ab +0 -0
`;

const STATUS_DIRTY = `# branch.oid 2222222222222222222222222222222222222222
# branch.head feature/auth
# branch.upstream origin/feature/auth
# branch.ab +3 -1
1 .M N... 100644 100644 100644 aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa src/auth.ts
? .env.local
`;

const STATUS_AHEAD_3 = `# branch.oid 3333333333333333333333333333333333333333
# branch.head feature/auth
# branch.upstream origin/feature/auth
# branch.ab +3 -0
`;

function makeMain(): Worktree {
  return {
    path: '/tmp/repo/main',
    head: 'abcdef1234567890abcdef1234567890abcdef12',
    branch: 'refs/heads/main',
    isMain: true,
    isDetached: false,
    isBare: false,
    isPrunable: false,
  };
}

function afterAddFixture(
  path: string,
  branchName: string,
  head = '9999999999999999999999999999999999999999',
): string {
  return (
    BASE_WORKTREES_PORCELAIN.trimEnd() +
    `\n\nworktree ${path}\nHEAD ${head}\nbranch refs/heads/${branchName}\n`
  );
}

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

describe('Task 4 — Worktree Add (core engine Fase 2)', () => {
  let adapter: MockGitAdapter;
  let svc: WorktreeService;
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'gittree-t4-'));
    adapter = new MockGitAdapter({ cwd: tmp, locale: 'en' });
    svc = new WorktreeService(adapter);
    adapter.queueOutput(oncePred('worktree list --porcelain'), BASE_WORKTREES_PORCELAIN);
  });

  it('TR-4.1: add cria worktree com nova branch -b e retorna Worktree correto', async () => {
    adapter.queueOutput(oncePred(/^worktree add -b feature\/pay/), '', '', 0);
    adapter.queueOutput(
      oncePred('worktree list --porcelain'),
      afterAddFixture('/tmp/repo/pay', 'feature/pay'),
    );
    const result = await svc.add({
      path: '/tmp/repo/pay',
      branchNewName: 'feature/pay',
      skipSetup: true,
    });
    expect(result.kind).toBe('new-branch');
    expect(result.newBranchCreated).toBe(true);
    expect(result.branchName).toBe('feature/pay');
    expect(result.worktree.branch).toBe('refs/heads/feature/pay');
    expect(result.worktree.path).toBe('/tmp/repo/pay');
    expect(result.setup).toBeUndefined();
    expect(adapter.wasCalled('worktree add -b feature/pay /tmp/repo/pay')).toBe(true);
  });

  it('add com remote branch origin/feature/chat usa tipo remote-branch', async () => {
    adapter.queueOutput(
      oncePred(/^worktree add \/tmp\/repo\/chat origin\/feature\/chat$/),
      '',
      '',
      0,
    );
    adapter.queueOutput(
      oncePred('worktree list --porcelain'),
      afterAddFixture('/tmp/repo/chat', 'feature/chat'),
    );
    const res = await svc.add({
      path: '/tmp/repo/chat',
      remoteBranch: 'origin/feature/chat',
      skipSetup: true,
    });
    expect(res.kind).toBe('remote-branch');
    expect(res.branchName).toBe('feature/chat');
    expect(res.newBranchCreated).toBe(false);
    expect(adapter.wasCalled(/worktree add \/tmp\/repo\/chat origin\/feature\/chat/)).toBe(true);
  });

  it('TR-4.2: branch existente em outra worktree lança BranchLockedError', async () => {
    await expect(
      svc.add({
        path: '/tmp/repo/feature-auth-2',
        branchExistingName: 'feature/auth',
        skipSetup: true,
      }),
    ).rejects.toThrow(BranchLockedError);
  });

  it('path já existe (fs) lança GitExecutionError antes de chamar git', async () => {
    const existing = resolve(tmp, 'already-exists');
    await mkdir(existing, { recursive: true });
    await expect(svc.add({ path: existing, skipSetup: true })).rejects.toThrow(GitExecutionError);
    expect(adapter.callCount(/^worktree add/)).toBe(0);
    await rm(existing, { recursive: true, force: true });
  });

  it('TR-4.3: setup script copy .env copia arquivo após criação (real fs)', async () => {
    const envPath = resolve(tmp, '.env');
    await writeFile(envPath, 'HELLO=from-root\n');
    await writeFile(
      resolve(tmp, '.gittree.json'),
      JSON.stringify({ setup: { copy: ['.env'], symlink: [] } }),
    );
    const gt = createGitTree({ cwd: tmp, adapter });
    const cfg = await gt.setup.loadConfig();
    expect(cfg?.setup?.copy).toEqual(['.env']);
    const newPath = resolve(tmp, '..', 'gittree-t4-new-' + Math.random().toString(36).slice(2, 8));
    try {
      await mkdir(newPath, { recursive: true });
      const applied = await gt.setup.apply(cfg!, newPath);
      expect(applied.copied).toContain('.env');
      expect((await stat(resolve(newPath, '.env'))).isFile()).toBe(true);
    } finally {
      await rm(newPath, { recursive: true, force: true });
    }
  });

  it('add com branchExistingName (não lockada) usa kind=existing-branch', async () => {
    adapter.queueOutput(oncePred(/^worktree add \/tmp\/repo\/chore feature\/chore$/), '', '', 0);
    adapter.queueOutput(
      oncePred('worktree list --porcelain'),
      afterAddFixture('/tmp/repo/chore', 'feature/chore'),
    );
    const r = await svc.add({
      path: '/tmp/repo/chore',
      branchExistingName: 'feature/chore',
      skipSetup: true,
    });
    expect(r.kind).toBe('existing-branch');
    expect(r.newBranchCreated).toBe(false);
    expect(r.branchName).toBe('feature/chore');
  });

  it('emite evento worktree:added após add', async () => {
    adapter.queueOutput(oncePred(/^worktree add -b evt-test/), '', '', 0);
    adapter.queueOutput(
      oncePred('worktree list --porcelain'),
      afterAddFixture('/tmp/repo/evt', 'evt-test'),
    );
    const added = vi.fn();
    svc.events.on('worktree:added', added);
    await svc.add({ path: '/tmp/repo/evt', branchNewName: 'evt-test', skipSetup: true });
    expect(added).toHaveBeenCalledTimes(1);
    expect(added.mock.calls[0]![0]!.worktree.path).toBe('/tmp/repo/evt');
  });
});

describe('Task 5 — Worktree Remove + Prune + BranchService', () => {
  let adapter: MockGitAdapter;
  let svc: WorktreeService;
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'gittree-t5-'));
    adapter = new MockGitAdapter({ cwd: tmp, locale: 'en' });
    svc = new WorktreeService(adapter);
  });

  it('TR-5.1: worktree dirty sem force → DirtyWorktreeError com arquivos', async () => {
    adapter.queueOutput(oncePred('worktree list --porcelain'), BASE_WORKTREES_PORCELAIN);
    adapter.queueOutput(oncePred(/^status --porcelain=v2 --branch$/), STATUS_DIRTY, '', 0);
    await expect(svc.remove('/tmp/repo/feature-auth')).rejects.toThrow(DirtyWorktreeError);

    adapter.reset();
    adapter.queueOutput(oncePred('worktree list --porcelain'), BASE_WORKTREES_PORCELAIN);
    adapter.queueOutput(oncePred(/^status --porcelain=v2 --branch$/), STATUS_DIRTY, '', 0);
    let err: DirtyWorktreeError | undefined;
    try {
      await svc.remove('/tmp/repo/feature-auth');
    } catch (e) {
      err = e as DirtyWorktreeError;
    }
    expect(err).toBeDefined();
    expect(err!.context?.worktreePath).toBe('/tmp/repo/feature-auth');
    const files = ((err!.context as { files?: string[] } | undefined)?.files ?? []) as string[];
    expect(files).toContain('src/auth.ts');
    expect(files).toContain('.env.local');
  });

  it('TR-5.2: remove com force em dirty worktree executa sem erro', async () => {
    adapter.queueOutput(oncePred('worktree list --porcelain'), BASE_WORKTREES_PORCELAIN);
    adapter.queueOutput(oncePred(/^status --porcelain=v2 --branch/), STATUS_DIRTY, '', 0);
    adapter.queueOutput(oncePred(/^worktree remove --force/), '', '', 0);
    adapter.queueOutput(
      oncePred('worktree list --porcelain'),
      BASE_WORKTREES_PORCELAIN.replace(
        /worktree \/tmp\/repo\/feature-auth[\s\S]*?\n\n(?=worktree|$)/,
        '',
      ),
    );
    const r = await svc.remove('/tmp/repo/feature-auth', { force: true });
    expect(r.ok).toBe(true);
    expect(r.force).toBe(true);
    expect(r.warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('TR-5.3: remove com deleteBranch: true deleta branch local após remoção', async () => {
    adapter.queueOutput(oncePred('worktree list --porcelain'), BASE_WORKTREES_PORCELAIN);
    adapter.queueOutput(oncePred(/^status --porcelain=v2 --branch/), STATUS_CLEAN, '', 0);
    adapter.queueOutput(oncePred(/^worktree remove \/tmp\/repo\/feature-auth$/), '', '', 0);
    adapter.queueOutput(oncePred(/^branch -d feature\/auth$/), '', '', 0);
    adapter.queueOutput(oncePred('worktree list --porcelain'), BASE_WORKTREES_PORCELAIN);
    const r = await svc.remove('/tmp/repo/feature-auth', { deleteBranch: true });
    expect(r.branchDeleted?.local).toBe(true);
    expect(adapter.wasCalled('branch -d feature/auth')).toBe(true);
  });

  it('remove com branch ahead (e sem force/skipPushCheck) → BranchAheadError', async () => {
    adapter.queueOutput(oncePred('worktree list --porcelain'), BASE_WORKTREES_PORCELAIN);
    adapter.queueOutput(oncePred(/^status --porcelain=v2 --branch/), STATUS_AHEAD_3, '', 0);
    await expect(svc.remove('/tmp/repo/feature-auth')).rejects.toThrow(BranchAheadError);

    adapter.reset();
    adapter.queueOutput(oncePred('worktree list --porcelain'), BASE_WORKTREES_PORCELAIN);
    adapter.queueOutput(oncePred(/^status --porcelain=v2 --branch/), STATUS_AHEAD_3, '', 0);
    adapter.queueOutput(oncePred(/^worktree remove \/tmp\/repo\/feature-auth$/), '', '', 0);
    adapter.queueOutput(oncePred('worktree list --porcelain'), BASE_WORKTREES_PORCELAIN);
    const r = await svc.remove('/tmp/repo/feature-auth', { skipPushCheck: true });
    expect(r.skippedPushCheck).toBe(true);
  });

  it('prune dry-run retorna caminhos que seriam prunados sem alterar lista', async () => {
    adapter.queueOutput(oncePred('worktree list --porcelain'), BASE_WORKTREES_PORCELAIN);
    adapter.queueOutput(
      oncePred('worktree prune --dry-run'),
      'Pruning /tmp/repo/stale-1\nPruning /tmp/repo/stale-2',
      '',
      0,
    );
    const r = await svc.prune({ dryRun: true });
    expect(r.ok).toBe(true);
    expect(r.prunedPaths).toEqual(
      expect.arrayContaining(['/tmp/repo/stale-1', '/tmp/repo/stale-2']),
    );
    expect(r.message).toContain('dry-run');
  });

  it('prune real compara before/after → retorna prunedPaths removidos', async () => {
    const withStale =
      BASE_WORKTREES_PORCELAIN.trimEnd() +
      `\n\nworktree /tmp/repo/stale-gone\nHEAD deadbeefdeadbeefdeadbeefdeadbeefdeadbeef\nbranch refs/heads/stale\nprunable\n`;
    adapter.queueOutput(oncePred('worktree list --porcelain'), withStale);
    adapter.queueOutput(oncePred('worktree prune'), '', '', 0);
    adapter.queueOutput(oncePred('worktree list --porcelain'), BASE_WORKTREES_PORCELAIN);
    const r = await svc.prune();
    expect(r.ok).toBe(true);
    expect(r.prunedPaths).toEqual(['/tmp/repo/stale-gone']);
    expect(adapter.wasCalled('worktree prune')).toBe(true);
  });

  it('BranchService deleteRemote chama push origin --delete name', async () => {
    const { branch } = createGitTree({ cwd: tmp, adapter });
    adapter.queueOutput(oncePred(/^push origin --delete hotfix-1$/), '', '', 0);
    const r = await branch.deleteRemote('hotfix-1');
    expect(r.remote).toBe('origin');
    expect(r.deleted).toBe(true);
  });

  it('WorktreeService.remove com deleteRemoteBranch = true deleta branch local + remota', async () => {
    adapter.queueOutput(oncePred('worktree list --porcelain'), BASE_WORKTREES_PORCELAIN);
    adapter.queueOutput(oncePred(/^status --porcelain=v2 --branch/), STATUS_CLEAN, '', 0);
    adapter.queueOutput(oncePred(/^worktree remove \/tmp\/repo\/feature-auth$/), '', '', 0);
    adapter.queueOutput(oncePred(/^branch -d feature\/auth$/), '', '', 0);
    adapter.queueOutput(oncePred(/^push origin --delete feature\/auth$/), '', '', 0);
    adapter.queueOutput(oncePred('worktree list --porcelain'), BASE_WORKTREES_PORCELAIN);
    const r = await svc.remove('/tmp/repo/feature-auth', {
      deleteBranch: true,
      deleteRemoteBranch: true,
    });
    expect(r.branchDeleted?.local).toBe(true);
    expect(r.branchDeleted?.remote).toBe(true);
    expect(adapter.wasCalled('push origin --delete feature/auth')).toBe(true);
  });
});

void makeMain;

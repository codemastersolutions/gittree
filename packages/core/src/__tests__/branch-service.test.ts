import { beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MockGitAdapter } from '../testing/index.js';
import { BranchService, createGitTree, type Branch } from '../index.js';

const LOCAL_BRANCHES_RAW =
  'main|*|origin/main\n' + 'feat||origin/feat-x\n' + 'bugfix/abc||\n' + 'no-upstream||';

const REMOTE_BRANCHES_RAW = 'origin/main\n' + 'origin/feat\n' + 'origin/HEAD\n' + 'upstream/stable';

describe('BranchService listLocal + listRemote (Fase 5 core)', () => {
  let tmp: string;
  let adapter: MockGitAdapter;
  let svc: BranchService;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'gittree-branch-'));
    adapter = new MockGitAdapter({ cwd: tmp });
    const gt = createGitTree({ cwd: tmp, adapter });
    svc = gt.branch as BranchService;
  });

  it('listLocal parses for-each-ref output with upstream/head flags', async () => {
    adapter.queueOutput(/refs\/heads/, LOCAL_BRANCHES_RAW);
    const branches = await svc.listLocal();
    expect(branches.length).toBe(4);
    const main = branches.find((b: Branch) => b.name === 'main')!;
    expect(main).toBeTruthy();
    expect(main.isCurrent).toBe(true);
    expect(main.isRemote).toBe(false);
    expect(main.upstream).toBe('origin/main');
    expect(main.remote).toBe('origin');
    expect(main.aheadBy).toBe(0);
    expect(main.behindBy).toBe(0);
    const feat = branches.find((b: Branch) => b.name === 'feat')!;
    expect(feat.isCurrent).toBe(false);
    expect(feat.upstream).toBe('origin/feat-x');
    expect(feat.remote).toBe('origin');
    const bug = branches.find((b: Branch) => b.name === 'bugfix/abc')!;
    expect(bug.upstream).toBeUndefined();
    expect(bug.remote).toBeUndefined();
    const noUp = branches.find((b: Branch) => b.name === 'no-upstream')!;
    expect(noUp.upstream).toBeUndefined();
  });

  it('listLocal throws GitExecutionError when git fails (default exit)', async () => {
    adapter.setDefaultExitCode(128);
    await expect(svc.listLocal()).rejects.toThrow(/list-local-branches failed/);
  });

  it('listRemote filters /HEAD symref and splits remote name', async () => {
    adapter.queueOutput(/refs\/remotes/, REMOTE_BRANCHES_RAW);
    const remotes = await svc.listRemote();
    expect(remotes.length).toBe(3);
    const names = remotes.map((r: Branch) => r.name);
    expect(names).not.toContain('origin/HEAD');
    expect(names).toEqual(
      expect.arrayContaining(['origin/main', 'origin/feat', 'upstream/stable']),
    );
    const main = remotes.find((r: Branch) => r.name === 'origin/main')!;
    expect(main.isRemote).toBe(true);
    expect(main.remote).toBe('origin');
    expect(main.upstream).toBeUndefined();
    expect(main.isCurrent).toBe(false);
    const stable = remotes.find((r: Branch) => r.name === 'upstream/stable')!;
    expect(stable.remote).toBe('upstream');
  });

  it('listRemote throws GitExecutionError when git fails (default exit)', async () => {
    adapter.setDefaultExitCode(128);
    await expect(svc.listRemote()).rejects.toThrow(/list-remote-branches failed/);
  });
});

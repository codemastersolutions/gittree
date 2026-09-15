import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { createGitTree, RealGitAdapter } from '@codemastersolutions/gittree-core';
import { createTemporaryRepo, type TemporaryRepo } from './setup.js';

describe('integration · createGitTree against a real git repo', () => {
  let repo: TemporaryRepo;
  let tree: ReturnType<typeof createGitTree>;

  beforeEach(async () => {
    repo = await createTemporaryRepo();
    // On macOS `os.tmpdir()` returns `/var/folders/...` which is a
    // symlink to `/private/var/folders/...`; git resolves it before
    // returning, so we hand the canonical path to the engine to keep
    // `isMain` detection accurate.
    const canonical = realpathSync(repo.path);
    tree = createGitTree({ cwd: canonical });
  });

  afterEach(() => {
    repo.cleanup();
  });

  it('exposes a RealGitAdapter bound to the repo cwd', () => {
    const adapter = new RealGitAdapter({ cwd: repo.path });
    expect(adapter.cwd()).toBe(repo.path);
    expect(typeof adapter.locale).toBe('string');
  });

  it('lists the main worktree and reports the current branch', async () => {
    const list = await tree.worktree.list({ skipCache: true });
    expect(list).toHaveLength(1);
    expect(list[0]!.isMain).toBe(true);
    expect(list[0]!.branch).toBe(`refs/heads/${repo.mainBranch}`);
  });

  it('creates a new worktree with a new branch, then removes it', async () => {
    // Resolve symlinks up-front so the path we hand to git matches what
    // git stores back. On macOS `os.tmpdir()` returns `/var/folders/...`
    // while git writes the resolved `/private/var/folders/...`.
    const wtPath = realpathSync(dirname(repo.path)) + '/feature-x';
    const added = await tree.worktree.add({
      path: wtPath,
      branchNewName: 'feature/x',
    });

    expect(added.kind).toBe('new-branch');
    expect(added.newBranchCreated).toBe(true);
    expect(added.branchName).toBe('feature/x');
    expect(added.worktree.path).toBe(wtPath);
    expect(added.worktree.branch).toBe('refs/heads/feature/x');
    expect(added.worktree.isMain).toBe(false);

    const afterAdd = await tree.worktree.list({ skipCache: true });
    expect(afterAdd).toHaveLength(2);
    expect(afterAdd.map((w) => w.path)).toContain(wtPath);

    await tree.worktree.remove(wtPath, { force: true });

    const afterRemove = await tree.worktree.list({ skipCache: true });
    expect(afterRemove).toHaveLength(1);
    expect(afterRemove.map((w) => w.path)).not.toContain(wtPath);
  });

  it('reports a clean status for the freshly initialised main worktree', async () => {
    const main = await tree.worktree.detectMainWorktree();
    expect(main).toBeDefined();
    const state = await tree.worktree.getStatus(main!.path);
    expect(state.kind).toBe('clean');
    expect(state.dirty).toBe(false);
    expect(state.aheadBy).toBe(0);
    expect(state.behindBy).toBe(0);
  });

  it('detects dirtiness when files are added to the worktree', async () => {
    const main = await tree.worktree.detectMainWorktree();
    expect(main).toBeDefined();

    const dirtyFile = join(main!.path, 'scratch.txt');
    writeFileSync(dirtyFile, 'hello\n');

    const state = await tree.worktree.getStatus(main!.path);
    expect(state.dirty).toBe(true);
    expect(state.untrackedFiles).toContain('scratch.txt');
  });

  it('produces a global repo status with the main worktree and zero ahead/behind', async () => {
    const report = await tree.repo.getGlobalStatus();
    expect(report.worktrees).toHaveLength(1);
    expect(report.mainWorktree?.path).toBe(report.worktrees[0]!.path);
    expect(report.totalAheadBy).toBe(0);
    expect(report.totalDirty).toBe(0);
    expect(report.remotes).toEqual([]);
  });

  it('returns commit log entries for the initial commit', async () => {
    const log = await tree.repo.logRecent({ limit: 5 });
    expect(log.length).toBeGreaterThan(0);
    expect(log[0]!.subject).toContain('initial commit');
    expect(log[0]!.hash.length).toBe(40);
    expect(log[0]!.hashShort.length).toBeGreaterThanOrEqual(7);
  });

  it('creates a fresh subdirectory under the main repo (sanity)', () => {
    const sub = join(repo.path, 'nested');
    mkdirSync(sub, { recursive: true });
    expect(require('node:fs').existsSync(sub)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';

import { createGitTree } from './git-tree.js';
import { MockGitAdapter } from './testing/mock-git-adapter.js';
import { WORKTREE_LIST_4, STATUS_CLEAN } from './__fixtures__/index.js';

describe('createGitTree facade', () => {
  it('returns a functional GitTree instance with wired services', async () => {
    const adapter = new MockGitAdapter({ cwd: '/repo' });
    adapter.queueOutput('worktree list --porcelain', WORKTREE_LIST_4);
    adapter.queueOutput('status --porcelain=v2 --branch', STATUS_CLEAN);

    const gt = createGitTree({ cwd: '/repo', adapter, locale: 'pt-br' });
    expect(gt.locale).toBe('pt-br');
    expect(gt.cwd).toBe('/repo');

    const list = await gt.worktree.list();
    expect(list.length).toBeGreaterThan(0);

    const status = await gt.worktree.getStatus(list[0]!.path);
    expect(status.kind).toBe('clean');
  });

  it('creates RealGitAdapter by default if adapter omitted', () => {
    const gt = createGitTree({ cwd: process.cwd() });
    expect(typeof gt.worktree.getStatus).toBe('function');
  });
});

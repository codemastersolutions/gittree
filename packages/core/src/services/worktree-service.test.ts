import { describe, it, expect, beforeEach, vi } from 'vitest';

import { WorktreeService } from '../services/worktree-service.js';
import { MockGitAdapter } from '../testing/mock-git-adapter.js';
import { WORKTREE_LIST_4, STATUS_DIRTY_AHEAD_BEHIND, STATUS_CLEAN } from '../__fixtures__/index.js';

describe('WorktreeService', () => {
  let adapter: MockGitAdapter;
  let service: WorktreeService;

  beforeEach(() => {
    adapter = new MockGitAdapter({ cwd: '/Users/alice/repo-main' });
    service = new WorktreeService(adapter);
  });

  it('list() calls worktree list --porcelain and emits worktree:listed', async () => {
    adapter.queueOutput('worktree list --porcelain', WORKTREE_LIST_4);
    const spy = vi.fn();
    service.events.on('worktree:listed', spy);

    const list = await service.list();
    expect(list).toHaveLength(4);
    expect(list[0]?.path).toBe('/Users/alice/repo-main');
    expect(list[0]?.isMain).toBe(true);
    expect(list[2]?.isDetached).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(list);
    expect(adapter.wasCalled('worktree list --porcelain')).toBe(true);
  });

  it('list() uses short-lived cache on second call', async () => {
    adapter.queueOutput('worktree list --porcelain', WORKTREE_LIST_4);
    await service.list();
    await service.list();
    expect(adapter.callCount('worktree list --porcelain')).toBe(1);
  });

  it('list({ skipCache: true }) bypasses cache', async () => {
    adapter.queueOutput('worktree list --porcelain', WORKTREE_LIST_4);
    adapter.queueOutput('worktree list --porcelain', WORKTREE_LIST_4);
    await service.list();
    await service.list({ skipCache: true });
    expect(adapter.callCount('worktree list --porcelain')).toBe(2);
  });

  it('invalidateCaches() forces new exec on subsequent list()', async () => {
    adapter.queueOutput('worktree list --porcelain', WORKTREE_LIST_4);
    adapter.queueOutput('worktree list --porcelain', WORKTREE_LIST_4);
    await service.list();
    service.invalidateCaches();
    await service.list();
    expect(adapter.callCount('worktree list --porcelain')).toBe(2);
  });

  it('getStatus() executes status porcelain=v2 scoped to worktree cwd', async () => {
    adapter.queueOutput('status --porcelain=v2 --branch', STATUS_DIRTY_AHEAD_BEHIND);
    const s = await service.getStatus('/Users/alice/repo-feature-auth');
    expect(s.dirty).toBe(true);
    expect(s.modifiedFiles).toContain('src/auth/login.ts');

    const record = adapter.recordedCalls()[0];
    expect(record?.options?.cwd).toBe('/Users/alice/repo-feature-auth');
  });

  it('getStatus emits worktree:status event', async () => {
    adapter.queueOutput('status --porcelain=v2 --branch', STATUS_CLEAN);
    const spy = vi.fn();
    service.events.on('worktree:status', spy);
    const s = await service.getStatus('/tmp');
    expect(spy).toHaveBeenCalledWith('/tmp', s);
  });

  it('detectMainWorktree returns existing isMain=true entry', async () => {
    adapter.queueOutput('worktree list --porcelain', WORKTREE_LIST_4);
    const m = await service.detectMainWorktree();
    expect(m?.path).toBe('/Users/alice/repo-main');
    expect(m?.branch).toBe('main');
  });
});

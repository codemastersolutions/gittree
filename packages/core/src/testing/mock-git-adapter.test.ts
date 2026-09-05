import { describe, it, expect } from 'vitest';

import { MockGitAdapter } from '../testing/mock-git-adapter.js';

describe('MockGitAdapter', () => {
  const make = (cwd = '/tmp/repo') => new MockGitAdapter({ cwd });

  it('returns queued output by exact command match', () => {
    const a = make();
    a.queueOutput('worktree list --porcelain', 'OUT');
    return expect(a.exec('worktree list --porcelain').then((r) => r.stdout)).resolves.toBe('OUT');
  });

  it('returns queued output by regex predicate', async () => {
    const a = make();
    a.queueOutput(/status\s+--porcelain/, 'M foo.ts\n?? bar.ts');
    const r = await a.exec('status --porcelain=v2');
    expect(r.stdout).toContain('M foo.ts');
  });

  it('records all calls with options', () => {
    const a = make();
    a.exec('status', { cwd: '/tmp/x' });
    a.exec('version');
    const calls = a.recordedCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0]?.command).toBe('status');
    expect(calls[0]?.options?.cwd).toBe('/tmp/x');
  });

  it('wasCalled / callCount filter by predicate', () => {
    const a = make();
    a.exec('worktree list --porcelain');
    a.exec('worktree list --porcelain');
    a.exec('pull');
    expect(a.callCount(/worktree/)).toBe(2);
    expect(a.wasCalled((c) => c.startsWith('pull'))).toBe(true);
  });

  it('version() returns mocked version that satisfies 2.24', async () => {
    const a = make();
    const v = await a.version();
    expect(v.major).toBe(2);
    expect(v.minor).toBe(45);
    expect(v.satisfies(2, 24)).toBe(true);
    expect(v.satisfies(3, 0)).toBe(false);
  });

  it('reset clears calls and queue', () => {
    const a = make();
    a.queueOutput('status', 'X');
    a.exec('status');
    a.reset();
    expect(a.recordedCalls()).toHaveLength(0);
    return expect(a.exec('status').then((r) => r.stdout)).resolves.toBe('');
  });
});

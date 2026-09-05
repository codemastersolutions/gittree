import { describe, it, expect } from 'vitest';

import { parseWorktreePorcelain } from '../parsers/worktree-porcelain.js';
import { WORKTREE_LIST_4 } from '../__fixtures__/index.js';

describe('parseWorktreePorcelain', () => {
  it('parses 4 worktrees from fixture', () => {
    const wts = parseWorktreePorcelain(WORKTREE_LIST_4, '/Users/alice/repo-main');
    expect(wts).toHaveLength(4);

    const [main, auth, hotfix, old] = wts as [unknown, unknown, unknown, unknown];

    expect((main as { path: string }).path).toBe('/Users/alice/repo-main');
    expect((main as { branch: string | undefined }).branch).toBe('main');
    expect((main as { isMain: boolean }).isMain).toBe(true);
    expect((main as { isDetached: boolean }).isDetached).toBe(false);

    expect((auth as { path: string }).path).toBe('/Users/alice/repo-feature-auth');
    expect((auth as { branch: string | undefined }).branch).toBe('feature/auth');
    expect((auth as { isMain: boolean }).isMain).toBe(false);

    expect((hotfix as { isDetached: boolean }).isDetached).toBe(true);
    expect((hotfix as { isPrunable: boolean }).isPrunable).toBe(true);
    expect((hotfix as { branch: string | undefined }).branch).toBeUndefined();

    expect((old as { lockReason: string | undefined }).lockReason).toBe('Permission denied');
  });

  it('infers first worktree as main when none match the path', () => {
    const wts = parseWorktreePorcelain(WORKTREE_LIST_4);
    expect(wts[0]?.isMain).toBe(true);
    expect(wts.slice(1).every((w) => !w.isMain)).toBe(true);
  });

  it('handles empty input', () => {
    expect(parseWorktreePorcelain('')).toHaveLength(0);
    expect(parseWorktreePorcelain('\n\n   \n\n')).toHaveLength(0);
  });
});

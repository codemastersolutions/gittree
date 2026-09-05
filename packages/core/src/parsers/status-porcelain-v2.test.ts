import { describe, it, expect } from 'vitest';

import { parseStatusPorcelainV2 } from '../parsers/status-porcelain-v2.js';
import { STATUS_CLEAN, STATUS_DIRTY_AHEAD_BEHIND } from '../__fixtures__/index.js';

describe('parseStatusPorcelainV2', () => {
  it('parses dirty worktree that is ahead and behind', () => {
    const s = parseStatusPorcelainV2(STATUS_DIRTY_AHEAD_BEHIND);
    expect(s.dirty).toBe(true);
    expect(s.kind).toBe('dirty');
    expect(s.aheadBy).toBe(2);
    expect(s.behindBy).toBe(1);
    expect(s.branch).toBe('feature/auth');
    expect(s.upstream).toBe('origin/feature/auth');
    expect(s.modifiedFiles).toEqual(['src/auth/login.ts', 'src/auth/signup.ts']);
    expect(s.deletedFiles).toEqual(['src/auth/legacy.ts']);
    expect(s.untrackedFiles).toEqual(['src/auth/.env.local', 'uploads/tmp.bin']);
  });

  it('parses clean worktree as kind=clean', () => {
    const s = parseStatusPorcelainV2(STATUS_CLEAN);
    expect(s.dirty).toBe(false);
    expect(s.kind).toBe('clean');
    expect(s.aheadBy).toBe(0);
    expect(s.behindBy).toBe(0);
    expect(s.branch).toBe('main');
    expect(s.upstream).toBe('origin/main');
  });

  it('returns arrays frozen (immutable)', () => {
    const s = parseStatusPorcelainV2(STATUS_DIRTY_AHEAD_BEHIND);
    expect(Object.isFrozen(s.modifiedFiles)).toBe(true);
  });

  it('resolves diverged when ahead>0 and behind>0 but no dirty', () => {
    const input = `# branch.oid 111
# branch.head x
# branch.ab +3 -2
`;
    const s = parseStatusPorcelainV2(input);
    expect(s.dirty).toBe(false);
    expect(s.kind).toBe('diverged');
  });

  it('resolves ahead when only ahead>0 and no dirty', () => {
    const s = parseStatusPorcelainV2(`# branch.head h\n# ahead 5\n`);
    expect(s.kind).toBe('ahead');
    expect(s.aheadBy).toBe(5);
  });

  it('resolves behind when only behind>0 and no dirty', () => {
    const s = parseStatusPorcelainV2(`# branch.head h\n# behind 5\n`);
    expect(s.kind).toBe('behind');
    expect(s.behindBy).toBe(5);
  });
});

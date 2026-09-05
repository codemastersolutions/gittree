import { describe, it, expect } from 'vitest';

import {
  GitTreeError,
  DirtyWorktreeError,
  BranchLockedError,
  BranchAheadError,
  GitExecutionError,
  GitVersionError,
} from '../errors/index.js';

describe('Error hierarchy', () => {
  it('GitTreeError carries code and context', () => {
    const e = new GitTreeError('CODE_X', 'message', { context: { foo: 1 } });
    expect(e.code).toBe('CODE_X');
    expect(e.name).toBe('GitTreeError');
    expect(e.context).toEqual({ foo: 1 });
    expect(e).toBeInstanceOf(Error);
  });

  it('DirtyWorktreeError exposes typed context', () => {
    const e = new DirtyWorktreeError('!', { worktreePath: '/x', files: ['a.ts'] });
    expect(e.code).toBe('DIRTY_WORKTREE');
    expect(e.context?.worktreePath).toBe('/x');
    expect(e).toBeInstanceOf(GitTreeError);
  });

  it('BranchLockedError exposes typed context', () => {
    const e = new BranchLockedError('!', { branch: 'x', alreadyAtPath: '/y' });
    expect(e.code).toBe('BRANCH_LOCKED');
    expect(e.context?.branch).toBe('x');
  });

  it('BranchAheadError exposes ahead count', () => {
    const e = new BranchAheadError('!', { branch: 'x', aheadBy: 3 });
    expect(e.code).toBe('BRANCH_AHEAD');
    expect(e.context?.aheadBy).toBe(3);
  });

  it('GitExecutionError exposes stdout/stderr/exitCode', () => {
    const e = new GitExecutionError('msg', {
      exitCode: 128,
      stdout: '',
      stderr: 'fatal: nope',
      command: 'git cmd',
    });
    expect(e.exitCode).toBe(128);
    expect(e.stderr).toBe('fatal: nope');
    expect(e.code).toBe('GIT_EXEC_FAILED');
  });

  it('GitVersionError includes required vs actual', () => {
    const e = new GitVersionError('too old', { required: '2.24', actual: '2.20.0' });
    expect(e.code).toBe('GIT_VERSION_TOO_OLD');
    expect(e.context?.required).toBe('2.24');
    expect(e.context?.actual).toBe('2.20.0');
  });
});

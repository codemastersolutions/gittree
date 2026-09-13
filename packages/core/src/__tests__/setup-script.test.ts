/* eslint security/detect-non-literal-fs-filename: off -- integration tests rely on mkdtemp + random UUID paths; these are 100% false positives for the rule. */
import { beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm, symlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { MockGitAdapter } from '../testing/index.js';
import { SetupScriptService, createGitTree, BranchService, ConfigParseError } from '../index.js';

describe('SetupScriptService + BranchService (isolated)', () => {
  let tmp: string;
  let adapter: MockGitAdapter;
  let setup: SetupScriptService;
  let branch: BranchService;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'gittree-setup-'));
    adapter = new MockGitAdapter({ cwd: tmp });
    const gt = createGitTree({ cwd: tmp, adapter });
    setup = gt.setup;
    branch = gt.branch;
  });

  it('loadConfig encontra .gittree.json no adapter.cwd()', async () => {
    await writeFile(
      resolve(tmp, '.gittree.json'),
      JSON.stringify({ setup: { copy: ['.env'], symlink: ['node_modules'] } }),
    );
    const cfg = await setup.loadConfig();
    expect(cfg?.setup?.copy).toEqual(['.env']);
    expect(cfg?.setup?.symlink).toEqual(['node_modules']);
  });

  it('loadConfig com JSON inválido lança ConfigParseError', async () => {
    const p = resolve(tmp, '.gittree.json');
    await writeFile(p, '{ setup: [invalid');
    await expect(setup.loadConfig(p)).rejects.toThrow(ConfigParseError);
  });

  it('apply copy copia arquivo existente, avisa se fonte não existe', async () => {
    await writeFile(resolve(tmp, '.env'), 'DB=local\n');
    await mkdir(resolve(tmp, 'hooks'), { recursive: true });
    await writeFile(resolve(tmp, 'hooks/pre-commit'), '#!/bin/sh\necho ok\n');
    const worktreePath = resolve(
      tmp,
      '..',
      'gittree-child-' + Math.random().toString(36).slice(2, 8),
    );
    try {
      await mkdir(worktreePath, { recursive: true });
      const r = await setup.apply(
        {
          setup: {
            copy: ['.env', 'hooks/pre-commit', '.missing'],
          },
        },
        worktreePath,
      );
      expect(r.copied).toEqual(['.env', 'hooks/pre-commit']);
      expect(r.warnings.some((w) => w.includes('.missing'))).toBe(true);
      expect((await stat(resolve(worktreePath, '.env'))).isFile()).toBe(true);
      expect((await stat(resolve(worktreePath, 'hooks/pre-commit'))).isFile()).toBe(true);
    } finally {
      await rm(worktreePath, { recursive: true, force: true });
    }
  });

  it('apply symlink cria link simbólico de src para dst', async () => {
    const nodeModules = resolve(tmp, 'node_modules');
    await mkdir(nodeModules, { recursive: true });
    await writeFile(resolve(nodeModules, 'marker'), 'x');
    const worktreePath = resolve(
      tmp,
      '..',
      'gittree-symlink-' + Math.random().toString(36).slice(2, 8),
    );
    try {
      await mkdir(worktreePath, { recursive: true });
      const r = await setup.apply({ setup: { symlink: ['node_modules'] } }, worktreePath);
      expect(r.symlinked).toEqual(['node_modules']);
      const st = await stat(resolve(worktreePath, 'node_modules'));
      expect(st.isDirectory()).toBe(true);
    } finally {
      await rm(worktreePath, { recursive: true, force: true });
    }
  });

  it('BranchService.deleteLocal -d falha se adapter retorna exit != 0', async () => {
    adapter.queueOutput(/^branch -d foo$/, '', 'error: branch foo not fully merged', 1);
    await expect(branch.deleteLocal('foo')).rejects.toThrow();
  });

  it('BranchService.deleteLocal force -D força remoção quando merge pendente', async () => {
    adapter.queueOutput(/^branch -D stale$/, 'Deleted branch stale (was deadbeef).\n', '', 0);
    const r = await branch.deleteLocal('stale', { force: true });
    expect(r.deleted).toBe(true);
    expect(r.branchName).toBe('stale');
  });

  it('BranchService.deleteRemote falha com GitExecutionError quando remote retorna exit != 0', async () => {
    adapter.queueOutput(
      /^push origin --delete feature\/gone$/,
      '',
      'error: unable to delete: remote ref does not exist',
      1,
    );
    await expect(branch.deleteRemote('feature/gone')).rejects.toThrow();
  });

  it('apply symlink avisa quando source não existe', async () => {
    const worktreePath = resolve(
      tmp,
      '..',
      'gittree-sym-miss-' + Math.random().toString(36).slice(2, 8),
    );
    try {
      await mkdir(worktreePath, { recursive: true });
      const r = await setup.apply(
        { setup: { symlink: ['missing-folder', '.env-missing'] } },
        worktreePath,
      );
      expect(r.symlinked).toEqual([]);
      expect(r.warnings.length).toBeGreaterThanOrEqual(2);
      expect(r.warnings.some((w) => w.includes('missing-folder'))).toBe(true);
      expect(r.warnings.some((w) => w.includes('.env-missing'))).toBe(true);
    } finally {
      await rm(worktreePath, { recursive: true, force: true });
    }
  });

  it('apply copy avisa quando source é um diretório (copy é file-only)', async () => {
    const dirSrc = resolve(tmp, 'config-dir');
    await mkdir(dirSrc, { recursive: true });
    const worktreePath = resolve(
      tmp,
      '..',
      'gittree-dir-' + Math.random().toString(36).slice(2, 8),
    );
    try {
      await mkdir(worktreePath, { recursive: true });
      const r = await setup.apply({ setup: { copy: ['config-dir'] } }, worktreePath);
      expect(r.copied).toEqual([]);
      expect(r.warnings.some((w) => w.includes('directory'))).toBe(true);
    } finally {
      await rm(worktreePath, { recursive: true, force: true });
    }
  });

  it('apply sem setup.chave retorna arrays vazios', async () => {
    const worktreePath = resolve(
      tmp,
      '..',
      'gittree-empty-' + Math.random().toString(36).slice(2, 8),
    );
    try {
      await mkdir(worktreePath, { recursive: true });
      const r = await setup.apply({} as Parameters<typeof setup.apply>[0], worktreePath);
      expect(r.copied).toEqual([]);
      expect(r.symlinked).toEqual([]);
      expect(r.warnings).toEqual([]);
    } finally {
      await rm(worktreePath, { recursive: true, force: true });
    }
  });
});

void symlink;

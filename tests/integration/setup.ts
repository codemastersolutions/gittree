import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface TemporaryRepo {
  readonly path: string;
  readonly mainBranch: string;
  commitAll(message: string): Promise<string>;
  createFile(name: string, contents?: string): Promise<string>;
  createWorktree(newPath: string, branch: string): Promise<void>;
  cleanup(): void;
}

export function makeRandomDir(prefix = 'gittree-test'): string {
  const id = createHash('sha1')
    .update(`${process.pid}-${Date.now()}-${Math.random()}`)
    .digest('hex')
    .slice(0, 12);
  const dir = path.join(os.tmpdir(), `${prefix}-${id}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function createTemporaryRepo(): Promise<TemporaryRepo> {
  const dir = makeRandomDir();
  const gitDir = path.join(dir, 'project');
  fs.mkdirSync(gitDir, { recursive: true });
  const { execSync } = await import('node:child_process');
  const run = (cmd: string, cwd = gitDir): Buffer =>
    execSync(cmd, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, stdio: 'pipe' });

  run('git init -b main');
  run('git config user.name "GitTree CI"');
  run('git config user.email "ci@gittree.dev"');
  run('git config commit.gpgsign false');

  await fs.promises.writeFile(path.join(gitDir, 'README.md'), '# hello\n');
  run('git add README.md');
  run('git commit -m "chore: initial commit"');

  const repo: TemporaryRepo = {
    path: gitDir,
    mainBranch: 'main',
    async createFile(name, contents = 'data') {
      const f = path.join(gitDir, name);
      await fs.promises.mkdir(path.dirname(f), { recursive: true });
      await fs.promises.writeFile(f, contents);
      return f;
    },
    async commitAll(message) {
      run('git add -A');
      run(`git commit -m ${JSON.stringify(message)}`);
      return run('git rev-parse HEAD').toString('utf8').trim();
    },
    async createWorktree(newPath, branch) {
      run(`git worktree add "${newPath}" -b "${branch}"`);
    },
    cleanup() {
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
  return repo;
}

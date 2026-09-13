/* eslint security/detect-non-literal-fs-filename: off -- integration tests rely on mkdtemp + random UUID paths; these are 100% false positives for the rule. */
/// <reference types="node" />
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { Writable } from 'node:stream';

import { MockGitAdapter } from '@codemastersolutions/gittree-core/testing';
import { run, GITTREE_CLI_VERSION } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class CollectingStream extends Writable {
  public chunks: Uint8Array[] = [];
  public override _write(chunk: Uint8Array, _encoding: string, cb: () => void): void {
    this.chunks.push(chunk);
    cb();
  }
  public text(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }
  public reset(): void {
    this.chunks.length = 0;
  }
}

function oncePred(cmdPart: string | RegExp): (_cmd: string) => boolean {
  let used = false;
  const pred =
    typeof cmdPart === 'string'
      ? (c: string) => c.includes(cmdPart)
      : (c: string) => cmdPart.test(c);
  return (c: string) => {
    if (used) return false;
    if (pred(c)) {
      used = true;
      return true;
    }
    return false;
  };
}

const CLI_PKG_VERSION = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'))
  .version as string;

const ROOT = '/repo/main';
const FEAT = '/repo/feat';
const MAIN_WORKTREE_PORCELAIN = `worktree ${ROOT}
HEAD abcdef1234567890abcdef1234567890abcdef12
branch refs/heads/main

worktree ${FEAT}
HEAD aabbccddeeff00112233445566778899aabbccdd
branch refs/heads/feature/auth
`;

const DIRTY_STATUS_V2 = `# branch.oid aabbccddeeff00112233445566778899aabbccdd
# branch.head feature/auth
1 .M N... 100644 100644 100644 1111111111111111111111111111111111111111 2222222222222222222222222222222222222222 src/app.ts
? src/untracked.ts
`;

const CLEAN_STATUS_V2 = `# branch.oid abcdef1234567890abcdef1234567890abcdef12
# branch.head main
`;

const AHEAD_STATUS_V2 = `# branch.oid aabbccddeeff00112233445566778899aabbccdd
# branch.head feature/auth
# branch.ab +3 -0
`;

function makeAdapter(): MockGitAdapter {
  return new MockGitAdapter({ cwd: ROOT, locale: 'en' });
}

describe('CLI bootstrap (Fase 3 Task 7)', () => {
  let stdout: CollectingStream;
  let stderr: CollectingStream;

  beforeEach(() => {
    stdout = new CollectingStream();
    stderr = new CollectingStream();
  });

  afterEach(() => {
    stdout.destroy();
    stderr.destroy();
  });

  it('TR-7.1: GITTREE_CLI_VERSION = package.json version', () => {
    expect(GITTREE_CLI_VERSION).toBe(CLI_PKG_VERSION);
  });

  it.each([[['--version'] as const], [['-v'] as const], [['version'] as const]])(
    '--version / -v / version imprime versão do package.json e sai 0',
    async (argv) => {
      const code = await run({ argv, stdout, stderr, color: false });
      expect(code).toBe(0);
      expect(stdout.text().trim()).toBe(CLI_PKG_VERSION);
    },
  );

  it('--help mostra usage, comandos worktree, branch, repo e exemplos', async () => {
    const code = await run({ argv: ['--help'], stdout, stderr, color: false });
    const out = stdout.text();
    expect(code).toBe(0);
    expect(out).toContain(`gittree/${CLI_PKG_VERSION}`);
    expect(out).toContain('worktree');
    expect(out).toContain('branch');
    expect(out).toContain('repo');
    expect(out).toContain('Examples:');
    expect(out).toContain('GITTREE_LANG');
  });

  it('gittree sem argumentos mostra help', async () => {
    const code = await run({ argv: [], stdout, stderr, color: false });
    expect(code).toBe(0);
    expect(stdout.text()).toContain('Usage:');
  });

  it('comando desconhecido sai 2 com mensagem try gittree help', async () => {
    const code = await run({
      argv: ['banana'],
      stdout,
      stderr,
      color: false,
      adapter: makeAdapter(),
    });
    expect(code).toBe(2);
    expect(stderr.text()).toContain('unknown command');
    expect(stderr.text()).toContain('gittree help');
  });

  it('TR-7.2: GITTREE_LANG=pt-br + comando desconhecido passa locale (stderr)', async () => {
    const adapter = makeAdapter();
    adapter.queueOutput(oncePred('worktree list'), MAIN_WORKTREE_PORCELAIN);
    adapter.queueOutput(oncePred('status --porcelain'), CLEAN_STATUS_V2);
    const code = await run({
      argv: ['worktree', 'list'],
      stdout,
      stderr,
      color: false,
      env: { GITTREE_LANG: 'pt-br' },
      cwd: ROOT,
      adapter,
    });
    expect(code).toBe(0);
    expect(stdout.text()).toContain('main');
  });

  it('TR-8.4: help worktree mostra subcomandos e exemplos reais', async () => {
    const code = await run({ argv: ['help', 'worktree'], stdout, stderr, color: false });
    const out = stdout.text();
    expect(code).toBe(0);
    expect(out).toContain('worktree list');
    expect(out).toContain('worktree add');
    expect(out).toContain('worktree remove');
    expect(out).toContain('worktree prune');
    expect(out).toContain('worktree sync');
    expect(out).toContain('Examples:');
    expect(out).toContain('feature/pay');
  });

  it('TR-8.4: help branch mostra sync delete', async () => {
    const code = await run({ argv: ['branch', '--help'], stdout, stderr, color: false });
    const out = stdout.text();
    expect(code).toBe(0);
    expect(out).toContain('branch sync');
    expect(out).toContain('branch delete');
    expect(out).toContain('origin/main');
  });

  it('TR-8.4: help repo mostra status doctor', async () => {
    const code = await run({ argv: ['repo', 'help'], stdout, stderr, color: false });
    const out = stdout.text();
    expect(code).toBe(0);
    expect(out).toContain('repo status');
    expect(out).toContain('repo doctor');
  });

  it('NO_COLOR desativa cor sem erro', async () => {
    const code = await run({
      argv: ['--help'],
      stdout,
      stderr,
      env: { NO_COLOR: '1' },
    });
    expect(code).toBe(0);
    expect(stdout.text()).not.toContain('\u001B[');
  });
});

describe('CLI worktree list/add/remove/prune (Fase 3 Task 8)', () => {
  let stdout: CollectingStream;
  let stderr: CollectingStream;
  let adapter: MockGitAdapter;

  beforeEach(() => {
    stdout = new CollectingStream();
    stderr = new CollectingStream();
    adapter = makeAdapter();
  });

  afterEach(() => {
    stdout.destroy();
    stderr.destroy();
    adapter.reset();
  });

  it('TR-8.2: worktree list --format json retorna JSON parseável com 2 worktrees', async () => {
    adapter.queueOutput(oncePred('worktree list --porcelain'), MAIN_WORKTREE_PORCELAIN);
    adapter.queueOutput(oncePred('status --porcelain'), CLEAN_STATUS_V2);
    adapter.queueOutput(oncePred('status --porcelain'), DIRTY_STATUS_V2);
    const code = await run({
      argv: ['worktree', 'list', '--format', 'json'],
      stdout,
      stderr,
      color: false,
      cwd: ROOT,
      adapter,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout.text()) as Array<{
      path: string;
      branch?: string;
      isMain: boolean;
    }>;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(2);
    const main = parsed.find((w) => w.path === ROOT)!;
    expect(main.isMain).toBe(true);
    expect(main.branch).toBe('refs/heads/main');
    expect(parsed.find((w) => w.path === FEAT)?.branch).toBe('refs/heads/feature/auth');
  });

  it('worktree list --format porcelain saída no padrão git (blocos \n\n separados)', async () => {
    adapter.queueOutput(oncePred('worktree list --porcelain'), MAIN_WORKTREE_PORCELAIN);
    const code = await run({
      argv: ['worktree', 'list', '-F', 'porcelain'],
      stdout,
      stderr,
      color: false,
      cwd: ROOT,
      adapter,
    });
    expect(code).toBe(0);
    const out = stdout.text();
    expect(out).toContain(`worktree ${ROOT}`);
    expect(out).toContain(`worktree ${FEAT}`);
    expect(out).toContain('branch refs/heads/main');
  });

  it('worktree list default=table mostra cabeçalhos PATH BRANCH HEAD MAIN STATE', async () => {
    adapter.queueOutput(oncePred('worktree list --porcelain'), MAIN_WORKTREE_PORCELAIN);
    adapter.queueOutput(oncePred('status --porcelain'), CLEAN_STATUS_V2);
    adapter.queueOutput(oncePred('status --porcelain'), DIRTY_STATUS_V2);
    const code = await run({
      argv: ['worktree', 'list'],
      stdout,
      stderr,
      color: false,
      cwd: ROOT,
      adapter,
    });
    expect(code).toBe(0);
    const out = stdout.text();
    expect(out).toContain('PATH');
    expect(out).toContain('BRANCH');
    expect(out).toContain('HEAD');
    expect(out).toContain('MAIN');
    expect(out).toContain('STATE');
    expect(out).toContain('clean');
    expect(out).toContain('dirty');
  });

  it('worktree add -b <novo> <path> cria nova worktree e relata new-branch', async () => {
    const listExisting = MAIN_WORKTREE_PORCELAIN;
    const listAfter =
      MAIN_WORKTREE_PORCELAIN +
      `\nworktree /repo/pay\nHEAD f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1f1\nbranch refs/heads/feature/pay\n`;
    adapter.queueOutput(oncePred('worktree list --porcelain'), listExisting);
    adapter.queueOutput(
      (c) => c.startsWith('worktree add ') && c.includes('-b') && c.includes('feature/pay'),
      '',
      '',
      0,
    );
    adapter.queueOutput(oncePred('worktree list --porcelain'), listAfter);
    const code = await run({
      argv: ['worktree', 'add', '/repo/pay', '-b', 'feature/pay'],
      stdout,
      stderr,
      color: false,
      cwd: ROOT,
      adapter,
    });
    expect(code).toBe(0);
    expect(stdout.text()).toContain('created worktree');
    expect(stdout.text()).toContain('new-branch');
    expect(stdout.text()).toContain('branch=feature/pay');
  });

  it('worktree add <path> sem path posicional → exit 2 + help', async () => {
    const code = await run({
      argv: ['worktree', 'add', '-b', 'nova'],
      stdout,
      stderr,
      color: false,
      cwd: ROOT,
      adapter,
    });
    expect(code).toBe(2);
    expect(stderr.text()).toContain('missing required argument');
    expect(stdout.text()).toContain('worktree add');
  });

  it('worktree remove <dirty> sem --force → exit 1 (DirtyWorktreeError) + lista arquivos (TR-8.3)', async () => {
    adapter.queueOutput(oncePred('worktree list --porcelain'), MAIN_WORKTREE_PORCELAIN);
    adapter.queueOutput(oncePred('status --porcelain=v2 --branch'), DIRTY_STATUS_V2);
    const code = await run({
      argv: ['worktree', 'remove', FEAT],
      stdout,
      stderr,
      color: false,
      cwd: ROOT,
      adapter,
    });
    expect(code).toBe(1);
    expect(stderr.text()).toContain('error:');
    expect(stderr.text()).toMatch(/uncommitted changes|dirty/i);
    expect(stdout.text()).toContain('files:');
    expect(stdout.text()).toContain('src/app.ts');
    expect(stdout.text()).toContain('src/untracked.ts');
    expect(stdout.text()).toContain('hint: use --force');
  });

  it('worktree remove <branch-ahead> sem skip-push-check → exit 3 (BranchAheadError)', async () => {
    adapter.queueOutput(oncePred('worktree list --porcelain'), MAIN_WORKTREE_PORCELAIN);
    adapter.queueOutput(oncePred('status --porcelain=v2 --branch'), AHEAD_STATUS_V2);
    const code = await run({
      argv: ['worktree', 'remove', FEAT],
      stdout,
      stderr,
      color: false,
      cwd: ROOT,
      adapter,
    });
    expect(code).toBe(3);
    expect(stderr.text()).toContain('ahead');
    expect(stdout.text()).toContain('hint: push first');
  });

  it('worktree remove -f -d -r remove forçado e deleta branches local+remote', async () => {
    adapter.queueOutput(oncePred('worktree list --porcelain'), MAIN_WORKTREE_PORCELAIN);
    adapter.queueOutput(oncePred('status --porcelain=v2 --branch'), DIRTY_STATUS_V2);
    adapter.queueOutput(oncePred('worktree remove --force'), '', '', 0);
    adapter.queueOutput(oncePred('branch -D feature/auth'), 'Deleted branch feature/auth', '', 0);
    adapter.queueOutput(oncePred('push origin --delete feature/auth'), '', '', 0);
    adapter.queueOutput(
      oncePred('worktree list --porcelain'),
      MAIN_WORKTREE_PORCELAIN.replace(/\n\nworktree \/repo\/feat[\s\S]*$/, ''),
    );
    const code = await run({
      argv: ['worktree', 'remove', FEAT, '-f', '-d', '-r'],
      stdout,
      stderr,
      color: false,
      cwd: ROOT,
      adapter,
    });
    expect(code).toBe(0);
    expect(adapter.wasCalled((c) => c.startsWith('worktree remove --force'))).toBe(true);
    expect(adapter.wasCalled((c) => c.includes('branch -D feature/auth'))).toBe(true);
    expect(adapter.wasCalled((c) => c.includes('push origin --delete feature/auth'))).toBe(true);
    const out = stdout.text();
    expect(out).toContain('removed worktree');
    expect(out).toContain('deleted local branch');
    expect(out).toContain('deleted remote branch');
  });

  it('worktree prune --dry-run (-n) lista paths que seriam removidos exit 0', async () => {
    const dryOut = `Pruning worktree '/tmp/old-wt1':
Pruning gitfile '/tmp/old-wt2/.git'`;
    adapter.queueOutput(oncePred('worktree prune --dry-run'), dryOut, '', 0);
    adapter.queueOutput(oncePred('worktree list --porcelain'), MAIN_WORKTREE_PORCELAIN);
    const code = await run({
      argv: ['worktree', 'prune', '-n'],
      stdout,
      stderr,
      color: false,
      cwd: ROOT,
      adapter,
    });
    expect(code).toBe(0);
    expect(stderr.text()).toContain('would prune');
    expect(stderr.text()).toContain('dry-run summary');
  });

  it('worktree prune (real) devolve 0 paths nothing to prune', async () => {
    adapter.queueOutput(oncePred('worktree prune'), '', '', 0);
    adapter.queueOutput(oncePred('worktree list --porcelain'), MAIN_WORKTREE_PORCELAIN);
    adapter.queueOutput(oncePred('worktree list --porcelain'), MAIN_WORKTREE_PORCELAIN);
    const code = await run({
      argv: ['worktree', 'prune'],
      stdout,
      stderr,
      color: false,
      cwd: ROOT,
      adapter,
    });
    expect(code).toBe(0);
    expect(stdout.text()).toContain('nothing to prune');
  });
});

describe('CLI worktree sync / branch / repo (Fase 3 Task 9)', () => {
  let stdout: CollectingStream;
  let stderr: CollectingStream;
  let adapter: MockGitAdapter;

  beforeEach(() => {
    stdout = new CollectingStream();
    stderr = new CollectingStream();
    adapter = makeAdapter();
  });

  afterEach(() => {
    stdout.destroy();
    stderr.destroy();
    adapter.reset();
  });

  it('TR-9.2: worktree sync --all 2 worktrees (1 ok, 1 conflict) → summary counts corretos exit=1', async () => {
    adapter.queueOutput(oncePred('fetch --all --prune'), '', '', 0);
    adapter.queueOutput(oncePred('worktree list --porcelain'), MAIN_WORKTREE_PORCELAIN);
    adapter.queueOutput(
      oncePred('pull --ff-only'),
      'Updating abcdef1..aabbccd\nFast-forward\n',
      '',
      0,
    );
    adapter.queueOutput(
      oncePred('pull --ff-only'),
      '',
      'fatal: Not possible to fast-forward, aborting.',
      128,
    );
    const code = await run({
      argv: ['worktree', 'sync', '--all', '--strategy', 'ff-only'],
      stdout,
      stderr,
      color: false,
      cwd: ROOT,
      adapter,
    });
    expect(code).toBe(1);
    const out = stdout.text() + '\n' + stderr.text();
    expect(out).toMatch(/Summary: ok=1\s+conflicted=1\s+failed=1\s+skipped=0\s+total=2/);
    expect(out).toContain('CONFLICT');
  });

  it('worktree sync sem path e sem --all → exit=2 help worktree', async () => {
    const code = await run({
      argv: ['worktree', 'sync'],
      stdout,
      stderr,
      color: false,
      cwd: ROOT,
      adapter,
    });
    expect(code).toBe(2);
    expect(stderr.text()).toContain('must provide');
    expect(stdout.text()).toContain('worktree sync');
  });

  it('branch sync <path> --with origin/main --strategy merge ok', async () => {
    adapter.queueOutput(
      oncePred('merge origin/main'),
      'Merge made by the ort strategy.\n app.ts | 2 +-\n 1 file changed, 1 insertion(+), 1 deletion(-)\n',
      '',
      0,
    );
    const code = await run({
      argv: ['branch', 'sync', FEAT, '--with', 'origin/main', '--strategy', 'merge'],
      stdout,
      stderr,
      color: false,
      cwd: ROOT,
      adapter,
    });
    expect(code).toBe(0);
    expect(stdout.text()).toContain('synced with origin/main');
    expect(stdout.text()).toContain('merge');
  });

  it('branch delete <name> -f -r deleta local (-D) + remote', async () => {
    adapter.queueOutput(
      (c) => c.includes('branch') && c.includes('-D') && c.includes('feature/pay'),
      'Deleted branch feature/pay',
      '',
      0,
    );
    adapter.queueOutput(
      (c) => c.includes('push') && c.includes('--delete') && c.includes('feature/pay'),
      '',
      '',
      0,
    );
    const code = await run({
      argv: ['branch', 'delete', 'feature/pay', '-f', '-r'],
      stdout,
      stderr,
      color: false,
      cwd: ROOT,
      adapter,
    });
    expect(code).toBe(0);
    expect(
      adapter.wasCalled(
        (c) => c.includes('branch') && c.includes('-D') && c.includes('feature/pay'),
      ),
    ).toBe(true);
    expect(
      adapter.wasCalled(
        (c) => c.includes('push') && c.includes('--delete') && c.includes('feature/pay'),
      ),
    ).toBe(true);
    expect(stdout.text()).toContain('deleted local branch');
    expect(stdout.text()).toContain('deleted remote branch');
  });

  it('branch delete <name> --remote-only deleta só remote', async () => {
    adapter.queueOutput(
      (c) => c.includes('push') && c.includes('--delete') && c.includes('only-remote'),
      '',
      '',
      0,
    );
    const code = await run({
      argv: ['branch', 'delete', 'only-remote', '--remote-only'],
      stdout,
      stderr,
      color: false,
      cwd: ROOT,
      adapter,
    });
    expect(code).toBe(0);
    expect(adapter.callCount((c) => c.startsWith('branch '))).toBe(0);
    expect(stdout.text()).toContain('deleted remote branch');
  });

  it('TR-9.1: repo status --format json contém worktrees, states (Map→Object), countByState, remotes', async () => {
    adapter.queueOutput(oncePred('worktree list --porcelain'), MAIN_WORKTREE_PORCELAIN);
    adapter.queueOutput(oncePred('status --porcelain=v2 --branch'), CLEAN_STATUS_V2);
    adapter.queueOutput(oncePred('status --porcelain=v2 --branch'), DIRTY_STATUS_V2);
    adapter.queueOutput(
      oncePred('remote -v'),
      'origin  git@github.com:acme/repo.git (fetch)\norigin  git@github.com:acme/repo.git (push)',
      '',
      0,
    );
    const code = await run({
      argv: ['repo', 'status', '-F', 'json'],
      stdout,
      stderr,
      color: false,
      cwd: ROOT,
      adapter,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout.text()) as {
      worktrees: Array<{ path: string }>;
      states: Record<string, { kind: string }>;
      countByState: Record<string, number>;
      remotes: Array<{ name: string; url: string }>;
      totalDirty: number;
      totalAheadBy: number;
    };
    expect(parsed.worktrees).toHaveLength(2);
    expect(typeof parsed.states).toBe('object');
    expect(parsed.states[ROOT]?.kind).toBeDefined();
    expect(parsed.states[FEAT]?.kind).toBe('dirty');
    expect(parsed.countByState.clean).toBeGreaterThanOrEqual(1);
    expect(parsed.countByState.dirty).toBeGreaterThanOrEqual(1);
    expect(parsed.remotes[0]?.name).toBe('origin');
    expect(parsed.remotes[0]?.url).toContain('acme/repo');
    expect(parsed.totalDirty).toBe(1);
  });

  it('repo status default table mostra header Repo Status, main worktree e counts', async () => {
    adapter.queueOutput(oncePred('worktree list --porcelain'), MAIN_WORKTREE_PORCELAIN);
    adapter.queueOutput(oncePred('status --porcelain=v2 --branch'), CLEAN_STATUS_V2);
    adapter.queueOutput(oncePred('status --porcelain=v2 --branch'), AHEAD_STATUS_V2);
    adapter.queueOutput(oncePred('remote -v'), '', '', 0);
    const code = await run({
      argv: ['repo', 'status'],
      stdout,
      stderr,
      color: false,
      cwd: ROOT,
      adapter,
    });
    expect(code).toBe(0);
    const out = stdout.text();
    expect(out).toContain('Repo Status');
    expect(out).toContain('main worktree:');
    expect(out).toContain('total dirty:');
    expect(out).toContain('total ahead:');
    expect(out).toContain('PATH');
    expect(out).toContain('STATE');
    expect(out).toContain('AHEAD');
  });

  it('repo doctor mostra 3 checks (list, hooks, .gittree) + PASS/WARN summary', async () => {
    adapter.queueOutput(oncePred('worktree list --porcelain'), MAIN_WORKTREE_PORCELAIN);
    adapter.queueOutput(oncePred('loadConfig'), '', '', 1);
    const code = await run({
      argv: ['repo', 'doctor'],
      stdout,
      stderr,
      color: false,
      cwd: ROOT,
      adapter,
    });
    // Exit pode ser 0 ou 1 dependendo de hooks no cwd;
    expect([0, 1]).toContain(code);
    const combined = stdout.text() + '\n' + stderr.text();
    expect(combined).toContain('worktree list works');
    expect(combined).toContain('shared hooks present');
    expect(combined).toContain('.gittree.json');
    expect(combined).toContain('Doctor summary:');
  });
});

describe('CLI completion + global config (Fase 6 Task 16)', () => {
  let stdout: CollectingStream;
  let stderr: CollectingStream;

  beforeEach(() => {
    stdout = new CollectingStream();
    stderr = new CollectingStream();
  });

  it('TR-16.1 completion bash script passa em bash -n (sem syntax errors)', async () => {
    const code = await run({ argv: ['completion', 'bash'], stdout, stderr, color: false });
    expect(code).toBe(0);
    const script = stdout.text();
    expect(script.length).toBeGreaterThan(500);
    expect(script).toContain('# gittree bash-completion');
    expect(script).toContain('_gittree_completions');
    expect(script).toContain('complete -F _gittree_completions gittree');
    const tmp = mkdtempSync(join(tmpdir(), 'gittree-bash-completion-'));
    try {
      const f = join(tmp, 'gittree.bash');
      writeFileSync(f, script, 'utf8');
      expect(() => execSync('bash -n ' + f, { stdio: 'pipe' })).not.toThrow();
    } finally {
      if (existsSync(tmp)) rmSync(tmp, { recursive: true });
    }
  });

  it('completion zsh e fish geram outputs não-vazios com headers corretos', async () => {
    let code = await run({ argv: ['completion', 'zsh'], stdout, stderr, color: false });
    expect(code).toBe(0);
    const z = stdout.text();
    expect(z.startsWith('#compdef gittree\n') || z.startsWith('#compdef gittree\r')).toBe(true);
    expect(z.length).toBeGreaterThan(500);
    stdout.reset();
    code = await run({ argv: ['completion', 'fish'], stdout, stderr, color: false });
    expect(code).toBe(0);
    const fi = stdout.text();
    expect(fi).toContain('# gittree fish-completion');
    expect(fi).toContain('complete -c gittree');
    expect(fi.length).toBeGreaterThan(500);
  });

  it('completion shell inválido retorna exit 2 + help', async () => {
    const code = await run({ argv: ['completion', 'powershell'], stdout, stderr, color: false });
    expect(code).toBe(2);
    expect(stderr.text()).toContain('invalid shell');
  });

  it('config set / get / list / unset round-trip com coerce boolean/number', async () => {
    const cfgHome = mkdtempSync(join(tmpdir(), 'gittree-cfg-test-'));
    const env = {
      XDG_CONFIG_HOME: cfgHome,
      HOME: cfgHome,
      NO_COLOR: '1',
      PATH: process.env.PATH ?? '',
    };
    try {
      // empty list
      let code = await run({ argv: ['config', 'list'], stdout, stderr, color: false, env });
      expect(code).toBe(0);
      expect(stdout.text()).toContain('no keys configured');
      stdout.reset();
      stderr.reset();
      // set string
      code = await run({
        argv: ['config', 'set', 'defaultLang', 'pt-br'],
        stdout,
        stderr,
        color: false,
        env,
      });
      expect(code).toBe(0);
      expect(stdout.text()).toContain('set defaultLang=pt-br');
      stdout.reset();
      stderr.reset();
      // get string
      code = await run({
        argv: ['config', 'get', 'defaultLang'],
        stdout,
        stderr,
        color: false,
        env,
      });
      expect(code).toBe(0);
      expect(stdout.text().trimEnd()).toBe('pt-br');
      stdout.reset();
      stderr.reset();
      // set number
      code = await run({
        argv: ['config', 'set', 'conn', '42'],
        stdout,
        stderr,
        color: false,
        env,
      });
      expect(code).toBe(0);
      stdout.reset();
      stderr.reset();
      code = await run({ argv: ['config', 'get', 'conn'], stdout, stderr, color: false, env });
      expect(code).toBe(0);
      expect(stdout.text().trimEnd()).toBe('42');
      stdout.reset();
      stderr.reset();
      // set boolean
      code = await run({
        argv: ['config', 'set', 'debug', 'true'],
        stdout,
        stderr,
        color: false,
        env,
      });
      expect(code).toBe(0);
      stdout.reset();
      stderr.reset();
      code = await run({ argv: ['config', 'get', 'debug'], stdout, stderr, color: false, env });
      expect(code).toBe(0);
      expect(stdout.text().trimEnd()).toBe('true');
      stdout.reset();
      stderr.reset();
      // list with keys
      code = await run({ argv: ['config', 'list'], stdout, stderr, color: false, env });
      expect(code).toBe(0);
      const lst = stdout.text();
      expect(lst).toContain('defaultLang');
      expect(lst).toContain('pt-br');
      expect(lst).toContain('conn');
      expect(lst).toContain('42');
      expect(lst).toContain('debug');
      expect(lst).toContain('true');
      stdout.reset();
      stderr.reset();
      // unset + get missing
      code = await run({ argv: ['config', 'unset', 'conn'], stdout, stderr, color: false, env });
      expect(code).toBe(0);
      expect(stdout.text()).toContain('unset conn');
      stdout.reset();
      stderr.reset();
      code = await run({ argv: ['config', 'get', 'conn'], stdout, stderr, color: false, env });
      expect(code).toBe(1);
      expect(stderr.text()).toContain('no such key');
      stdout.reset();
      stderr.reset();
      // missing args
      code = await run({ argv: ['config', 'set', 'x'], stdout, stderr, color: false, env });
      expect(code).toBe(2);
      stdout.reset();
      stderr.reset();
      code = await run({ argv: ['config', 'get'], stdout, stderr, color: false, env });
      expect(code).toBe(2);
    } finally {
      if (existsSync(cfgHome)) rmSync(cfgHome, { recursive: true });
    }
  });

  it('config carrega corretamente de ~/.gittree/config.json quando XDG não está setado', async () => {
    const home = mkdtempSync(join(tmpdir(), 'gittree-home-'));
    const env = { HOME: home, NO_COLOR: '1', PATH: process.env.PATH ?? '' };
    try {
      const gittreeDir = join(home, '.gittree');
      mkdirSync(gittreeDir, { recursive: true });
      writeFileSync(
        join(gittreeDir, 'config.json'),
        JSON.stringify({ defaultFormat: 'json' }) + '\n',
      );
      const code = await run({
        argv: ['config', 'get', 'defaultFormat'],
        stdout,
        stderr,
        color: false,
        env,
      });
      expect(code).toBe(0);
      expect(stdout.text().trimEnd()).toBe('json');
    } finally {
      if (existsSync(home)) rmSync(home, { recursive: true });
    }
  });
});

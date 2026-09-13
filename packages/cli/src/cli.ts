/// <reference types="node" />
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import pkg from '../package.json' with { type: 'json' };
import {
  BranchAheadError,
  BranchLockedError,
  ConfigParseError,
  countByResult,
  createGitTree,
  DirtyWorktreeError,
  GitExecutionError,
  GitTreeError,
  GitVersionError,
  I18n,
  safeExistsAnywhere,
  safeMkdirAnywhere,
  safeReadFileAnywhere,
  safeWriteFileAnywhere,
  type GitAdapter,
  type GitLocale,
  type GitTree,
  type RepoStatusReport,
  type SyncResult,
  type SyncStrategy,
  type WorktreeStateKind,
} from '@codemastersolutions/gittree-core';

import { Logger, type LoggerOptions } from './logger.js';

export const GITTREE_CLI_VERSION = pkg.version;

type StringEnv = Record<string, string | undefined>;

export type CliRunOptions = LoggerOptions & {
  readonly argv?: readonly string[];
  readonly env?: StringEnv;
  readonly cwd?: string;
  readonly adapter?: GitAdapter;
};

type ParsedArgs = {
  readonly positional: readonly string[];
  readonly flags: Readonly<Record<string, string | boolean>>;
};

const SUPPORTED_LANGS: ReadonlySet<string> = new Set(['en', 'pt', 'pt-br', 'es']);

function normalizeLang(raw: string | undefined): GitLocale {
  if (!raw) return 'en';
  const lc = raw.toLowerCase().replace('_', '-');
  if (lc === 'pt' || lc === 'pt-br') return 'pt-br';
  if (lc === 'es') return 'es';
  return 'en';
}

function resolveLocale(flags: ParsedArgs['flags'], env: StringEnv): GitLocale {
  const raw =
    typeof flags.lang === 'string'
      ? flags.lang
      : typeof flags.l === 'string'
        ? flags.l
        : (env.GITTREE_LANG ?? env.LANG ?? env.LC_ALL ?? 'en');
  const base = raw.split(/[.@]/)[0] ?? raw;
  if (SUPPORTED_LANGS.has(base)) return normalizeLang(base);
  return normalizeLang(base.split('-')[0] ?? base);
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const SHORT_VALUE: ReadonlyMap<string, string> = new Map([
    ['v', 'version'],
    ['h', 'help'],
    ['l', 'lang'],
    ['F', 'format'],
    ['f', 'force'],
    ['b', 'new-branch'],
    ['B', 'force-branch'],
    ['d', 'delete-branch'],
    ['r', 'delete-remote'],
    ['p', 'skip-push-check'],
    ['n', 'dry-run'],
    ['a', 'all'],
    ['s', 'strategy'],
    ['w', 'with'],
  ]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('-')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      const short = arg.slice(1);
      const chars = short.split('');
      for (let j = 0; j < chars.length; j++) {
        const ch = chars[j]!;
        const isLast = j === chars.length - 1;
        const long = SHORT_VALUE.get(ch) ?? ch;
        if (isLast) {
          const next = argv[i + 1];
          if (next !== undefined && !next.startsWith('-')) {
            flags[long] = next;
            i++;
          } else {
            flags[long] = true;
          }
        } else {
          flags[long] = true;
        }
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

const HELP = {
  root: (v: string) =>
    [
      `gittree/${v}`,
      '',
      'Usage:',
      '  gittree [--version] [--help] [--lang <en|pt-BR|es>] <group> <command> [options]',
      '',
      'Groups:',
      '  worktree   Manage worktrees (list | add | remove | prune | sync)',
      '  branch     Manage branches (sync | delete)',
      '  repo       Repository-wide operations (status | doctor)',
      '  completion Generate shell completion script (bash | zsh | fish)',
      '  config     Global configuration (set | get | list)',
      '',
      'Global options:',
      '  -v, --version                Print version and exit',
      '  -h, --help                   Print this help and exit',
      '      --lang, -l <code>        Output language (en, pt-BR, es). Overrides $GITTREE_LANG',
      '',
      'Examples:',
      '  gittree worktree list --format json',
      '  gittree worktree add ../payments -b feature/pay',
      '  gittree worktree remove ../payments --force --delete-branch',
      '  gittree worktree sync --all --strategy rebase',
      '  gittree repo status --format json',
      '  gittree completion bash > /etc/bash_completion.d/gittree',
      '  gittree config set defaultWorktreeBaseDir /opt/worktrees',
      '',
      'Environment:',
      '  GITTREE_LANG                 Default language (en, pt, pt-BR, es)',
      '  NO_COLOR                     Disable colored output',
      '  FORCE_COLOR                  Force colored output',
    ].join('\n') + '\n',

  worktree: () =>
    [
      'gittree worktree',
      '',
      'Usage:',
      '  gittree worktree list    [-F table|json|porcelain] [-f dirty|clean|ahead|behind|diverged|detached]',
      '  gittree worktree add     <path> [-b <new> | -B <force-new> | --existing <b> | --remote <o/b>] [--no-setup]',
      '  gittree worktree remove  <path> [-f] [-d] [-r] [-p]',
      '  gittree worktree prune   [-n]',
      '  gittree worktree sync    [<path>] [-a] [-s ff-only|merge|rebase] [--no-fetch-first]',
      '',
      'Options:',
      '  -F, --format <fmt>       Output format: table (default) | json | porcelain',
      '  -f, --filter <kind>      Filter list by worktree state kind',
      '  -b, --new-branch <n>     Create new branch at new worktree',
      '  -B, --force-branch <n>   Create new branch (reset if exists)',
      '      --existing <b>       Use existing local branch',
      '      --remote <o/b>       Track remote branch (e.g. origin/main)',
      '      --no-setup           Skip .gittree.json setup scripts after add',
      '  -f, --force              Remove/sync even if dirty or force-branch create',
      '  -d, --delete-branch      Delete local branch when removing worktree',
      '  -r, --delete-remote      Delete remote branch when removing worktree',
      '  -p, --skip-push-check    Skip ahead-by push check before remove',
      '  -n, --dry-run            Prune simulation only (no deletions)',
      '  -a, --all                Sync all worktrees (ignores positional <path>)',
      '  -s, --strategy <s>       Pull strategy: ff-only (default) | merge | rebase',
      '      --no-fetch-first     Skip fetch before sync',
      '',
      'Examples:',
      '  gittree worktree list',
      '  gittree worktree list -F json -f dirty',
      '  gittree worktree add ../pay -b feature/pay',
      '  gittree worktree add ../main --existing main',
      '  gittree worktree add ../feat --remote origin/feat-x --no-setup',
      '  gittree worktree remove ../pay -f -d -r',
      '  gittree worktree prune --dry-run',
      '  gittree worktree sync --all -s rebase',
      '  gittree worktree sync ../pay -s merge',
    ].join('\n') + '\n',

  branch: () =>
    [
      'gittree branch',
      '',
      'Usage:',
      '  gittree branch sync    <worktree-path> [-w origin/main] [-s rebase|merge]',
      '  gittree branch delete  <branch-name> [-f] [-r] [--remote-only]',
      '',
      'Options:',
      '  -w, --with <ref>       Main ref to sync against (default origin/main)',
      '  -s, --strategy <s>     Sync strategy: rebase (default) | merge',
      '  -f, --force            Force local delete (uses -D instead of -d)',
      '  -r, --remote           Also delete remote tracking branch (origin/<name>)',
      '      --remote-only      Delete only the remote branch, keep local',
      '',
      'Examples:',
      '  gittree branch sync ../pay --with origin/main --strategy rebase',
      '  gittree branch delete feature/pay -f -r',
      '  gittree branch delete old/proto --remote-only',
    ].join('\n') + '\n',

  repo: () =>
    [
      'gittree repo',
      '',
      'Usage:',
      '  gittree repo status   [-F table|json]',
      '  gittree repo doctor',
      '',
      'Options:',
      '  -F, --format <fmt>    Output format: table (default) | json',
      '',
      'Examples:',
      '  gittree repo status',
      '  gittree repo status -F json > report.json',
      '  gittree repo doctor',
    ].join('\n') + '\n',

  completion: () =>
    [
      'gittree completion',
      '',
      'Usage:',
      '  gittree completion <bash|zsh|fish>',
      '',
      'Description:',
      '  Writes a shell completion script to stdout. Pipe or source it from your shell rc.',
      '',
      'Shell setup examples:',
      '  # bash (persistent: /etc/bash_completion.d/ or ~/.bashrc)',
      '  gittree completion bash > /usr/local/share/bash-completion/completions/gittree',
      '',
      '  # zsh ($fpath directory or ~/.zshrc with autoload -U compinit)',
      '  gittree completion zsh > /usr/local/share/zsh/site-functions/_gittree',
      '',
      '  # fish',
      '  gittree completion fish > ~/.config/fish/completions/gittree.fish',
    ].join('\n') + '\n',

  config: () =>
    [
      'gittree config',
      '',
      'Usage:',
      '  gittree config list',
      '  gittree config get  <key>',
      '  gittree config set  <key> <value>',
      '  gittree config unset <key>',
      '',
      'Description:',
      '  Manages the global GitTree configuration stored at ~/.gittree/config.json.',
      '  All values are saved as JSON (strings, numbers, booleans, objects, arrays).',
      '',
      'Supported keys:',
      '  defaultWorktreeBaseDir    Base directory for newly-created worktrees',
      '  defaultLang               Default output language (en, pt-BR, es)',
      '  defaultFormat             Default output format (table, json, porcelain)',
      '  defaultPullStrategy       Default pull strategy (ff-only, merge, rebase)',
      '',
      'Examples:',
      '  gittree config list',
      '  gittree config get defaultWorktreeBaseDir',
      '  gittree config set defaultWorktreeBaseDir /opt/worktrees',
      '  gittree config set defaultLang pt-BR',
      '  gittree config unset defaultLang',
    ].join('\n') + '\n',
};

function printHelpFor(logger: Logger, parts: readonly string[]): void {
  if (parts.length === 0) {
    logger.info(HELP.root(GITTREE_CLI_VERSION).trimEnd());
    return;
  }
  const [g, sub] = parts as readonly [string?, string?];
  if (g === 'worktree') logger.info(HELP.worktree().trimEnd());
  else if (g === 'branch') logger.info(HELP.branch().trimEnd());
  else if (g === 'repo') logger.info(HELP.repo().trimEnd());
  else if (g === 'completion') logger.info(HELP.completion().trimEnd());
  else if (g === 'config') logger.info(HELP.config().trimEnd());
  else if (g === 'help') printHelpFor(logger, parts.slice(1));
  else {
    logger.info(HELP.root(GITTREE_CLI_VERSION).trimEnd());
    if (sub !== undefined) {
      logger.info('');
      logger.warn(`no specific help for "${parts.join(' ')}"`);
    }
  }
}

type TableRow = readonly string[];

function asciiTable(headers: TableRow, rows: readonly TableRow[]): string {
  const cols = headers.length;
  const widths = new Array<number>(cols).fill(0);
  const measure = (cells: readonly string[]) => {
    for (let i = 0; i < cols; i++) widths[i] = Math.max(widths[i]!, stripAnsi(cells[i]!).length);
  };
  measure(headers);
  rows.forEach(measure);
  const pad = (s: string, w: number) => {
    const plain = stripAnsi(s);
    const need = Math.max(0, w - plain.length);
    return s + ' '.repeat(need);
  };
  const sep = '  ';
  const lines: string[] = [];
  const headRow = headers.map((h, i) => pad(h, widths[i]!)).join(sep);
  lines.push(headRow, widths.map((w) => '-'.repeat(Math.max(0, w))).join(sep));
  for (const r of rows) {
    lines.push(r.map((c, i) => pad(c, widths[i]!)).join(sep));
  }
  return lines.join('\n');
}

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001B\[[0-9;]*m/g, '');
}

function stateColor(
  kind: WorktreeStateKind,
): 'green' | 'yellow' | 'red' | 'cyan' | 'magenta' | 'gray' {
  switch (kind) {
    case 'clean':
      return 'green';
    case 'dirty':
      return 'yellow';
    case 'ahead':
      return 'cyan';
    case 'behind':
      return 'magenta';
    case 'diverged':
      return 'red';
    case 'detached':
      return 'gray';
  }
}

function serializeRepoReportForJson(r: RepoStatusReport): unknown {
  return {
    mainWorktree: r.mainWorktree,
    worktrees: r.worktrees,
    states: Object.fromEntries(r.states.entries()),
    countByState: r.countByState,
    remotes: r.remotes,
    totalAheadBy: r.totalAheadBy,
    totalDirty: r.totalDirty,
  };
}

function shortenHead(h: string): string {
  return h.length > 7 ? h.slice(0, 7) : h;
}

function relativeOr(cwd: string, p: string): string {
  try {
    const r = relative(cwd, p);
    if (r.length === 0 || r.startsWith('.')) return p;
    return r.length < p.length ? r : p;
  } catch {
    return p;
  }
}

function flagBool(flags: ParsedArgs['flags'], long: string, short?: string): boolean {
  const v = flags[long] ?? (short ? flags[short] : undefined);
  return v === true || v === 'true' || v === '1' || v === 'yes';
}

function flagString(flags: ParsedArgs['flags'], long: string, short?: string): string | undefined {
  const v = flags[long] ?? (short ? flags[short] : undefined);
  return typeof v === 'string' ? v : undefined;
}

async function cmdWorktreeList(
  gt: GitTree,
  logger: Logger,
  flags: ParsedArgs['flags'],
): Promise<number> {
  const format = (flagString(flags, 'format', 'F') ?? 'table').toLowerCase() as
    'table' | 'json' | 'porcelain';
  const filterKind = flagString(flags, 'filter') as WorktreeStateKind | undefined;
  const worktrees = await gt.worktree.list({ skipCache: true });

  let rows = worktrees.slice();
  if (filterKind) {
    const states = new Map<string, WorktreeStateKind>();
    for (const w of rows) {
      if (w.isBare) continue;
      const s = await gt.worktree.getStatus(w.path).catch(() => undefined);
      if (s) states.set(w.path, s.kind);
    }
    rows = rows.filter((w) => {
      if (filterKind === 'detached') return w.isDetached;
      return states.get(w.path) === filterKind;
    });
  }

  if (format === 'json') {
    logger.info(JSON.stringify(rows, null, 2));
    return 0;
  }

  if (format === 'porcelain') {
    const blocks: string[] = [];
    for (const w of rows) {
      const lines: string[] = [];
      lines.push(`worktree ${w.path}`, `HEAD ${w.head}`);
      if (w.branch) lines.push(`branch ${w.branch}`);
      if (w.isDetached) lines.push('detached');
      if (w.isBare) lines.push('bare');
      if (w.lockReason) lines.push(`locked ${w.lockReason}`);
      if (w.isPrunable) lines.push('prunable');
      blocks.push(lines.join('\n'));
    }
    logger.info(blocks.join('\n\n') + (blocks.length ? '\n' : ''));
    return 0;
  }

  const header = ['PATH', 'BRANCH', 'HEAD', 'MAIN', 'STATE'] as TableRow;
  const data: TableRow[] = [];
  const states = new Map<string, WorktreeStateKind>();
  for (const w of rows) {
    if (!w.isBare) {
      const s = await gt.worktree.getStatus(w.path).catch(() => undefined);
      if (s) states.set(w.path, s.kind);
    }
  }
  for (const w of rows) {
    const path = relativeOr(gt.cwd, w.path);
    const branch = w.branch
      ? w.branch.replace(/^refs\/heads\//, '')
      : w.isDetached
        ? '(detached)'
        : w.isBare
          ? '(bare)'
          : '-';
    const head = shortenHead(w.head);
    const main = w.isMain ? '*' : '';
    const kind: WorktreeStateKind =
      states.get(w.path) ?? (w.isDetached ? 'detached' : w.isBare ? 'clean' : 'clean');
    const stateCol = logger.paint(stateColor(kind), kind);
    data.push([path, branch, head, main, stateCol]);
  }
  logger.info(asciiTable(header, data));
  return 0;
}

async function cmdWorktreeAdd(
  gt: GitTree,
  logger: Logger,
  flags: ParsedArgs['flags'],
  positional: readonly string[],
): Promise<number> {
  const [path] = positional as readonly [string?, ...string[]];
  if (!path) {
    logger.error('missing required argument: <path>');
    printHelpFor(logger, ['worktree']);
    return 2;
  }
  const branchNewName = flagString(flags, 'new-branch', 'b');
  const forceBranchRaw = flagString(flags, 'force-branch', 'B');
  const forceBranchCreate = forceBranchRaw !== undefined;
  const branchExistingName = flagString(flags, 'existing');
  const remoteBranch = flagString(flags, 'remote');
  const skipSetup = flagBool(flags, 'no-setup');
  const res = await gt.worktree.add({
    path,
    branchNewName: forceBranchRaw ?? branchNewName,
    forceBranchCreate,
    branchExistingName,
    remoteBranch,
    skipSetup,
  });
  const kindLabel =
    res.kind === 'new-branch' ? (forceBranchCreate ? 'new-branch(force)' : 'new-branch') : res.kind;
  logger.success(
    `created worktree ${relativeOr(gt.cwd, res.worktree.path)} (${kindLabel}) branch=${res.branchName ?? '-'}`,
  );
  if (res.setup) {
    for (const c of res.setup.copied ?? []) logger.info(`  setup copy:  ${c}`);
    for (const s of res.setup.symlinked ?? []) logger.info(`  setup link:  ${s}`);
    for (const w of res.setup.warnings ?? []) logger.warn(`  setup: ${w}`);
  }
  return 0;
}

async function cmdWorktreeRemove(
  gt: GitTree,
  logger: Logger,
  flags: ParsedArgs['flags'],
  positional: readonly string[],
): Promise<number> {
  const [path] = positional as readonly [string?, ...string[]];
  if (!path) {
    logger.error('missing required argument: <path>');
    printHelpFor(logger, ['worktree']);
    return 2;
  }
  const force = flagBool(flags, 'force', 'f');
  const deleteBranch = flagBool(flags, 'delete-branch', 'd');
  const deleteRemoteBranch = flagBool(flags, 'delete-remote', 'r');
  const skipPushCheck = flagBool(flags, 'skip-push-check', 'p');
  const res = await gt.worktree.remove(path, {
    force,
    deleteBranch,
    deleteRemoteBranch,
    skipPushCheck,
  });
  logger.success(`removed worktree ${relativeOr(gt.cwd, res.removedPath)}`);
  if (res.branchDeleted?.local) logger.success(`  deleted local branch`);
  if (res.branchDeleted?.remote) logger.success(`  deleted remote branch`);
  for (const w of res.warnings) logger.warn(w);
  return 0;
}

async function cmdWorktreePrune(
  gt: GitTree,
  logger: Logger,
  flags: ParsedArgs['flags'],
): Promise<number> {
  const dryRun = flagBool(flags, 'dry-run', 'n');
  const res = await gt.worktree.prune({ dryRun });
  if (res.prunedPaths.length === 0) {
    logger.info(dryRun ? 'nothing would be pruned' : 'nothing to prune');
    return 0;
  }
  for (const p of res.prunedPaths) {
    const rel = relativeOr(gt.cwd, p);
    if (dryRun) logger.warn(`would prune ${rel}`);
    else logger.success(`pruned ${rel}`);
  }
  if (dryRun) logger.warn(`dry-run summary: ${res.prunedPaths.length} path(s) would be pruned`);
  else logger.success(`summary: ${res.prunedPaths.length} stale reference(s) pruned`);
  return 0;
}

async function cmdWorktreeSync(
  gt: GitTree,
  logger: Logger,
  flags: ParsedArgs['flags'],
  positional: readonly string[],
): Promise<number> {
  const all = flagBool(flags, 'all', 'a');
  const strategyRaw = (flagString(flags, 'strategy', 's') ?? 'ff-only').toLowerCase();
  const strategy: SyncStrategy =
    strategyRaw === 'merge' ? 'merge' : strategyRaw === 'rebase' ? 'rebase' : 'ff-only';
  const fetchFirst = !flagBool(flags, 'no-fetch-first');
  const [posPath] = positional as readonly [string?, ...string[]];

  let results: readonly SyncResult[];
  if (all) {
    results = await gt.sync.pullAll({ strategy, fetchFirst });
  } else if (posPath) {
    results = [await gt.sync.pullWorktree(posPath, strategy)];
  } else {
    logger.error('must provide <path> or --all flag');
    printHelpFor(logger, ['worktree']);
    return 2;
  }

  let hadAnyNonOk = false;
  for (const r of results) {
    const rel = relativeOr(gt.cwd, r.worktreePath);
    const skipped = r.ok && r.warnings.some((w) => w.includes('skipped:'));
    if (r.ok && !skipped) logger.success(`✓ ${rel}  (${r.strategy})`);
    else if (skipped) logger.warn(`- ${rel}  (skipped: detached)`);
    else if (r.conflicted) {
      logger.warn(`✗ ${rel}  CONFLICT (${r.strategy})`);
      if (r.details) logger.info(`    ${r.details.split('\n')[0]}`);
      hadAnyNonOk = true;
    } else {
      logger.error(`✗ ${rel}  FAILED (${r.strategy})`);
      if (r.details) logger.info(`    ${r.details.split('\n')[0]}`);
      hadAnyNonOk = true;
    }
  }

  const counts = countByResult(results);
  logger.info(
    `Summary: ok=${counts.ok}  conflicted=${counts.conflicted}  failed=${counts.failed}  skipped=${counts.skipped}  total=${counts.total}`,
  );
  return hadAnyNonOk ? 1 : 0;
}

async function cmdBranchSync(
  gt: GitTree,
  logger: Logger,
  flags: ParsedArgs['flags'],
  positional: readonly string[],
): Promise<number> {
  const [path] = positional as readonly [string?, ...string[]];
  if (!path) {
    logger.error('missing required argument: <worktree-path>');
    printHelpFor(logger, ['branch']);
    return 2;
  }
  const mainRef = flagString(flags, 'with', 'w') ?? 'origin/main';
  const stratRaw = (flagString(flags, 'strategy', 's') ?? 'rebase').toLowerCase();
  const strategy = stratRaw === 'merge' ? 'merge' : 'rebase';
  const res = await gt.sync.syncWithMain(path, { mainRef, strategy });
  const rel = relativeOr(gt.cwd, path);
  if (res.ok) logger.success(`✓ ${rel} synced with ${mainRef} (${strategy})`);
  else if (res.conflicted) {
    logger.warn(`✗ ${rel} CONFLICT sync with ${mainRef} (${strategy})`);
    if (res.details) logger.info(`    ${res.details.split('\n')[0]}`);
    return 1;
  } else {
    logger.error(`✗ ${rel} FAILED sync with ${mainRef} (${strategy})`);
    if (res.details) logger.info(`    ${res.details.split('\n')[0]}`);
    return 1;
  }
  return 0;
}

async function cmdBranchDelete(
  gt: GitTree,
  logger: Logger,
  flags: ParsedArgs['flags'],
  positional: readonly string[],
): Promise<number> {
  const [name] = positional as readonly [string?, ...string[]];
  if (!name) {
    logger.error('missing required argument: <branch-name>');
    printHelpFor(logger, ['branch']);
    return 2;
  }
  const force = flagBool(flags, 'force', 'f');
  const remote = flagBool(flags, 'delete-remote', 'r') || flagBool(flags, 'remote', 'r');
  const remoteOnly = flagBool(flags, 'remote-only');
  if (remoteOnly) {
    await gt.branch.deleteRemote(name);
    logger.success(`deleted remote branch origin/${name}`);
    return 0;
  }
  await gt.branch.deleteLocal(name, { force });
  logger.success(`deleted local branch ${name} (${force ? '-D' : '-d'})`);
  if (remote) {
    await gt.branch.deleteRemote(name);
    logger.success(`deleted remote branch origin/${name}`);
  }
  return 0;
}

async function cmdRepoStatus(
  gt: GitTree,
  logger: Logger,
  flags: ParsedArgs['flags'],
): Promise<number> {
  const format = (flagString(flags, 'format', 'F') ?? 'table').toLowerCase() as 'table' | 'json';
  const report = await gt.repo.getGlobalStatus();
  if (format === 'json') {
    logger.info(JSON.stringify(serializeRepoReportForJson(report), null, 2));
    return 0;
  }
  const remotes = report.remotes.map((r) => `${r.name}=${r.url}`).join(', ') || '(none)';
  logger.info(`Repo Status (cwd=${gt.cwd})`);
  logger.info(
    `  main worktree: ${report.mainWorktree ? relativeOr(gt.cwd, report.mainWorktree.path) : '(unknown)'}`,
  );
  logger.info(`  remotes:      ${remotes}`);
  logger.info(`  total dirty:  ${report.totalDirty}`);
  logger.info(`  total ahead:  ${report.totalAheadBy}`);
  logger.info(
    `  counts:       ${
      Object.entries(report.countByState)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${k}=${v}`)
        .join('  ') || '(all zero)'
    }`,
  );
  logger.info('');
  const header = ['PATH', 'BRANCH', 'STATE', 'AHEAD', 'BEHIND', 'MOD'] as TableRow;
  const rows: TableRow[] = [];
  for (const w of report.worktrees) {
    if (w.isBare) {
      rows.push([
        relativeOr(gt.cwd, w.path),
        '(bare)',
        logger.paint('gray', 'bare'),
        '-',
        '-',
        '-',
      ]);
      continue;
    }
    const s = report.states.get(w.path);
    const kind: WorktreeStateKind = s?.kind ?? (w.isDetached ? 'detached' : 'clean');
    const branch = w.branch
      ? w.branch.replace(/^refs\/heads\//, '')
      : w.isDetached
        ? '(detached)'
        : '-';
    const mod = s
      ? String(s.modifiedFiles.length + s.untrackedFiles.length + s.deletedFiles.length)
      : '0';
    rows.push([
      relativeOr(gt.cwd, w.path),
      branch,
      logger.paint(stateColor(kind), kind),
      String(s?.aheadBy ?? 0),
      String(s?.behindBy ?? 0),
      mod,
    ]);
  }
  logger.info(asciiTable(header, rows));
  return 0;
}

async function cmdRepoDoctor(gt: GitTree, logger: Logger): Promise<number> {
  type Check = { readonly name: string; readonly ok: boolean; readonly note: string };
  const checks: Check[] = [];

  let worktreeListOk = true;
  let worktreeCount = 0;
  let listNote = 'list --porcelain';
  try {
    const list = await gt.worktree.list({ skipCache: true });
    worktreeCount = list.length;
    listNote = `list --porcelain ok (${worktreeCount} worktree(s))`;
  } catch (e) {
    worktreeListOk = false;
    listNote =
      e instanceof Error ? `list failed: ${e.message.split('\n')[0]}` : `list failed: ${String(e)}`;
  }
  checks.push({
    name: 'worktree list works',
    ok: worktreeListOk,
    note: listNote,
  });

  const hooksCandidates = [
    gt.cwd + '/.commitzero/hooks/pre-commit',
    gt.cwd + '/.githooks/pre-commit',
    gt.cwd + '/.git/hooks/pre-commit',
  ];
  const anyHook = hooksCandidates.some((h) => safeExistsAnywhere(h));
  checks.push({
    name: 'shared hooks present',
    ok: anyHook,
    note: anyHook
      ? hooksCandidates.find((h) => safeExistsAnywhere(h))!
      : 'no hook found (.commitzero/hooks, .githooks, .git/hooks)',
  });

  let setupOk = false;
  let setupNote = 'no .gittree config';
  try {
    const cfg = await gt.setup.loadConfig();
    if (cfg) {
      setupOk = true;
      setupNote = `parsed ok (copy=${cfg.setup?.copy?.length ?? 0}, symlink=${cfg.setup?.symlink?.length ?? 0})`;
    }
  } catch (e) {
    if (e instanceof ConfigParseError) {
      setupNote = `ConfigParseError: ${e.message}`;
    }
  }
  checks.push({ name: '.gittree.json', ok: setupOk, note: setupNote });

  let pass = 0;
  let warn = 0;
  for (const c of checks) {
    if (c.ok) {
      logger.success(`PASS ${c.name}  — ${c.note}`);
      pass++;
    } else {
      logger.warn(`WARN ${c.name}  — ${c.note}`);
      warn++;
    }
  }
  logger.info(`Doctor summary: PASS=${pass}  WARN=${warn}  total=${checks.length}`);
  return warn > 0 ? 1 : 0;
}

type GlobalConfig = Record<string, unknown>;

function globalConfigPath(env: Record<string, string | undefined>): string {
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg && xdg.length > 0) return join(xdg, 'gittree', 'config.json');
  const home = env.HOME ?? env.HOMEDIR ?? env.HOMEPATH ?? homedir();
  return join(home, '.gittree', 'config.json');
}

async function loadGlobalConfig(path: string): Promise<GlobalConfig> {
  try {
    const raw = await safeReadFileAnywhere(path, 'utf8');
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw) as GlobalConfig;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return {};
  } catch (e) {
    if (
      typeof e === 'object' &&
      e !== null &&
      'code' in e &&
      (e as { code?: string }).code === 'ENOENT'
    ) {
      return {};
    }
    throw new ConfigParseError('failed to parse ' + path, { source: path });
  }
}

async function saveGlobalConfig(path: string, cfg: GlobalConfig): Promise<void> {
  const dir = dirname(path);
  await safeMkdirAnywhere(dir, { recursive: true });
  await safeWriteFileAnywhere(path, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

function cmdCompletion(logger: Logger, positional: readonly string[]): number {
  const [shell] = positional as readonly [string?, ...string[]];
  const s = (shell ?? '').toLowerCase();
  if (s !== 'bash' && s !== 'zsh' && s !== 'fish') {
    logger.error('missing or invalid shell argument: bash, zsh, or fish');
    printHelpFor(logger, ['completion']);
    return 2;
  }
  if (s === 'bash') {
    logger.rawStdout(
      [
        '# gittree bash-completion (bash 3.2 compatible)',
        '_gittree_completions() {',
        '  local cur prev opts groups worktree_cmds branch_cmds repo_cmds config_cmds shells',
        '  COMPREPLY=()',
        '  cur="${COMP_WORDS[COMP_CWORD]}"',
        '  prev="${COMP_WORDS[COMP_CWORD-1]}"',
        '  groups="worktree branch repo completion config help version"',
        '  worktree_cmds="list add remove rm prune sync help"',
        '  branch_cmds="sync delete rm help"',
        '  repo_cmds="status doctor help"',
        '  config_cmds="list get set unset help"',
        '  shells="bash zsh fish"',
        '  case "${prev}" in',
        '    gittree)',
        '      COMPREPLY=($(compgen -W "$groups --version --help --lang --format" -- "$cur"))',
        '      ;;',
        '    worktree)',
        '      COMPREPLY=($(compgen -W "$worktree_cmds -F --format -f --filter -b --new-branch -B --force-branch -d --delete-branch -r --delete-remote -p --skip-push-check -n --dry-run -a --all -s --strategy --existing --remote --no-setup --no-fetch-first --force" -- "$cur"))',
        '      ;;',
        '    branch)',
        '      COMPREPLY=($(compgen -W "$branch_cmds -w --with -s --strategy -f --force -r --delete-remote --remote --remote-only" -- "$cur"))',
        '      ;;',
        '    repo)',
        '      COMPREPLY=($(compgen -W "$repo_cmds -F --format" -- "$cur"))',
        '      ;;',
        '    completion)',
        '      COMPREPLY=($(compgen -W "$shells" -- "$cur"))',
        '      ;;',
        '    config)',
        '      COMPREPLY=($(compgen -W "$config_cmds" -- "$cur"))',
        '      ;;',
        '    set|unset|get)',
        '      COMPREPLY=($(compgen -W "defaultWorktreeBaseDir defaultLang defaultFormat defaultPullStrategy" -- "$cur"))',
        '      ;;',
        '    -s|--strategy)',
        '      COMPREPLY=($(compgen -W "ff-only merge rebase" -- "$cur"))',
        '      ;;',
        '    -F|--format)',
        '      COMPREPLY=($(compgen -W "table json porcelain" -- "$cur"))',
        '      ;;',
        '    --lang|-l)',
        '      COMPREPLY=($(compgen -W "en pt-br es" -- "$cur"))',
        '      ;;',
        '    -f|--filter)',
        '      COMPREPLY=($(compgen -W "clean dirty ahead behind diverged detached" -- "$cur"))',
        '      ;;',
        '  esac',
        '  return 0',
        '}',
        'complete -F _gittree_completions gittree',
        '',
      ].join('\n'),
    );
    return 0;
  }
  if (s === 'zsh') {
    logger.rawStdout(
      [
        '#compdef gittree',
        '# gittree zsh-completion',
        '_gittree() {',
        '  local -a groups worktree_cmds branch_cmds repo_cmds config_cmds shells formats langs filters strategies keys',
        '  groups=("worktree:Manage worktrees" "branch:Manage branches" "repo:Repository operations" "completion:Shell completion script" "config:Global configuration" "help:Print help" "version:Print version")',
        '  worktree_cmds=("list:List worktrees" "add:Add worktree" "remove:Remove worktree" "rm:Remove worktree" "prune:Prune worktrees" "sync:Sync worktrees")',
        '  branch_cmds=("sync:Sync branch with main" "delete:Delete branch" "rm:Delete branch")',
        '  repo_cmds=("status:Repo status" "doctor:Health check")',
        '  config_cmds=("list:List all keys" "get:Get a key" "set:Set a key" "unset:Remove a key")',
        '  shells=(bash zsh fish)',
        '  formats=(table json porcelain)',
        '  langs=(en pt-br es)',
        '  filters=(clean dirty ahead behind diverged detached)',
        '  strategies=(ff-only merge rebase)',
        '  keys=(defaultWorktreeBaseDir defaultLang defaultFormat defaultPullStrategy)',
        '  _arguments -C \\',
        '    "1:group:(${groups})" \\',
        '    "*::arg:->args"',
        '  case $state in',
        '    args)',
        '      case $words[1] in',
        '        worktree) _arguments \\',
        '          "1:subcmd:(${worktree_cmds})" \\',
        '          "-F[output format]:format:(${formats})" \\',
        '          "--format[output format]:format:(${formats})" \\',
        '          "-f[filter by state]:filter:(${filters})" \\',
        '          "--filter[filter by state]:filter:(${filters})" \\',
        '          "-s[strategy]:strategy:(${strategies})" \\',
        '          "--strategy[strategy]:strategy:(${strategies})" ;;',
        '        branch) _arguments \\',
        '          "1:subcmd:(${branch_cmds})" \\',
        '          "-s[strategy]:strategy:(${strategies})" \\',
        '          "--strategy[strategy]:strategy:(${strategies})" ;;',
        '        repo) _arguments \\',
        '          "1:subcmd:(${repo_cmds})" \\',
        '          "-F[format]:format:(${formats})" ;;',
        '        completion) _arguments "1:shell:(${shells})" ;;',
        '        config) _arguments \\',
        '          "1:subcmd:(${config_cmds})" \\',
        '          "2:key:(${keys})" ;;',
        '      esac ;;',
        '  esac',
        '}',
        '_gittree "$@"',
        '',
      ].join('\n'),
    );
    return 0;
  }
  logger.rawStdout(
    [
      '# gittree fish-completion',
      'function __fish_gittree_using_command',
      '  set -l cmd (commandline -opc)',
      '  if [ (count $cmd) -eq (count $argv) ]',
      '    for i in (seq (count $argv))',
      '      if [ $cmd[$i] != $argv[$i] ]; return 1; end',
      '    end; return 0; end; return 1',
      'end',
      '',
      'complete -c gittree -n "__fish_gittree_using_command gittree" -f -a worktree -d "Manage worktrees"',
      'complete -c gittree -n "__fish_gittree_using_command gittree" -f -a branch -d "Manage branches"',
      'complete -c gittree -n "__fish_gittree_using_command gittree" -f -a repo -d "Repository operations"',
      'complete -c gittree -n "__fish_gittree_using_command gittree" -f -a completion -d "Shell completion script"',
      'complete -c gittree -n "__fish_gittree_using_command gittree" -f -a config -d "Global configuration"',
      'complete -c gittree -n "__fish_gittree_using_command gittree" -f -a help -d "Print help"',
      'complete -c gittree -n "__fish_gittree_using_command gittree" -f -a version -d "Print version"',
      '',
      'complete -c gittree -n "__fish_gittree_using_command gittree worktree" -f -a list add remove rm prune sync',
      'complete -c gittree -n "__fish_gittree_using_command gittree branch" -f -a sync delete rm',
      'complete -c gittree -n "__fish_gittree_using_command gittree repo" -f -a status doctor',
      'complete -c gittree -n "__fish_gittree_using_command gittree completion" -f -a bash zsh fish',
      'complete -c gittree -n "__fish_gittree_using_command gittree config" -f -a list get set unset',
      '',
      'set -l _keys defaultWorktreeBaseDir defaultLang defaultFormat defaultPullStrategy',
      'complete -c gittree -n "__fish_gittree_using_command gittree config set" -f -a $_keys',
      'complete -c gittree -n "__fish_gittree_using_command gittree config get" -f -a $_keys',
      'complete -c gittree -n "__fish_gittree_using_command gittree config unset" -f -a $_keys',
      '',
      'complete -c gittree -s s -l strategy -f -a "ff-only merge rebase"',
      'complete -c gittree -s F -l format -f -a "table json porcelain"',
      'complete -c gittree -s l -l lang -f -a "en pt-br es"',
      'complete -c gittree -s f -l filter -f -a "clean dirty ahead behind diverged detached"',
      '',
    ].join('\n'),
  );
  return 0;
}

async function cmdConfigList(
  logger: Logger,
  env: Record<string, string | undefined>,
): Promise<number> {
  const p = globalConfigPath(env);
  const cfg = await loadGlobalConfig(p);
  const keys = Object.keys(cfg).sort((a, b) => a.localeCompare(b));
  if (keys.length === 0) {
    logger.info(`(no keys configured — file: ${p})`);
    return 0;
  }
  logger.info(`Global config: ${p}`);
  const rows: TableRow[] = [];
  for (const k of keys) {
    const raw = cfg[k];
    const val = typeof raw === 'string' ? raw : JSON.stringify(raw);
    rows.push([k, val]);
  }
  logger.info(asciiTable(['KEY', 'VALUE'] as TableRow, rows));
  return 0;
}

async function cmdConfigGet(
  logger: Logger,
  env: Record<string, string | undefined>,
  positional: readonly string[],
): Promise<number> {
  const [key] = positional as readonly [string?, ...string[]];
  if (!key?.length) {
    logger.error('missing required argument: <key>');
    printHelpFor(logger, ['config']);
    return 2;
  }
  const p = globalConfigPath(env);
  const cfg = await loadGlobalConfig(p);
  if (!(key in cfg)) {
    logger.warn(`no such key: ${key}`);
    return 1;
  }
  const raw = cfg[key];
  if (typeof raw === 'string') logger.info(raw);
  else logger.info(JSON.stringify(raw));
  return 0;
}

function coerceScalar(v: string): unknown {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (/^-?\d+$/.test(v)) {
    const n = Number(v);
    if (!Number.isNaN(n) && Number.isSafeInteger(n)) return n;
  }
  if (/^-?\d+\.\d+$/.test(v)) {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  if ((v.startsWith('{') && v.endsWith('}')) || (v.startsWith('[') && v.endsWith(']'))) {
    try {
      return JSON.parse(v);
    } catch {
      // fallthrough: treat as string
    }
  }
  return v;
}

async function cmdConfigSet(
  logger: Logger,
  env: Record<string, string | undefined>,
  positional: readonly string[],
): Promise<number> {
  const [key, value] = positional as readonly [string?, string?, ...string[]];
  if (!key?.length || value === undefined) {
    logger.error('missing required arguments: <key> <value>');
    printHelpFor(logger, ['config']);
    return 2;
  }
  const p = globalConfigPath(env);
  const cfg = await loadGlobalConfig(p);
  cfg[key] = coerceScalar(value);
  await saveGlobalConfig(p, cfg);
  logger.success(
    `set ${key}=${typeof cfg[key] === 'string' ? (cfg[key] as string) : JSON.stringify(cfg[key])}`,
  );
  return 0;
}

async function cmdConfigUnset(
  logger: Logger,
  env: Record<string, string | undefined>,
  positional: readonly string[],
): Promise<number> {
  const [key] = positional as readonly [string?, ...string[]];
  if (!key?.length) {
    logger.error('missing required argument: <key>');
    printHelpFor(logger, ['config']);
    return 2;
  }
  const p = globalConfigPath(env);
  const cfg = await loadGlobalConfig(p);
  if (!(key in cfg)) {
    logger.warn(`no such key: ${key}`);
    return 1;
  }
  delete cfg[key];
  await saveGlobalConfig(p, cfg);
  logger.success(`unset ${key}`);
  return 0;
}

function errorToExitCode(e: unknown): number {
  if (e instanceof DirtyWorktreeError) return 1;
  if (e instanceof BranchLockedError) return 2;
  if (e instanceof BranchAheadError) return 3;
  if (e instanceof GitExecutionError) return 4;
  if (e instanceof ConfigParseError) return 5;
  if (e instanceof GitVersionError) return 6;
  if (e instanceof GitTreeError) return 10;
  return 1;
}

function logError(logger: Logger, e: unknown, i18n: I18n): void {
  if (e instanceof DirtyWorktreeError) {
    const files = (e.context?.files as readonly string[] | undefined) ?? [];
    const path = (e.context?.worktreePath as string | undefined) ?? '?';
    logger.error(
      `${i18n.t('errors.dirtyWorktree', { path, count: String(files.length) })} (refusing to remove)`,
    );
    if (files.length) logger.info(`  files: ${files.join(', ')}`);
    logger.info('  hint: use --force to remove anyway, or commit/stash first');
    return;
  }
  if (e instanceof BranchLockedError) {
    logger.error(e.message);
    const other = (e.context?.alreadyAtPath as string | undefined) ?? '';
    if (other) logger.info(`  hint: branch is active at ${other}`);
    return;
  }
  if (e instanceof BranchAheadError) {
    logger.error(e.message);
    const ahead = (e.context?.aheadBy as number | undefined) ?? 0;
    if (ahead > 0) logger.info(`  hint: push first, use --skip-push-check, or pass --force`);
    return;
  }
  if (e instanceof GitExecutionError) {
    logger.error(`${e.message}`);
    if (e.stderr.trim()) {
      const first = e.stderr.trim().split('\n')[0]!;
      logger.info(`  git stderr: ${first}`);
    }
    return;
  }
  if (e instanceof ConfigParseError) {
    logger.error(`config error: ${e.message}`);
    const src = e.context?.source as string | undefined;
    if (src) logger.info(`  source: ${src}`);
    return;
  }
  if (e instanceof GitTreeError) {
    logger.error(`${e.code}: ${e.message}`);
    return;
  }
  if (e instanceof Error) {
    logger.error(`${e.name}: ${e.message}`);
    return;
  }
  logger.error(String(e));
}

export async function run(options: CliRunOptions = {}): Promise<number> {
  const env = options.env ?? process.env;
  const argv = options.argv ?? process.argv.slice(2);
  const logger = new Logger(options);
  const { positional, flags } = parseArgs(argv);

  const versionFlag = flagBool(flags, 'version') || flagBool(flags, 'v');
  const helpFlag = flagBool(flags, 'help') || flagBool(flags, 'h');
  const [command, ...rest] = positional as readonly [string?, ...string[]];

  if (versionFlag || command === 'version') {
    logger.info(GITTREE_CLI_VERSION);
    return 0;
  }

  if (helpFlag || command === 'help' || positional.length === 0) {
    let parts: readonly string[];
    if (command === 'help') parts = rest;
    else if (helpFlag && command) parts = [command, ...rest];
    else parts = [];
    printHelpFor(logger, parts.filter(Boolean));
    return 0;
  }

  if (command === 'completion') {
    if (helpFlag) {
      printHelpFor(logger, ['completion']);
      return 0;
    }
    return cmdCompletion(logger, rest);
  }
  if (command === 'config') {
    const [sub, ...args] = rest as readonly [string?, ...string[]];
    if (helpFlag || sub === 'help' || sub === undefined) {
      printHelpFor(logger, ['config']);
      return 0;
    }
    try {
      if (sub === 'list') return await cmdConfigList(logger, env);
      if (sub === 'get') return await cmdConfigGet(logger, env, args);
      if (sub === 'set') return await cmdConfigSet(logger, env, args);
      if (sub === 'unset') return await cmdConfigUnset(logger, env, args);
      logger.warn(`unknown config subcommand "${sub}"`);
      printHelpFor(logger, ['config']);
      return 2;
    } catch (e) {
      const i18nPlain = new I18n(resolveLocale(flags, env));
      logError(logger, e, i18nPlain);
      return errorToExitCode(e);
    }
  }

  const locale = resolveLocale(flags, env);
  const cwd = options.cwd ?? process.cwd();
  const gt = createGitTree({ cwd, locale, adapter: options.adapter });
  const i18n = new I18n(locale);

  try {
    if (command === 'worktree') {
      const [sub, ...args] = rest as readonly [string?, ...string[]];
      if (helpFlag || sub === 'help' || sub === undefined) {
        printHelpFor(logger, helpFlag && sub && sub !== 'help' ? ['worktree'] : ['worktree']);
        return 0;
      }
      if (sub === 'list') return await cmdWorktreeList(gt, logger, flags);
      if (sub === 'add') return await cmdWorktreeAdd(gt, logger, flags, args);
      if (sub === 'remove' || sub === 'rm') return await cmdWorktreeRemove(gt, logger, flags, args);
      if (sub === 'prune') return await cmdWorktreePrune(gt, logger, flags);
      if (sub === 'sync') return await cmdWorktreeSync(gt, logger, flags, args);
      logger.warn(`unknown worktree subcommand "${sub}"`);
      printHelpFor(logger, ['worktree']);
      return 2;
    }
    if (command === 'branch') {
      const [sub, ...args] = rest as readonly [string?, ...string[]];
      if (helpFlag || sub === 'help' || sub === undefined) {
        printHelpFor(logger, ['branch']);
        return 0;
      }
      if (sub === 'sync') return await cmdBranchSync(gt, logger, flags, args);
      if (sub === 'delete' || sub === 'rm') return await cmdBranchDelete(gt, logger, flags, args);
      logger.warn(`unknown branch subcommand "${sub}"`);
      printHelpFor(logger, ['branch']);
      return 2;
    }
    if (command === 'repo') {
      const [sub] = rest as readonly [string?, ...string[]];
      if (helpFlag || sub === 'help' || sub === undefined) {
        printHelpFor(logger, ['repo']);
        return 0;
      }
      if (sub === 'status') return await cmdRepoStatus(gt, logger, flags);
      if (sub === 'doctor') return await cmdRepoDoctor(gt, logger);
      logger.warn(`unknown repo subcommand "${sub}"`);
      printHelpFor(logger, ['repo']);
      return 2;
    }

    logger.warn(`unknown command "${command}" — try "gittree help"`);
    return 2;
  } catch (e) {
    logError(logger, e, i18n);
    return errorToExitCode(e);
  }
}

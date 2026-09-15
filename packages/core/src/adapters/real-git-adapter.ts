import { spawn } from 'node:child_process';
import type { GitAdapter, GitExecOptions, GitExecResult, GitLocale, GitVersion } from './types.js';

import { GitExecutionError, GitVersionError } from '../errors/index.js';
import { I18n } from '../i18n/index.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_GIT_MAJOR = 2;
const MIN_GIT_MINOR = 24;

function parseGitVersion(raw: string): GitVersion {
  // Tolerate vendor suffixes: `git version 2.50.1 (Apple Git-155)`,
  // `git version 2.42.0.windows.1`, etc. We only need the first three
  // numeric groups and ignore anything that follows (spaces, parens,
  // platform tags). The `$` anchor in the previous regex broke every
  // such build, leaving the adapter pinned to 0.0.0.
  // eslint-disable-next-line security/detect-unsafe-regex -- bounded quantifiers (max 3 / 5 digits) + no backtracking on the suffix.
  const versionRegex = /git\s*version\s+(\d{1,3})\.(\d{1,3})(?:\.(\d{1,5}))?/i;
  const head = raw.split('\n')[0] ?? '';
  const match = versionRegex.exec(head);
  if (!match) {
    return {
      raw,
      major: 0,
      minor: 0,
      patch: 0,
      satisfies: () => false,
    };
  }
  const major = Number(match[1] ?? 0);
  const minor = Number(match[2] ?? 0);
  const patch = Number(match[3] ?? 0);
  return {
    raw,
    major,
    minor,
    patch,
    satisfies(needMajor: number, needMinor: number): boolean {
      if (major > needMajor) return true;
      if (major === needMajor && minor >= needMinor) return true;
      return false;
    },
  };
}

export class RealGitAdapter implements GitAdapter {
  public readonly locale: GitLocale;
  private readonly rootCwd: string;
  private readonly i18n: I18n;
  private cachedVersion: GitVersion | undefined;

  public constructor(options: { readonly cwd: string; readonly locale?: GitLocale }) {
    this.rootCwd = options.cwd;
    this.locale = options.locale ?? 'en';
    this.i18n = new I18n(this.locale);
  }

  public cwd(): string {
    return this.rootCwd;
  }

  public async version(): Promise<GitVersion> {
    if (this.cachedVersion) {
      return this.cachedVersion;
    }
    const result = await this.exec('--version');
    const parsed = parseGitVersion(result.stdout.trim());
    this.cachedVersion = parsed;
    return parsed;
  }

  public async requireMinVersion(major: number, minor: number): Promise<void> {
    const v = await this.version();
    if (v.satisfies(major, minor)) {
      return;
    }
    const msg = this.i18n.t('errors.gitVersionTooOld', {
      required: `${major}.${minor}`,
      actual: `${v.major}.${v.minor}.${v.patch}`,
    });
    throw new GitVersionError(msg, {
      required: `${major}.${minor}`,
      actual: `${v.major}.${v.minor}.${v.patch}`,
    });
  }

  public async exec(command: string, options?: GitExecOptions): Promise<GitExecResult> {
    await this.ensureVersionChecked(command);

    const workingDir = options?.cwd ?? this.rootCwd;
    const timeout = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const args = this.splitArgs(command);
    const startedAt = performance.now();

    return new Promise<GitExecResult>((resolve, reject) => {
      const child = spawn('git', args, {
        cwd: workingDir,
        env: {
          ...process.env,
          ...(options?.env ?? {}),
          GIT_TERMINAL_PROMPT: '0',
          LANG: this.envLocale(),
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let done = false;

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        child.kill('SIGTERM');
        reject(
          new GitExecutionError('Git command timed out', {
            exitCode: -1,
            stdout,
            stderr: `${stderr}\n[timed out after ${timeout}ms]`,
            command,
          }),
        );
      }, timeout);

      child.stdout.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString('utf8');
      });
      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString('utf8');
      });

      if (options?.stdin !== undefined) {
        const stdinInput = typeof options.stdin === 'string' ? options.stdin : options.stdin;
        child.stdin?.end(stdinInput);
      }

      child.on('error', (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        reject(
          new GitExecutionError(err.message, {
            exitCode: -1,
            stdout,
            stderr,
            command,
          }),
        );
      });

      child.on('close', (exitCode, signal) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const durationMs = Math.round(performance.now() - startedAt);
        const code = exitCode ?? (signal ? -2 : 0);
        const result: GitExecResult = {
          stdout,
          stderr,
          exitCode: code,
          command,
          durationMs,
        };
        if (code !== 0) {
          reject(
            new GitExecutionError(
              this.i18n.t('errors.gitExecFailed', {
                command,
                exitCode: code,
                stderr: stderr.trim() || '(no stderr)',
              }),
              { exitCode: code, stdout, stderr, command },
            ),
          );
          return;
        }
        resolve(result);
      });
    });
  }

  private splitArgs(command: string): readonly string[] {
    const trimmed = command.trim();
    if (!trimmed) return [];
    const tokens: string[] = [];
    let current = '';
    let inSingle = false;
    let inDouble = false;
    for (const element of trimmed) {
      const ch = element as string;
      if (ch === "'" && !inDouble) {
        inSingle = !inSingle;
        continue;
      }
      if (ch === '"' && !inSingle) {
        inDouble = !inDouble;
        continue;
      }
      if (ch === ' ' && !inSingle && !inDouble) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        continue;
      }
      current += ch;
    }
    if (current) tokens.push(current);
    return tokens;
  }

  private envLocale(): string {
    switch (this.locale) {
      case 'pt-br':
        return 'pt_BR.UTF-8';
      case 'es':
        return 'es_ES.UTF-8';
      case 'en':
      default:
        return 'C.UTF-8';
    }
  }

  private async ensureVersionChecked(command: string): Promise<void> {
    if (command === '--version' || command.startsWith('version')) {
      return;
    }
    await this.requireMinVersion(MIN_GIT_MAJOR, MIN_GIT_MINOR);
  }
}

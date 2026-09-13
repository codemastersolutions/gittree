import type {
  GitAdapter,
  GitCallRecord,
  GitExecOptions,
  GitExecResult,
  GitLocale,
  GitVersion,
} from '../adapters/types.js';

type QueuedResult = {
  readonly predicate: (_command: string) => boolean;
  readonly output: { stdout: string; stderr: string; exitCode: number };
};

export class MockGitAdapter implements GitAdapter {
  public readonly locale: GitLocale;
  private readonly rootCwd: string;

  private readonly calls: GitCallRecord[] = [];
  private readonly queue: QueuedResult[] = [];
  private defaultExit = 0;

  public constructor(options: { readonly cwd: string; readonly locale?: GitLocale }) {
    this.rootCwd = options.cwd;
    this.locale = options.locale ?? 'en';
  }

  public cwd(): string {
    return this.rootCwd;
  }

  public async version(): Promise<GitVersion> {
    return {
      raw: 'git version 2.45.0.mock',
      major: 2,
      minor: 45,
      patch: 0,
      satisfies(major: number, minor: number): boolean {
        if (2 > major) return true;
        if (2 === major && 45 >= minor) return true;
        return false;
      },
    };
  }

  public async requireMinVersion(_major: number, _minor: number): Promise<void> {
    return undefined;
  }

  public queueOutput(
    commandPredicate: string | RegExp | ((_command: string) => boolean),
    stdout: string,
    stderr = '',
    exitCode = 0,
  ): void {
    const predicate: (_c: string) => boolean =
      typeof commandPredicate === 'string'
        ? (_c: string) => _c === commandPredicate
        : commandPredicate instanceof RegExp
          ? (_c: string) => commandPredicate.test(_c)
          : commandPredicate;
    this.queue.push({
      predicate,
      output: { stdout, stderr, exitCode },
    });
  }

  public setDefaultExitCode(code: number): void {
    this.defaultExit = code;
  }

  public recordedCalls(): readonly GitCallRecord[] {
    return this.calls.slice();
  }

  public wasCalled(commandPredicate: string | RegExp | ((_c: string) => boolean)): boolean {
    const pred: (_c: string) => boolean =
      typeof commandPredicate === 'string'
        ? (_c: string) => _c === commandPredicate
        : commandPredicate instanceof RegExp
          ? (_c: string) => commandPredicate.test(_c)
          : commandPredicate;
    return this.calls.some((call) => pred(call.command));
  }

  public callCount(commandPredicate: string | RegExp | ((_c: string) => boolean)): number {
    const pred: (_c: string) => boolean =
      typeof commandPredicate === 'string'
        ? (_c: string) => _c === commandPredicate
        : commandPredicate instanceof RegExp
          ? (_c: string) => commandPredicate.test(_c)
          : commandPredicate;
    return this.calls.filter((call) => pred(call.command)).length;
  }

  public reset(): void {
    this.calls.length = 0;
    this.queue.length = 0;
    this.defaultExit = 0;
  }

  public async exec(command: string, options?: GitExecOptions): Promise<GitExecResult> {
    this.calls.push({ command, options, at: Date.now() });
    const idx = this.queue.findIndex((q) => q.predicate(command));
    if (idx >= 0) {
      const hit = this.queue[idx] as QueuedResult;
      return {
        command,
        stdout: hit.output.stdout,
        stderr: hit.output.stderr,
        exitCode: hit.output.exitCode,
        durationMs: 0,
      };
    }
    return {
      command,
      stdout: '',
      stderr: '',
      exitCode: this.defaultExit,
      durationMs: 0,
    };
  }
}

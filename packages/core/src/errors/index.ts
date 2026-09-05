export class GitTreeError extends Error {
  public readonly code: string;
  public readonly cause?: unknown;
  public readonly context?: Readonly<Record<string, unknown>>;

  public constructor(
    code: string,
    message: string,
    opts?: { cause?: unknown; context?: Record<string, unknown> },
  ) {
    super(message);
    this.name = 'GitTreeError';
    this.code = code;
    this.cause = opts?.cause;
    this.context = opts?.context ? { ...opts.context } : undefined;
    Object.setPrototypeOf(this, GitTreeError.prototype);
  }
}

export class GitVersionError extends GitTreeError {
  public constructor(message: string, context?: { required: string; actual: string }) {
    super('GIT_VERSION_TOO_OLD', message, { context });
    this.name = 'GitVersionError';
    Object.setPrototypeOf(this, GitVersionError.prototype);
  }
}

export class GitExecutionError extends GitTreeError {
  public readonly stdout: string;
  public readonly stderr: string;
  public readonly exitCode: number;

  public constructor(
    message: string,
    details: {
      exitCode: number;
      stdout: string;
      stderr: string;
      command?: string;
    },
  ) {
    super('GIT_EXEC_FAILED', message, {
      context: {
        exitCode: details.exitCode,
        command: details.command,
        stderrHead: details.stderr.slice(0, 500),
      },
    });
    this.name = 'GitExecutionError';
    this.stdout = details.stdout;
    this.stderr = details.stderr;
    this.exitCode = details.exitCode;
    Object.setPrototypeOf(this, GitExecutionError.prototype);
  }
}

export class DirtyWorktreeError extends GitTreeError {
  public constructor(
    message: string,
    context?: { worktreePath: string; files: readonly string[] },
  ) {
    super('DIRTY_WORKTREE', message, { context });
    this.name = 'DirtyWorktreeError';
    Object.setPrototypeOf(this, DirtyWorktreeError.prototype);
  }
}

export class BranchLockedError extends GitTreeError {
  public constructor(message: string, context?: { branch: string; alreadyAtPath: string }) {
    super('BRANCH_LOCKED', message, { context });
    this.name = 'BranchLockedError';
    Object.setPrototypeOf(this, BranchLockedError.prototype);
  }
}

export class BranchAheadError extends GitTreeError {
  public constructor(message: string, context?: { branch: string; aheadBy: number }) {
    super('BRANCH_AHEAD', message, { context });
    this.name = 'BranchAheadError';
    Object.setPrototypeOf(this, BranchAheadError.prototype);
  }
}

export class ConfigParseError extends GitTreeError {
  public constructor(message: string, context?: { source: string }) {
    super('CONFIG_PARSE_ERROR', message, { context });
    this.name = 'ConfigParseError';
    Object.setPrototypeOf(this, ConfigParseError.prototype);
  }
}

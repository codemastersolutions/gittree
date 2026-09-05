/// <reference types="node" />

export type GitLocale = 'en' | 'pt-br' | 'es';

export interface GitExecOptions {
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
  readonly timeoutMs?: number;
  readonly stdin?: string | Buffer;
}

export interface GitExecResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly command: string;
  readonly durationMs: number;
}

export interface GitAdapter {
  readonly locale: GitLocale;
  exec(_command: string, _options?: GitExecOptions): Promise<GitExecResult>;
  cwd(): string;
  version(): Promise<GitVersion>;
  requireMinVersion(_major: number, _minor: number): Promise<void>;
}

export interface GitVersion {
  readonly raw: string;
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  satisfies(_major: number, _minor: number): boolean;
}

export interface GitCallRecord {
  readonly command: string;
  readonly options: GitExecOptions | undefined;
  readonly at: number;
}

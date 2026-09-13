/// <reference types="node" />

import type { Writable } from 'node:stream';

const COLORS = {
  reset: [0, 0],
  bold: [1, 22],
  dim: [2, 22],
  red: [31, 39],
  green: [32, 39],
  yellow: [33, 39],
  blue: [34, 39],
  magenta: [35, 39],
  cyan: [36, 39],
  white: [37, 39],
  gray: [90, 39],
} as const satisfies Record<string, readonly [number, number]>;

type ColorKey = keyof typeof COLORS;

const isColorSupported = (stream?: { isTTY?: boolean }): boolean => {
  if (process.env.NO_COLOR !== undefined) return false;
  if (process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== '0') return true;
  return stream?.isTTY === true;
};

export type LoggerOptions = {
  readonly color?: boolean;
  readonly stdout?: Writable;
  readonly stderr?: Writable;
};

export class Logger {
  public readonly color: boolean;
  private readonly stdout: Writable;
  private readonly stderr: Writable;

  public constructor(options: LoggerOptions = {}) {
    this.color = options.color ?? isColorSupported(process.stdout);
    this.stdout = options.stdout ?? process.stdout;
    this.stderr = options.stderr ?? process.stderr;
  }

  public paint(color: ColorKey, text: string): string {
    if (!this.color) return text;
    const [open, close] = COLORS[color];
    return `\u001B[${open}m${text}\u001B[${close}m`;
  }

  public info(...parts: readonly string[]): void {
    this.stdout.write(parts.join(' ') + '\n');
  }

  public warn(...parts: readonly string[]): void {
    const prefix = this.color ? this.paint('yellow', 'warning') + ':' : 'warning:';
    this.stderr.write(prefix + ' ' + parts.join(' ') + '\n');
  }

  public error(...parts: readonly string[]): void {
    const prefix = this.color ? this.paint('red', 'error') + ':' : 'error:';
    this.stderr.write(prefix + ' ' + parts.join(' ') + '\n');
  }

  public success(...parts: readonly string[]): void {
    const prefix = this.color ? this.paint('green', 'ok') + ':' : 'ok:';
    this.stdout.write(prefix + ' ' + parts.join(' ') + '\n');
  }

  public rawStdout(data: string): void {
    this.stdout.write(data);
  }
}

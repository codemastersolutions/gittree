import type { GitAdapter } from '../adapters/types.js';
import type { Branch, DeleteBranchResult } from '../types/index.js';
import type { I18n } from '../i18n/index.js';
import { GitExecutionError } from '../errors/index.js';

export class BranchService {
  private readonly adapter: GitAdapter;
  private readonly i18n: I18n;

  public constructor(adapter: GitAdapter, i18n: I18n) {
    this.adapter = adapter;
    this.i18n = i18n;
  }

  public async deleteLocal(
    branchName: string,
    options?: { readonly force?: boolean },
  ): Promise<DeleteBranchResult> {
    const force = options?.force === true;
    const flag = force ? '-D' : '-d';
    const res = await this.adapter.exec(`branch ${flag} ${quoteArg(branchName)}`);
    if (res.exitCode !== 0) {
      const msg = this.i18n.t('errors.branchDeleteFailed', {
        branch: branchName,
        stderr: res.stderr || 'unknown',
      });
      throw new GitExecutionError(msg, {
        exitCode: res.exitCode,
        stdout: res.stdout,
        stderr: res.stderr,
        command: `branch ${flag} ${branchName}`,
      });
    }
    return {
      ok: true,
      deleted: true,
      branchName,
      warnings: [],
      message: `branch ${branchName} deleted locally (${flag})`,
    };
  }

  public async deleteRemote(
    branchName: string,
    options?: { readonly remote?: string },
  ): Promise<DeleteBranchResult> {
    const remote = options?.remote ?? 'origin';
    const res = await this.adapter.exec(
      `push ${quoteArg(remote)} --delete ${quoteArg(branchName)}`,
    );
    if (res.exitCode !== 0) {
      const msg = this.i18n.t('errors.remoteBranchDeleteFailed', {
        branch: branchName,
        remote,
        stderr: res.stderr || 'unknown',
      });
      throw new GitExecutionError(msg, {
        exitCode: res.exitCode,
        stdout: res.stdout,
        stderr: res.stderr,
        command: `push ${remote} --delete ${branchName}`,
      });
    }
    return {
      ok: true,
      deleted: true,
      branchName,
      remote,
      warnings: [],
      message: `branch ${remote}/${branchName} deleted remotely`,
    };
  }

  public async listLocal(): Promise<readonly Branch[]> {
    const format = '--format=%(refname:short)|%(HEAD)|%(upstream:short)';
    const res = await this.adapter.exec(`for-each-ref ${format} refs/heads`);
    if (res.exitCode !== 0) {
      throw new GitExecutionError('git list-local-branches failed', {
        exitCode: res.exitCode,
        stdout: res.stdout,
        stderr: res.stderr,
        command: 'for-each-ref refs/heads',
      });
    }
    const lines = res.stdout.split('\n').filter((l) => l.length > 0);
    const branches: Branch[] = [];
    for (const line of lines) {
      const [name, headSym, upstream] = line.split('|');
      if (!name) continue;
      const hasUpstream = Boolean(upstream) && (upstream?.length ?? 0) > 0;
      branches.push({
        name,
        remote: hasUpstream ? upstream!.split('/')[0]! : undefined,
        upstream: hasUpstream ? upstream : undefined,
        isCurrent: headSym === '*',
        isRemote: false,
        upToDate: undefined,
        aheadBy: 0,
        behindBy: 0,
      });
    }
    return branches;
  }

  public async listRemote(): Promise<readonly Branch[]> {
    const format = '--format=%(refname:short)';
    const res = await this.adapter.exec(`for-each-ref ${format} refs/remotes`);
    if (res.exitCode !== 0) {
      throw new GitExecutionError('git list-remote-branches failed', {
        exitCode: res.exitCode,
        stdout: res.stdout,
        stderr: res.stderr,
        command: 'for-each-ref refs/remotes',
      });
    }
    const lines = res.stdout.split('\n').filter((l) => l.length > 0 && !l.endsWith('/HEAD'));
    return lines.map((line) => {
      const slash = line.indexOf('/');
      const remote = slash >= 0 ? line.slice(0, Math.max(0, slash)) : undefined;
      return {
        name: line,
        remote,
        upstream: undefined,
        isCurrent: false,
        isRemote: true,
        upToDate: undefined,
        aheadBy: 0,
        behindBy: 0,
      };
    });
  }
}

function quoteArg(arg: string): string {
  if (/^[a-zA-Z0-9@/+_:.-]+$/.test(arg)) return arg;
  const escaped = arg.replace(/'/g, "'\\''");
  return `'${escaped}'`;
}

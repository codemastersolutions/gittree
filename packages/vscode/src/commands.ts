import type { GitTree, Worktree } from '@codemastersolutions/gittree-core';
import type { ExtensionRuntime } from './types';

export interface VsCodeNavApis {
  readonly commands: {
    executeCommand(command: string, ...rest: readonly unknown[]): Promise<unknown>;
  };
  readonly window: {
    createTerminal(options?: { name?: string; cwd?: string; shellPath?: string }): {
      show(preserveFocus?: boolean): void;
    };
    showErrorMessage(message: string): Promise<unknown>;
    showInformationMessage(message: string): Promise<unknown>;
  };
  readonly env: { openExternal(target: unknown): Promise<boolean> };
  readonly Uri: { file(path: string): { readonly fsPath: string } };
  readonly workspace: {
    getConfiguration(section?: string): {
      get<T = unknown>(key: string, fallback?: T): T;
    };
  };
}

export class CommandHandlers {
  private readonly runtime: ExtensionRuntime;
  private readonly vscode: VsCodeNavApis;

  constructor(runtime: ExtensionRuntime, vscode: VsCodeNavApis) {
    this.runtime = runtime;
    this.vscode = vscode;
  }

  public get gt(): GitTree {
    return this.runtime.gt;
  }

  public async openInNewWindow(path: string): Promise<void> {
    const uri = this.vscode.Uri.file(path);
    await this.vscode.commands.executeCommand('vscode.openFolder', uri, true);
  }

  public async revealInExplorer(path: string): Promise<void> {
    const uri = this.vscode.Uri.file(path);
    await this.vscode.commands.executeCommand('revealFileInOS', uri);
  }

  public openTerminalHere(worktree: Worktree): { name: string; cwd: string; showed: boolean } {
    const cfg = this.vscode.workspace.getConfiguration('gittree');
    const shellPath = cfg.get<string | null>('gittree.defaultShell', null);
    const name = `GitTree · ${worktree.branch ?? worktree.head.substring(0, 8)}`;
    const term = this.vscode.window.createTerminal({
      name,
      cwd: worktree.path,
      shellPath: shellPath ?? undefined,
    });
    term.show(true);
    return { name, cwd: worktree.path, showed: true };
  }

  public async switchToWorktree(worktree: Worktree): Promise<unknown> {
    if (worktree.isBare) {
      await this.vscode.window.showErrorMessage(
        `Cannot switch to bare worktree at ${worktree.path}`,
      );
      return undefined;
    }
    const uri = this.vscode.Uri.file(worktree.path);
    return this.vscode.commands.executeCommand('vscode.openFolder', uri, false);
  }

  public async refreshTree(provider: { refresh(): void }): Promise<void> {
    provider.refresh();
    await this.vscode.window.showInformationMessage('GitTree worktrees refreshed.');
  }

  public pathBasename(p: string): string {
    const sep = p.includes('/') ? '/' : '\\';
    const idx = p.lastIndexOf(sep);
    return idx >= 0 ? p.substring(idx + 1) : p;
  }
}

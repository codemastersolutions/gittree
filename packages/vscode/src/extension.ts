import type { ExtensionContext } from 'vscode';
import {
  createGitTree,
  type GitTree,
  type GitAdapter,
  type Worktree,
} from '@codemastersolutions/gittree-core';
import { WorktreesTreeDataProvider, resolveLanguagePreference } from './tree-provider';
import { CommandHandlers } from './commands';
import { NewWorktreeWizard } from './wizards';
import { WriteHandlers } from './batch-actions';
import { WorktreeDetailsWebView, type WorktreeDetailsInput } from './worktree-details-webview';
import type { ExtensionRuntime, GitTreeNode } from './types';

export interface GitTreeExtensionModule {
  activate(
    context: ExtensionContext,
    overrides?: ExtensionActivationOverrides,
  ): Promise<ActivationHandles>;
  deactivate(): void;
}

export interface ExtensionActivationOverrides {
  readonly vscode?: Partial<VsCodeApis>;
  readonly adapter?: GitAdapter;
  readonly cwd?: string;
  readonly RealGitAdapter?: new (opts: { cwd: string }) => GitAdapter;
}

export interface QuickPickItem {
  readonly label: string;
  readonly description?: string;
  readonly detail?: string;
  readonly picked?: boolean;
}
export interface MessageItem {
  readonly title: string;
  readonly isCloseAffordance?: boolean;
}
export interface OutputChannelStub {
  readonly name: string;
  appendLine(value: string): void;
  show(preserveFocus?: boolean): void;
  dispose(): void;
  readonly lines: string[];
}

export interface WebviewPanelStub {
  readonly viewType: string;
  title: string;
  readonly webview: {
    html: string;
    options: unknown;
    onDidReceiveMessage(handler: (msg: unknown) => unknown): { dispose(): void };
    postMessage(message: unknown): PromiseLike<boolean>;
    asWebviewUri(uri: unknown): unknown;
    readonly cspSource: string;
  };
  onDidDispose(handler: () => void): { dispose(): void };
  reveal(column?: unknown, preserveFocus?: boolean): void;
  dispose(): void;
  readonly disposed: boolean;
  readonly visible: boolean;
}
export interface VsCodeApis {
  readonly window: {
    createTreeView<T>(
      viewId: string,
      opts: { treeDataProvider: import('vscode').TreeDataProvider<T> },
    ): { readonly onDidChangeVisibility?: import('vscode').Event<unknown>; dispose(): void };
    createTerminal(opts?: { name?: string; cwd?: string; shellPath?: string }): {
      show(preserveFocus?: boolean): void;
    };
    createOutputChannel(name: string): OutputChannelStub;
    createWebviewPanel(
      viewType: string,
      title: string,
      showOptions: unknown,
      options?: {
        readonly enableScripts?: boolean;
        readonly retainContextWhenHidden?: boolean;
        readonly localResourceRoots?: readonly unknown[];
      },
    ): WebviewPanelStub;
    showErrorMessage<T extends string | MessageItem>(
      msg: string,
      ...items: readonly T[]
    ): Promise<T | undefined>;
    showInformationMessage<T extends string | MessageItem>(
      msg: string,
      ...items: readonly T[]
    ): Promise<T | undefined>;
    showWarningMessage<T extends string | MessageItem>(
      msg: string,
      options?: { readonly modal?: boolean; readonly detail?: string },
      ...items: readonly T[]
    ): Promise<T | undefined>;
    showQuickPick<T extends QuickPickItem>(
      items: readonly T[] | Promise<readonly T[]>,
      options?: {
        readonly title?: string;
        readonly placeHolder?: string;
        readonly canPickMany?: false;
      },
    ): Promise<T | undefined>;
    showInputBox(options?: {
      readonly title?: string;
      readonly placeHolder?: string;
      readonly prompt?: string;
      readonly value?: string;
      validateInput?(value: string): string | undefined | Promise<string | undefined>;
    }): Promise<string | undefined>;
    showWorkspaceFolderPick(): Promise<
      { readonly uri: { readonly fsPath: string }; readonly name: string } | undefined
    >;
    withProgress<R>(
      opts: {
        readonly location: unknown;
        readonly title?: string;
        readonly cancellable?: boolean;
      },
      task: (progress: {
        report(_: { readonly increment?: number; readonly message?: string }): void;
      }) => Promise<R>,
    ): Promise<R>;
    registerTreeDataProvider<T>(
      viewId: string,
      provider: import('vscode').TreeDataProvider<T>,
    ): { dispose(): void };
  };
  readonly commands: {
    registerCommand(
      command: string,
      handler: (...args: readonly unknown[]) => unknown,
    ): { dispose(): void };
    executeCommand(cmd: string, ...args: readonly unknown[]): Promise<unknown>;
  };
  readonly workspace: {
    getConfiguration(section?: string): {
      get<T = unknown>(key: string, fallback?: T): T;
    };
    workspaceFolders?: readonly { readonly uri: { readonly fsPath: string } }[];
  };
  readonly env: { readonly language?: string; openExternal(target: unknown): Promise<boolean> };
  readonly Uri: {
    file(path: string): { readonly fsPath: string; toString(): string };
    parse(value: string): { toString(): string };
  };
  readonly EventEmitter: new <T>() => {
    readonly event: import('vscode').Event<T>;
    fire(data: T): void;
    dispose(): void;
  };
  readonly TreeItemCollapsibleState: {
    readonly None: 0;
    readonly Collapsed: 1;
    readonly Expanded: 2;
  };
  readonly ProgressLocation: {
    readonly Window: 1;
    readonly Notification: 15;
    readonly SourceControl: 3;
  };
  readonly ThemeIcon: unknown;
  readonly extensions: { readonly all: readonly unknown[] };
}

export interface ActivationHandles {
  readonly gt: GitTree;
  readonly provider: WorktreesTreeDataProvider;
  readonly commands: CommandHandlers;
  readonly wizard: NewWorktreeWizard;
  readonly write: WriteHandlers;
  readonly outputChannel: OutputChannelStub;
  readonly runtime: ExtensionRuntime;
  readonly dispose: () => void;
}

let disposables: { dispose(): void }[] = [];

export function activate(
  context: ExtensionContext,
  overrides: ExtensionActivationOverrides = {},
): ActivationHandles | Promise<ActivationHandles> {
  const vscode = loadVscode(overrides.vscode);
  const cwd = overrides.cwd ?? resolveCwd(vscode);
  const locale = resolveLanguagePreference(
    vscode.workspace.getConfiguration('gittree'),
    context,
    vscode.env.language,
  );
  const adapter =
    overrides.adapter ?? new (overrides.RealGitAdapter ?? defaultRealGitAdapter())({ cwd });
  const gt = createGitTree({ cwd, locale, adapter });

  const runtime: ExtensionRuntime = {
    gt,
    context,
    setContext(_key, _value): void | Promise<void> {
      if (hasSetContext(vscode)) {
        return vscode.commands.executeCommand('setContext', _key, _value).then(() => {
          /* void */
        }) as Promise<void>;
      }
      return undefined;
    },
    dispose() {
      // runtime has no owned subscriptions; context.subscriptions owns
    },
  };

  const EventEmitterCtor = vscode.EventEmitter;
  const provider = new WorktreesTreeDataProvider(runtime, {
    makeEmitter: () => new EventEmitterCtor<GitTreeNode | undefined | null>(),
    Uri: vscode.Uri,
  });

  const commandApis = {
    commands: vscode.commands,
    window: vscode.window,
    env: vscode.env,
    Uri: vscode.Uri,
    workspace: vscode.workspace,
  };
  const commands = new CommandHandlers(runtime, commandApis);

  const outputChannel = vscode.window.createOutputChannel('GitTree');
  disposables.push(outputChannel);

  const wizard = new NewWorktreeWizard({ vscode, gt, output: outputChannel });
  const write = new WriteHandlers({ vscode, gt, output: outputChannel, provider });

  const view = vscode.window.registerTreeDataProvider<GitTreeNode>('gittree.worktrees', provider);
  disposables.push(view);

  const refresh = vscode.commands.registerCommand('gittree.refresh', async () =>
    commands.refreshTree(provider),
  );
  const openFolder = vscode.commands.registerCommand(
    'gittree.openFolder',
    async (...args: readonly unknown[]) => {
      const node = args[0] as { readonly path?: string; readonly kind?: string } | undefined;
      const p = node?.path ?? cwd;
      return commands.openInNewWindow(p);
    },
  );
  const revealFile = vscode.commands.registerCommand(
    'gittree.revealFile',
    async (...args: readonly unknown[]) => {
      const node = args[0] as { readonly path?: string } | undefined;
      const p = node?.path ?? cwd;
      return commands.revealInExplorer(p);
    },
  );
  const openTerminal = vscode.commands.registerCommand(
    'gittree.openTerminal',
    async (...args: readonly unknown[]) => {
      const node = args[0] as { readonly worktree?: Worktree } | undefined;
      const worktrees = await runtime.gt.worktree.list({ skipCache: false });
      const wt = node?.worktree ?? worktrees.find((w: Worktree) => w.isMain);
      if (wt) commands.openTerminalHere(wt);
    },
  );
  const newWorktree = vscode.commands.registerCommand('gittree.newWorktree', async () => {
    const r = await wizard.run();
    if (r) provider.refresh();
    return r;
  });
  const removeWorktree = vscode.commands.registerCommand(
    'gittree.removeWorktree',
    async (...args: readonly unknown[]) => {
      const node = args[0] as
        | {
            readonly worktree?: Worktree;
            readonly path?: string;
            readonly state?: import('@codemastersolutions/gittree-core').WorktreeState;
          }
        | undefined;
      return write.removeWorktree(node);
    },
  );
  const pullCurrent = vscode.commands.registerCommand(
    'gittree.pullCurrent',
    async (...args: readonly unknown[]) => {
      const node = args[0] as { readonly worktree?: Worktree } | undefined;
      return write.pullCurrent(node);
    },
  );
  const pushCurrent = vscode.commands.registerCommand(
    'gittree.pushCurrent',
    async (...args: readonly unknown[]) => {
      const node = args[0] as { readonly worktree?: Worktree } | undefined;
      return write.pushCurrent(node);
    },
  );
  const syncAll = vscode.commands.registerCommand('gittree.syncAll', async () => write.syncAll());
  const applySetup = vscode.commands.registerCommand(
    'gittree.applySetup',
    async (...args: readonly unknown[]) => {
      const node = args[0] as { readonly worktree?: Worktree; readonly path?: string } | undefined;
      return write.applySetupScript(node);
    },
  );
  const pruneWorktrees = vscode.commands.registerCommand('gittree.pruneWorktrees', async () =>
    write.pruneWorktrees(),
  );

  let detailsView: WorktreeDetailsWebView | null = null;
  const worktreeDetails = vscode.commands.registerCommand(
    'gittree.worktreeDetails',
    async (...args: readonly unknown[]) => {
      const node = args[0] as
        | {
            readonly kind?: string;
            readonly path?: string;
            readonly worktree?: Worktree;
            readonly state?: import('@codemastersolutions/gittree-core').WorktreeState;
          }
        | undefined;
      let worktree: Worktree | undefined = node?.worktree;
      if (!worktree && node?.path) {
        const all = await runtime.gt.worktree.list({ skipCache: false });
        worktree = all.find((w) => w.path === node!.path);
      }
      if (!worktree) {
        const all = await runtime.gt.worktree.list({ skipCache: false });
        worktree = all.find((w) => w.isMain) ?? all[0];
      }
      if (!worktree) {
        return vscode.window.showErrorMessage('No worktree selected');
      }
      const onAction = async (action: 'openTerminal' | 'openFolder' | 'refresh') => {
        if (action === 'openTerminal')
          return vscode.commands.executeCommand('gittree.openTerminal', { worktree });
        if (action === 'openFolder')
          return vscode.commands.executeCommand('gittree.openFolder', { path: worktree.path });
        if (action === 'refresh')
          return vscode.commands.executeCommand('gittree.worktreeDetails', { worktree });
        return undefined;
      };
      if (!detailsView || detailsView.isDisposed()) {
        detailsView = WorktreeDetailsWebView.create(vscode, outputChannel, onAction);
        disposables.push({ dispose: () => detailsView?.dispose() });
      }
      detailsView.showLoading();
      try {
        const [state, commits] = await Promise.all([
          runtime.gt.worktree.getStatus(worktree.path).catch(() => undefined),
          runtime.gt.repo.logRecent({ path: worktree.path, limit: 10 }).catch(() => []),
        ]);
        const dirtyFiles: { readonly path: string; readonly status: string }[] = [];
        if (state) {
          for (const m of state.modifiedFiles) dirtyFiles.push({ path: m, status: 'Modified' });
          for (const u of state.untrackedFiles) dirtyFiles.push({ path: u, status: 'Untracked' });
          for (const d of state.deletedFiles) dirtyFiles.push({ path: d, status: 'Deleted' });
        }
        const payload: WorktreeDetailsInput = {
          worktree,
          state,
          commits,
          dirtyFiles,
        };
        detailsView.update(payload);
      } catch (e) {
        detailsView.showError(e instanceof Error ? e.message : String(e));
      }
      return undefined;
    },
  );

  disposables.push(
    refresh,
    openFolder,
    revealFile,
    openTerminal,
    newWorktree,
    removeWorktree,
    pullCurrent,
    pushCurrent,
    syncAll,
    applySetup,
    pruneWorktrees,
    worktreeDetails,
  );
  context.subscriptions.push(...disposables);

  const detected = cwd ? true : false;
  void runtime.setContext('gittree:repoDetected', detected);

  const handles: ActivationHandles = {
    gt,
    provider,
    commands,
    wizard,
    write,
    outputChannel,
    runtime,
    dispose() {
      let d;
      while ((d = disposables.pop())) d.dispose();
    },
  };
  return handles;
}

export function deactivate(): void {
  let d;
  while ((d = disposables.pop())) d.dispose();
}

function resolveCwd(vscode: VsCodeApis): string {
  const folders = vscode.workspace.workspaceFolders;
  if (folders?.length) return folders[0]!.uri.fsPath;
  try {
    return process.cwd();
  } catch {
    return '.';
  }
}

function loadVscode(partial?: Partial<VsCodeApis>): VsCodeApis {
  const real = partial ?? require('vscode');
  return real as unknown as VsCodeApis;
}

function defaultRealGitAdapter(): new (opts: { cwd: string }) => GitAdapter {
  const core = require('@codemastersolutions/gittree-core');
  return core.RealGitAdapter as new (opts: { cwd: string }) => GitAdapter;
}

function hasSetContext(v: VsCodeApis): boolean {
  return typeof v.commands?.executeCommand === 'function';
}

export type { CommandHandlers };
export { WorktreesTreeDataProvider, NewWorktreeWizard, WriteHandlers };

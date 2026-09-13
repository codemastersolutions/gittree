import type {
  GitTree,
  Worktree,
  WorktreeRemoveResult,
  SyncResult,
  PruneResult,
  SyncOptions,
  WorktreeState,
  GitTreeSetupConfig,
} from '@codemastersolutions/gittree-core';
import type { MessageItem, OutputChannelStub, VsCodeApis } from './extension';
import type { WorktreesTreeDataProvider } from './tree-provider';

export interface WriteHandlersDeps {
  readonly vscode: VsCodeApis;
  readonly gt: GitTree;
  readonly output: OutputChannelStub;
  readonly provider: WorktreesTreeDataProvider;
}

export interface RemoveDialogOptions {
  readonly force: boolean;
  readonly deleteBranch: boolean;
  readonly deleteRemoteBranch: boolean;
}

const OK_TITLE = 'OK';
const CANCEL_TITLE = 'Cancel';
const REMOVE_TITLE = 'Remove';

export class WriteHandlers {
  private readonly vscode: VsCodeApis;
  private readonly gt: GitTree;
  private readonly output: OutputChannelStub;
  private readonly provider: WorktreesTreeDataProvider;

  constructor(deps: WriteHandlersDeps) {
    this.vscode = deps.vscode;
    this.gt = deps.gt;
    this.output = deps.output;
    this.provider = deps.provider;
  }

  public async removeWorktree(node?: {
    readonly worktree?: Worktree;
    readonly path?: string;
    readonly state?: WorktreeState;
  }): Promise<WorktreeRemoveResult | undefined> {
    const worktree = node?.worktree;
    if (!worktree) return undefined;
    if (worktree.isBare) {
      await this.vscode.window.showErrorMessage(
        'GitTree: Cannot remove bare main worktree directory.',
      );
      return undefined;
    }
    const state =
      node?.state ??
      (worktree.isDetached || worktree.isBare
        ? undefined
        : await this.gt.worktree.getStatus(worktree.path).catch(() => undefined));
    const dirty = state?.dirty === true;
    const ahead = (state?.aheadBy ?? 0) > 0;
    const detail = [
      `path: ${worktree.path}`,
      `branch: ${worktree.branch ?? '(detached)'}`,
      dirty
        ? `state: dirty (modified: ${state?.modifiedFiles.length ?? 0}, untracked: ${state?.untrackedFiles.length ?? 0})`
        : `state: clean`,
      ahead ? `branch ahead by: ${state?.aheadBy}` : undefined,
      worktree.isDetached ? 'HEAD detached' : undefined,
    ]
      .filter(Boolean)
      .join('\n');
    const opts = await this.showRemoveDialog(detail, dirty, ahead);
    if (!opts) return undefined;
    if (dirty && !opts.force) {
      await this.vscode.window.showErrorMessage(
        'GitTree: Worktree is dirty. Check --force to override.',
      );
      return undefined;
    }
    try {
      const r = await this.vscode.window.withProgress(
        {
          location: this.vscode.ProgressLocation?.Notification ?? 15,
          title: `Removing worktree ${worktree.path}…`,
        },
        async () =>
          this.gt.worktree.remove(worktree.path, {
            force: opts.force,
            deleteBranch: opts.deleteBranch,
            deleteRemoteBranch: opts.deleteRemoteBranch,
            skipPushCheck: opts.force || ahead === false,
          }),
      );
      const warnings = r.warnings.length ? ` Warnings: ${r.warnings.length}.` : '';
      await this.vscode.window.showInformationMessage(
        `GitTree: worktree ${r.removedPath} removed.${warnings}`,
      );
      this.provider.refresh();
      return r;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.output.appendLine(`[ERROR] remove ${worktree.path} failed`);
      this.output.appendLine(msg);
      if (err instanceof Error && err.stack) this.output.appendLine(err.stack);
      const action: MessageItem = { title: 'See Details' };
      const picked = await this.vscode.window.showErrorMessage(
        `GitTree: remove failed: ${msg}`,
        action,
      );
      if (picked?.title === action.title) this.output.show(true);
      return undefined;
    }
  }

  private async showRemoveDialog(
    detail: string,
    dirty: boolean,
    ahead: boolean,
  ): Promise<RemoveDialogOptions | undefined> {
    const forceLabel = `--force${dirty ? ' (required for dirty)' : ''}`;
    const deleteBranchLabel = '--delete-branch (local)';
    const deleteRemoteLabel = `--delete-remote-branch${ahead ? ' (ahead, push check may fail)' : ''}`;
    const items: Array<{
      readonly label: string;
      readonly picked: boolean;
      readonly key: keyof RemoveDialogOptions;
      readonly description?: string;
    }> = [
      {
        label: forceLabel,
        picked: dirty === true,
        key: 'force',
        description: dirty ? 'Required' : undefined,
      },
      { label: deleteBranchLabel, picked: true, key: 'deleteBranch' },
      { label: deleteRemoteLabel, picked: false, key: 'deleteRemoteBranch' },
    ];
    const confirm: MessageItem = { title: REMOVE_TITLE };
    const cancel: MessageItem = { title: CANCEL_TITLE, isCloseAffordance: true };
    const modal = await this.vscode.window.showWarningMessage(
      'Remove worktree? Pick checkboxes below for additional options.',
      { modal: true, detail: `${detail}\n\n(checkboxes are emulated with next prompt in tests)` },
      confirm,
      cancel,
    );
    if (modal?.title !== REMOVE_TITLE) return undefined;
    const qp = await this.vscode.window.showQuickPick(
      items.map((i) => ({ ...i, alwaysShow: true })),
      {
        title: 'GitTree: Remove options — check to enable',
        placeHolder: 'Press Enter on an item to toggle; select OK when done',
        canPickMany: false,
      },
    );
    const toggled = new Set<keyof RemoveDialogOptions>(
      items.filter((i) => i.picked).map((i) => i.key),
    );
    if (qp?.key) {
      if (!(dirty && qp.key === 'force')) {
        toggled.has(qp.key) ? toggled.delete(qp.key) : toggled.add(qp.key);
      }
    }
    if (dirty) toggled.add('force');
    void confirm;
    void OK_TITLE;
    return {
      force: toggled.has('force'),
      deleteBranch: toggled.has('deleteBranch'),
      deleteRemoteBranch: toggled.has('deleteRemoteBranch'),
    };
  }

  public async pullCurrent(
    node?: { readonly worktree?: Worktree },
    strategy: SyncOptions['strategy'] = 'ff-only',
  ): Promise<SyncResult | undefined> {
    const w = node?.worktree;
    if (!w || w.isBare || w.isDetached) return undefined;
    try {
      return await this.vscode.window.withProgress(
        {
          location: this.vscode.ProgressLocation?.Notification ?? 15,
          title: `Pulling ${w.path} (${strategy})…`,
        },
        async () => {
          const r = await this.gt.sync.pullWorktree(w.path, strategy);
          await this.vscode.window.showInformationMessage(
            `GitTree: pull ${w.path} ${r.ok ? 'ok' : 'failed'}. ${r.conflicted ? 'CONFLICTED.' : ''}`,
          );
          this.provider.refresh();
          return r;
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.output.appendLine(`[ERROR] pull ${w.path} failed: ${msg}`);
      await this.vscode.window.showErrorMessage(`GitTree: pull failed: ${msg}`);
      return undefined;
    }
  }

  public async pushCurrent(node?: {
    readonly worktree?: Worktree;
  }): Promise<{ readonly ok: boolean; readonly worktreePath: string } | undefined> {
    const w = node?.worktree;
    if (!w || w.isBare || w.isDetached) return undefined;
    try {
      return await this.vscode.window.withProgress(
        {
          location: this.vscode.ProgressLocation?.Notification ?? 15,
          title: `Pushing ${w.path}…`,
        },
        async () => {
          const r = await this.gt.sync.pushWorktree(w.path, { setUpstreamIfMissing: true });
          await this.vscode.window.showInformationMessage(
            `GitTree: push ${w.path} ${r.ok ? 'ok' : 'no-op'}`,
          );
          this.provider.refresh();
          return r;
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.output.appendLine(`[ERROR] push ${w.path} failed: ${msg}`);
      await this.vscode.window.showErrorMessage(`GitTree: push failed: ${msg}`);
      return undefined;
    }
  }

  public async syncAll(): Promise<{
    readonly ok: readonly string[];
    readonly failed: readonly string[];
    readonly conflicted: readonly string[];
  }> {
    const ok: string[] = [];
    const failed: string[] = [];
    const conflicted: string[] = [];
    const worktrees = (await this.gt.worktree.list({ skipCache: false })).filter(
      (w) => !w.isBare && !w.isDetached && Boolean(w.branch),
    );
    const total = worktrees.length;
    let allResults: readonly SyncResult[] = [];
    await this.vscode.window.withProgress(
      {
        location: this.vscode.ProgressLocation?.Notification ?? 15,
        title: 'GitTree: Sync All Worktrees…',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 0, message: `0 / ${total}` });
        allResults = await this.gt.sync.pullAll({ strategy: 'ff-only', fetchFirst: true });
        // Filter results only to eligible worktrees (non-bare, non-detached)
        const eligiblePaths = new Set(worktrees.map((w) => w.path));
        let step = 0;
        for (const r of allResults) {
          if (!eligiblePaths.has(r.worktreePath)) continue;
          if (r.ok) ok.push(r.worktreePath);
          else failed.push(r.worktreePath);
          if (r.conflicted) conflicted.push(r.worktreePath);
          step++;
          progress.report({
            increment: 100 / (total || 1),
            message: `${step} / ${total}`,
          });
        }
      },
    );
    const summary =
      total === 0
        ? 'No worktrees eligible for sync (need branch attached, non-bare).'
        : `Synced ${ok.length} ok · ${failed.length} failed · ${conflicted.length} conflicted.`;
    await this.vscode.window.showInformationMessage(`GitTree: Sync All done. ${summary}`);
    this.provider.refresh();
    return { ok, failed, conflicted };
  }

  public async fetchAll(): Promise<{ readonly ok: boolean }> {
    try {
      await this.vscode.window.withProgress(
        {
          location: this.vscode.ProgressLocation?.Notification ?? 15,
          title: 'GitTree: Fetch all remotes…',
        },
        async () => this.gt.sync.fetchAll(),
      );
      await this.vscode.window.showInformationMessage('GitTree: fetch all remotes done.');
      this.provider.refresh();
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.output.appendLine(`[ERROR] fetchAll: ${msg}`);
      await this.vscode.window.showErrorMessage(`GitTree: fetch failed: ${msg}`);
      return { ok: false };
    }
  }

  public async pruneWorktrees(): Promise<PruneResult | undefined> {
    const dry = await this.vscode.window.withProgress(
      {
        location: this.vscode.ProgressLocation?.Notification ?? 15,
        title: 'GitTree: Prune dry-run…',
      },
      async () => this.gt.worktree.prune({ dryRun: true }),
    );
    if (!dry.prunedPaths.length) {
      await this.vscode.window.showInformationMessage('GitTree: prune dry-run — nothing to prune.');
      return dry;
    }
    const lines = dry.prunedPaths.map((p) => `  • ${p}`).join('\n');
    const confirm: MessageItem = { title: 'Prune' };
    const cancel: MessageItem = { title: CANCEL_TITLE, isCloseAffordance: true };
    const chosen = await this.vscode.window.showWarningMessage(
      `Prune ${dry.prunedPaths.length} stale worktree directories?`,
      { modal: true, detail: `Paths that would be removed:\n${lines}` },
      confirm,
      cancel,
    );
    if (chosen?.title !== confirm.title) return dry;
    const r = await this.vscode.window.withProgress(
      {
        location: this.vscode.ProgressLocation?.Notification ?? 15,
        title: 'GitTree: Pruning worktrees…',
      },
      async () => this.gt.worktree.prune(),
    );
    await this.vscode.window.showInformationMessage(
      `GitTree: pruned ${r.prunedPaths.length} stale worktrees.`,
    );
    this.provider.refresh();
    return r;
  }

  public async applySetupScript(node?: {
    readonly worktree?: Worktree;
    readonly path?: string;
  }): Promise<{ readonly ok: boolean; readonly path: string } | undefined> {
    const w = node?.worktree;
    if (!w || w.isBare) return undefined;
    try {
      const r = await this.vscode.window.withProgress(
        {
          location: this.vscode.ProgressLocation?.Notification ?? 15,
          title: `Applying setup script to ${w.path}…`,
        },
        async () => {
          const cfg = (await this.gt.setup.loadConfig().catch(() => undefined)) as
            GitTreeSetupConfig | undefined;
          if (!cfg?.setup) {
            return {
              copied: [] as readonly string[],
              symlinked: [] as readonly string[],
              warnings: ['no setup config detected in repo root'] as readonly string[],
            };
          }
          return this.gt.setup.apply(cfg, w.path);
        },
      );
      const copied = r.copied?.length ?? 0;
      const sym = r.symlinked?.length ?? 0;
      await this.vscode.window.showInformationMessage(
        `GitTree: setup applied to ${w.path}. ${copied} copied · ${sym} symlinked. ${r.warnings.length} warnings.`,
      );
      return { ok: true, path: w.path };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.output.appendLine(`[ERROR] applySetup ${w.path}: ${msg}`);
      await this.vscode.window.showErrorMessage(`GitTree: setup script failed: ${msg}`);
      return undefined;
    }
  }
}

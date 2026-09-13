import type {
  AddWorktreeKind,
  GitTree,
  WorktreeAddResult,
} from '@codemastersolutions/gittree-core';
import type { Branch } from '@codemastersolutions/gittree-core';
import type { MessageItem, OutputChannelStub, QuickPickItem, VsCodeApis } from './extension';

export interface NewWorktreeWizardDeps {
  readonly vscode: VsCodeApis;
  readonly gt: GitTree;
  readonly output: OutputChannelStub;
  readonly path?: {
    basename(p: string): string;
    dirname(p: string): string;
    join(...parts: readonly string[]): string;
  };
}

export interface WizardNewSelection {
  readonly kind: Extract<AddWorktreeKind, 'new-branch'>;
  readonly branchName: string;
  readonly path: string;
}
export interface WizardExistingSelection {
  readonly kind: Extract<AddWorktreeKind, 'existing-branch'>;
  readonly branchName: string;
  readonly path: string;
}
export interface WizardRemoteSelection {
  readonly kind: Extract<AddWorktreeKind, 'remote-branch'>;
  readonly remoteBranch: string;
  readonly branchName: string;
  readonly path: string;
}
export type WizardSelection = WizardNewSelection | WizardExistingSelection | WizardRemoteSelection;

const DETAILS_ACTION_TITLE = 'See Details';

export class NewWorktreeWizard {
  private readonly vscode: VsCodeApis;
  private readonly gt: GitTree;
  private readonly output: OutputChannelStub;
  private readonly path: NewWorktreeWizardDeps['path'];

  constructor(deps: NewWorktreeWizardDeps) {
    this.vscode = deps.vscode;
    this.gt = deps.gt;
    this.output = deps.output;
    this.path = deps.path ?? {
      basename: (p) => p.split('/').pop() ?? p,
      dirname: (p) => p.split('/').slice(0, -1).join('/') || '/',
      join: (...parts) =>
        parts
          .filter((p) => p && p !== '.')
          .join('/')
          .replace(/\/+/g, '/'),
    };
  }

  public async run(): Promise<WorktreeAddResult | undefined> {
    const picked = await this.pickKind();
    if (!picked) return undefined;
    const selection = await this.runFlow(picked);
    if (!selection) return undefined;
    const confirmed = await this.review(selection);
    if (!confirmed) return undefined;
    return this.withProgress(selection);
  }

  private async pickKind(): Promise<AddWorktreeKind | undefined> {
    const items: (QuickPickItem & { readonly kind: AddWorktreeKind })[] = [
      {
        kind: 'new-branch',
        label: 'New Branch',
        description: 'Create a new branch and a worktree for it',
        detail: 'Creates branch locally, then worktree',
      },
      {
        kind: 'existing-branch',
        label: 'Existing Branch',
        description: 'Checkout an existing local branch in a new worktree',
        detail: 'Uses branchExistingName internally',
      },
      {
        kind: 'remote-branch',
        label: 'Remote Branch',
        description: 'Track a remote branch (origin/feature) in a new worktree',
        detail: 'Uses remoteBranch and creates local tracking branch',
      },
    ];
    const chosen = await this.vscode.window.showQuickPick(items, {
      title: 'GitTree: Create New Worktree — Step 1 of 4',
      placeHolder: 'Choose worktree source',
    });
    return chosen?.kind;
  }

  private async runFlow(kind: AddWorktreeKind): Promise<WizardSelection | undefined> {
    switch (kind) {
      case 'new-branch':
        return this.flowNewBranch();
      case 'existing-branch':
        return this.flowExisting();
      case 'remote-branch':
        return this.flowRemote();
    }
  }

  private async flowNewBranch(): Promise<WizardNewSelection | undefined> {
    const name = await this.vscode.window.showInputBox({
      title: 'GitTree: New Branch Name — Step 2 of 4',
      placeHolder: 'feature/my-new-feature',
      prompt: 'Name for the new branch (cannot be empty, no spaces)',
      validateInput: (v) => (this.validateBranchName(v) ? undefined : 'Invalid branch name'),
    });
    if (!name) return undefined;
    const path = await this.pickPath(name);
    if (!path) return undefined;
    return { kind: 'new-branch', branchName: name, path };
  }

  private async flowExisting(): Promise<WizardExistingSelection | undefined> {
    const locals = (await this.gt.branch.listLocal()).filter((b) => !b.isCurrent);
    if (!locals.length) {
      await this.vscode.window.showWarningMessage(
        'No existing local branches available (other than current).',
      );
      return undefined;
    }
    const items = locals.map((b) => ({
      label: b.name,
      description: b.upToDate === false ? '⟳ needs sync' : undefined,
      detail: b.upstream ? `upstream: ${b.upstream}` : undefined,
      branch: b,
    }));
    const picked = await this.vscode.window.showQuickPick(items, {
      title: 'GitTree: Pick Existing Branch — Step 2 of 4',
      placeHolder: 'Choose a local branch',
    });
    if (!picked) return undefined;
    const path = await this.pickPath(picked.branch.name);
    if (!path) return undefined;
    return { kind: 'existing-branch', branchName: picked.branch.name, path };
  }

  private async flowRemote(): Promise<WizardRemoteSelection | undefined> {
    const remotes = await this.gt.branch.listRemote();
    if (!remotes.length) {
      await this.vscode.window.showWarningMessage(
        'No remote branches found. Fetch first with GitTree: Fetch All.',
      );
      return undefined;
    }
    const items = remotes.map((b: Branch) => ({
      label: b.name,
      description: b.remote ? `remote: ${b.remote}` : undefined,
      branch: b,
    }));
    const picked = await this.vscode.window.showQuickPick(items, {
      title: 'GitTree: Pick Remote Branch — Step 2 of 4',
      placeHolder: 'Choose a remote tracking branch',
    });
    if (!picked) return undefined;
    const shortName = picked.branch.name.includes('/')
      ? picked.branch.name.split('/').slice(1).join('/')
      : picked.branch.name;
    const localName = await this.vscode.window.showInputBox({
      title: 'GitTree: Local Branch Name — Step 2b of 4',
      placeHolder: shortName,
      prompt: 'Local branch name to create tracking remote',
      value: shortName,
      validateInput: (v) => (this.validateBranchName(v) ? undefined : 'Invalid branch name'),
    });
    if (!localName) return undefined;
    const path = await this.pickPath(localName);
    if (!path) return undefined;
    return {
      kind: 'remote-branch',
      remoteBranch: picked.branch.name,
      branchName: localName,
      path,
    };
  }

  private async pickPath(defaultName: string): Promise<string | undefined> {
    const rootCwd = this.gt.cwd;
    const baseDirCfg = this.vscode.workspace
      .getConfiguration('gittree')
      .get<string | null>('defaultWorktreeBaseDir', null);
    const baseDir: string = baseDirCfg ?? this.path!.dirname(rootCwd);
    const suggested = this.path!.join(baseDir, defaultName.replace(/[^\w.\-_@/]+/g, '-'));
    const manual = await this.vscode.window.showInputBox({
      title: 'GitTree: Worktree Path — Step 3 of 4',
      placeHolder: suggested,
      prompt: 'Path for the new worktree. Use absolute path outside the repository directory.',
      value: suggested,
      validateInput: (v) => {
        if (!v?.length) return 'Path cannot be empty';
        if (v.startsWith(rootCwd + '/') || v === rootCwd) {
          return 'Worktree cannot be inside the main repository directory';
        }
        return undefined;
      },
    });
    if (!manual) return undefined;
    return manual;
  }

  private async review(sel: WizardSelection): Promise<boolean> {
    const detected = await this.gt.setup.loadConfig().catch(() => undefined);
    const lines: string[] = [];
    lines.push(`kind: ${sel.kind}`);
    if (sel.kind === 'new-branch' || sel.kind === 'existing-branch') {
      lines.push(`branch: ${sel.branchName}`);
    } else {
      lines.push(`remote: ${sel.remoteBranch}`);
      lines.push(`local branch: ${sel.branchName}`);
    }
    lines.push(`path: ${sel.path}`);
    if (detected?.setup) {
      lines.push('setup script: DETECTED in repo root (will run copy/symlink after creation)');
      if (detected.setup.copy?.length) lines.push(`  copy: ${detected.setup.copy.join(', ')}`);
      if (detected.setup.symlink?.length) {
        lines.push(`  symlink: ${detected.setup.symlink.join(', ')}`);
      }
    } else {
      lines.push('setup script: none detected in repo root');
    }
    const detail = lines.join('\n');
    const confirm: MessageItem = { title: 'Create' };
    const cancel: MessageItem = { title: 'Cancel', isCloseAffordance: true };
    const r = await this.vscode.window.showWarningMessage<MessageItem>(
      `Create worktree ${sel.path}?`,
      { modal: true, detail },
      confirm,
      cancel,
    );
    return r?.title === confirm.title;
  }

  private async withProgress(sel: WizardSelection): Promise<WorktreeAddResult | undefined> {
    try {
      const r = await this.vscode.window.withProgress<WorktreeAddResult>(
        { location: this.vscode.ProgressLocation?.Notification ?? 15, title: 'Creating worktree…' },
        async (progress) => {
          progress.report({ increment: 20, message: 'Validating parameters…' });
          let opts:
            | { readonly path: string; readonly branchNewName: string }
            | { readonly path: string; readonly branchExistingName: string }
            | {
                readonly path: string;
                readonly remoteBranch: string;
                readonly branchNewName: string;
              };
          if (sel.kind === 'new-branch') {
            opts = { path: sel.path, branchNewName: sel.branchName };
          } else if (sel.kind === 'existing-branch') {
            opts = { path: sel.path, branchExistingName: sel.branchName };
          } else {
            opts = {
              path: sel.path,
              remoteBranch: sel.remoteBranch,
              branchNewName: sel.branchName,
            };
          }
          progress.report({ increment: 50, message: 'Running git worktree add…' });
          const result = await this.gt.worktree.add(opts);
          progress.report({ increment: 100, message: 'Done.' });
          return result;
        },
      );
      const copiedCount = r.setup?.copied?.length ?? 0;
      const symCount = r.setup?.symlinked?.length ?? 0;
      const setupMsg =
        copiedCount + symCount > 0
          ? ` Setup applied: ${copiedCount} copied, ${symCount} symlinked.`
          : '';
      await this.vscode.window.showInformationMessage(
        `GitTree: worktree created at ${r.worktree.path}.${setupMsg}`,
      );
      return r;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.output.appendLine('[ERROR] worktree creation failed');
      this.output.appendLine(msg);
      if (err instanceof Error && err.stack) this.output.appendLine(err.stack);
      const action: MessageItem = { title: DETAILS_ACTION_TITLE };
      const picked = await this.vscode.window.showErrorMessage<MessageItem>(
        `GitTree: Failed to create worktree: ${msg}`,
        action,
      );
      if (picked?.title === DETAILS_ACTION_TITLE) this.output.show(true);
      return undefined;
    }
  }

  private validateBranchName(v: string): boolean {
    if (!v?.length) return false;
    if (/\s/.test(v)) return false;
    if (v.startsWith('-') || v.endsWith('/') || v.startsWith('/')) return false;
    if (v.includes('..') || v.includes('~') || v.includes('^') || v.includes(':')) return false;
    if (v.includes('?') || v.includes('*') || v.includes('[')) return false;
    if (v.includes('@{') || v.endsWith('.lock')) return false;
    return true;
  }
}

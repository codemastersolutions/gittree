import type { Worktree, WorktreeState, WorktreeStateKind } from '@codemastersolutions/gittree-core';
import type {
  BranchInfoNode,
  ExtensionRuntime,
  GitTreeNode,
  GitTreeApi,
  RepoRootNode,
  WorktreeNode,
} from './types';
import type {
  EventEmitter,
  TreeDataProvider,
  TreeItem,
  TreeItemCollapsibleState,
  Event,
  ThemeIcon,
  ExtensionContext,
  Uri as VscodeUri,
} from 'vscode';

export const CACHE_TTL_MS = 2_000;

export class WorktreesTreeDataProvider implements TreeDataProvider<GitTreeNode>, GitTreeApi {
  private readonly _onDidChangeTreeData: EventEmitter<GitTreeNode | undefined | null>;
  private readonly runtime: ExtensionRuntime;
  private readonly now: () => number;
  private readonly uriFile?: (path: string) => VscodeUri;

  private cacheExpireAt = 0;
  private cached: {
    main?: Worktree;
    wts: readonly Worktree[];
    states: Map<string, WorktreeState>;
  } | null = null;

  public readonly onDidChangeTreeData: Event<GitTreeNode | undefined | null>;

  constructor(
    runtime: ExtensionRuntime,
    factory: {
      makeEmitter(): EventEmitter<GitTreeNode | undefined | null>;
      now?: () => number;
      Uri?: { file(path: string): unknown };
    },
  ) {
    this.runtime = runtime;
    this.now = factory.now ?? (() => Date.now());
    this.uriFile = factory.Uri ? (p) => factory.Uri!.file(p) as VscodeUri : undefined;
    this._onDidChangeTreeData = factory.makeEmitter();
    this.onDidChangeTreeData = this._onDidChangeTreeData.event;
  }

  public refresh(): void {
    this.cacheExpireAt = 0;
    this.cached = null;
    this._onDidChangeTreeData.fire(null);
  }

  private async loadOnce(): Promise<NonNullable<WorktreesTreeDataProvider['cached']>> {
    const now = this.now();
    if (this.cached && now < this.cacheExpireAt) return this.cached;
    const { gt } = this.runtime;
    const worktrees = await gt.worktree.list({ skipCache: true });
    const main = worktrees.find((w) => w.isMain);
    const states = new Map<string, WorktreeState>();
    for (const w of worktrees) {
      if (w.isBare || w.isDetached) continue;
      try {
        states.set(w.path, await gt.worktree.getStatus(w.path));
      } catch {
        // ignore individual worktree state errors; tree still renders
      }
    }
    this.cached = { main, wts: worktrees, states };
    this.cacheExpireAt = now + CACHE_TTL_MS;
    return this.cached;
  }

  public async getChildren(element?: GitTreeNode): Promise<GitTreeNode[]> {
    if (!element) {
      const data = await this.loadOnce();
      const cwd = this.runtime.gt.cwd;
      const root: RepoRootNode = {
        kind: 'repo',
        cwd,
        mainWorktree: data.main,
        worktrees: data.wts.slice(),
      };
      return [root];
    }
    if (element.kind === 'repo') {
      return element.worktrees.map((w) => this.makeWorktreeNode(w, element));
    }
    if (element.kind === 'worktree') {
      const branch = element.worktree.branch ?? 'HEAD';
      const headShort = element.worktree.head.substring(0, 8);
      const child: BranchInfoNode = { kind: 'branchInfo', parent: element, branch, headShort };
      return [child];
    }
    return [];
  }

  public getTreeItem(element: GitTreeNode): TreeItem {
    if (element.kind === 'repo') return this.rootItem(element);
    if (element.kind === 'branchInfo') return this.branchInfoItem(element);
    return this.worktreeItem(element);
  }

  private rootItem(node: RepoRootNode): TreeItem {
    const main = node.mainWorktree;
    const label = main ? `Repo: ${main.branch ?? node.cwd}` : `Repo: ${node.cwd}`;
    return {
      label,
      tooltip: `cwd: ${node.cwd} · worktrees: ${node.worktrees.length}`,
      collapsibleState: 1 satisfies TreeItemCollapsibleState as unknown as TreeItemCollapsibleState,
      description: `${node.worktrees.length} worktrees`,
      iconPath: { id: 'repo' } satisfies ThemeIcon as unknown as ThemeIcon,
    };
  }

  private worktreeItem(node: WorktreeNode): TreeItem {
    const { worktree: w, state } = node;
    const label = w.branch ?? (w.isBare ? '(bare)' : `(detached ${w.head.substring(0, 8)})`);
    const contextValue = this.contextValueFor(w, state?.kind);
    const iconPath = this.iconFor(w, state?.kind);
    const badge = state ? this.badgeFor(state) : undefined;
    const collapsibleState = w.isBare
      ? (0 satisfies TreeItemCollapsibleState as unknown as TreeItemCollapsibleState)
      : (1 satisfies TreeItemCollapsibleState as unknown as TreeItemCollapsibleState);
    const tooltip = this.tooltipFor(w, state);
    return {
      label,
      description: w.isMain ? 'main' : this.pathBasename(w.path),
      resourceUri: node.uri,
      tooltip,
      collapsibleState,
      contextValue,
      iconPath,
      // Badge is set only if state available (tree item doesn't have stable field, use label appendix via description)
      ...(badge && {
        description: [w.isMain ? 'main' : this.pathBasename(w.path), badge].join(' · '),
      }),
    };
  }

  private branchInfoItem(node: BranchInfoNode): TreeItem {
    return {
      label: `HEAD ${node.headShort}`,
      description: node.branch,
      tooltip: `branch: ${node.branch}\nhead: ${node.parent.worktree.head}`,
      collapsibleState: 0 satisfies TreeItemCollapsibleState as unknown as TreeItemCollapsibleState,
      iconPath: { id: 'git-branch' } satisfies ThemeIcon as unknown as ThemeIcon,
    };
  }

  private makeWorktreeNode(w: Worktree, _root: RepoRootNode): WorktreeNode {
    const state = this.cached?.states.get(w.path);
    let uri: VscodeUri | undefined;
    if (this.uriFile) uri = this.uriFile(w.path);
    else {
      const { Uri } = this.imports();
      if (Uri) uri = Uri.file(w.path);
    }
    return { kind: 'worktree', path: w.path, worktree: w, state, uri };
  }

  private contextValueFor(w: Worktree, kind?: WorktreeStateKind): string {
    const parts: string[] = ['worktree'];
    if (w.isMain) parts.push('main');
    if (w.isDetached) parts.push('detached');
    if (w.isBare) parts.push('bare');
    if (kind) parts.push(kind);
    return parts.join('|');
  }

  private iconFor(w: Worktree, kind?: WorktreeStateKind): ThemeIcon | undefined {
    if (w.isBare) return { id: 'git-branch' } as unknown as ThemeIcon;
    if (w.isDetached) return { id: 'debug-line-through' } as unknown as ThemeIcon;
    switch (kind) {
      case 'dirty':
        return { id: 'warning' } as unknown as ThemeIcon;
      case 'ahead':
        return { id: 'arrow-up' } as unknown as ThemeIcon;
      case 'behind':
        return { id: 'arrow-down' } as unknown as ThemeIcon;
      case 'diverged':
        return { id: 'arrow-both' } as unknown as ThemeIcon;
      case 'clean':
      case 'detached':
      case undefined:
      default:
        return { id: 'check' } as unknown as ThemeIcon;
    }
  }

  private badgeFor(s: WorktreeState): string | undefined {
    if (s.kind === 'dirty') return '⚠️';
    if (s.kind === 'ahead' && s.aheadBy > 0) return `↑${s.aheadBy}`;
    if (s.kind === 'behind' && s.behindBy > 0) return `↓${s.behindBy}`;
    if (s.kind === 'diverged') return `↕${s.aheadBy}/${s.behindBy}`;
    return undefined;
  }

  private tooltipFor(w: Worktree, s?: WorktreeState): string {
    const lines: string[] = [];
    lines.push(`path: ${w.path}`);
    lines.push(`branch: ${w.branch ?? '(detached)'}`);
    lines.push(`head: ${w.head}`);
    if (s) {
      lines.push(`state: ${s.kind}`);
      if (s.aheadBy) lines.push(`ahead by: ${s.aheadBy}`);
      if (s.behindBy) lines.push(`behind by: ${s.behindBy}`);
      const dirty = s.modifiedFiles.length + s.untrackedFiles.length + s.deletedFiles.length;
      if (dirty > 0) lines.push(`files dirty: ${dirty}`);
    }
    return lines.join('\n');
  }

  private pathBasename(p: string): string {
    const sep = p.includes('/') ? '/' : '\\';
    const idx = p.lastIndexOf(sep);
    return idx >= 0 ? p.substring(idx + 1) : p;
  }

  private imports(): { Uri?: typeof import('vscode').Uri } {
    try {
      return require('vscode');
    } catch {
      return { Uri: undefined };
    }
  }
}

export function worktreeContextValue(w: Worktree, kind?: WorktreeStateKind): string {
  const parts: string[] = ['worktree'];
  if (w.isMain) parts.push('main');
  if (w.isDetached) parts.push('detached');
  if (w.isBare) parts.push('bare');
  if (kind) parts.push(kind);
  return parts.join('|');
}

export function resolveLanguagePreference(
  cfg: { get<T = unknown>(key: string, fallback?: T): T } | undefined,
  context: ExtensionContext,
  vsCodeLocale: string | undefined,
): 'en' | 'pt-br' | 'es' | undefined {
  const val = cfg?.get<string | undefined>('gittree.language', 'default');
  if (val && val !== 'default') {
    if (val === 'en' || val === 'pt-br' || val === 'es') return val;
  }
  if (vsCodeLocale) {
    const low = vsCodeLocale.toLowerCase();
    if (low.startsWith('pt')) return 'pt-br';
    if (low.startsWith('es')) return 'es';
  }
  void context;
  return undefined;
}

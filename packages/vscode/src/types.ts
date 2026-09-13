import type { GitTree, Worktree, WorktreeState } from '@codemastersolutions/gittree-core';
import type { Event, ExtensionContext, Uri as VscodeUri, Disposable } from 'vscode';

export type WorktreeNodeKind = 'repo' | 'worktree' | 'branchInfo';

export interface WorktreeNode {
  readonly kind: 'worktree';
  readonly path: string;
  readonly worktree: Worktree;
  readonly state?: WorktreeState;
  readonly uri?: VscodeUri;
}

export interface RepoRootNode {
  readonly kind: 'repo';
  readonly cwd: string;
  readonly mainWorktree?: Worktree;
  readonly worktrees: readonly Worktree[];
}

export interface BranchInfoNode {
  readonly kind: 'branchInfo';
  readonly parent: WorktreeNode;
  readonly branch: string;
  readonly headShort: string;
}

export type GitTreeNode = RepoRootNode | WorktreeNode | BranchInfoNode;

export interface ExtensionRuntime extends Disposable {
  readonly gt: GitTree;
  readonly context: ExtensionContext;
  setContext(key: string, value: unknown): Promise<void> | void;
}

export interface GitTreeApi {
  onDidChangeTreeData: Event<GitTreeNode | undefined | null>;
  getChildren(element?: GitTreeNode): Promise<GitTreeNode[]>;
  getTreeItem(element: GitTreeNode): unknown;
  refresh(): void;
}

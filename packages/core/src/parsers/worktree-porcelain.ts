import type { Worktree } from '../types/index.js';

export function parseWorktreePorcelain(
  raw: string,
  mainWorktreePath?: string,
): readonly Worktree[] {
  const blocks = raw
    .split(/\n(?=worktree\s)/m)
    .map((b) => b.trim())
    .filter(Boolean);

  const result: Worktree[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trimEnd())
      .filter(Boolean);
    if (lines.length === 0) continue;

    let path: string | undefined;
    let head: string | undefined;
    let branch: string | undefined;
    let detached = false;
    let bare = false;
    let prunable = false;
    let lockReason: string | undefined;

    for (const rawLine of lines) {
      const line = rawLine;
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length);
        continue;
      }
      if (line.startsWith('HEAD ')) {
        head = line.slice('HEAD '.length);
        continue;
      }
      if (line.startsWith('branch ')) {
        const ref = line.slice('branch '.length);
        branch = ref.replace(/^refs\/heads\//, '');
        continue;
      }
      if (line === 'detached') {
        detached = true;
        continue;
      }
      if (line === 'bare') {
        bare = true;
        continue;
      }
      if (line.startsWith('prunable')) {
        prunable = true;
        continue;
      }
      if (line.startsWith('locked')) {
        const rest = line.slice('locked'.length).trim();
        lockReason = rest.length > 0 ? rest : undefined;
        continue;
      }
    }

    if (path === undefined || head === undefined) {
      continue;
    }

    const finalPath = path;
    const isMain =
      mainWorktreePath !== undefined
        ? finalPath === mainWorktreePath
        : /(^|\/)\.git($|\/|\\)/.test(finalPath) === false && branch !== undefined
          ? false
          : isLikelyMain(finalPath, result);

    result.push({
      path: finalPath,
      head,
      branch,
      isDetached: detached,
      isBare: bare,
      isPrunable: prunable,
      lockReason,
      isMain,
    });
  }

  if (mainWorktreePath === undefined && result.length > 0 && result.every((w) => !w.isMain)) {
    (result[0] as { isMain: boolean }).isMain = true;
  }

  return result;
}

function isLikelyMain(path: string, existing: readonly Worktree[]): boolean {
  if (existing.some((w) => w.isMain)) return false;
  try {
    const fs = require('node:fs') as typeof import('node:fs');
    return fs.existsSync(require('node:path').join(path, '.git'));
  } catch {
    return existing.length === 0;
  }
}

import type { WorktreeState, WorktreeStateKind } from '../types/index.js';

type StatusV2BranchHeader = {
  oid?: string;
  head?: string;
  upstream?: string;
  aheadBy?: number;
  behindBy?: number;
  detached?: boolean;
};

export function parseStatusPorcelainV2(raw: string): WorktreeState {
  const lines = raw.split('\n');
  const headers: StatusV2BranchHeader = {};
  const modifiedFiles: string[] = [];
  const deletedFiles: string[] = [];
  const addedFiles: string[] = [];
  const untracked: string[] = [];

  for (const line of lines) {
    if (line.length === 0) continue;
    if (line.startsWith('# ')) {
      const body = line.slice(2);
      if (body.startsWith('branch.')) {
        const rest = body.slice('branch.'.length);
        const [sub, val] = splitOnce(rest, ' ');
        if (sub === 'oid') headers.oid = val;
        else if (sub === 'head') headers.head = val;
        else if (sub === 'upstream') headers.upstream = val;
        else if (sub === 'ab') {
          const { ahead, behind } = parseAb(val ?? '');
          headers.aheadBy = ahead;
          headers.behindBy = behind;
        }
      } else if (body.startsWith('ahead ')) {
        headers.aheadBy = Number(body.slice('ahead '.length).trim()) || 0;
      } else if (body.startsWith('behind ')) {
        headers.behindBy = Number(body.slice('behind '.length).trim()) || 0;
      } else if (body === 'detached' || body.startsWith('detached ')) {
        headers.detached = true;
      }
      continue;
    }

    if (line.startsWith('1 ') || line.startsWith('2 ') || line.startsWith('u ')) {
      const cols = line.split(' ');
      const xy = cols[1];
      const path = cols.at(-1);
      const submoduleMarker = cols[2] ?? '';
      const hasIndexDelete = submoduleMarker.includes('S') ? false : false;
      void hasIndexDelete;
      const x = xy?.[0];
      const y = xy?.[1];
      const isDeleted = x === 'D' || y === 'D' || (x === '.' && y === 'D');
      const isAdded = x === 'A' || y === 'A';
      if (path) {
        if (isDeleted) {
          deletedFiles.push(path);
        } else if (isAdded) {
          addedFiles.push(path);
          modifiedFiles.push(path);
        } else {
          modifiedFiles.push(path);
        }
      }
      continue;
    }
    if (line.startsWith('? ')) {
      const p = line.slice(2);
      if (p) untracked.push(p);
    }
  }

  const dirty = modifiedFiles.length + untracked.length + deletedFiles.length > 0;
  const ahead = headers.aheadBy ?? 0;
  const behind = headers.behindBy ?? 0;

  const kind: WorktreeStateKind = resolveKind(headers.detached ?? false, dirty, ahead, behind);

  return {
    dirty,
    kind,
    aheadBy: ahead,
    behindBy: behind,
    branch: headers.head,
    upstream: headers.upstream,
    modifiedFiles: Object.freeze(modifiedFiles),
    untrackedFiles: Object.freeze(untracked),
    deletedFiles: Object.freeze(deletedFiles),
  };
}

function resolveKind(
  detached: boolean,
  dirty: boolean,
  ahead: number,
  behind: number,
): WorktreeStateKind {
  if (detached) return 'detached';
  if (dirty) return 'dirty';
  if (ahead > 0 && behind > 0) return 'diverged';
  if (ahead > 0) return 'ahead';
  if (behind > 0) return 'behind';
  return 'clean';
}

function splitOnce(input: string, sep: string): [string, string] {
  const idx = input.indexOf(sep);
  if (idx < 0) return [input, ''];
  return [input.slice(0, idx), input.slice(idx + sep.length)];
}

function parseAb(raw: string): { ahead: number; behind: number } {
  const match = new RegExp(/\+(\d+)\s+-(\d+)/).exec(raw);
  if (match) {
    return { ahead: Number(match[1] ?? 0), behind: Number(match[2] ?? 0) };
  }
  return { ahead: 0, behind: 0 };
}

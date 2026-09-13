/// <reference types="node" />

import {
  safeAccessInsideRoot,
  safeCopyFileInsideRoot,
  safeMkdirInsideRoot,
  safeReadFileInsideRoot,
  safeStatInsideRoot,
  safeSymlinkInsideRoot,
} from '../utils/fs-safe.js';
import { dirname, isAbsolute, resolve } from 'node:path';

import type { GitTreeSetupConfig } from '../types/index.js';
import { ConfigParseError } from '../errors/index.js';
import type { GitAdapter } from '../adapters/types.js';

export type SetupApplyResult = {
  readonly copied: readonly string[];
  readonly symlinked: readonly string[];
  readonly warnings: readonly string[];
};

const CANDIDATE_CONFIG_FILES = ['.gittree.json', '.gittree', '.gittree.local.json'] as const;

export class SetupScriptService {
  private readonly adapter: GitAdapter;

  public constructor(adapter: GitAdapter) {
    this.adapter = adapter;
  }

  public async loadConfig(overridePath?: string): Promise<GitTreeSetupConfig | undefined> {
    const root = this.adapter.cwd();
    if (overridePath) {
      const p = isAbsolute(overridePath) ? overridePath : resolve(root, overridePath);
      return await this.parseFile(p);
    }
    for (const file of CANDIDATE_CONFIG_FILES) {
      const p = resolve(root, file);
      try {
        const parsed = await this.parseFile(p);
        return parsed;
      } catch (err) {
        if (err instanceof ConfigParseError) throw err;
      }
    }
    return undefined;
  }

  private async parseFile(path: string): Promise<GitTreeSetupConfig> {
    let raw: string;
    try {
      const root = this.adapter.cwd();
      raw = await safeReadFileInsideRoot(root, path, 'utf8');
    } catch {
      const err = new Error('ENOENT') as Error & { code?: string };
      err.code = 'ENOENT';
      throw err;
    }
    try {
      return JSON.parse(raw) as GitTreeSetupConfig;
    } catch (e) {
      const msg =
        e instanceof SyntaxError
          ? `Invalid JSON in ${path}: ${e.message}`
          : `Unable to parse ${path}`;
      throw new ConfigParseError(msg, { source: path });
    }
  }

  public async apply(config: GitTreeSetupConfig, worktreePath: string): Promise<SetupApplyResult> {
    const root = this.adapter.cwd();
    const copied: string[] = [];
    const symlinked: string[] = [];
    const warnings: string[] = [];

    const setup = config.setup;
    if (!setup) return { copied, symlinked, warnings };

    if (setup.copy && setup.copy.length > 0) {
      for (const rel of setup.copy) {
        try {
          await safeAccessInsideRoot(root, rel);
        } catch {
          warnings.push(`setup.copy: source '${rel}' does not exist, skipping`);
          continue;
        }
        try {
          await safeMkdirInsideRoot(worktreePath, dirname(rel), { recursive: true });
        } catch {
          // ignore: may already exist
        }
        try {
          const stats = await safeStatInsideRoot(root, rel);
          if (stats.isDirectory()) {
            warnings.push(`setup.copy: '${rel}' is a directory; copy is file-only, skipping`);
            continue;
          }
          await safeCopyFileInsideRoot(root, rel, worktreePath, rel);
          copied.push(rel);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          warnings.push(`setup.copy '${rel}' failed: ${msg}`);
        }
      }
    }

    if (setup.symlink && setup.symlink.length > 0) {
      for (const rel of setup.symlink) {
        try {
          await safeAccessInsideRoot(root, rel);
        } catch {
          warnings.push(`setup.symlink: source '${rel}' does not exist, skipping`);
          continue;
        }
        try {
          await safeMkdirInsideRoot(worktreePath, dirname(rel), { recursive: true });
          const st = await safeStatInsideRoot(root, rel);
          const type: 'dir' | 'file' = st.isDirectory() ? 'dir' : 'file';
          await safeSymlinkInsideRoot(root, rel, worktreePath, rel, type);
          symlinked.push(rel);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          warnings.push(`setup.symlink '${rel}' failed: ${msg}`);
        }
      }
    }

    return { copied, symlinked, warnings };
  }
}

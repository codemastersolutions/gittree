# @gittree/core

> Shared engine powering both the `gittree` CLI and the GitTree VS Code extension.
>
> Implements Git worktree / branch / sync operations as **typed contracts** through a `GitAdapter`
> port-and-adapter pattern, with built-in i18n, structured logging, safety guards and
> event emitters for UI consumption.

---

## Usage Instructions

### Importing

```typescript
// Public API (main entry)
import {
  createGitTree,
  type GitTree,
  type Worktree,
  type WorktreeState,
  type SyncStrategy
} from '@gittree/core';

// Test utilities (separate entry, excluded from production bundles)
import { MockGitAdapter, type GitCallRecord } from '@gittree/core/testing';
```

### Instantiation

```typescript
import { RealGitAdapter, createGitTree } from '@gittree/core';

const core = createGitTree({
  cwd: process.cwd(),
  adapter: new RealGitAdapter({ cwd: process.cwd() }),
  locale: 'en' // or 'pt-br' | 'es'
});

const worktrees = await core.worktree.list();
```

### Examples

```typescript
// List all worktrees + detect global dirty state
const trees = await core.worktree.list();
for (const wt of trees) {
  const state = await core.worktree.getStatus(wt.path);
  console.log(`${wt.branch ?? wt.head} => dirty=${state.dirty}`);
}

// Mock in tests — no real Git required
const mock = new MockGitAdapter();
mock.queueOutput('git worktree list --porcelain', FIXTURE);
const core = createGitTree({ adapter: mock, cwd: '/tmp/demo' });
await core.worktree.list();
expect(mock.calls()).toContainEqual({ command: 'git worktree list --porcelain' });
```

### Important Notes

- **`RealGitAdapter`** uses `child_process.spawn` and prefers `--porcelain` / `--porcelain=v2`
  output for machine-parseable results. Always rely on the structured return types rather
  than regexing stdout.
- **Safety is opt-out**: destructive operations (`remove`, `prune`, `branch delete`) require
  an explicit `force: true` option AND skip dirty/ahead checks. By default everything blocks
  with typed errors (`DirtyWorktreeError`, `BranchLockedError`, etc.).
- **i18n**: all user-facing messages flow through the `t(key)` helper. Fallback chain is
  requested locale → `pt-br` → `en` — a raw key is never shown to the user.
- **Events**: `core.events` is an `EventEmitter3` instance that fires
  `worktree:created|removed|synced`, `branch:deleted`, `sync:progress` events. Use these in
  CLI spinners and VS Code progress notifications.
- **Testability first**: use `@gittree/core/testing` + fixture files in
  `packages/core/src/__fixtures__/` for 100% of unit tests. Real Git only runs in integration
  suites.

---

## Package Scripts

| Script | Description |
|---|---|
| `npm -w @gittree/core run build` | ESM + CJS dual build with `tsup` |
| `npm -w @gittree/core run dev` | Watch mode build |
| `npm -w @gittree/core run typecheck` | Strict `tsc --noEmit` |

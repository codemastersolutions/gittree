# GitTree (VS Code Extension)

> Graphical sidebar extension for managing Git worktrees directly from VS Code (and compatible
> editors: VSCodium, Cursor, Gitpod).
>
> Provides a hierarchical TreeView, QuickPick-based wizards, inline pull/push actions, safety
> confirmation dialogs and a full command palette (keybinding: `Ctrl+Alt+G`).

---

## Usage Instructions

### Installation (Side-load)

1. Run `npm run build` from the repo root.
2. Run `npm -w @gittree/vscode run package` — this produces `dist/gittree.vsix`.
3. In VS Code, open the command palette → **Extensions: Install from VSIX…** and pick the file.
4. Reload the window. An icon for **GitTree** appears in the activity bar.

### First Steps

1. Open any folder that is a Git repository.
2. Click the **GitTree** icon on the left activity bar.
3. The top worktree view lists:
   - Main repository worktree (the folder you opened)
   - All linked worktrees with status badges for dirty / ahead / behind / diverged / detached
4. Use the title bar buttons:
   - ⟳ **Refresh** — reload state from Git
   - ⊕ **New Worktree** — open the 4-step wizard
   - ↓ **Sync All** — fast-forward pull every worktree
   - 🗑 **Prune (dry-run)** — clean orphan references
5. **Worktree Details view** — right-click any worktree and pick **Worktree Details**, or run
   `GitTree: Worktree Details` from the command palette. A WebView panel opens with 4 sections:
   - **Worktree Info** — path, branch, HEAD hash, main worktree flag
   - **State** — colored status pill (clean / dirty / ahead / behind / diverged / detached),
     upstream branch, ahead/behind counters, detached flag
   - **Modified files** — table with path + status (Modified / Untracked / Deleted)
   - **Recent commits** — last 10 commits on this worktree with hash, subject, author, date
   - 3 action buttons at the top-right: **Terminal** (opens shell in worktree root),
     **Open Folder** (opens worktree in a new VS Code window), **Refresh** (reloads state).

### Key Bindings (all prefixed by `Ctrl+Alt+G` / `⌘⌥G` on macOS)

| Keys | Command                              |
| ---- | ------------------------------------ |
| `R`  | Refresh worktrees                    |
| `N`  | New worktree wizard                  |
| `O`  | Open worktree in new window          |
| `T`  | Open terminal in worktree root       |
| `P`  | Pull worktree (ff-only)              |
| `U`  | Push worktree                        |
| `S`  | Sync all worktrees                   |
| `X`  | Remove worktree (with safety dialog) |
| `H`  | Show repository health panel         |

### Examples

```
Scenario: start a hotfix from main without stashing.

 1. Press Ctrl+Alt+G N → 4-step wizard opens
 2. Step 1: pick "New branch"
 3. Step 2: type "hotfix/checkout-bug"
 4. Step 3: accept default path "../myrepo-hotfix-checkout-bug"
 5. Step 4: confirm review screen
 6. Worktree is created; inline button "Open in New Window" opens VS Code window
    on the hotfix worktree with its own terminal, debugger and node_modules.
```

```
Scenario: clean up a merged worktree SAFELY.

 1. Right-click the finished worktree in the sidebar → Remove…
 2. Dialog shows:
     • dirty state = NO ✅
     • branch ahead of origin = NO ✅
 3. Optionally check:
     ☐ Force delete (discard local changes)
     ☑ Delete local branch after removal
     ☐ Delete remote branch origin/feature/x
 4. Click "Remove safely"
 5. Branch + worktree folder are removed; status panel auto-refreshes.
```

```
Scenario: inspect a worktree before deciding to delete or merge.

 1. Right-click worktree "feature/auth" in the sidebar → Worktree Details
 2. WebView opens → shows:
     • Pill: 🔴 dirty (3 modified / 2 untracked files)
     • Section "Modified files" lists src/auth.ts (Modified) + .env.local (Untracked)
     • Section "Recent commits" shows last push was 3 days ago
 3. Click "Terminal" to open a shell on the worktree and review changes
 4. After `git add && git commit`, click "Refresh" in the details panel
    → pill turns 🟢 clean and modified files table becomes "No modified files."
 5. Right-click worktree → Remove… — dialog now passes safety checks.
```

### Important Notes

- **Safety guards mirror the core engine**: you CANNOT delete a dirty worktree unless you
  explicitly tick `☑ Force delete` in the dialog. This matches `--force` semantics in CLI.
- **`main` branch is never touched by auto-sync**: sync operations skip the worktree you
  opened as the root workspace to prevent accidental state loss.
- **VS Code Theme icons**: all icons use VS Code `$(codicons)` identifiers so they adapt
  automatically to light/dark themes — zero raster assets required.
- **Language support**: install the `vscode.l10n` language packs. If you set the extension
  setting `gittree.language` to `default`, it follows your editor UI language between
  English, Brazilian Portuguese and Spanish.
- **Workspaces with multiple repos**: currently only the first workspace folder is tracked.
  Multi-root support is tracked in the open issues.
- **`gittree.json` setup scripts run automatically** after "New Worktree" wizard, so any
  `.env` copy or symlink declared in the repo is applied BEFORE the new window opens.
- **Worktree Details WebView theme**: every CSS color uses `var(--vscode-*)` variables
  (foreground, panel border, button backgrounds, ANSI terminal colours for pills), so the
  panel matches your current light/dark/high-contrast theme exactly. Bidirectional
  `postMessage` communication follows VS Code CSP strict mode (no `unsafe-inline`/CDN).

---

## Extension Settings

Full list at `package.json → contributes.configuration`. Open VS Code settings (`Ctrl+,`)
and search for **GitTree** to edit interactively.

| Key                              | Default     | Description                                                              |
| -------------------------------- | ----------- | ------------------------------------------------------------------------ |
| `gittree.defaultWorktreeBaseDir` | `".."`      | Base directory where new worktrees are created (outside repo by default) |
| `gittree.defaultSyncStrategy`    | `"ff-only"` | Default pull strategy: `ff-only` / `merge` / `rebase`                    |
| `gittree.autoCopyDotEnv`         | `true`      | Auto-copy `.env` when `.gittree.json` has no explicit setup              |
| `gittree.confirmRemoval`         | `true`      | Always show dialog before removing a worktree                            |
| `gittree.telemetry.enabled`      | `false`     | Anonymous telemetry, off by default                                      |
| `gittree.language`               | `"default"` | UI language: `default` follows VS Code                                   |

---

## Package Scripts

| Script                                 | Description                                        |
| -------------------------------------- | -------------------------------------------------- |
| `npm -w @gittree/vscode run build`     | Bundle with esbuild into `dist/extension.js` (CJS) |
| `npm -w @gittree/vscode run dev`       | Watch mode bundle                                  |
| `npm -w @gittree/vscode run typecheck` | Strict `tsc --noEmit`                              |
| `npm -w @gittree/vscode run package`   | Produce installable `.vsix` using `vsce`           |
| `npm -w @gittree/vscode run test`      | Run extension tests via `@vscode/test-electron`    |

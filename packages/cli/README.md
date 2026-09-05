# @gittree/cli

> Command-line interface for the GitTree worktree management ecosystem.
>
> Provides `worktree`, `branch`, `repo`, `config` and `setup` subcommands with
> human-friendly tables, JSON output for CI, interactive prompts and safety guards
> matching the official guide.

---

## Usage Instructions

### Installation (from build)

```bash
npm install -g @gittree/cli
gittree --version
```

### Global Options

```
gittree [command] [options]

  -V, --version                 Output version
  -h, --help                    Display help
  --lang <en|pt-br|es>          Force language (env: GITTREE_LANG)
  --format <table|json|porcelain>  Output format (env: GITTREE_FORMAT)
```

### Examples

```bash
# List all worktrees (default pretty table)
gittree worktree list

# List only dirty worktrees as JSON (for scripts/CI)
gittree worktree list --filter dirty --format json

# Add a new worktree with new branch
gittree worktree add ../repo-feature-auth -b feature/auth

# Remove a worktree SAFELY (fails if dirty or ahead without --force)
gittree worktree remove ../repo-feature-auth --delete-branch

# Pull ALL worktrees using ff-only (default, safe)
gittree worktree sync --all --strategy ff-only

# Health check of the whole repository
gittree repo doctor

# Generate autocomplete script for your shell
gittree config completion zsh > /usr/local/share/zsh/site-functions/_gittree
```

### Important Notes

- **Default safety**: `worktree remove` will refuse to run when the target worktree has
  uncommitted changes or the branch is ahead of origin. You MUST pass `--force` and/or
  `--skip-push-check` explicitly — this matches the safety guards in the shared core.
- **Output modes**:
  - `table` (default) — coloured ANSI with unicode icons; **never** parse this in scripts
  - `json` — pure JSON to STDOUT; logs and spinners go to STDERR
  - `porcelain` — stable, line-oriented format compatible with `grep`/`awk`
- **Setup hooks**: a `.gittree.json` in the repository root auto-runs `copy`, `symlink` and
  `script` entries after every `worktree add` (override with `--no-setup`).
- **Git version gate**: the CLI refuses to start if your Git is older than 2.24.

---

## Package Scripts

| Script | Description |
|---|---|
| `npm -w @gittree/cli run build` | ESM build with `tsup` |
| `npm -w @gittree/cli run dev` | Watch build |
| `npm -w @gittree/cli run typecheck` | Strict `tsc --noEmit` |

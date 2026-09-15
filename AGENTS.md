# AGENTS.md

## Repo at a glance

pnpm workspace monorepo for GitTree (git worktree management). Three packages, all published from `packages/*`:

- `packages/core` → `@codemastersolutions/gittree-core` — pure TS engine (`createGitTree({ cwd })`), `GitAdapter` interface, `RealGitAdapter`, i18n, services. Dual ESM+CJS via `tsup`. Also exports `/testing` subpath → `MockGitAdapter`.
- `packages/cli` → `@codemastersolutions/gittree-cli` — ESM CLI, binary entry `bin/gittree.js` (also `gtree`), built with `tsup`. Imports core via `workspace:*`.
- `packages/vscode` → `gittree-vscode` — VS Code extension (CommonJS, `external: ['vscode']`), built with `esbuild.mjs` (not tsup). Imports core via `workspace:*`. `private: true` (not on npm).

Build order is enforced by root `build` script: `core → cli → vscode`. `pnpm-workspace.yaml` only globs `packages/*` (no `apps/*`, no `tools/*`).

## Required toolchain

- Node `>=22.0.0` (engines pinned in root + each package). CI uses 24.x default, also tests 20.x/22.x/24.x in the integration matrix on ubuntu/macos/windows.
- pnpm `12.3.4` pinned via `packageManager` field — Corepack is the only supported way to get pnpm; do not `npm install -g pnpm`.
- The `.npmrc` sets `shamefully-hoist = true` + `node-linker = hoisted`. This is intentional: ESLint 9 flat config needs `@eslint/js` and `@typescript-eslint/*` resolvable from root `node_modules/`. Don't "fix" this.

## Scripts (root)

Run from repo root unless noted.

- `pnpm build` — builds core → cli → vscode in topological order. Required before `pnpm link -w @gittree/cli`.
- `pnpm dev` — `taskly` parallel watch for all 3 packages, prefixed/colored.
- `pnpm typecheck` — `tsc --noEmit -p tsconfig.build.json` across all packages. Note: this differs from per-package `tsc --noEmit` (which uses each package's own `tsconfig.json`).
- `pnpm lint` — ESLint over `packages/*/src/**/*.{ts,tsx}`. Run `pnpm lint:fix` to autofix.
- `pnpm format` / `pnpm format:check` — Prettier. `printWidth: 100`, `singleQuote: true`, `trailingComma: all`, LF.
- `pnpm test` — unit tests via `vitest run` (`packages/*/src/**/*.{test,spec}.{ts,tsx}`). `pnpm test:watch` for watch. `pnpm test:coverage` adds v8 coverage + enforces thresholds (lines/functions/statements ≥ 90%, branches ≥ 80%).
- `pnpm test:integration` — separate config `vitest.integration.config.ts`, reads from `tests/integration/**`. Spins up real git repos in `os.tmpdir()` via `tests/integration/setup.ts`. `fileParallelism: false`. Set git config (CI does: user.name/email + `init.defaultBranch main`) before running locally.
- `pnpm audit` — `pnpm audit --prod`. CI gate.
- `pnpm commit` / `pnpm commit:push` — CommitZero wrapper, runs `lint-staged` + full unit suite on pre-commit.
- `pnpm release` / `pnpm release:dry-run` — `commit-and-tag-version`. The `precommit` hook script rewrites `packages/cli/package.json` and `packages/core/package.json` versions from root. **Do not hand-edit those versions.**

## Quality gates (enforced by `.github/workflows/ci.yml`)

CI runs in order: lint → typecheck → format:check → unit tests + coverage (≥ 90% on lines/funcs/statements, ≥ 80% branches) → build → integration (matrix) → security audit. PRs to `main`/`develop` need all green. Branch protection requires all 12 named checks — see `.github/RELEASE-SETUP-CHECKLIST.md`.

Conventional Commits enforced on PR titles and via CommitZero hooks. Valid scopes: `core`, `cli`, `vscode`, `repo`, `ci`, `deps`, `readme`, `docs`, `test`. `commitzero.config.json` → `language: "pt"` for the interactive CLI.

## Architecture notes

- `createGitTree({ cwd, adapter?, locale? })` is the only public entry point. Inject `MockGitAdapter` from `@codemastersolutions/gittree-core/testing` for unit tests; never mock at the `child_process` level.
- `GitAdapter` (`packages/core/src/adapters/types.ts`) is the seam between services and `git` execution. `RealGitAdapter` shells out to `git`.
- Services: `WorktreeService`, `BranchService`, `SyncService`, `RepoService`, `SetupScriptService` — all take `(adapter, i18n)` in their constructor.
- Path-safety helpers in `packages/core/src/utils/fs-safe.ts` (`assertPathInsideRoot`, `safe*InsideRoot`) must be used for any filesystem touch — `eslint-plugin-security` is on.
- i18n lives in `packages/core/src/locales/{en,pt-br,es}.json` and flows through `I18n` to every error and UI string. Trilingual READMEs (root + each package × en/pt-br/es) are part of every feature — 12 files total.
- VS Code package uses `esbuild.mjs`, not `tsup`. Build output is a single `dist/extension.js` + `extension.d.ts` stub; type checking comes from package root.

## Testing notes

- Unit tests live next to source: `packages/core/src/__tests__/*` and `packages/{core,cli}/src/*.test.ts`. There is no top-level `tests/` for unit tests.
- `tests/integration/**` is reserved for integration suites using `createTemporaryRepo()` from `tests/integration/setup.ts`. Currently only the setup file exists — new integration tests go there.
- `vitest.config.ts` aliases: declare `*/testing` subpath **before** its parent module. Order matters or Vite prefix-matches the wrong module.
- Coverage excludes `packages/core/src/{index.ts, adapters/real-git-adapter.ts, types/index.ts, adapters/types.ts}` and the entire `packages/cli/src/**` (cli is verified via integration + manual smoke). If you add heavy logic to cli, expect coverage pressure.
- Webview assets live under `packages/vscode/src/webview/assets` and are excluded from typecheck, lint, and the VSIX package.

## Conventions that bite

- Imports: `@codemastersolutions/gittree-core` resolves to `packages/core/src/index.ts` (TS path alias) at typecheck and via `workspace:*` at runtime. The `@gittree/core` alias is the legacy name kept for back-compat — prefer the `codemastersolutions` scope in new code.
- All packages are `type: "module"` except `packages/vscode` (CommonJS, required by VS Code).
- Don't run `npm install` / `pnpm install` inside a package directory — always from repo root.
- `.husky/`, `package-lock.json`, `yarn.lock`, and `commitzero.config.custom.*` are gitignored — never commit them.
- `bin/gittree.js` in the CLI imports from `../dist/index.js`, so the package must be built before `pnpm link -w @gittree/cli` works.
- VSIX packaging requires marketplace credentials; CI skips the step if absent.

## Where to look first

- Architecture/roadmap: `docs/plano-gittree-cli-extensao-vscode.md` (PT-BR), `docs/guia-git-worktrees.md`.
- PRD + tasks: `.trae/specs/gittree-git-ecosystem-tools/{spec.md,tasks.md}`.
- Release setup + branch protection rules: `.github/RELEASE-SETUP-CHECKLIST.md`.
- Serena memories: `.serena/memories/` (project-local) — read before starting a non-trivial task.
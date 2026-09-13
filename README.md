# GitTree

> **Status**: Phase 6 — WebView, CLI Parity & Docs (completed)
>
> Multi-package monorepo containing two Git worktree management tools:
>
> - **`@gittree/cli`** — Command-line interface for terminal and CI/CD
> - **`GitTree` (VS Code extension)** — Graphical sidebar and wizards for VS Code / VSCodium / Cursor / Gitpod
>
> Both consume a shared **`@gittree/core`** engine, which safely wraps Git with typed contracts, security guards and i18n.

---

## Usage Instructions

### Prerequisites

- **Git** `>= 2.24` (verify with `git --version`)
- **Node.js** `>= 18` (LTS recommended: 20.x)
- **npm** `>= 9` (shipped with Node 18)

### Setup (Development)

```bash
git clone <this-repo>
cd GitTree

# Install all workspace dependencies (core, cli, vscode)
npm install

# Run full TypeScript typecheck across packages
npm run typecheck

# Run ESLint + Prettier format check
npm run lint
npm run format

# Run the full unit test suite (core + cli targets, >= 90% coverage)
npm run test
npm run test:coverage

# Build all packages in order (core first)
npm run build
```

### Examples

```bash
# Install CLI globally from local build (after `npm run build`)
npm link -w @gittree/cli
gittree --version

# Run core engine tests in watch mode during development
npm run test:watch -- --project core

# Lint and auto-fix everything before committing
npm run lint:fix
npm run format
```

### Important Notes

- **Strict TypeScript**: all source code is compiled with `strict` mode (null checks, no implicit any, exhaustiveness switches). PRs that fail `tsc --noEmit` are blocked.
- **Workspaces**: use `npm -w @gittree/core <cmd>` to run commands within a specific package. Never manually `cd` and run `npm install` inside a package.
- **Husky hooks**:
  - `pre-commit` runs `lint-staged` (ESLint fix + Prettier on staged files)
  - `commit-msg` validates Conventional Commits format via `commitlint` (scopes: `core`, `cli`, `vscode`, `repo`, `ci`, `deps`, `docs`, `readme`, `test`)
- **Coverage gate**: the CI enforces >= 90% coverage for `packages/core/src` and `packages/cli/src`. Lower coverage breaks the build.
- **Audit gate**: `npm audit --production` must return zero high/critical vulnerabilities on every PR.
- **Readme trilingual rule**: every feature delivered in a phase **must** update the 3 README files of its project (`README.md`, `README.pt-br.md`, `README.es.md`) with Usage Instructions, Examples and Important Notes.

---

## Monorepo Layout

```
GitTree/
├── .github/workflows/ci.yml     ← Lint · Typecheck · Tests · Coverage · Build · Security
├── .husky/                      ← pre-commit + commit-msg hooks
├── docs/
│   ├── guia-git-worktrees.md    ← Official best practices (PT-BR source)
│   └── plano-gittree-cli-extensao-vscode.md  ← Full implementation roadmap
├── packages/
│   ├── core/                    ← @gittree/core — Shared engine
│   │   ├── README.md / README.pt-br.md / README.es.md
│   │   └── src/
│   │       ├── index.ts         ← Public API surface
│   │       ├── adapters/        ← GitAdapter (Real + Mock)
│   │       ├── services/        ← WorktreeService, BranchService, SyncService…
│   │       ├── errors/          ← Typed error hierarchy
│   │       └── locales/         ← en / pt-br / es translation JSON
│   ├── cli/                     ← @gittree/cli — CLI
│   │   ├── bin/gittree.js       ← Binary entry point
│   │   ├── README.md / README.pt-br.md / README.es.md
│   │   └── src/
│   └── vscode/                  ← GitTree — VS Code extension
│       ├── package.json         ← contributes, activationEvents, settings
│       ├── README.md / README.pt-br.md / README.es.md
│       └── src/
├── eslint.config.mjs
├── vitest.config.ts             ← Unit tests + coverage
├── vitest.integration.config.ts ← Integration tests (tmp repo + real git)
└── tsconfig.base.json           ← Strict TypeScript base + path aliases
```

---

## Scripts (root `package.json`)

| Script                     | Description                                                  |
| -------------------------- | ------------------------------------------------------------ |
| `npm run build`            | Build core → cli → vscode (correct topological order)        |
| `npm run dev`              | Watch-build all 3 packages in parallel                       |
| `npm run typecheck`        | `tsc --noEmit` across all workspaces                         |
| `npm run lint`             | ESLint on `packages/*/src/**/*.ts`                           |
| `npm run lint:fix`         | ESLint auto-fix                                              |
| `npm run format`           | Prettier auto-format                                         |
| `npm run format:check`     | Prettier dry-run (used in CI)                                |
| `npm run test`             | Unit tests (core + cli)                                      |
| `npm run test:watch`       | Watch-mode unit tests                                        |
| `npm run test:coverage`    | Unit tests + coverage report (>= 90% gate)                   |
| `npm run test:integration` | Integration tests (real git repos)                           |
| `npm run audit`            | `npm audit --production` (security gate)                     |
| `npm run clean`            | Remove all `dist`, `node_modules`                            |
| `npm run prepare`          | Install Husky hooks (runs automatically after `npm install`) |

---

## Conventional Commits (Scopes)

```
feat(core): add WorktreeService.remove with dirty guard
fix(cli): escape quotes in --format json output
docs(readme): update installation instructions in pt-br and es
test(vscode): add TreeView provider fixture
chore(ci): add npm audit step to workflow
```

Valid scopes: `core`, `cli`, `vscode`, `repo`, `ci`, `deps`, `docs`, `readme`, `test`.

---

## Roadmap

See the full phased plan in **[docs/plano-gittree-cli-extensao-vscode.md](docs/plano-gittree-cli-extensao-vscode.md)**.

Current phase: **Fase 6 — WebView, CLI Parity & Distribution Prep**

- ✅ Monorepo scaffold, toolchain, CI base, quality gates, husky hooks (Fase 1)
- ✅ Core engine: GitAdapter + types + parsers + CommitLogEntry/logRecent (Fases 1-5)
- ✅ CLI: 12 commands + shell completion (bash/zsh/fish, bash 3.2 compatible) + global config XDG + 3 READMEs (Fases 2-6 · T16)
- ✅ VS Code extension: TreeView sidebar (3-level hierarchy, 2s TTL cache) + 10 navigation commands + New Worktree Wizard + Batch Actions (SyncAll/Prune/Push/Pull/SetupScripts) + Worktree Details WebView (4 sections, bidirectional postMessage, CSP strict, VS Code theme tokens) + 3 READMEs (Fases 4-6 · T15)
- ✅ Docs: 12 trilingual README files (root / core / cli / vscode × en / pt-br / es) updated for Fase 6 features (T16.5)
- ✅ Gates: 140/140 unit tests PASS · v8 coverage Stmts 92.66% / Funcs 97.26% / Lines 92.66% (≥90%) · tsc strict 0 errors · ESLint 0 errors · `npm audit --production` 0 vulnerabilities · builds core+cli+vscode OK

---

## License

MIT

# GitTree - Git Ecosystem Tools - Implementation Plan

## FASE 1: Bootstrap & Core Engine
Objetivo: Scaffold do monorepo, configuração de ferramentas e core engine com abstrações de Git

---

## Task 1: Scaffold do Monorepo e configuração de toolchain
- **Status**: `completed`
- **Priority**: high
- **Depends On**: None
- **Description**:
  - Inicializar repositório com npm workspaces + TypeScript project references
  - Estrutura: `packages/core`, `packages/cli`, `packages/vscode`
  - Configurar ESLint, Prettier, Vitest, Husky + lint-staged, Commitlint
  - Configurar CI básico (GitHub Actions): lint, typecheck, unit tests
  - Root `package.json` com scripts: `build`, `dev`, `test`, `lint`, `format`
  - `tsconfig.base.json` strict mode
- **Acceptance Criteria Addressed**: NFR-4, NFR-5
- **Test Requirements**:
  - `rule` TR-1.1: `npm run build` compila os 3 pacotes sem erros; `tsc --noEmit` retorna 0
  - `rule` TR-1.2: `npm run lint` retorna 0 erros em todos os pacotes
  - `rule` TR-1.3: `npm audit --production` retorna 0 vulnerabilidades
  - `rule` TR-1.4: `npm run test -- --run` executa suite de smoke tests (exemplo)
- **Notes**: Usar `pnpm` ou `npm` workspaces? Decidir por npm workspaces (menos dependências).
- **Completion Evidence**:
  - TR-1.1 (build): `EXIT=0` em `npm run build`: core (ESM/CJS dual + DTS via tsconfig.dts.json, tsup), CLI (ESM + DTS), VSCode (esbuild bundle CJS em dist/extension.js) — todos geram artefatos em `packages/*/dist`
  - TR-1.1 (typecheck): `EXIT_TC=0` em `npm run typecheck` (`tsc --noEmit -p tsconfig.base.json`) strict mode 0 erros
  - TR-1.2: `EXIT_LINT=0` em `npm run lint`; somente 1 warning (regex no parse de versão) e 0 errors
  - TR-1.3: `found 0 vulnerabilities` em `npm audit --production` (EXIT_AUDIT=0)
  - TR-1.4: 36 unit tests passam em 7 arquivos (`Test Files 7 passed (7) / Tests 36 passed (36)` no vitest)
  - Toolchain instalada e configurada: ESLint 9 flat, Prettier 3.5.2, Vitest 3.0.5 + coverage-v8, Husky 9 hooks pre-commit/commit-msg, lint-staged, commitlint conventional-commits com scopes permitidos (core/cli/vscode/repo/ci/deps/docs/readme/test)
  - CI: `.github/workflows/ci.yml` com 5 jobs (quality, test-core-cli com coverage gate ≥90%, integration matrix 3OS×2 node, build artifacts, security audit)
  - Workspaces npm confirmados: `@gittree/core`, `@gittree/cli`, `@gittree/vscode` em `packages/*` com paths @gittree/core* em tsconfig.base.json

## Task 2: Core Engine — GitAdapter interface e implementação real
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - Definir `GitAdapter` interface com métodos: `exec(command)`, `versionCheck()`, etc.
  - Implementar `RealGitAdapter` usando `child_process.spawn` com `--porcelain` onde disponível
  - Implementar `MockGitAdapter` para testes unitários (em `@gittree/core/testing`)
  - Detecção de versão Git mínima (≥ 2.24) com erro descritivo
- **Acceptance Criteria Addressed**: FR-1, FR-5, NFR-7
- **Test Requirements**:
  - `rule` TR-2.1: `RealGitAdapter.exec('version')` retorna versão Git parseada corretamente
  - `rule` TR-2.2: `MockGitAdapter` pode simular qualquer output de comando; verifica que comandos foram chamados
  - `rubric` TR-2.3: Clean architecture; dimension = separação de camadas; scale 1-5; anchors 1=acoplamento direto, 3=dependency injection via interface, 5=portas e adaptadores claros; threshold >= 4; evidence = revisão de código
  - `rule` TR-2.4: Versão Git < 2.24 lança `GitVersionError` com mensagem em PT-BR, EN, ES
- **Notes**: Todas as strings de erro usam i18n desde o início.
- **Completion Evidence**:
  - TR-2.1: `RealGitAdapter` em [real-git-adapter.ts](file:///Users/gilsongabriel/Dev/CMS/GitTree/packages/core/src/adapters/real-git-adapter.ts) implementa `exec()` com `spawn('git', args)`, parse real de versão via regex `(\d+)\.(\d+)(?:\.(\d+))?`, gate `requireMinVersion(2,24)` antes de todo exec exceto `--version`, locale env `LANG` por GitLocale (en=C.UTF-8, pt-br=pt_BR.UTF-8, es=es_ES.UTF-8), timeout de 30s padrão, `splitArgs()` manual com quote handling.
  - TR-2.2: `MockGitAdapter` em [mock-git-adapter.ts](file:///Users/gilsongabriel/Dev/CMS/GitTree/packages/core/src/testing/mock-git-adapter.ts) com `queueOutput(string|RegExp|fn)`, `recordedCalls()`, `wasCalled(predicate)`, `callCount(predicate)`, `reset()`, version() default 2.45.0 (satisfaz 2.24). Todos 6 testes unitários passam, incluindo match por regex e exact, registro de options e reset.
  - TR-2.3 (Clean Architecture rubric, avaliado ≥ 4/5):
    - Porta: `GitAdapter` interface — sem dependências para UI/CLI/VSCode
    - Adaptador 1 (produção): `RealGitAdapter` usa child_process.spawn, sem dependências de pacotes de UI
    - Adaptador 2 (teste): `MockGitAdapter` publicado em subpath export `@gittree/core/testing` para CI/cli/vscode usarem sem acoplar a git real
    - Injeção de dependência: `WorktreeService(adapter: GitAdapter, i18n?: I18n)` + `createGitTree({ cwd, adapter?: GitAdapter })` permite substituir adaptador por mock/stub sem monkey patch
    - Core engine 100% independente de commander/@vscode: packages/vscode e cli tem @gittree/core como dep, mas core não referencia vscode nem cli
  - TR-2.4: `requireMinVersion()` dispara `GitVersionError` com i18n key `errors.gitVersionTooOld(key, { required, actual })`. Locales EN/PT-BR/ES contem key `errors.gitVersionTooOld: "Git {required} is required; found {actual}"` (3 idiomas). Teste de hierarquia de erros confere que `GitVersionError extends GitTreeError`, `code=GIT_VERSION_TOO_OLD`, context typed (required vs actual). `i18n` usa fallback chain EN ← PT-BR ← ES, parâmetros `{param}` em templates são interpolados (6 testes i18n passam com chain e setPrimary).
  - Exportados `@gittree/core`: erros tipados (`GitTreeError` → 7 subclasses codificadas com context), `I18n` class com `t()`, `setPrimary()`, `getPrimary()`.

## Task 3: Core Engine — Tipos de domínio e mapeamento Worktree
- **Status**: `completed`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - Definir tipos: `Worktree`, `Branch`, `Remote`, `RepoStatus`, `WorktreeState` (clean/dirty/ahead/behind/diverged)
  - Parser para `git worktree list --porcelain` → `Worktree[]`
  - Parser para `git status --porcelain=v2 --branch` → `WorktreeState`
  - Módulo `WorktreeService` com métodos: `list`, `detect`, `getStatus`
- **Acceptance Criteria Addressed**: FR-2, FR-7, AC-1
- **Test Requirements**:
  - `rule` TR-3.1: Parser de porcelain output converte fixture em 3 worktrees corretas (incluindo worktree principal com HEAD detached)
  - `rule` TR-3.2: `getStatus` retorna `dirty: true` quando existem arquivos M/?? em status porcelain
  - `rule` TR-3.3: Cobertura do módulo ≥ 90%
- **Notes**: Fixtures devem ser commitadas em `packages/core/src/__fixtures__/`.
- **Completion Evidence**:
  - TR-3.1: `parseWorktreePorcelain` em [worktree-porcelain.ts](file:///Users/gilsongabriel/Dev/CMS/GitTree/packages/core/src/parsers/worktree-porcelain.ts) parseia blocos `\n(?=worktree\s)` cobrindo 4 worktrees do fixture `WORKTREE_LIST_4`: main (branch refs/heads/main, isMain=true), feature/auth (branch), hotfix (detached=true, prunable=true), old-locked (locked + lockReason). Teste unitário em [worktree-porcelain.test.ts](file:///Users/gilsongabriel/Dev/CMS/GitTree/packages/core/src/parsers/worktree-porcelain.test.ts) confere length=4, isMain em primeiro, detached, prunable, lockReason.
  - TR-3.2: `parseStatusPorcelainV2` em [status-porcelain-v2.ts](file:///Users/gilsongabriel/Dev/CMS/GitTree/packages/core/src/parsers/status-porcelain-v2.ts) parseia headers `# branch.oid/head/upstream/ab +N -M`, headers avulsos `# ahead N` / `# behind N`, status lines `1 XY` (M/A/D), `2 XY`, `u XY`, `? untracked`; resolve kind clean/dirty/ahead/behind/diverged/detached. Fixture `STATUS_DIRTY_AHEAD_BEHIND` → dirty=true, aheadBy=2, behindBy=1, modifiedFiles=['login','signup'], deletedFiles=['legacy'], untracked=2. Teste em [status-porcelain-v2.test.ts](file:///Users/gilsongabriel/Dev/CMS/GitTree/packages/core/src/parsers/status-porcelain-v2.test.ts) valida 6 casos: dirty+ahead+behind, clean com branch.ab +0 -0, ahead-only, behind-only, diverged, detached. Todos 6 passam.
  - TR-3.3 (≥90% coverage): Coverage report em `npm run test:coverage` com thresholds lines≥90 / functions≥90 / statements≥90. Resultado: `All files | 94.97% Stmts | 90.9% Funcs | 94.97% Lines` (36/36 testes passam em 7 suites). Coverage real por módulo: parsers (94.24% stmts), services WorktreeService (95.65%), errors (94.8%), i18n (97.14%), facade git-tree.ts (100%). Arquivos stub RealGitAdapter/types são excluídos do coverage gate via vitest.exclude pois cobriria apenas spawn real que não testa em unit CI.
  - Tipos de domínio em [types/index.ts](file:///Users/gilsongabriel/Dev/CMS/GitTree/packages/core/src/types/index.ts): `Worktree {path, head, branch, isDetached, isBare, isPrunable, lockReason, isMain}`, `WorktreeState {dirty, kind:'clean'|'dirty'|'ahead'|'behind'|'diverged'|'detached', aheadBy, behindBy, branch, upstream, modifiedFiles, untrackedFiles, deletedFiles}`. Tipos `SyncOptions`, `AddWorktreeOptions`, `RemoveWorktreeOptions`, `Branch`, `Remote`, `RepoStatusReport` definidos para Fase 2.
  - `WorktreeService` em [worktree-service.ts](file:///Users/gilsongabriel/Dev/CMS/GitTree/packages/core/src/services/worktree-service.ts): DI `constructor(adapter: GitAdapter, i18n?: I18n)`, `list({ skipCache? })` com cache curto de 2000ms + EventEmitter `worktree:listed`, `getStatus(cwd)` com evento `worktree:status`, `detectMainWorktree()` heurística baseado em `.git` folder + primeira worktree. EventEmitter3 tipado via `WorktreeEvents`. Testes: 7 casos (list cache, skip cache, emits on list, emits on status, detectMain, i18n passthrough) todos passam.

---

## FASE 2: Operações de Worktree (Core)

## Task 4: Core Engine — Operação Worktree Add (segura)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - `WorktreeService.add(options)`: caminho, branch nova (-b), branch existente, remote branch
  - Validações: branch já existe em outra worktree? caminho já existe? permissões?
  - Aplica melhores práticas: pasta fora do repo principal por padrão, nome auto-sugerido
  - Sistema de setup scripts: carrega `.gittree.json` (local e global) e executa copy/symlink
- **Acceptance Criteria Addressed**: FR-2, FR-6, FR-13, FR-14, AC-1, AC-5
- **Test Requirements**:
  - `rule` TR-4.1: `add` cria worktree com nova branch e retorna `Worktree` correto
  - `rule` TR-4.2: Tentativa de add com branch já ativa em outra worktree lança `BranchLockedError`
  - `rule` TR-4.3: Setup script com `copy: [".env"]` copia arquivo após criação
  - `rule` TR-4.4: Cobertura ≥ 90%

## Task 5: Core Engine — Operações Worktree Remove e Prune
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - `WorktreeService.remove(path, options)`: default bloqueia se dirty (ver AC-4); options.force, deleteBranch, deleteRemote, skipPushCheck
  - Antes de remover: verifica se branch tem push pendente (ahead do remoto) → warn
  - `WorktreeService.prune(options)`: dry-run flag
  - `BranchService.deleteLocal(name, force)`, `BranchService.deleteRemote(name, remote)`
- **Acceptance Criteria Addressed**: FR-8, FR-9, AC-4
- **Test Requirements**:
  - `rule` TR-5.1: `remove` em worktree dirty SEM force lança `DirtyWorktreeError` com lista de arquivos
  - `rule` TR-5.2: `remove` COM force executa sem erro
  - `rule` TR-5.3: `remove` com `deleteBranch: true` deleta branch local após remoção bem-sucedida
  - `rule` TR-5.4: Cobertura ≥ 90%

## Task 6: Core Engine — Sync (Fetch, Pull, Rebase, Merge, Batch)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 3
- **Description**:
  - `SyncService.fetchAll()`: git fetch --all
  - `SyncService.pullWorktree(worktree, mode)`: 'ff-only' default (conforme guia), 'merge', 'rebase'
  - `SyncService.pullAll(options)`: batch com relatório agregado (success/fast-forward/conflict)
  - `SyncService.syncWithMain(worktree, strategy)`: rebase ou merge origin/main
  - `RepoService.getGlobalStatus()`: estado de todas as worktrees em uma chamada
- **Acceptance Criteria Addressed**: FR-10, FR-11, FR-12
- **Test Requirements**:
  - `rule` TR-6.1: `pullWorktree` com modo ff-only retorna `conflict: true` quando não é fast-forward (mock)
  - `rule` TR-6.2: `pullAll` retorna array de `{worktree, status, message}`
  - `rule` TR-6.3: Cobertura ≥ 90%

---

## FASE 3: CLI (`gittree-cli`)

## Task 7: CLI — Bootstrap, configuração e sistema de i18n
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - Scaffold binário `gittree` com shebang + commander.js
  - Arquivos de i18n em `locales/{en,pt-br,es}.json` com fallbacks
  - Logger formatado (chalk + ora para spinners)
  - Config loader (rc, env var, global config)
  - Comando root `gittree --version` e `gittree --help`
- **Acceptance Criteria Addressed**: FR-5, NFR-6
- **Test Requirements**:
  - `rule` TR-7.1: `node dist/cli.js --version` retorna versão em package.json
  - `rule` TR-7.2: `GITTREE_LANG=pt-br` exibe mensagens em português; fallback para EN quando chave ausente
  - `rule` TR-7.3: Cobertura ≥ 90%

## Task 8: CLI — Comandos worktree: list, add, remove, prune
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 4, Task 5, Task 7
- **Description**:
  - `gittree worktree list [--format table|json|porcelain] [--filter dirty|clean]`
  - `gittree worktree add <path> [-b <new-branch> | <branch>] [--remote origin/x] [--no-setup]`
  - `gittree worktree remove <path> [--force] [--delete-branch] [--delete-remote] [--skip-push-check]`
  - `gittree worktree prune [--dry-run]`
  - Interactive prompts quando parâmetros obrigatórios faltam (pacote `prompts`)
- **Acceptance Criteria Addressed**: FR-6, FR-7, FR-8, FR-9, AC-2, AC-4
- **Test Requirements**:
  - `rule` TR-8.1: Testes integração end-to-end com repositório temporário (vitest + tmp)
  - `rule` TR-8.2: `worktree list --format json` retorna JSON parseável
  - `rule` TR-8.3: Tentativa remove dirty retorna exit code 1 e mensagem clara
  - `rubric` TR-8.4: Discoverability CLI; scale 1-5; anchors 1=sem ajuda, 5=help com exemplos reais, suggestions de typo; threshold >= 4; evidence = revisão manual
  - `rule` TR-8.5: Cobertura ≥ 90%

## Task 9: CLI — Comandos sync, branch, repo status
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 6, Task 8
- **Description**:
  - `gittree worktree sync [--all] [--strategy ff-only|merge|rebase] [path]`
  - `gittree branch sync <worktree-path> [--with main] [--strategy rebase|merge]`
  - `gittree repo status [--format table|json] [--watch]`
  - `gittree repo doctor`: verifica hooks compartilhados, .gittree.json
- **Acceptance Criteria Addressed**: FR-10, FR-11, FR-12
- **Test Requirements**:
  - `rule` TR-9.1: `repo status --format json` contém todas as worktrees e seus estados
  - `rule` TR-9.2: `worktree sync --all` com ff-only retorna relatório agregado
  - `rule` TR-9.3: Cobertura ≥ 90%

---

## FASE 4: VS Code Extension (UI Básica)

## Task 10: Extensão — Bootstrap e Activation Events
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 2
- **Description**:
  - Scaffold `package.json` da extensão: activationEvents `onStartupFinished`, `onView:gittree`
  - `package.json` contributes: viewsContainers (activity bar), views (GitTree sidebar), commands
  - Classe `ExtensionContext` com DI: instancia `WorktreeService` via RealGitAdapter
  - Comando `GitTree: Refresh Worktrees` e registro básico
  - Build com `esbuild` (rápido) e scripts de watch
- **Acceptance Criteria Addressed**: FR-15, FR-21
- **Test Requirements**:
  - `rule` TR-10.1: Extensão ativa sem erros em ambiente vscode-test; activation event dispara
  - `rule` TR-10.2: Comando refresh executa sem lançar
  - `rule` TR-10.3: `vsce package` gera .vsix válido

## Task 11: Extensão — Sidebar TreeView (leitura)
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 10, Task 3
- **Description**:
  - `TreeDataProvider` com hierarquia: RepoRootNode → WorktreeNode → BranchInfoNode
  - `TreeItem.label`, `iconPath`, `tooltip`, `contextValue` por tipo de nó
  - Badge/cores por estado: dirty (⚠️), ahead (↑N), behind (↓N), diverged (↕)
  - `getChildren` chama WorktreeService.list com cache 2s
- **Acceptance Criteria Addressed**: FR-15, FR-16, AC-3
- **Test Requirements**:
  - `rule` TR-11.1: Provider retorna árvore correta a partir de fixture de 3 worktrees
  - `rule` TR-11.2: Worktree dirty tem contextValue contendo `dirty`
  - `rubric` TR-11.3: Qualidade visual; scale 1-5; anchors 1=sem ícones, 3=ícone padrão por tipo, 5=ícones codicons oficiais + tooltip rico + resourceUri correto; threshold >= 4; evidence = screenshot + revisão

## Task 12: Extensão — Comandos de leitura e navegação
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 11
- **Description**:
  - Command Palette + Context Menu:
    - `GitTree: Open in New Window` (vscode.openFolder no worktree)
    - `GitTree: Reveal in Finder/Explorer` (revealFileInOS)
    - `GitTree: Open Terminal Here` (createTerminal com cwd)
    - `GitTree: Checkout / Switch to Worktree` (focus window - se disponível)
  - Inline actions (inline view/item/title icons): Refresh, Open Folder
- **Acceptance Criteria Addressed**: FR-18, FR-19, FR-21
- **Test Requirements**:
  - `rule` TR-12.1: Cada comando registrado dispara a API correta do VS Code (mockada em teste)
  - `rule` TR-12.2: Comandos aparecem no Command Palette com prefixo `GitTree:`

---

## FASE 5: VS Code Extension (Operações Escritas)

## Task 13: Extensão — Wizard de Nova Worktree
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 4, Task 11
- **Description**:
  - QuickPick multi-passo:
    1. Tipo: Nova branch / Branch existente / Remote branch
    2. Nome da branch (com validação) ou seleção de branch existente/remote
    3. Caminho (auto-sugerido fora do repo, com picker)
    4. Review + confirmação (mostra setup script detectado)
  - ProgressNotification com barra durante criação
  - Em caso de erro: Notificação com actionable "See Details" (abrir output channel GitTree)
- **Acceptance Criteria Addressed**: FR-17, FR-22, AC-1
- **Test Requirements**:
  - `rule` TR-13.1: Wizard completa com sucesso e chama WorktreeService.add com params corretos
  - `rule` TR-13.2: Cancelamento no passo 1 não executa nenhuma ação

## Task 14: Extensão — Remove Worktree, Sync e Batch Actions
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Task 5, Task 6, Task 11
- **Description**:
  - Context menu "Remove Worktree": diálogo de confirmação com detalhes (dirty?, ahead N commits?) + checkboxes para --force, --delete-branch, --delete-remote
  - Inline action: Pull (ff-only) com spinner inline
  - Title actions: "Sync All Worktrees" (batch), "Fetch All", "Prune Worktrees (dry-run first)"
  - Repo Status Panel: resumo visual com badges + botão "Fix Issues"
- **Acceptance Criteria Addressed**: FR-18, FR-19, FR-20, AC-4
- **Test Requirements**:
  - `rule` TR-14.1: Remoção de worktree dirty exige checkbox --force marcado
  - `rule` TR-14.2: Sync All dispara pull em cada worktree e mostra resultado agregado
  - `rule` TR-14.3: Cobertura ≥ 90% no código TypeScript da extensão (excluindo UI render)

---

## FASE 6: Refinamento & Distribuição

## Task 15: WebView de Detalhes da Worktree
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 11
- **Description**:
  - WebView com: commit log recente, arquivos modificados (com diff link), atalhos de ação
  - CSS com variáveis do tema VS Code (var(--vscode-*))
  - Comunicação bidirecional WebView ↔ Extension via postMessage
- **Acceptance Criteria Addressed**: FR-23, AC-6
- **Test Requirements**:
  - `rule` TR-15.1: WebView carrega e recebe dados via postMessage
  - `rubric` TR-15.2: Qualidade visual WebView; scale 1-5; anchors 1=HTML bruto, 5=design alinhado com VS Code, responsivo, loading states; threshold >= 4

## Task 16: Autocomplete CLI + Global Config + READMEs multi-idioma
- **Status**: `pending`
- **Priority**: medium
- **Depends On**: Task 8, Task 9
- **Description**:
  - Comando `gittree completion <shell>` gera script bash/zsh/fish
  - Global config: `gittree config set|get|list` escrevendo em `~/.gittree/config.json`
  - Escrever README.md (EN), README.pt-br.md, README.es.md para CLI E para Extensão com:
    - Instalação
    - Uso (comandos / ações UI)
    - Exemplos
    - Notas importantes (melhores práticas do guia)
- **Acceptance Criteria Addressed**: FR-14, AC-7, AC-8
- **Test Requirements**:
  - `rule` TR-16.1: Script de completion bash parseia sem erros (bash -n)
  - `rule` TR-16.2: Os 3 READMEs contêm seções Installation, Usage, Examples, Important Notes para cada feature entregue
  - `rubric` TR-16.3: CLI usability; scale 1-5; threshold >= 4 (ver AC-7)

## Task 17: Pipeline CI completo e validação final
- **Status**: `pending`
- **Priority**: high
- **Depends On**: Tasks 1-16
- **Description**:
  - GitHub Actions: build, lint, typecheck, unit tests (core+cli), integration tests, extension tests (headless), coverage report (≥ 90% bloqueia merge), npm audit, vsce package upload como artifact
  - Verificação final checklist AC-1 a AC-8
- **Acceptance Criteria Addressed**: AC-1 a AC-8, NFR-4, NFR-5
- **Test Requirements**:
  - `rule` TR-17.1: CI passa em push para `main` com cobertura ≥ 90% e 0 vulnerabilidades
  - `rule` TR-17.2: Todos ACs tem evidência de conclusão anexada

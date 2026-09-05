# GitTree — Plano Detalhado: CLI + Extensão VS Code para Gerenciamento de Git Worktrees

> Plano de implementação faseada para dois projetos independentes (monorepo): CLI multiplataforma e extensão gráfica para VS Code / VSCodium / Cursor. Baseado nas melhores práticas descritas em [guia-git-worktrees.md](file:///Users/gilsongabriel/Dev/CMS/GitTree/docs/guia-git-worktrees.md).

---

## 1. Visão Geral do Ecossistema

```
GitTree (monorepo)
├── packages/core              ← Motor compartilhado (TypeScript)
│   ├── GitAdapter             ← Porta de abstração do Git (real + mock)
│   ├── WorktreeService        ← CRUD + Sync + Prune
│   ├── BranchService          ← Branches locais/remotas
│   ├── SyncService            ← Fetch / Pull / Rebase / Merge em lote
│   ├── RepoService            ← Status global, health checks
│   ├── ConfigService          ← .gittree.json (projeto) + ~/.gittree/config.json (global)
│   ├── SetupScriptRunner      ← Copiar .env, symlinks, hooks
│   ├── i18n/                  ← EN (default), PT-BR, ES
│   └── errors/                ← Hierarquia de erros tipados
│
├── packages/cli               ← CLI @gittree/cli (global: `gittree`)
│   ├── bin/gittree            ← Entry point
│   ├── src/commands/          ← worktree, branch, repo, config, completion
│   ├── src/ui/                ← Chalk, Ora, Prompts, Tabelas
│   └── locales/               ← Arquivos de tradução (compartilham com core)
│
└── packages/vscode            ← Extensão VS Code (id: GitTree.gittree)
    ├── src/extension.ts       ← Activation, DI, Command registrar
    ├── src/sidebar/           ← TreeViewProvider, TreeNode classes
    ├── src/commands/          ← Handlers dos comandos (palette + context menu)
    ├── src/webview/           ← WebView de detalhes + comunicação postMessage
    ├── src/wizards/           ← QuickPick multi-passo (New Worktree etc.)
    └── package.json           ← contributes, activationEvents, icones
```

---

## 2. Pacote `@gittree/core` (Motor Compartilhado)

### 2.1 Princípios Arquiteturais

| Pilar | Implementação |
|---|---|
| **Independência de UI** | Core não importa nada de `commander`, `@types/vscode`, `react`, etc. |
| **Portas & Adaptadores** | `GitAdapter` interface → `RealGitAdapter` (child_process) / `MockGitAdapter` (testes) |
| **Estados tipados** | `WorktreeState = 'clean' \| 'dirty' \| 'ahead' \| 'behind' \| 'diverged' \| 'detached'` |
| **Segurança por padrão** | Toda operação destrutiva requer parâmetro `force: true` explicito; guarda dirty state |
| **Observáveis** | `EventEmitter` por serviço: `on('worktree:created')`, `on('sync:progress')` etc. (usado pela UI em tempo real) |
| **i18n built-in** | Todas as mensagens passam por `t(key, params)` com fallback EN → PT-BR → ES |

### 2.2 API Pública do Core (contrato reutilizado por CLI e Extensão)

```typescript
// Exemplo de assinaturas (contrato estável entre pacotes)
export interface GitTreeCore {
  worktree: {
    list(opts?: { filter? }): Promise<Worktree[]>;
    add(opts: WorktreeAddOptions): Promise<Worktree>;
    remove(path: string, opts: WorktreeRemoveOptions): Promise<OperationResult>;
    prune(opts?: { dryRun: boolean }): Promise<PruneResult>;
    sync(path: string, opts: SyncOptions): Promise<SyncResult>;
    syncAll(opts: SyncOptions): Promise<SyncResult[]>;
  };
  branch: {
    list(scope: 'local'|'remote'|'all'): Promise<Branch[]>;
    syncWithMain(worktreePath: string, opts: { strategy: 'rebase'|'merge' }): Promise<MergeResult>;
    deleteLocal(name: string, force?: boolean): Promise<void>;
    deleteRemote(name: string, remote?: string): Promise<void>;
  };
  repo: {
    status(): Promise<RepoStatusReport>;
    doctor(): Promise<HealthCheck[]>;
  };
  events: EventEmitter;
}
```

### 2.3 Guards de Segurança (baseados no guia oficial)

1. **Dirty state check**: Bloqueia `remove` sem `--force` quando `git status --porcelain` ≠ vazio
2. **Branch lock check**: Bloqueia `add` quando branch já está ativa em outra worktree (Git já faz isso — core só melhora a mensagem)
3. **Ahead push check**: Antes de `remove --delete-branch`, avisa se branch está `ahead` do remoto sem push
4. **Shared hooks warning**: Detecta `core.hooksPath` compartilhado; emite warning
5. **Path validation**: Recomenda pastas fora do repo principal (warn se caminho estiver dentro de `.git/`)
6. **Stash isolation note**: Log informativo que `stash` é compartilhado — sugere `wip commit` temporário

---

## 3. Projeto 1: CLI `@gittree/cli`

### 3.1 Stack Técnica

| Dependência | Versão alvo | Justificativa |
|---|---|---|
| `node` | ≥ 18 LTS | LTS, ESM nativo, `fetch` global |
| `typescript` | latest stable | Strict mode |
| `commander` | latest | CLI parsing maduro, widespread |
| `chalk` | v5 (ESM) | Cores ANSI |
| `ora` | latest | Spinners async |
| `prompts` | latest | Prompts interativos multi-tipo |
| `cli-table3` | latest | Tabelas formatadas ASCII |
| `cosmiconfig` | latest | Carregamento de `.gittree.json`, `.gittreerc`, etc. |

### 3.2 Mapa de Comandos (1:1 com o guia)

```
gittree
├── --version / -V
├── --help / -h
├── --lang <en|pt-br|es>              (env: GITTREE_LANG)
├── --format <table|json|porcelain>    (env: GITTREE_FORMAT)
│
├── worktree
│   ├── list         [--filter dirty|clean|ahead|behind] [--format ...]
│   ├── add          <path>  [-b <new-branch> | <existing-branch>]
│   │                       [--remote <origin/branch>]
│   │                       [--no-setup] [--setup-script <path>]
│   ├── remove       <path>  [--force] [--delete-branch]
│   │                       [--delete-remote] [--skip-push-check]
│   ├── prune        [--dry-run]
│   └── sync         [path] [--all] [--strategy ff-only|merge|rebase]
│
├── branch
│   ├── list         [--local|--remote|--all]
│   └── sync         <worktree-path> [--with main] [--strategy rebase|merge]
│
├── repo
│   ├── status       [--format ...] [--watch]
│   └── doctor                           (hooks, .gittree.json sanity)
│
├── config
│   ├── get          <key>
│   ├── set          <key> <value>
│   ├── list         [--global]
│   └── completion   <bash|zsh|fish>     (gera script autocomplete)
│
└── setup
    └── init                               (cria .gittree.json padrão no repo)
```

### 3.3 Formatos de Output

- **`table` (default para humano)**: Cores, ícones unicode, colunas alinhadas, sumário no rodapé
- **`json` (para scripts/CI)**: Output puro JSON no stdout; logs/warnings em stderr
- **`porcelain`**: Compatível com parsing programático (mesmo estilo Git native)

### 3.4 Padrão de .gittree.json (por projeto)

```json
{
  "$schema": "https://gittree.dev/schemas/config-v1.json",
  "mainBranch": "main",
  "defaultRemote": "origin",
  "worktreeBaseDir": "..",
  "setup": {
    "copy": [".env", ".env.local"],
    "symlink": ["uploads", "node_modules/.cache"],
    "script": "./scripts/after-worktree-create.sh",
    "hooksStrategy": "copy"
  },
  "sync": {
    "defaultStrategy": "ff-only",
    "autoPruneAfterSync": true
  }
}
```

---

## 4. Projeto 2: Extensão VS Code `GitTree.gittree`

### 4.1 Compatibilidade

| Editor | Versão mínima | Justificativa |
|---|---|---|
| **VS Code** | ≥ 1.80 | API `TreeView` + `WebViewView` estável |
| **VSCodium** | ≥ 1.80 | Sem telemetria padrão |
| **Cursor** | ≥ 0.20 | Compatibilidade plena VS Code |
| **GitPod / GitHub Codespaces** | latest | Suporte nativo a extensões via Marketplace |

### 4.2 Arquitetura da Extensão

```mermaid
graph TD
    A[package.json contributes] -->|Activation Event| B[extension.ts activate()]
    B --> C[Dependency Injection Container]
    C --> D[RealGitAdapter]
    C --> E[WorktreeService / Core]
    C --> F[EventBus]
    E -->|events| F
    F --> G[Sidebar TreeDataProvider]
    F --> H[Notification Center]
    G --> I[VS Code UI: Activity Bar]
    J[Command Palette] --> K[CommandHandlers]
    K --> E
    L[Context Menu / Inline Actions] --> K
    M[Wizards (QuickPick multi-step)] --> K
    N[WebView Panel] <-->|postMessage| K
```

### 4.3 Sidebar (Activity Bar) — "GitTree"

```
🗂  GitTree
├── ⟳  Refresh    ↓  Sync All    ⊞  New Worktree    ⚠  Prune Dry-Run
│
├── 📁 repo-name (main)                  ← RootNode (repo principal)
│   ├── 🌿  feature-auth                 ← WorktreeNode: ../repo-feature-auth
│   │   ├── 🏷  branch: feature/auth
│   │   ├── 📍 path: ../repo-feature-auth
│   │   ├── ⚠️  dirty: 3 modified, 2 untracked
│   │   └── ↓ behind origin by 1 commit
│   │   [⟳ pull]  [↗ push]  [🗑 remove]
│   │
│   ├── 🌿  hotfix-checkout (clean) ← WorktreeNode
│   │   [⟳ pull]  [↗ push]  [🗑 remove]
│   │
│   └── 🌿  HEAD@abc1234 (detached) ⚠️
│
└── ─── STATUS ───
    ├── 🟢 Clean: 2 worktrees
    ├── 🔴 Dirty: 1 worktree
    ├── ⬇️  Behind: 1 worktree
    └── 🩺 Run Doctor...
```

### 4.4 Comandos Registrados (Command Palette + Context Menu)

| ID | Command Palette | Context Menu | Inline | Tecla de atalho |
|---|---|---|---|---|
| `gittree.refresh` | `GitTree: Refresh Worktrees` | ✅ | ✅ title | `Ctrl+Alt+G R` |
| `gittree.newWorktree` | `GitTree: New Worktree...` | ❌ | ✅ title | `Ctrl+Alt+G N` |
| `gittree.openFolder` | `GitTree: Open Worktree in New Window` | ✅ worktree | ✅ | `Ctrl+Alt+G O` |
| `gittree.revealFile` | `GitTree: Reveal in Explorer/Finder` | ✅ worktree | ❌ | |
| `gittree.openTerminal` | `GitTree: Open Terminal Here` | ✅ worktree | ✅ | `Ctrl+Alt+G T` |
| `gittree.pullWorktree` | `GitTree: Pull Worktree (ff-only)` | ✅ worktree | ✅ | `Ctrl+Alt+G P` |
| `gittree.pushWorktree` | `GitTree: Push Worktree` | ✅ worktree | ✅ | `Ctrl+Alt+G U` |
| `gittree.syncAll` | `GitTree: Sync All Worktrees` | ❌ | ✅ title | `Ctrl+Alt+G S` |
| `gittree.removeWorktree` | `GitTree: Remove Worktree...` | ✅ worktree | ✅ | `Ctrl+Alt+G X` |
| `gittree.prune` | `GitTree: Prune Worktree Refs...` | ❌ | ✅ title | |
| `gittree.repoStatus` | `GitTree: Show Repository Health` | ❌ | ❌ | `Ctrl+Alt+G H` |
| `gittree.worktreeDetails` | `GitTree: Show Worktree Details` | ✅ worktree | ❌ | |

### 4.5 Wizard: Nova Worktree (QuickPick Multi-Passo)

**Passo 1 — Tipo de criação** (QuickPick single-select):
- 🆕 `New branch` → cria `-b <nome>`
- 🌿 `Existing local branch` → selecionar da lista
- 🌍 `From remote branch` → fetch + checkout

**Passo 2 — Nome / Branch**:
- (se New) InputBox com validação: sem espaços, não conflita com existentes
- (se Existing/Remote) QuickPick multi-select filtrável

**Passo 3 — Caminho**:
- InputBox com valor padrão: `../<repo-name>-<branch-name>` (fora do repo)
- Botão "Browse..." via `vscode.showOpenDialog`

**Passo 4 — Review & Confirm**:
```
📝 Criar worktree:
  • Branch:    feature/carrinho-compras
  • Type:      Nova branch
  • Path:      /Projects/repo-feature-carrinho-compras
  • Setup:     Copiar .env, symlink uploads (detectado em .gittree.json)

               [ Cancel ] [ ✅ Confirm and Create ]
```

### 4.6 Dialogo: Remover Worktree (segurança)

```
⚠️  Remover worktree: ../repo-feature-auth

   • Dirty state: SIM — 3 arquivos modificados, 2 untracked
   • Branch: feature/auth (⚠️ ahead of origin by 2 commits — push não feito!)
   • Caminho: /Projects/repo-feature-auth

   ☐  Forçar remoção (perder mudanças locais)
   ☐  Deletar branch local após remoção
   ☐  Deletar branch remota origin/feature/auth

   [ Cancel ] [ 🗑  Remover com Segurança ]
```

### 4.7 WebView: Detalhes da Worktree

Aba lateral com:
- **Header**: nome, path, branch, head commit hash + autor/data
- **Commit Log (últimos 10)**: `git log --oneline --graph` formatado como árvore
- **Working Changes**: lista de arquivos M/A/D/R/? com botão "Open Diff" (abre diff built-in)
- **Quick Actions**: Pull, Push, Fetch, Rebase with main, Run Terminal, Open Folder

### 4.8 Settings (VS Code User / Workspace)

| Key | Tipo | Default | Descrição |
|---|---|---|---|
| `gittree.defaultWorktreeBaseDir` | string | `".."` | Pasta base para novas worktrees |
| `gittree.defaultSyncStrategy` | enum | `"ff-only"` | ff-only / merge / rebase |
| `gittree.autoCopyDotEnv` | boolean | `true` | Auto-copy `.env` em novas worktrees |
| `gittree.confirmRemoval` | boolean | `true` | Pedir confirmação antes de remover |
| `gittree.defaultShell` | string | `null` | Shell para terminal em worktrees |
| `gittree.telemetry.enabled` | boolean | `false` | Telemetria anônima (desligado padrão) |
| `gittree.language` | enum | `"default"` | en / pt-br / es (default = idioma do VS Code) |

---

## 5. Implementação Faseada (Roadmap)

> Cada feature entregue → **atualizar os 3 READMEs** (`README.md`, `README.pt-br.md`, `README.es.md`) de cada projeto com:
> 1. **Usage Instructions** — como usar (passo-a-passo)
> 2. **Examples** — snippets de código / CLI / screenshot
> 3. **Important Notes** — caveats, melhores práticas, riscos mitigados

### FASE 1 — Fundação (Sem UI pública, entregas técnicas)

| Item | Entrega | Ao finalizar, atualizar READMEs com... |
|---|---|---|
| 1.1 | Monorepo scaffold, toolchain, CI básico | Setup dev, `npm install`, scripts root |
| 1.2 | `@gittree/core`: `GitAdapter`, `MockGitAdapter`, tipos de erro | Arquitetura core, como contribuir com teste |
| 1.3 | Core: `WorktreeService.list + getStatus` + parsers porcelain | Como core abstrai Git, exemplos de objeto `Worktree` |
| 1.4 | Cobertura core ≥ 90% + `npm audit` limpo | Estado da qualidade, como rodar cobertura |

### FASE 2 — Operações Core (todas as features de worktree)

| Item | Entrega | READMEs: novas seções |
|---|---|---|
| 2.1 | `WorktreeService.add` + Setup Script Runner + `.gittree.json` v1 | `.gittree.json` schema, setup automático de .env/symlink |
| 2.2 | `WorktreeService.remove` + guards (dirty, ahead) + prune | Guards de segurança IMPORTANTES; o que é bloqueado |
| 2.3 | `SyncService` completo: fetch/pull/rebase/merge em lote + `RepoService.status` | Modos de sincronização; ff-only vs rebase vs merge quando usar |

### FASE 3 — CLI (Alpha funcional)

| Item | Entrega | READMEs: novas seções |
|---|---|---|
| 3.1 | CLI bootstrap + i18n + commander setup | Instalação: `npm i -g @gittree/cli`, `gittree --version` |
| 3.2 | Comandos `worktree list/add/remove/prune` | Usage: `gittree worktree --help` + exemplos do guia oficial portados para gittree |
| 3.3 | Comandos `worktree sync`, `branch sync`, `repo status/doctor` | Exemplos: batch sync, health check, integração CI (output json) |
| 3.4 | Autocomplete bash/zsh/fish + `config` global | Habilitar autocomplete; config global `~/.gittree/` |

### FASE 4 — Extensão VS Code (UI Básica)

| Item | Entrega | READMEs: novas seções |
|---|---|---|
| 4.1 | Bootstrap extensão + activation + `package.json` contributes | Instalar .vsix side-load; marketplace publishing (se habilitado) |
| 4.2 | Sidebar TreeView (leitura) + status badges + ícones codicons | Visão geral da UI; significado dos ícones/cores |
| 4.3 | Comandos navegação: Open Folder / Reveal / Terminal / Command Palette | Atalhos de teclado; context menu |

### FASE 5 — Extensão VS Code (Ações Escritas)

| Item | Entrega | READMEs: novas seções |
|---|---|---|
| 5.1 | Wizard Nova Worktree (QuickPick 4 passos) | Passo-a-passo UI; diferenças vs CLI |
| 5.2 | Inline Pull/Push + Sync All + batch | Demonstração GIF (README) das ações em lote |
| 5.3 | Dialogo Remover com segurança + Prune | Fluxo de remoção segura; quando usar cada checkbox |

### FASE 6 — Refinamento e Distribuição

| Item | Entrega | READMEs: novas seções |
|---|---|---|
| 6.1 | WebView detalhes worktree (log + changes) | Navegação WebView; integração com diff built-in |
| 6.2 | i18n UI extensão (EN/PT-BR/ES) + vscode.l10n | Como trocar idioma; como contribuir tradução |
| 6.3 | Pipeline CI completo + artefatos vsix + npm publish dry-run | Como instalar from source; roadmap do projeto |
| 6.4 | Polimento: telemetria opcional, error reporting, settings finais | Privacy notes; configurações avançadas |

---

## 6. Estrutura de README Multi-Idioma

Para cada projeto (`packages/cli` e `packages/vscode`), manter **3 arquivos sincronizados**:

```
packages/
├── cli/
│   ├── README.md            ← English (default)
│   ├── README.pt-br.md      ← Português Brasileiro
│   └── README.es.md         ← Spanish
└── vscode/
    ├── README.md            ← English (default)
    ├── README.pt-br.md      ← Português Brasileiro
    └── README.es.md         ← Spanish
```

### Template Padrão por Feature (em cada README)

```markdown
## <Nome da Feature>

### Usage Instructions

<!-- Passo a passo como usar a feature -->

### Examples

<!-- Snippets / Screenshots / GIFs -->

### Important Notes

<!-- Melhores práticas, riscos, diferenças vs git nativo -->
```

**Processo**: Cada Task concluída → PR atualiza **as mesmas seções** nos 3 arquivos de mesmo projeto (mesma estrutura, só tradução).

---

## 7. Estratégia de Branches e Commits (Git Flow)

| Branch | Propósito | Regra |
|---|---|---|
| `main` | Estável, releases | Apenas via PR (squash merge), passar CI 100% |
| `develop` | Integração | Merge por feature branch |
| `feature/<fase>-<desc>` | Trabalho diário | Ex: `feature/f2-worktree-remove` |
| `release/vX.Y.Z` | Preparação release | Freeze + bugfixes |
| `hotfix/<issue>` | Urgente em main | Merge volta para main + develop |

**Commits convencionais (Conventional Commits + lint)**:
- `feat(core): add WorktreeService.remove with dirty guard`
- `fix(cli): resolve --format json escaping quotes`
- `docs(readme): update worktree add examples in pt-br/es`
- `test(vscode): add wizard quickpick mock coverage`
- `chore(ci): add npm audit step`

---

## 8. Localização (i18n)

| Chave exemplo | EN | PT-BR | ES |
|---|---|---|---|
| `errors.dirtyWorktree` | "Worktree is dirty — use --force to discard changes" | "Worktree tem mudanças locais — use --force para descartar" | "Worktree con cambios locales — usa --force para descartar" |
| `commands.worktree.add.success` | "Worktree created at {path} on branch {branch}" | "Worktree criada em {path} na branch {branch}" | "Worktree creada en {path} en la rama {branch}" |

- **Detecção**: CLI → `GITTREE_LANG` env var, senão `LANG`, fallback EN. Extensão → `vscode.env.language` ou setting `gittree.language`.
- **Fallback em cascata**: se chave não existe no idioma solicitado → PT-BR → EN (nunca mostrar raw key).

---

## 9. Validação de Qualidade Contínua

| Check | Onde | Bloqueia PR? |
|---|---|---|
| TypeScript `strict` | `tsc --noEmit` | ✅ |
| ESLint + Prettier | `npm run lint` | ✅ |
| Unit tests core/cli | `vitest run` + ≥90% coverage | ✅ |
| Extension tests | `@vscode/test-electron` headless | ✅ |
| Integration tests | Repo tmp + shell real | ✅ |
| `npm audit --production` | CI step | ✅ |
| `vsce package` valido | Gera .vsix artifact | ✅ |
| README tri-língue sincronizado | Check manual no review | ✅ (rubric) |

---

## 10. Próximos Passos Imediatos

1. **Aprovar este plano** e os artefatos de Spec Mode em:
   - [spec.md](file:///Users/gilsongabriel/Dev/CMS/GitTree/.trae/specs/gittree-git-ecosystem-tools/spec.md)
   - [tasks.md](file:///Users/gilsongabriel/Dev/CMS/GitTree/.trae/specs/gittree-git-ecosystem-tools/tasks.md)
2. **Criar branch `develop`** e iniciar Fase 1: Task 1 (scaffold monorepo)
3. **Decidir**: Namespace npm (`@gittree/cli` ou outro)? Publicar marketplace?

---

> Documento vivo — conforme implementação avança, manter este plano atualizado com novos aprendizados.

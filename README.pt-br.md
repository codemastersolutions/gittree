# GitTree

> **Status**: Fase 1 — Bootstrap do Core Engine
>
> Monorepo multi-pacote contendo duas ferramentas de gerenciamento de Git worktrees:
> - **`@gittree/cli`** — Interface de linha de comando para terminal e CI/CD
> - **`GitTree` (extensão VS Code)** — Sidebar gráfica e wizards para VS Code / VSCodium / Cursor / Gitpod
>
> Ambas consomem o motor compartilhado **`@gittree/core`**, que encapsula o Git com contratos tipados, guards de segurança e internacionalização.

---

## Instruções de Uso

### Pré-requisitos

- **Git** `>= 2.24` (verifique com `git --version`)
- **Node.js** `>= 18` (recomendado LTS 20.x)
- **npm** `>= 9` (empacotado com Node 18)

### Setup (Desenvolvimento)

```bash
git clone <este-repo>
cd GitTree

# Instala todas as dependências do workspace (core, cli, vscode)
npm install

# Executa verificação de tipos TypeScript em todos pacotes
npm run typecheck

# Executa ESLint + checagem de formatação Prettier
npm run lint
npm run format

# Executa suíte completa de testes unitários (core + cli, >= 90% cobertura)
npm run test
npm run test:coverage

# Faz build de todos pacotes na ordem correta (core primeiro)
npm run build
```

### Exemplos

```bash
# Instala CLI globalmente a partir do build local (após npm run build)
npm link -w @gittree/cli
gittree --version

# Executa testes do core em modo watch durante o desenvolvimento
npm run test:watch -- --project core

# Linta e auto-corrige tudo antes de commitar
npm run lint:fix
npm run format
```

### Notas Importantes

- **TypeScript Strict**: todo código-fonte é compilado com modo `strict` (null checks, no implicit any, exaustividade em switches). PRs que falham em `tsc --noEmit` são bloqueadas.
- **Workspaces**: use `npm -w @gittree/core <cmd>` para rodar comandos dentro de um pacote específico. Nunca entre manualmente na pasta e rode `npm install`.
- **Hooks do Husky**:
  - `pre-commit` executa `lint-staged` (ESLint fix + Prettier nos arquivos staged)
  - `commit-msg` valida o formato Conventional Commits via `commitlint` (scopes: `core`, `cli`, `vscode`, `repo`, `ci`, `deps`, `docs`, `readme`, `test`)
- **Porta de Cobertura**: o CI força cobertura >= 90% para `packages/core/src` e `packages/cli/src`. Cobertura abaixo quebra o build.
- **Porta de Auditoria**: `npm audit --production` deve retornar zero vulnerabilidades high/critical em todo PR.
- **Regra README Tri-língue**: toda feature entregue em uma fase **deve** atualizar os 3 arquivos README de seu projeto (`README.md`, `README.pt-br.md`, `README.es.md`) com Instruções de Uso, Exemplos e Notas Importantes.

---

## Estrutura do Monorepo

```
GitTree/
├── .github/workflows/ci.yml     ← Lint · Typecheck · Testes · Cobertura · Build · Segurança
├── .husky/                      ← Hooks pre-commit + commit-msg
├── docs/
│   ├── guia-git-worktrees.md    ← Melhores práticas oficiais (fonte PT-BR)
│   └── plano-gittree-cli-extensao-vscode.md  ← Roadmap completo de implementação
├── packages/
│   ├── core/                    ← @gittree/core — Motor compartilhado
│   │   ├── README.md / README.pt-br.md / README.es.md
│   │   └── src/
│   │       ├── index.ts         ← Superfície de API pública
│   │       ├── adapters/        ← GitAdapter (Real + Mock)
│   │       ├── services/        ← WorktreeService, BranchService, SyncService…
│   │       ├── errors/          ← Hierarquia tipada de erros
│   │       └── locales/         ← JSON de tradução en / pt-br / es
│   ├── cli/                     ← @gittree/cli — CLI
│   │   ├── bin/gittree.js       ← Ponto de entrada binário
│   │   ├── README.md / README.pt-br.md / README.es.md
│   │   └── src/
│   └── vscode/                  ← GitTree — Extensão VS Code
│       ├── package.json         ← contributes, activationEvents, configurações
│       ├── README.md / README.pt-br.md / README.es.md
│       └── src/
├── eslint.config.mjs
├── vitest.config.ts             ← Testes unitários + cobertura
├── vitest.integration.config.ts ← Testes de integração (repo tmp + git real)
└── tsconfig.base.json           ← Base TypeScript strict + aliases de path
```

---

## Scripts (root `package.json`)

| Script | Descrição |
|---|---|
| `npm run build` | Build core → cli → vscode (ordem topológica correta) |
| `npm run dev` | Watch-build dos 3 pacotes em paralelo |
| `npm run typecheck` | `tsc --noEmit` em todos workspaces |
| `npm run lint` | ESLint em `packages/*/src/**/*.ts` |
| `npm run lint:fix` | Auto-correção ESLint |
| `npm run format` | Auto-formatação Prettier |
| `npm run format:check` | Dry-run Prettier (usado no CI) |
| `npm run test` | Testes unitários (core + cli) |
| `npm run test:watch` | Testes unitários modo watch |
| `npm run test:coverage` | Testes unitários + relatório cobertura (>= 90%) |
| `npm run test:integration` | Testes de integração (repositórios git reais) |
| `npm run audit` | `npm audit --production` (porta de segurança) |
| `npm run clean` | Remove todos `dist`, `node_modules` |
| `npm run prepare` | Instala hooks Husky (roda automaticamente após `npm install`) |

---

## Conventional Commits (Scopes)

```
feat(core): adiciona WorktreeService.remove com guard dirty
fix(cli): escapa aspas no output --format json
docs(readme): atualiza instruções de instalação em pt-br e es
test(vscode): adiciona fixture TreeView provider
chore(ci): adiciona step npm audit ao workflow
```

Scopes válidos: `core`, `cli`, `vscode`, `repo`, `ci`, `deps`, `docs`, `readme`, `test`.

---

## Roadmap

Veja o plano faseado completo em **[docs/plano-gittree-cli-extensao-vscode.md](docs/plano-gittree-cli-extensao-vscode.md)**.

Fase atual: **Fase 1 — Bootstrap & Core Engine**
- ✅ Scaffold monorepo, toolchain, CI base, portas de qualidade, hooks husky
- 🔧 Core engine: GitAdapter + tipos + parsers (Tarefa 2 · Tarefa 3)

---

## Licença

MIT

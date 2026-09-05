# GitTree - Git Ecosystem Tools - Product Requirements Document

## Overview

- **Summary**: Criação de duas ferramentas complementares para gerenciamento do ecossistema Git com foco em worktrees: (1) uma extensão para VS Code (e editores compatíveis) com interface gráfica via sidebar, e (2) uma CLI multiplataforma com os mesmos comandos. Ambas as ferramentas abstraem a complexidade dos comandos Git de worktree, branch, sync e limpeza, aplicando as melhores práticas documentadas.
- **Purpose**: Democratizar e acelerar o uso de git worktrees, reduzindo erros humanos, automatizando tarefas repetitivas e fornecendo interface visual/CLI padronizada seguindo o guia oficial do projeto.
- **Target Users**: Desenvolvedores que usam Git diariamente, especialmente equipes que lidam com múltiplas branches em paralelo (features, hotfixes, code reviews).

## Goals

- Gerenciar worktrees (criar, listar, remover, prune) de forma segura e intuitiva
- Gerenciar branches locais e remotas associadas às worktrees
- Automatizar sincronização e atualização de worktrees em lote
- Fornecer validações de segurança antes de operações destrutivas
- Dashboard visual na sidebar da extensão com status em tempo real
- CLI consistente com a extensão, suportando scripts e CI
- Documentação de cada feature em 3 idiomas (EN, PT-BR, ES)

## Non-Goals

- Substituir extensões de Git completas (GitLens, etc.) — foco exclusivo em worktree e operações correlatas
- Implementar cliente de diff/merge gráfico completo
- Suporte a sistemas de versionamento diferentes de Git
- Integração com GitHub/GitLab API (issues, PRs) além de operações básicas de push/pull
- Gerenciamento de monorepos ou submódulos em fase inicial

## Background & Context

- Guia oficial do projeto: [guia-git-worktrees.md](file:///Users/gilsongabriel/Dev/CMS/GitTree/docs/guia-git-worktrees.md) define as melhores práticas, riscos e fluxos completos
- Estrutura do repositório GitTree: `/Users/gilsongabriel/Dev/CMS/GitTree/` atualmente contém apenas a documentação
- Padrão de qualidade: código em inglês, testes com ≥90% de cobertura, lint seguro, sem dependências depreciadas
- Dois projetos independentes: `packages/gittree-cli` e `packages/gittree-vscode` (monorepo)

## Functional Requirements

### Core Engine (Compartilhado)

- **FR-1**: Core engine em TypeScript que encapsula toda a lógica de worktrees, reutilizável por CLI e extensão
- **FR-2**: Mapeamento 1:1 com cada comando do guia oficial, com validações e guards de segurança
- **FR-3**: Sistema de eventos/observáveis para notificar UI sobre mudanças de estado
- **FR-4**: Logging estruturado com níveis (debug, info, warn, error)
- **FR-5**: Tratamento de erros padronizado com mensagens multilíngues

### CLI (`gittree-cli`)

- **FR-6**: Comando `worktree add` com suporte a `-b <branch>`, `<branch-existente>`, `<remote/branch>` e flags `--path`, `--setup-script`
- **FR-7**: Comando `worktree list` com output formatado (table, json, porcelain) e filtros
- **FR-8**: Comando `worktree remove` com flags `--force`, `--delete-branch`, `--delete-remote`, `--skip-push-check`
- **FR-9**: Comando `worktree prune` com flag `--dry-run`
- **FR-10**: Comando `worktree sync` (atualização em lote com ff-only e relatório de conflitos)
- **FR-11**: Comando `branch sync` (rebase/merge com main/master por worktree)
- **FR-12**: Comando `repo status` (panorama geral de todas as worktrees: sujo, ahead, behind, divergido)
- **FR-13**: Sistema de setup scripts (copiar .env, symlinks, hooks) configurável via arquivo `.gittree.json`
- **FR-14**: Suporte a configuração por projeto (`.gittree.json`) e global (`~/.gittree/config.json`)

### VS Code Extension (`gittree-vscode`)

- **FR-15**: Sidebar dedicada ("GitTree") com árvore hierárquica de Repositório → Worktrees → Branches
- **FR-16**: Nós interativos: status visual (dirty, clean, ahead, behind), badge de branch atual
- **FR-17**: Botão "New Worktree" com wizard multi-passo (escolher branch/tipo, caminho, setup)
- **FR-18**: Context menu por worktree: Open in New Window, Reveal in Finder/Explorer, Terminal, Remove, Sync
- **FR-19**: Action buttons (inline) em cada worktree: Fetch, Pull, Push, Checkout (navigate)
- **FR-20**: Painel "Repo Status" com indicadores de saúde e ações em lote (Sync All, Prune, Fetch All)
- **FR-21**: Comandos Command Palette (`Ctrl+Shift+P`) prefixados por `GitTree:`
- **FR-22**: Notificações nativas do VS Code com progresso e opção "Undo" para operações seguras
- **FR-23**: WebView de detalhes de worktree com log de commits, arquivos modificados e atalhos
- **FR-24**: Configurações do Workspace/User do VS Code para todas as preferências

## Non-Functional Requirements

- **NFR-1**: Segurança — nenhuma operação destrutiva executa sem confirmação explícita (ou `--force`/flag). Hooks compartilhados são detectados e warnados.
- **NFR-2**: Performance — listagem de worktrees < 100ms para até 50 worktrees; uso de `--porcelain` e cache curto (2s)
- **NFR-3**: Portabilidade — CLI roda em macOS, Linux, Windows (PowerShell/WSL); extensão compatível com VS Code ≥ 1.80, Cursor, VSCodium
- **NFR-4**: Qualidade de código — TypeScript strict, ESLint + Prettier, cobertura de testes ≥ 90% (core engine + CLI)
- **NFR-5**: Sem dependências depreciadas ou com vulnerabilidades conhecidas (verificação via `npm audit` em CI)
- **NFR-6**: Internacionalização — UI da extensão e mensagens da CLI suportam EN (default), PT-BR, ES
- **NFR-7**: Testabilidade — core engine depende de interface `GitAdapter` para permitir mock em testes unitários
- **NFR-8**: Observabilidade — extensão envia telemetria anônima opcional (desligada por padrão)

## Constraints

- **Technical**: Linguagem TypeScript para ambos os projetos. Extensão usa a API oficial do VS Code (`@types/vscode`). CLI usa `commander` ou `cac` + `chalk` + `ora` + `prompts`.
- **Business**: Código em inglês, mensagens de retorno e documentação em PT-BR (idioma do usuário), READMEs multi-idioma.
- **Dependencies**: Git versão ≥ 2.24 instalado no sistema (primeira feature detecta e valida versão). Não requer Node > 18 LTS.

## Assumptions

- Usuário tem Git instalado e disponível no PATH
- Repositório Git já inicializado (a extensão detecta a pasta root do workspace)
- Permissões de leitura/escrita nos diretórios das worktrees
- Para Windows, WSL2 ou Git Bash é preferencial

## Acceptance Criteria

### AC-1: Core Engine abstrai comandos Git worktree de forma independente de UI

- **Type**: `rule`
- **Given**: Um repositório Git válido com 0+ worktrees
- **When**: Core engine executa operação de add/list/remove/prune/sync via GitAdapter
- **Then**: Retorna objetos tipados (`Worktree[]`, `OperationResult`) e nunca executa operação destrutiva sem flag `force: true`
- **Pass Condition**: Testes unitários passam 100% com mock GitAdapter; audit do npm retorna 0 vulnerabilidades
- **Evidence**: `npm run test -- packages/core` com cobertura ≥ 90% + `npm audit --production` = 0

### AC-2: CLI pode executar o fluxo completo de worktree sem intervenção (com flags)

- **Type**: `rule`
- **Given**: Repositório Git com worktree principal e branch `feature-demo` remota
- **When**: Executar sequência: `gittree worktree add ../demo feature-demo` → `gittree repo status --format json` → `gittree worktree remove ../demo --delete-branch --force`
- **Then**: Cada comando retorna exit code 0; JSON de status exibe estados corretos; após remove a worktree não aparece na lista
- **Pass Condition**: Teste de integração com repositório temporário (`tmp`/`testcontainers`) passa
- **Evidence**: `npm run test:integration` suite CLI passa

### AC-3: Extensão VS Code exibe sidebar e executa operações via Command Palette

- **Type**: `rule`
- **Given**: Workspace VS Code aberto em repo Git, extensão ativada
- **When**: Usuário clica em ícone GitTree e executa `GitTree: List Worktrees`
- **Then**: Sidebar renderiza árvore de worktrees com ícones corretos; comando retorna lista via toast
- **Pass Condition**: `vscode-test` suite de extensão passa; ativação ocorre sem erros no console de desenvolvedor
- **Evidence**: `npm run test:extension` passa

### AC-4: Operações destrutivas exigem confirmação e detectam estado sujo

- **Type**: `rule`
- **Given**: Worktree com arquivos não commitados (estado `dirty`)
- **When**: Tentar `worktree remove` sem `--force` / sem confirmação na UI
- **Then**: Operação é abortada com mensagem clara listando arquivos modificados; exit code diferente de 0
- **Pass Condition**: Testes unitários verificam bloqueio em 100% dos casos de dirty state
- **Evidence**: Suite de testes do core com cenário dirty passa

### AC-5: Setup scripts e arquivo .gittree.json configuram ambiente automaticamente

- **Type**: `rule`
- **Given**: Repo com `.gittree.json` contendo `setup: { copy: [".env"], symlink: ["uploads"] }`
- **When**: Criar nova worktree via CLI ou extensão
- **Then**: `.env` é copiado; `uploads` recebe symlink relativo; operação reporta sucesso
- **Pass Condition**: Após add, filesystem possui os arquivos/symlinks esperados; teste de integração valida
- **Evidence**: Teste de integração com setup script passa

### AC-6: UI / UX da extensão segue padrões VS Code e é responsiva

- **Type**: `rubric`
- **Dimension**: Qualidade visual e interação da extensão
- **Scale**: 1-5
- **Anchors**: 1 = ícones ausentes, layout quebrado; 3 = funcional, utiliza componentes padrão VS Code (TreeView, QuickPick, ProgressNotification); 5 = experiência premium com ícones da biblioteca oficial, animações de loading, empty states, atalhos de teclado, hover informativo
- **Pass Threshold**: >= 4
- **Evidence**: Screenshots + checklist de design system VS Code; revisão manual

### AC-7: CLI é intuitiva e ajuda automática é completa

- **Type**: `rubric`
- **Dimension**: Usabilidade da CLI (discoverability)
- **Scale**: 1-5
- **Anchors**: 1 = sem help, nomes de comando obscuros; 3 = `--help` por comando, examples básicos; 5 = help com exemplos reais por subcomando, autocomplete (bash/zsh/fish), sugestão de comando quando typo, cores consistentes, progress spinner com texto explicativo
- **Pass Threshold**: >= 4
- **Evidence**: Revisão manual do `--help` em cada comando + teste de autocomplete

### AC-8: Todo feature implementada tem documentação tri-língue nos READMEs

- **Type**: `rule`
- **Given**: Qualquer feature entregue na Fase N
- **When**: Verificar seções Usage / Examples / Important Notes em README.md, README.pt-br.md, README.es.md
- **Then**: Todos os 3 READMEs contêm a mesma informação estruturada; exemplos batem com comandos da CLI e ações da UI
- **Pass Condition**: Checklist por feature marcando presença nas 3 línguas
- **Evidence**: Diff entre READMEs (estruturalmente iguais, apenas tradução)

## Open Questions

- [ ] Deseja publicar no VS Code Marketplace e npm? Qual namespace/organização?
- [ ] Suporte a múltiplos repositórios abertos simultaneamente no workspace?
- [ ] Integração opcional com GitLab/GitHub para criar MR/PR a partir da UI?
- [ ] Preferência entre `commander` e `cac` para CLI? (padrão: commander, mais estabelecido)
- [ ] Nome do pacote CLI: `gittree` (global install via `npm i -g @gittree/cli`)?

# @gittree/cli

> Interface de linha de comando para o ecossistema GitTree de gerenciamento de worktrees.
>
> Disponibiliza subcomandos `worktree`, `branch`, `repo`, `config` e `setup` com tabelas
> humanas, output JSON para CI, prompts interativos e guards de segurança alinhados
> com o guia oficial.

---

## Instruções de Uso

### Instalação (a partir do build)

```bash
npm install -g @gittree/cli
gittree --version
```

### Opções Globais

```
gittree [comando] [opções]

  -V, --version                 Exibe a versão
  -h, --help                    Exibe ajuda
  --lang <en|pt-br|es>          Força idioma (env: GITTREE_LANG)
  --format <table|json|porcelain>  Formato de output (env: GITTREE_FORMAT)
```

### Exemplos

```bash
# Lista todas worktrees (tabela bonita padrão)
gittree worktree list

# Lista apenas worktrees sujas como JSON (para scripts/CI)
gittree worktree list --filter dirty --format json

# Adiciona worktree com nova branch
gittree worktree add ../repo-feature-auth -b feature/auth

# Remove worktree COM SEGURANÇA (falha se dirty ou ahead sem --force)
gittree worktree remove ../repo-feature-auth --delete-branch

# Pull EM TODAS worktrees usando ff-only (padrão, seguro)
gittree worktree sync --all --strategy ff-only

# Health check de todo repositório
gittree repo doctor

# Gera script autocomplete para seu shell
gittree config completion zsh > /usr/local/share/zsh/site-functions/_gittree
```

### Notas Importantes

- **Segurança padrão**: `worktree remove` se recusa a executar quando a worktree alvo tem
  alterações não commitadas ou a branch está à frente do origin. VOCÊ DEVE passar `--force`
  e/ou `--skip-push-check` explicitamente — comportamento alinhado aos guards do core.
- **Modos de output**:
  - `table` (padrão) — ANSI colorido com ícones unicode; **nunca** parseie isso em scripts
  - `json` — JSON puro em STDOUT; logs e spinners vão para STDERR
  - `porcelain` — formato estável orientado a linhas, compatível com `grep`/`awk`
- **Setup hooks**: um `.gittree.json` na raiz do repositório executa automaticamente
  entradas `copy`, `symlink` e `script` após todo `worktree add` (sobrescreva com `--no-setup`).
- **Porta de versão Git**: o CLI se recusa a iniciar se seu Git for mais antigo que 2.24.

---

## Scripts do Pacote

| Script | Descrição |
|---|---|
| `npm -w @gittree/cli run build` | Build ESM com `tsup` |
| `npm -w @gittree/cli run dev` | Build em modo watch |
| `npm -w @gittree/cli run typecheck` | `tsc --noEmit` strict |

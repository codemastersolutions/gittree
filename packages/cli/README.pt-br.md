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

#### Habilitar Autocompletar no Shell (opcional)

```bash
# bash → adicione esta linha no ~/.bashrc ou ~/.bash_profile
source <(gittree completion bash)

# zsh → salve em qualquer diretório do seu $fpath (recomendado)
gittree completion zsh > /usr/local/share/zsh/site-functions/_gittree
# depois: autoload -Uz compinit && compinit

# fish → salve no diretório padrão de completions do fish
gittree completion fish > ~/.config/fish/completions/gittree.fish
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

# Config global: listar, pegar, definir e remover chaves entre repositórios
gittree config list
gittree config get defaultWorktreeBaseDir
gittree config set defaultWorktreeBaseDir ~/git-worktrees
gittree config set autoCopyDotEnv false
gittree config unset autoCopyDotEnv

# Gera script de autocompletar shell (bash/zsh/fish)
gittree completion zsh > /usr/local/share/zsh/site-functions/_gittree
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
- **Localização da config global**: lê primeiro de `$XDG_CONFIG_HOME/gittree/config.json`,
  depois cai em `~/.gittree/config.json`. Funciona em Linux, macOS e Windows
  (todas variáveis `HOME`, `HOMEDIR` ou `HOMEPATH` são reconhecidas). Os comandos
  `completion` e `config` são **independentes de repositório** — funcionam sem pasta `.git`.
- **Coerção de tipos no config**: `gittree config set chave VALOR` infere automaticamente
  escalares: `true`/`false` → booleanos, `null` → nulo, dígitos puros → inteiros,
  floats tipo `3.14` → decimais, objetos/arrays JSON válidos são parseados. Qualquer
  outro valor é salvo como string simples.
- **Compatibilidade Bash 3.2**: o script gerado para bash é compatível com o bash padrão
  do macOS (GNU Bash 3.2) — evita sintaxe `;;&` de fallthrough no case.

---

## Scripts do Pacote

| Script                              | Descrição             |
| ----------------------------------- | --------------------- |
| `npm -w @gittree/cli run build`     | Build ESM com `tsup`  |
| `npm -w @gittree/cli run dev`       | Build em modo watch   |
| `npm -w @gittree/cli run typecheck` | `tsc --noEmit` strict |

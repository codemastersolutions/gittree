# Guia Completo de Git Worktrees

Guia prático para criar, usar, atualizar e encerrar worktrees no Git de forma segura.

---

## 1. O que são Worktrees

Worktrees permitem ter múltiplas branches "checked out" simultaneamente, cada uma em uma pasta separada, mas compartilhando o mesmo repositório `.git` (histórico, objetos, configs, hooks, stash).

**Vantagem principal:** evita o vai-e-vem de `git stash` / `git checkout` quando você precisa trocar de contexto rapidamente — por exemplo, revisar uma PR urgente enquanto ainda está no meio de uma feature.

---

## 2. Criando Worktrees

```bash
# Criar uma nova worktree com uma branch nova
git worktree add ../projeto-feature-x -b feature-x

# Criar uma worktree a partir de uma branch já existente
git worktree add ../projeto-hotfix hotfix-urgente

# Criar a partir de uma branch remota, já atualizada
git fetch origin
git worktree add ../projeto-feature-y origin/feature-y

# Listar todas as worktrees ativas
git worktree list
```

> Uma branch só pode estar "ativa" em uma worktree por vez — o Git bloqueia automaticamente tentativas de checkout duplicado.

---

## 3. Organização e Boas Práticas

1. **Pastas fora do repo principal** — use diretórios irmãos (`../projeto-feature-x`), não dentro do repo, para não conflitar com `.gitignore` e ferramentas de build.
2. **Nomeie a pasta igual à branch** — facilita identificar o conteúdo de cada worktree sem rodar `git branch`.
3. **Use para contextos com dependências/builds diferentes** — evita reprocessar `node_modules`, migrations, etc. a cada troca de branch.
4. **Configure o prompt do terminal** (oh-my-zsh, starship) para mostrar a branch/pasta atual — reduz risco de rodar comando na worktree errada.
5. **Rode `git worktree prune`** sempre que remover uma pasta manualmente (`rm -rf`), para limpar referências órfãs.

---

## 4. Evitando Sobrescrita Indevida de Arquivos

| Risco | Motivo | Mitigação |
|---|---|---|
| Arquivos não versionados (`.env`, uploads) | Não são sincronizados entre worktrees | Script de setup que copia/faz symlink desses arquivos em cada nova worktree |
| Comando destrutivo na pasta errada | `git checkout .`, `git clean -fd` rodado sem perceber onde está | Prompt do terminal visível + nomes de pasta distintos |
| Build/dependências (`node_modules`, `dist`) | Symlink acidental entre worktrees | Garantir pastas de build isoladas por worktree |
| Hooks do Git (`.git/hooks`) | São **compartilhados** entre todas as worktrees | Hooks devem usar caminhos relativos (`git rev-parse --show-toplevel`), nunca absolutos fixos |
| `git stash` | É **compartilhado** entre todas as worktrees do repositório | Prefira commits temporários (`wip` + `reset HEAD~1`) ou confira `git stash list` com cuidado antes de aplicar |

### Script de setup de worktree

```bash
#!/bin/bash
# setup-worktree.sh
WORKTREE_PATH=$1
cp .env "$WORKTREE_PATH/.env"
ln -s "$(pwd)/uploads" "$WORKTREE_PATH/uploads"  # symlink para pasta compartilhada, se fizer sentido
```

---

## 5. Atualizando Worktrees

### Atualização básica

```bash
cd ../projeto-feature-x
git fetch origin
git pull origin nome-da-branch
```

### Sincronizando com a main/master

**Rebase** (histórico mais limpo — evite se a branch já foi compartilhada com outra pessoa):
```bash
git fetch origin
git rebase origin/main
```

**Merge** (mais seguro, preserva histórico exato):
```bash
git fetch origin
git merge origin/main
```

### Atualizando todas as worktrees de uma vez

```bash
git fetch --all
```

Isso atualiza as referências remotas (`origin/main`, `origin/feature-x`, etc.) para todas as worktrees, mas **não aplica** nada nas branches locais — ainda é necessário entrar em cada uma e rodar `pull`/`merge`/`rebase`.

```bash
#!/bin/bash
# update-all-worktrees.sh
git fetch --all

git worktree list --porcelain | grep worktree | awk '{print $2}' | while read -r path; do
  echo "Atualizando: $path"
  (cd "$path" && git pull --ff-only) || echo "⚠️  Conflito ou branch não rastreada em $path"
done
```

> `--ff-only` evita merges automáticos inesperados — se não der fast-forward, ele avisa em vez de criar um merge commit sem você perceber.

**Cuidados:**
- Com mudanças não commitadas, `pull`/`rebase` vai barrar — resolva com `git status` antes.
- Rebase muda hashes de commit — prefira merge se a branch já foi compartilhada.

---

## 6. Encerrando uma Worktree

### Fluxo completo

```bash
# 1. Confere pendências e garante backup remoto
cd ../projeto-feature-x
git status
git add .
git commit -m "finaliza feature x"
git push origin feature-x

# 2. Sai da worktree (não é possível removê-la estando dentro dela)
cd ../projeto-main

# 3. Remove a worktree
git worktree remove ../projeto-feature-x

# 4. Remove a branch local, se já mergeada
git branch -d feature-x

# 5. Remove a branch remota, se necessário
git push origin --delete feature-x

# 6. Confirma que sumiu da lista
git worktree list
```

> Se houver arquivos não commitados, o Git recusa a remoção por segurança (`fatal: contains modified or untracked files`). Use `--force` apenas com certeza de que pode descartar tudo:
> ```bash
> git worktree remove --force ../projeto-feature-x
> ```
> Use `git branch -D` (maiúsculo) apenas se quiser forçar a deleção de uma branch **não mergeada**.

### Script de encerramento

```bash
#!/bin/bash
# close-worktree.sh
WORKTREE_PATH=$1
BRANCH_NAME=$2

cd "$WORKTREE_PATH" || exit 1
if [[ -n $(git status --porcelain) ]]; then
  echo "⚠️  Existem mudanças não commitadas. Resolva antes de continuar."
  exit 1
fi

cd - > /dev/null
git worktree remove "$WORKTREE_PATH"
git branch -d "$BRANCH_NAME" 2>/dev/null || echo "Branch não deletada (talvez não mergeada ainda)."
echo "✅ Worktree encerrada com sucesso."
```

---

## 7. Referência Rápida de Comandos

```bash
git worktree add <caminho> -b <nova-branch>     # criar worktree com branch nova
git worktree add <caminho> <branch-existente>   # criar worktree a partir de branch existente
git worktree list                               # listar worktrees ativas
git worktree remove <caminho>                   # remover worktree
git worktree remove --force <caminho>           # remover forçando (descarta mudanças locais)
git worktree prune                              # limpar referências órfãs
git fetch --all                                 # atualizar referências remotas de todas as worktrees
git branch -d <branch>                          # deletar branch local (se já mergeada)
git branch -D <branch>                          # deletar branch local (forçado)
git push origin --delete <branch>               # deletar branch remota
```

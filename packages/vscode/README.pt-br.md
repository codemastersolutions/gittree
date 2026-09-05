# GitTree (Extensão VS Code)

> Extensão com sidebar gráfica para gerenciar worktrees do Git diretamente do VS Code (e editores
> compatíveis: VSCodium, Cursor, Gitpod).
>
> Disponibiliza TreeView hierárquica, wizards baseados em QuickPick, ações inline de pull/push,
> diálogos de confirmação seguros e command palette completo (atalho `Ctrl+Alt+G`).

---

## Instruções de Uso

### Instalação (Side-load)

1. Execute `npm run build` na raiz do repositório.
2. Execute `npm -w @gittree/vscode run package` — isso produz `dist/gittree.vsix`.
3. No VS Code, abra a command palette → **Extensions: Install from VSIX…** e selecione o arquivo.
4. Recarregue a janela. Um ícone **GitTree** aparece na activity bar.

### Primeiros Passos

1. Abra qualquer pasta que seja um repositório Git.
2. Clique no ícone **GitTree** na activity bar esquerda.
3. A view principal de worktrees lista:
   - Worktree do repositório principal (a pasta que você abriu)
   - Todas worktrees vinculadas com badges de status dirty / ahead / behind / divergido / detached
4. Use os botões da barra de título:
   - ⟳ **Refresh** — recarrega estado do Git
   - ⊕ **New Worktree** — abre wizard de 4 passos
   - ↓ **Sync All** — fast-forward pull em todas worktrees
   - 🗑 **Prune (dry-run)** — limpa referências órfãs

### Atalhos de Teclado (todos prefixados por `Ctrl+Alt+G` / `⌘⌥G` no macOS)

| Atalho | Comando |
|---|---|
| `R` | Atualizar worktrees |
| `N` | Wizard nova worktree |
| `O` | Abrir worktree em nova janela |
| `T` | Abrir terminal na raiz da worktree |
| `P` | Pull worktree (ff-only) |
| `U` | Push worktree |
| `S` | Sincronizar todas worktrees |
| `X` | Remover worktree (com diálogo de segurança) |
| `H` | Exibir painel de saúde do repositório |

### Exemplos

```
Cenário: iniciar hotfix a partir da main sem stash.

 1. Pressione Ctrl+Alt+G N → abre wizard de 4 passos
 2. Passo 1: escolha "Nova branch"
 3. Passo 2: digite "hotfix/checkout-bug"
 4. Passo 3: aceite caminho padrão "../meurepo-hotfix-checkout-bug"
 5. Passo 4: confirme tela de review
 6. Worktree é criada; botão inline "Abrir em Nova Janela" abre janela do VS Code
    na worktree do hotfix com terminal, debugger e node_modules próprios.
```

```
Cenário: limpar worktree mergeada COM SEGURANÇA.

 1. Clique com botão direito na worktree finalizada → Remover…
 2. Diálogo mostra:
     • dirty state = NÃO ✅
     • branch ahead do origin = NÃO ✅
 3. Opcionalmente marque:
     ☐ Forçar delete (descarta mudanças locais)
     ☑ Deletar branch local após remoção
     ☐ Deletar branch remota origin/feature/x
 4. Clique "Remover com segurança"
 5. Branch + pasta da worktree são removidos; painel de status atualiza automaticamente.
```

### Notas Importantes

- **Guards de segurança espelham o core engine**: VOCÊ NÃO PODE deletar uma worktree suja a
  menos que marque explicitamente `☑ Forçar delete` no diálogo. Semântica idêntica ao `--force`
  da CLI.
- **Branch `main` nunca é tocada por auto-sync**: as operações de sync pulam a worktree que
  você abriu como root do workspace para evitar perda acidental de estado.
- **Ícones de Tema do VS Code**: todos ícones usam identificadores `$(codicons)` do VS Code
  para se adaptar automaticamente a temas claro/escuro — sem assets raster.
- **Suporte a idiomas**: instale os pacotes `vscode.l10n`. Se você ajustar a configuração
  `gittree.language` para `default`, segue o idioma da UI do editor entre Inglês, Português
  Brasileiro e Espanhol.
- **Workspaces com múltiplos repos**: atualmente apenas a primeira pasta do workspace é
  rastreada. Suporte multi-root está nas issues abertas.
- **Setup scripts do `.gittree.json` rodam automaticamente** após o wizard "Nova Worktree",
  portanto qualquer cópia de `.env` ou symlink declarado no repositório é aplicado ANTES da
  nova janela abrir.

---

## Configurações da Extensão

Lista completa em `package.json → contributes.configuration`. Abra as configurações do VS Code
(`Ctrl+,`) e pesquise por **GitTree** para editar interativamente.

| Chave | Padrão | Descrição |
|---|---|---|
| `gittree.defaultWorktreeBaseDir` | `".."` | Pasta base onde novas worktrees são criadas (fora do repo por padrão) |
| `gittree.defaultSyncStrategy` | `"ff-only"` | Estratégia padrão de pull: `ff-only` / `merge` / `rebase` |
| `gittree.autoCopyDotEnv` | `true` | Auto-cópia de `.env` quando `.gittree.json` não tem setup explícito |
| `gittree.confirmRemoval` | `true` | Sempre mostrar diálogo antes de remover worktree |
| `gittree.telemetry.enabled` | `false` | Telemetria anônima, desligada por padrão |
| `gittree.language` | `"default"` | Idioma UI: `default` segue VS Code |

---

## Scripts do Pacote

| Script | Descrição |
|---|---|
| `npm -w @gittree/vscode run build` | Bundle com esbuild → `dist/extension.js` (CJS) |
| `npm -w @gittree/vscode run dev` | Bundle em modo watch |
| `npm -w @gittree/vscode run typecheck` | `tsc --noEmit` strict |
| `npm -w @gittree/vscode run package` | Produz `.vsix` instalável via `vsce` |
| `npm -w @gittree/vscode run test` | Executa tests da extensão via `@vscode/test-electron` |

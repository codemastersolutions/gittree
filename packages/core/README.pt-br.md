# @gittree/core

> Motor compartilhado que alimenta tanto o CLI `gittree` quanto a extensão GitTree do VS Code.
>
> Implementa operações de worktree / branch / sync do Git como **contratos tipados** através do
> padrão portas e adaptadores (`GitAdapter`), com i18n integrado, logging estruturado,
> guards de segurança e event emitters para consumo pela UI.

---

## Instruções de Uso

### Importação

```typescript
// API pública (entrada principal)
import {
  createGitTree,
  type GitTree,
  type Worktree,
  type WorktreeState,
  type SyncStrategy,
  type CommitLogEntry,
} from '@gittree/core';

// Utilitários de teste (entrada separada, excluída de bundles de produção)
import { MockGitAdapter, type GitCallRecord } from '@gittree/core/testing';
```

### Instanciação

```typescript
import { RealGitAdapter, createGitTree } from '@gittree/core';

const core = createGitTree({
  cwd: process.cwd(),
  adapter: new RealGitAdapter({ cwd: process.cwd() }),
  locale: 'pt-br', // ou 'en' | 'es'
});

const worktrees = await core.worktree.list();
```

### Exemplos

```typescript
// Lista todas worktrees + detecta estado dirty global
const trees = await core.worktree.list();
for (const wt of trees) {
  const state = await core.worktree.getStatus(wt.path);
  console.log(`${wt.branch ?? wt.head} => dirty=${state.dirty}`);
}

// Busca commits recentes escopados a uma worktree (usa `git log -- <caminho>`)
const trees = await core.worktree.list();
const feature = trees.find((wt) => wt.branch === 'feat/x');
if (feature) {
  const commits: CommitLogEntry[] = await core.repo.logRecent({
    path: feature.path,
    limit: 10,
  });
  for (const c of commits) {
    console.log(`[${c.hashShort}] ${c.author} — ${c.subject} (${c.dateIso})`);
  }
}

// Mock em testes — nenhum Git real necessário
const mock = new MockGitAdapter();
mock.queueOutput('git worktree list --porcelain', FIXTURE);
const core = createGitTree({ adapter: mock, cwd: '/tmp/demo' });
await core.worktree.list();
expect(mock.calls()).toContainEqual({ command: 'git worktree list --porcelain' });
```

### Notas Importantes

- **`RealGitAdapter`** usa `child_process.spawn` e prefere output `--porcelain` / `--porcelain=v2`
  para resultados parseáveis por máquina. Sempre confie nos tipos de retorno estruturados ao
  invés de regex no stdout.
- **Segurança é opt-out**: operações destrutivas (`remove`, `prune`, `branch delete`) requerem
  opção explícita `force: true` E pulam guards de dirty/ahead. Por padrão tudo é bloqueado
  com erros tipados (`DirtyWorktreeError`, `BranchLockedError`, etc.).
- **i18n**: todas mensagens de usuário passam pelo helper `t(key)`. A cadeia de fallback é
  locale solicitado → `pt-br` → `en` — chaves cruas nunca são mostradas ao usuário.
- **Eventos**: `core.events` é uma instância `EventEmitter3` que dispara eventos
  `worktree:created|removed|synced`, `branch:deleted`, `sync:progress`. Use-os em spinners
  da CLI e notificações de progresso do VS Code.
- **Testabilidade primeiro**: use `@gittree/core/testing` + arquivos fixture em
  `packages/core/src/__fixtures__/` para 100% dos testes unitários. Git real só roda nas
  suítes de integração.
- **Parser de commit log**: `repo.logRecent()` executa `git log -n <limite> --pretty=format:%h|%H|%an|%ai|%s
-- <caminho>` e parseia o output separado por pipes em `CommitLogEntry` com 5 campos:
  `hashShort` (%h), `hash` (%H), `author` (%an), `dateIso` (%ai) e `subject` (%s). Omitir
  `path` retorna commits de todo o repositório; `limit` tem valor padrão `10`.

---

## Scripts do Pacote

| Script                               | Descrição                       |
| ------------------------------------ | ------------------------------- |
| `npm -w @gittree/core run build`     | Build dual ESM + CJS com `tsup` |
| `npm -w @gittree/core run dev`       | Build em modo watch             |
| `npm -w @gittree/core run typecheck` | `tsc --noEmit` strict           |

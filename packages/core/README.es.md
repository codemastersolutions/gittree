# @gittree/core

> Motor compartido que alimenta tanto el CLI `gittree` como la extensión GitTree para VS Code.
>
> Implementa operaciones de worktree / branch / sync de Git como **contratos tipados** mediante
> el patrón puertos y adaptadores (`GitAdapter`), con i18n integrado, logging estructurado,
> guardias de seguridad y event emitters para consumo desde la UI.

---

## Instrucciones de Uso

### Importación

```typescript
// API pública (entrada principal)
import {
  createGitTree,
  type GitTree,
  type Worktree,
  type WorktreeState,
  type SyncStrategy
} from '@gittree/core';

// Utilidades de test (entrada separada, excluida de bundles de producción)
import { MockGitAdapter, type GitCallRecord } from '@gittree/core/testing';
```

### Instanciación

```typescript
import { RealGitAdapter, createGitTree } from '@gittree/core';

const core = createGitTree({
  cwd: process.cwd(),
  adapter: new RealGitAdapter({ cwd: process.cwd() }),
  locale: 'es' // o 'en' | 'pt-br'
});

const worktrees = await core.worktree.list();
```

### Ejemplos

```typescript
// Lista todos los worktrees + detecta estado dirty global
const trees = await core.worktree.list();
for (const wt of trees) {
  const state = await core.worktree.getStatus(wt.path);
  console.log(`${wt.branch ?? wt.head} => dirty=${state.dirty}`);
}

// Mock en tests — sin Git real requerido
const mock = new MockGitAdapter();
mock.queueOutput('git worktree list --porcelain', FIXTURE);
const core = createGitTree({ adapter: mock, cwd: '/tmp/demo' });
await core.worktree.list();
expect(mock.calls()).toContainEqual({ command: 'git worktree list --porcelain' });
```

### Notas Importantes

- **`RealGitAdapter`** usa `child_process.spawn` y prefiere outputs `--porcelain` / `--porcelain=v2`
  para resultados parseables por máquina. Siempre confía en los tipos de retorno estructurados
  en lugar de aplicar regex al stdout.
- **La seguridad es opt-out**: las operaciones destructivas (`remove`, `prune`, `branch delete`)
  requieren la opción explícita `force: true` Y saltan las guardias de dirty/ahead. Por
  defecto todo se bloquea con errores tipados (`DirtyWorktreeError`, `BranchLockedError`, etc.).
- **i18n**: todos los mensajes de usuario pasan por el helper `t(key)`. La cadena de fallback
  es locale solicitado → `pt-br` → `en` — nunca se muestra una clave cruda al usuario.
- **Eventos**: `core.events` es una instancia de `EventEmitter3` que dispara eventos
  `worktree:created|removed|synced`, `branch:deleted`, `sync:progress`. Úsalos en spinners
  del CLI y notificaciones de progreso de VS Code.
- **Testabilidad primero**: usa `@gittree/core/testing` + archivos fixture en
  `packages/core/src/__fixtures__/` para el 100% de los tests unitarios. Git real solo se
  ejecuta en las suites de integración.

---

## Scripts del Paquete

| Script | Descripción |
|---|---|
| `npm -w @gittree/core run build` | Build dual ESM + CJS con `tsup` |
| `npm -w @gittree/core run dev` | Build en modo watch |
| `npm -w @gittree/core run typecheck` | `tsc --noEmit` strict |

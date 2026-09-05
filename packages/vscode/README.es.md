# GitTree (Extensión VS Code)

> Extensión con barra lateral gráfica para gestionar worktrees de Git directamente desde VS Code
> (y editores compatibles: VSCodium, Cursor, Gitpod).
>
> Provee TreeView jerárquico, asistentes basados en QuickPick, acciones inline pull/push,
> diálogos de confirmación seguros y palette de comandos completa (atajo `Ctrl+Alt+G`).

---

## Instrucciones de Uso

### Instalación (Side-load)

1. Ejecuta `npm run build` desde la raíz del repositorio.
2. Ejecuta `npm -w @gittree/vscode run package` — esto produce `dist/gittree.vsix`.
3. En VS Code, abre la palette de comandos → **Extensions: Install from VSIX…** y selecciona el archivo.
4. Recarga la ventana. Un icono de **GitTree** aparece en la barra de actividad.

### Primeros Pasos

1. Abre cualquier carpeta que sea un repositorio Git.
2. Clic en el icono **GitTree** en la barra de actividad izquierda.
3. La vista principal de worktrees lista:
   - Worktree del repositorio principal (la carpeta que abriste)
   - Todos los worktrees vinculados con distintivos de estado dirty / ahead / behind / divergido / detached
4. Usa los botones de la barra de título:
   - ⟳ **Refresh** — recarga estado desde Git
   - ⊕ **New Worktree** — abre asistente de 4 pasos
   - ↓ **Sync All** — fast-forward pull en todos los worktrees
   - 🗑 **Prune (dry-run)** — limpia referencias huérfanas

### Atajos de Teclado (todos prefijados por `Ctrl+Alt+G` / `⌘⌥G` en macOS)

| Atajo | Comando |
|---|---|
| `R` | Refrescar worktrees |
| `N` | Asistente nuevo worktree |
| `O` | Abrir worktree en nueva ventana |
| `T` | Abrir terminal en la raíz del worktree |
| `P` | Pull worktree (ff-only) |
| `U` | Push worktree |
| `S` | Sincronizar todos los worktrees |
| `X` | Eliminar worktree (con diálogo de seguridad) |
| `H` | Mostrar panel de salud del repositorio |

### Ejemplos

```
Escenario: arrancar hotfix desde main sin stash.

 1. Pulsa Ctrl+Alt+G N → se abre asistente de 4 pasos
 2. Paso 1: elige "Nueva rama"
 3. Paso 2: escribe "hotfix/checkout-bug"
 4. Paso 3: acepta ruta por defecto "../mirepo-hotfix-checkout-bug"
 5. Paso 4: confirma pantalla de revisión
 6. Worktree creado; botón inline "Abrir en Nueva Ventana" abre ventana VS Code
    en el worktree del hotfix con su propio terminal, depurador y node_modules.
```

```
Escenario: limpiar worktree mergeado CON SEGURIDAD.

 1. Botón derecho en el worktree finalizado → Eliminar…
 2. Diálogo muestra:
     • dirty state = NO ✅
     • rama adelantada a origin = NO ✅
 3. Opcionalmente marca:
     ☐ Forzar delete (descarta cambios locales)
     ☑ Eliminar rama local tras la eliminación
     ☐ Eliminar rama remota origin/feature/x
 4. Clic en "Eliminar con seguridad"
 5. Rama + carpeta worktree se eliminan; el panel de estado se auto-actualiza.
```

### Notas Importantes

- **Guardias de seguridad espejan el core engine**: NO PUEDES borrar un worktree sucio a menos
  que marques explícitamente `☑ Forzar delete` en el diálogo. Semántica idéntica a `--force` en CLI.
- **Rama `main` nunca se toca por auto-sync**: las operaciones sync saltan el worktree que abriste
  como root del workspace para evitar pérdida accidental de estado.
- **Iconos de Tema VS Code**: todos los iconos usan identificadores `$(codicons)` de VS Code para
  adaptarse automáticamente a temas claro/oscuro — sin assets raster.
- **Soporte idiomas**: instala los language packs `vscode.l10n`. Si configuras `gittree.language`
  en `default`, sigue el idioma de la UI del editor entre Inglés, Portugués Brasileño y Español.
- **Workspaces con múltiples repos**: actualmente solo se rastrea la primera carpeta del workspace.
  Soporte multi-root en issues abiertos.
- **Setup scripts de `.gittree.json` se ejecutan automáticamente** tras el asistente "Nuevo Worktree",
  así que cualquier copia de `.env` o symlink declarado en el repo se aplica ANTES de abrir la
  nueva ventana.

---

## Configuraciones de la Extensión

Lista completa en `package.json → contributes.configuration`. Abre ajustes VS Code (`Ctrl+,`)
y busca **GitTree** para editar interactivamente.

| Clave | Por defecto | Descripción |
|---|---|---|
| `gittree.defaultWorktreeBaseDir` | `".."` | Directorio base donde crean nuevos worktrees (fuera del repo por defecto) |
| `gittree.defaultSyncStrategy` | `"ff-only"` | Estrategia por defecto de pull: `ff-only` / `merge` / `rebase` |
| `gittree.autoCopyDotEnv` | `true` | Auto-copia `.env` cuando `.gittree.json` no tiene setup explícito |
| `gittree.confirmRemoval` | `true` | Siempre mostrar diálogo antes de eliminar worktree |
| `gittree.telemetry.enabled` | `false` | Telemetría anónima, desactivada por defecto |
| `gittree.language` | `"default"` | Idioma UI: `default` sigue VS Code |

---

## Scripts del Paquete

| Script | Descripción |
|---|---|
| `npm -w @gittree/vscode run build` | Bundle con esbuild → `dist/extension.js` (CJS) |
| `npm -w @gittree/vscode run dev` | Bundle en modo watch |
| `npm -w @gittree/vscode run typecheck` | `tsc --noEmit` strict |
| `npm -w @gittree/vscode run package` | Produce `.vsix` instalable vía `vsce` |
| `npm -w @gittree/vscode run test` | Ejecuta tests de la extensión vía `@vscode/test-electron` |

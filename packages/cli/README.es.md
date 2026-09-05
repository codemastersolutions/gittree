# @gittree/cli

> Interfaz de línea de comandos para el ecosistema de gestión GitTree de worktrees.
>
> Provee subcomandos `worktree`, `branch`, `repo`, `config` y `setup` con tablas
> amigables para humanos, output JSON para CI, prompts interactivos y guardias de
> seguridad alineadas con la guía oficial.

---

## Instrucciones de Uso

### Instalación (desde el build)

```bash
npm install -g @gittree/cli
gittree --version
```

### Opciones Globales

```
gittree [comando] [opciones]

  -V, --version                 Muestra la versión
  -h, --help                    Muestra ayuda
  --lang <en|pt-br|es>          Fuerza idioma (env: GITTREE_LANG)
  --format <table|json|porcelain>  Formato de output (env: GITTREE_FORMAT)
```

### Ejemplos

```bash
# Lista todos los worktrees (tabla bonita por defecto)
gittree worktree list

# Lista solo worktrees sucios como JSON (para scripts/CI)
gittree worktree list --filter dirty --format json

# Agrega worktree con nueva rama
gittree worktree add ../repo-feature-auth -b feature/auth

# Elimina un worktree CON SEGURIDAD (falla si dirty o ahead sin --force)
gittree worktree remove ../repo-feature-auth --delete-branch

# Pull EN TODOS los worktrees usando ff-only (por defecto, seguro)
gittree worktree sync --all --strategy ff-only

# Health check de todo el repositorio
gittree repo doctor

# Genera script autocomplete para tu shell
gittree config completion zsh > /usr/local/share/zsh/site-functions/_gittree
```

### Notas Importantes

- **Seguridad por defecto**: `worktree remove` se niega a ejecutarse cuando el worktree
  objetivo tiene cambios sin commitear o la rama está adelantada respecto a origin.
  DEBES pasar `--force` y/o `--skip-push-check` explícitamente — alineado con las guardias
  del core compartido.
- **Modos de output**:
  - `table` (por defecto) — ANSI coloreado con iconos unicode; **nunca** parsees esto en scripts
  - `json` — JSON puro en STDOUT; logs y spinners van a STDERR
  - `porcelain` — formato estable orientado a líneas, compatible con `grep`/`awk`
- **Setup hooks**: un `.gittree.json` en la raíz del repositorio ejecuta automáticamente
  las entradas `copy`, `symlink` y `script` después de cada `worktree add` (anular con `--no-setup`).
- **Puerta de versión Git**: el CLI se niega a arrancar si tu Git es anterior a 2.24.

---

## Scripts del Paquete

| Script | Descripción |
|---|---|
| `npm -w @gittree/cli run build` | Build ESM con `tsup` |
| `npm -w @gittree/cli run dev` | Build en modo watch |
| `npm -w @gittree/cli run typecheck` | `tsc --noEmit` strict |

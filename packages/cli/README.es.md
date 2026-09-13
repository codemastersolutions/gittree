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

#### Habilitar Autocompletar en Shell (opcional)

```bash
# bash → añade esta línea en ~/.bashrc o ~/.bash_profile
source <(gittree completion bash)

# zsh → guarda en cualquier directorio de tu $fpath (recomendado)
gittree completion zsh > /usr/local/share/zsh/site-functions/_gittree
# después: autoload -Uz compinit && compinit

# fish → guarda en el directorio estándar de completions de fish
gittree completion fish > ~/.config/fish/completions/gittree.fish
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

# Config global: lista, obtén, define y elimina claves entre repositorios
gittree config list
gittree config get defaultWorktreeBaseDir
gittree config set defaultWorktreeBaseDir ~/git-worktrees
gittree config set autoCopyDotEnv false
gittree config unset autoCopyDotEnv

# Genera script de autocompletar shell (bash/zsh/fish)
gittree completion zsh > /usr/local/share/zsh/site-functions/_gittree
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
- **Ubicación config global**: lee primero de `$XDG_CONFIG_HOME/gittree/config.json`,
  después cae en `~/.gittree/config.json`. Funciona en Linux, macOS y Windows
  (todas las variables `HOME`, `HOMEDIR` o `HOMEPATH` son reconocidas). Los comandos
  `completion` y `config` son **independientes de repositorio** — funcionan sin carpeta `.git`.
- **Coerción de tipos en config**: `gittree config set clave VALOR` infiere automáticamente
  escalares: `true`/`false` → booleanos, `null` → nulo, dígitos puros → enteros,
  floats tipo `3.14` → decimales, objetos/arrays JSON válidos son parseados. Cualquier
  otro valor se guarda como string simple.
- **Compatibilidad Bash 3.2**: el script generado para bash es compatible con el bash por
  defecto de macOS (GNU Bash 3.2) — evita sintaxis `;;&` de fallthrough en el case.

---

## Scripts del Paquete

| Script                              | Descripción           |
| ----------------------------------- | --------------------- |
| `npm -w @gittree/cli run build`     | Build ESM con `tsup`  |
| `npm -w @gittree/cli run dev`       | Build en modo watch   |
| `npm -w @gittree/cli run typecheck` | `tsc --noEmit` strict |

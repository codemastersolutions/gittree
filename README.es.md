# GitTree

> **Estado**: Fase 1 — Bootstrap del Core Engine
>
> Monorepo multipaquete que contiene dos herramientas de gestión de Git worktrees:
> - **`@gittree/cli`** — Interfaz de línea de comandos para terminal y CI/CD
> - **`GitTree` (extensión VS Code)** — Barra lateral gráfica y asistentes para VS Code / VSCodium / Cursor / Gitpod
>
> Ambas consumen el motor compartido **`@gittree/core`**, que encapsula Git con contratos tipados, guardias de seguridad e internacionalización.

---

## Instrucciones de Uso

### Requisitos previos

- **Git** `>= 2.24` (comprueba con `git --version`)
- **Node.js** `>= 18` (recomendado LTS 20.x)
- **npm** `>= 9` (incluido con Node 18)

### Configuración (Desarrollo)

```bash
git clone <este-repo>
cd GitTree

# Instala todas las dependencias del workspace (core, cli, vscode)
npm install

# Ejecuta comprobación de tipos TypeScript en todos los paquetes
npm run typecheck

# Ejecuta ESLint + comprobación de formato Prettier
npm run lint
npm run format

# Ejecuta la suite completa de tests unitarios (core + cli, >= 90% cobertura)
npm run test
npm run test:coverage

# Construye todos los paquetes en el orden correcto (core primero)
npm run build
```

### Ejemplos

```bash
# Instala CLI globalmente desde el build local (después de npm run build)
npm link -w @gittree/cli
gittree --version

# Ejecuta tests del core en modo watch durante el desarrollo
npm run test:watch -- --project core

# Lintea y auto-corrige todo antes de commitear
npm run lint:fix
npm run format
```

### Notas Importantes

- **TypeScript Strict**: todo el código fuente se compila en modo `strict` (null checks, no implicit any, exhaustividad en switches). Los PRs que fallan en `tsc --noEmit` se bloquean.
- **Workspaces**: usa `npm -w @gittree/core <cmd>` para ejecutar comandos dentro de un paquete específico. Nunca entres manualmente y ejecutes `npm install` dentro de un paquete.
- **Hooks de Husky**:
  - `pre-commit` ejecuta `lint-staged` (ESLint fix + Prettier sobre archivos staged)
  - `commit-msg` valida el formato Conventional Commits vía `commitlint` (scopes: `core`, `cli`, `vscode`, `repo`, `ci`, `deps`, `docs`, `readme`, `test`)
- **Puerta de Cobertura**: el CI obliga a >= 90% cobertura para `packages/core/src` y `packages/cli/src`. Cobertura inferior rompe el build.
- **Puerta de Auditoría**: `npm audit --production` debe devolver cero vulnerabilidades high/critical en cada PR.
- **Regla README Trilingüe**: cada feature entregada en una fase **debe** actualizar los 3 archivos README de su proyecto (`README.md`, `README.pt-br.md`, `README.es.md`) con Instrucciones de Uso, Ejemplos y Notas Importantes.

---

## Estructura del Monorepo

```
GitTree/
├── .github/workflows/ci.yml     ← Lint · Typecheck · Tests · Cobertura · Build · Seguridad
├── .husky/                      ← Hooks pre-commit + commit-msg
├── docs/
│   ├── guia-git-worktrees.md    ← Buenas prácticas oficiales (fuente PT-BR)
│   └── plano-gittree-cli-extensao-vscode.md  ← Roadmap completo de implementación
├── packages/
│   ├── core/                    ← @gittree/core — Motor compartido
│   │   ├── README.md / README.pt-br.md / README.es.md
│   │   └── src/
│   │       ├── index.ts         ← Superficie de API pública
│   │       ├── adapters/        ← GitAdapter (Real + Mock)
│   │       ├── services/        ← WorktreeService, BranchService, SyncService…
│   │       ├── errors/          ← Jerarquía tipada de errores
│   │       └── locales/         ← JSON de traducción en / pt-br / es
│   ├── cli/                     ← @gittree/cli — CLI
│   │   ├── bin/gittree.js       ← Punto de entrada binario
│   │   ├── README.md / README.pt-br.md / README.es.md
│   │   └── src/
│   └── vscode/                  ← GitTree — Extensión VS Code
│       ├── package.json         ← contributes, activationEvents, configuraciones
│       ├── README.md / README.pt-br.md / README.es.md
│       └── src/
├── eslint.config.mjs
├── vitest.config.ts             ← Tests unitarios + cobertura
├── vitest.integration.config.ts ← Tests de integración (repo tmp + git real)
└── tsconfig.base.json           ← Base TypeScript strict + aliases de path
```

---

## Scripts (root `package.json`)

| Script | Descripción |
|---|---|
| `npm run build` | Build core → cli → vscode (orden topológico correcto) |
| `npm run dev` | Watch-build de los 3 paquetes en paralelo |
| `npm run typecheck` | `tsc --noEmit` en todos los workspaces |
| `npm run lint` | ESLint sobre `packages/*/src/**/*.ts` |
| `npm run lint:fix` | Auto-corrección ESLint |
| `npm run format` | Auto-formato Prettier |
| `npm run format:check` | Dry-run Prettier (usado en CI) |
| `npm run test` | Tests unitarios (core + cli) |
| `npm run test:watch` | Tests unitarios en modo watch |
| `npm run test:coverage` | Tests unitarios + informe de cobertura (>= 90%) |
| `npm run test:integration` | Tests de integración (repositorios git reales) |
| `npm run audit` | `npm audit --production` (puerta de seguridad) |
| `npm run clean` | Elimina todos los `dist`, `node_modules` |
| `npm run prepare` | Instala hooks Husky (automático tras `npm install`) |

---

## Conventional Commits (Scopes)

```
feat(core): agrega WorktreeService.remove con guard dirty
fix(cli): escapa comillas en output --format json
docs(readme): actualiza instrucciones de instalación en pt-br y es
test(vscode): agrega fixture TreeView provider
chore(ci): agrega step npm audit al workflow
```

Scopes válidos: `core`, `cli`, `vscode`, `repo`, `ci`, `deps`, `docs`, `readme`, `test`.

---

## Roadmap

Consulta el plan completo por fases en **[docs/plano-gittree-cli-extensao-vscode.md](docs/plano-gittree-cli-extensao-vscode.md)**.

Fase actual: **Fase 1 — Bootstrap & Core Engine**
- ✅ Scaffold monorepo, toolchain, CI base, puertas de calidad, hooks husky
- 🔧 Core engine: GitAdapter + tipos + parsers (Tarea 2 · Tarea 3)

---

## Licencia

MIT

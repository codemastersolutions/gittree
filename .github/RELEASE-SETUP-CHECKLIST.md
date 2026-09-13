# ============================================================
# 🔐 SETUP OBRIGATÓRIO (ANTES DO PRIMEIRO RELEASE)
# ============================================================
#
# Siga os 2 blocos abaixo em ordem (GUI do GitHub + GUI do npm).
# NÃO precisa commitar este arquivo — ele existe apenas para
# guiar você (ou novos mantenedores) pelo setup one-shot.
#
# ============================================================
# 1️⃣ BRANCH PROTECTION RULES (github.com → Settings → Branches)
# ============================================================
#
# Crie 2 regras (Branch protection rule):
#
# --- Rule A: "main" (branch de releases, gatilho do release.yml)
#
#   Branch name pattern:           main
#   ☑️ Require a pull request before merging
#        Required approvals:       1
#        ☑️ Dismiss stale pull request approvals when new commits are pushed
#        ☑️ Require review from Code Owners (se usar CODEOWNERS)
#   ☑️ Require status checks to pass before merging
#        Status checks (marcar TODOS, exatamente como escrito):
#           ◻️ lint
#           ◻️ typecheck
#           ◻️ format:check
#           ◻️ Unit Tests (core + cli + vscode)
#           ◻️ Enforce 90% coverage
#           ◻️ Security Audit
#           ◻️ integration (ubuntu-latest · 18.x)
#           ◻️ integration (ubuntu-latest · 20.x)
#           ◻️ integration (macos-latest  · 18.x)
#           ◻️ integration (macos-latest  · 20.x)
#           ◻️ integration (windows-latest · 18.x)
#           ◻️ integration (windows-latest · 20.x)
#        ☑️ Do not allow bypassing the above settings
#   ☑️ Require branches to be up to date before merging
#   ☑️ Require signed commits          (opcional, recomendado)
#   ☑️ Require linear history          (evita messy merges de PR)
#   ☑️ Include administrators          (IMPORTANTE, bypass default = vazar gates)
#   ☑️ Allow force pushes              ❌ DESMARCADO (nunca)
#   ☑️ Allow deletions                 ❌ DESMARCADO (nunca)
#
# --- Rule B: "develop" (branch padrão de merges diários)
#
#   Branch name pattern:           develop
#   ☑️ Require a pull request before merging  (1 approval)
#   ☑️ Require status checks to pass before merging
#        Status checks (marcar os MESMOS 12 checks acima)
#   ☑️ Require branches to be up to date before merging
#   ☑️ Include administrators
#   ☑️ Allow force pushes              ❌
#   ☑️ Allow deletions                 ❌
#
# ============================================================
# 2️⃣ NPM TRUSTED PUBLISHER (npmjs.com → Package Settings)
# ============================================================
#
# O release.yml usa OIDC (id-token: write) + `pnpm publish --provenance`
# — NÃO usamos token clássico `NPM_TOKEN` em secrets.
#
# Repita os passos ABAIXO 2x (um para CADA pacote publicado):
#   a) @codemastersolutions/gittree-core
#   b) @codemastersolutions/gittree-cli
#
# Passos (por pacote):
#
# 1. Publique a versão 0.1.0 MANUALMENTE UMA ÚNICA VEZ na sua máquina:
#      (apenas para o pacote EXISTIR no npmjs — Trusted Publisher
#      só pode ser configurado em pacotes que já existem no registry)
#
#      pnpm install
#      pnpm build
#      cd packages/core
#      pnpm login                         # loga com sua conta npm
#      pnpm publish --access public       # publica core primeiro
#      cd ../cli
#      sleep 20 && pnpm publish --access public   # CLI depende do core
#
# 2. Vá para npmjs.com/package/@codemastersolutions/gittree-core →
#    Settings → Publishing → 🔑 "Trusted publishing" → Add a new publisher.
#
# 3. Preencha EXATAMENTE:
#
#      Owner:                     codemastersolutions     ← sua org no GH
#      Repository:                gittree                 ← nome repo
#      Workflow name (EXATO):     Release (CLI + Core → npm)
#         (copiar do release.yml top-level `name: "Release (CLI + Core → npm)"`)
#      Environment name:          npm-publish             ← se errou lá em cima, ajuste aqui
#
# 4. Clique em "Add".
#
# 5. REPITA os passos 2..4 para o pacote @codemastersolutions/gittree-cli.
#
# ============================================================
# 3️⃣ (OPCIONAL) GITHUB ENVIRONMENT "npm-publish"
# ============================================================
#
# No release.yml usamos `environment: npm-publish`. Isso serve para:
#   • Aprovação manual antes do publish (recomendado para major releases)
#   • Restringir publish APENAS para a branch main
#   • Auditar TODOS os publishes por usuários aprovadores.
#
# Setup:
#   github.com → settings → Environments → New environment:
#     Name:              npm-publish
#     Required reviewers:     (seus mantenedores, ex: você + colega)
#     Deployment branches:   Selected branches → Add rule → `main` (EXATO)
#     Environment secrets:   (VAZIO — NÃO coloque NPM_TOKEN aqui)
#     Environment variables: (VAZIO — tudo vem OIDC)
#
# ============================================================
# 4️⃣ (OPCIONAL) CODEOWNERS — aprovação obrigatória em release files
# ============================================================
#
# Criar arquivo /CODEOWNERS:
#
#   .github/workflows/release.yml     @codemastersolutions/platform-team
#   package.json                      @codemastersolutions/platform-team
#   packages/*/package.json           @codemastersolutions/platform-team
#
# ============================================================
# ✅ 1º release manual e workflow release.yml
# ============================================================
#
# Depois de concluir TUDO acima:
#
#   1. Merge PR → develop e depois PR develop → main (ou direto PR→main)
#   2. Acompanhe em Actions → "Release (CLI + Core → npm)"
#   3. Se você marcou Environment approval: ir em Environments →
#      Review deployments → Aprovar.
#   4. No final: verificar em npmjs.com os badges PROVENANCE ✅ e
#      SLSA Build Level 3 nas páginas de @codemastersolutions/gittree-*.
#
# ============================================================
# ✨ Dicas de conventional commits (impactam versão automática)
# ============================================================
#
#   fix(worktree): corrige X      → PATCH  x.y.Z
#   feat(sync): adiciona Y        → MINOR  x.Y.0
#   feat!: breaking change Z      → MAJOR  X.0.0
#   chore/docs/build/test         → sem bump (nada publicado)
#
# Override manual (workflow_dispatch ou CLI local):
#   pnpm run release:patch         → força PATCH
#   pnpm run release:minor         → força MINOR
#   pnpm run release:major         → força MAJOR
#   (ex: releases candidatos a RC)

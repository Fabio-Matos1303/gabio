#!/usr/bin/env bash
set -eo pipefail
source "$HOME/.nvm/nvm.sh"
nvm use 24 >/dev/null
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
release_dir="${1:?Informe o diretório temporário criado por validate-release.sh}"
cd "$repo_root"
cp package.json eslint.config.js "$release_dir/"
cp -a apps/web/src apps/web/public "$release_dir/apps/web/"
cp apps/web/vite.config.ts apps/web/vite.preview.config.ts "$release_dir/apps/web/"
cp -a scripts docs .github "$release_dir/"
cp .gitignore .editorconfig .env.example README.md wrangler.jsonc "$release_dir/"
cd "$release_dir"
node node_modules/vitest/vitest.mjs run packages/contracts/src packages/domain/src packages/ai-router/src --pool forks --maxWorkers 1
node node_modules/eslint/bin/eslint.js .
node node_modules/prettier/bin/prettier.cjs --check apps/web/src apps/web/vite.config.ts apps/web/vite.preview.config.ts scripts docs/architecture/decisions/007-task-workflow-status.md docs/architecture/decisions/008-module-pages-and-home-hub.md docs/architecture/decisions/010-task-mvp-offline-snapshot.md docs/operations/task-mvp-launch.md package.json eslint.config.js wrangler.jsonc

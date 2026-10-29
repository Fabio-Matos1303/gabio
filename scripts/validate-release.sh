#!/usr/bin/env bash
set -eo pipefail
source "$HOME/.nvm/nvm.sh"
nvm use 24 >/dev/null
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
release_dir="$(mktemp -d /tmp/gabio-release.XXXXXX)"
printf 'Release workspace: %s\n' "$release_dir"
cd "$repo_root"
mkdir -p "$release_dir/apps/web" "$release_dir/packages"
cp package.json pnpm-lock.yaml pnpm-workspace.yaml eslint.config.js prettier.config.mjs tsconfig.base.json "$release_dir/"
for package in contracts domain ai-router; do
  mkdir -p "$release_dir/packages/$package"
  cp -a "packages/$package/src" "packages/$package/package.json" "packages/$package/tsconfig.json" "$release_dir/packages/$package/"
  if [ -d "packages/$package/node_modules" ]; then cp -a "packages/$package/node_modules" "$release_dir/packages/$package/"; fi
done
cp -a apps/web/src apps/web/public apps/web/index.html apps/web/package.json apps/web/tsconfig*.json apps/web/vite.config.ts apps/web/vitest.config.ts "$release_dir/apps/web/"
cp -a node_modules "$release_dir/"
cp -a apps/web/node_modules "$release_dir/apps/web/"
cp -a apps/web/src "$release_dir/apps/web/"
cd "$release_dir/apps/web"
node ../../node_modules/vitest/vitest.mjs run --pool forks --maxWorkers 1

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
node -e 'const fs=require("fs");const p="scripts/preview/vite.config.mjs";if(fs.existsSync(p))fs.unlinkSync(p);'
node node_modules/eslint/bin/eslint.js .
node -e 'const fs=require("fs"),cp=require("child_process");const files=JSON.parse(fs.readFileSync("scripts/task-release-files.json","utf8")).filter(p=>p!==".env.example"&&!p.endsWith(".png")&&!p.endsWith(".sql")&&!p.endsWith(".sh"));cp.execFileSync(process.execPath,["node_modules/prettier/bin/prettier.cjs","--write",...files],{stdio:"inherit"});'
for file in $(node -e 'const fs=require("fs");console.log(JSON.parse(fs.readFileSync("scripts/task-release-files.json","utf8")).filter(p=>p!==".env.example"&&!p.endsWith(".png")&&!p.endsWith(".sql")&&!p.endsWith(".sh")).join(" "));'); do cp "$release_dir/$file" "$repo_root/$file"; done
node node_modules/prettier/bin/prettier.cjs --check apps/web/src package.json eslint.config.js wrangler.jsonc

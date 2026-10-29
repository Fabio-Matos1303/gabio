#!/usr/bin/env bash
set -eo pipefail
source "$HOME/.nvm/nvm.sh"
nvm use 24 >/dev/null
cd "$(dirname "${BASH_SOURCE[0]}")/.."
node apps/web/node_modules/vite/bin/vite.js --config apps/web/vite.preview.config.ts

#!/usr/bin/env bash
set -eo pipefail
source "$HOME/.nvm/nvm.sh"
nvm use 24 >/dev/null
cd "$(dirname "${BASH_SOURCE[0]}")/.."
pnpm exec supabase link --project-ref ukyjbipshqsdbhkwkepq
pnpm exec supabase migration list --linked

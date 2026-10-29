#!/usr/bin/env bash
set -eo pipefail
source "$HOME/.nvm/nvm.sh"
nvm use 24 >/dev/null
cd "$(dirname "${BASH_SOURCE[0]}")/.."
pnpm exec supabase migration up
pnpm exec supabase test db supabase/tests/m1_auth.test.sql supabase/tests/m2_tasks.test.sql supabase/tests/m2_task_workflow.test.sql supabase/tests/task_gateway_privileges.test.sql

#!/usr/bin/env bash
# Prints the four environment variables Vercel needs, read from
# .env.cloud.local and adjusted for serverless.
#
# Output contains live secrets. Run it in your own terminal, paste into
# Vercel, and do not put the result anywhere it will be stored.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env.cloud.local ] || { echo "No .env.cloud.local here." >&2; exit 1; }

get() { grep -E "^$1=" .env.cloud.local | head -1 | cut -d= -f2-; }

DB="$(get DATABASE_URL)"
API="$(get NEXT_PUBLIC_SUPABASE_URL)"
SECRET="$(get SUPABASE_SECRET_KEY)"

# Session pooler is right for scripts from a laptop; a serverless host wants
# transaction mode, which is the same URI on 6543.
POOLED="${DB/:5432\//:6543/}"

echo "DATABASE_URL=$POOLED"
echo "NEXT_PUBLIC_SUPABASE_URL=$API"
echo "SUPABASE_SECRET_KEY=$SECRET"
echo
echo "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=   <-- not in this file."
echo "  Supabase dashboard -> Project Settings -> API keys -> publishable."
echo "  The one in .env.local belongs to the local stack, not this project."

#!/usr/bin/env bash
# Pushes the four production environment variables to the linked Vercel
# project, reading three of them straight out of .env.cloud.local.
#
# Values are piped to `vercel env add` on stdin, so none of them appears on a
# command line, in your shell history, or in any transcript.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env.cloud.local ] || { echo "No .env.cloud.local here." >&2; exit 1; }
[ -f .vercel/project.json ] || { echo "Project not linked. Run: vercel link" >&2; exit 1; }

get() { grep -E "^$1=" .env.cloud.local | head -1 | cut -d= -f2-; }

push() { # name, value
  local name="$1" value="$2"
  [ -n "$value" ] || { echo "  $name: empty, skipped" >&2; return; }
  printf '%s' "$value" | vercel env add "$name" production --force >/dev/null 2>&1 \
    && echo "  $name: set" \
    || echo "  $name: FAILED" >&2
}

# Session pooler is right for scripts from a laptop; a serverless host wants
# transaction mode, which is the same URI on 6543.
DB="$(get DATABASE_URL)"
push DATABASE_URL "${DB/:5432\//:6543/}"
push NEXT_PUBLIC_SUPABASE_URL "$(get NEXT_PUBLIC_SUPABASE_URL)"
push SUPABASE_SECRET_KEY "$(get SUPABASE_SECRET_KEY)"

# Not in that file: it belongs to the cloud project, and .env.local holds the
# local stack's key, which would look right and fail at sign-in.
echo
echo "Supabase dashboard -> Project Settings -> API keys -> publishable"
printf "Paste the publishable key (hidden): "
read -rs PUBLISHABLE
echo
push NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "$PUBLISHABLE"

echo
vercel env ls production

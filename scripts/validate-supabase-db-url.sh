#!/usr/bin/env bash
set -Eeuo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"

# GitHub-hosted runners are IPv4-only. Require the Sol project's Session Pooler
# endpoint (username contains the exact project ref) instead of accepting any
# URL that merely contains the project ref somewhere in its text.
if [[ "$SUPABASE_DB_URL" =~ ^postgres(ql)?://postgres\.oyoyozdugicmnkfhjovo:[^@]+@([a-zA-Z0-9-]+\.)+pooler\.supabase\.com:5432/postgres(\?[^[:space:]]*)?$ ]]; then
  exit 0
fi

echo "Refusing database URL: expected Sol's Session Pooler host, port 5432, and postgres.<project-ref> username." >&2
exit 2

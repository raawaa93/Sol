#!/usr/bin/env bash
set -Eeuo pipefail

: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is required}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT is required}"
: "${BACKUP_OUTPUT_FILE:?BACKUP_OUTPUT_FILE is required}"

bash "$(dirname "$0")/validate-supabase-db-url.sh"

if [[ ! "$AGE_RECIPIENT" =~ ^age1[0-9a-z]+$ ]]; then
  echo "AGE_RECIPIENT must be a valid age public recipient (age1...). " >&2
  exit 2
fi

command -v supabase >/dev/null 2>&1 || { echo "Supabase CLI is required." >&2; exit 2; }
command -v age >/dev/null 2>&1 || { echo "age is required." >&2; exit 2; }

work_dir="$(mktemp -d "${TMPDIR:-/tmp}/sol-supabase-backup.XXXXXX")"
cleanup() { rm -rf "$work_dir"; }
trap cleanup EXIT

output_dir="$(dirname "$BACKUP_OUTPUT_FILE")"
mkdir -p "$output_dir"
chmod 700 "$output_dir"

# Supabase CLI v3 requires --remote=<database-url>; omitting it targets local Docker.
supabase db dump --remote="$SUPABASE_DB_URL" -f "$work_dir/roles.sql" --role-only
supabase db dump --remote="$SUPABASE_DB_URL" -f "$work_dir/schema.sql"
supabase db dump --remote="$SUPABASE_DB_URL" -f "$work_dir/data.sql" --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"

for file in roles.sql schema.sql data.sql; do
  test -f "$work_dir/$file" || { echo "Backup export did not create $file." >&2; exit 1; }
done

grep -q "volterra_rate_limit_windows" "$work_dir/schema.sql" || {
  echo "The dump does not contain the expected Sol rate-limit table; refusing to publish it." >&2
  exit 1
}
grep -q "volterra_check_rate_limit" "$work_dir/schema.sql" || {
  echo "The dump does not contain the expected Sol rate-limit RPC; refusing to publish it." >&2
  exit 1
}

cli_version="$(supabase --version)"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
cat > "$work_dir/manifest.txt" <<EOF
Project: Sol / Volterra
Supabase project ref: oyoyozdugicmnkfhjovo
Created at (UTC): $created_at
Repository commit: ${GITHUB_SHA:-unknown}
Supabase CLI: $cli_version
Included: PostgreSQL cluster roles, non-managed schema definitions, non-managed schema data
Excluded by Supabase CLI: auth, storage, extension-managed schemas and data
Not included: Auth users/sessions, Storage object bytes, Edge Function secrets, project settings
Encryption: age recipient encryption; keep the matching private identity offline and outside GitHub
EOF

(
  cd "$work_dir"
  sha256sum roles.sql schema.sql data.sql manifest.txt > SHA256SUMS
)
tar -czf "$work_dir/sol-supabase-backup.tar.gz" -C "$work_dir" roles.sql schema.sql data.sql manifest.txt SHA256SUMS

age -r "$AGE_RECIPIENT" -o "$BACKUP_OUTPUT_FILE" "$work_dir/sol-supabase-backup.tar.gz"
chmod 600 "$BACKUP_OUTPUT_FILE"

if ! head -c 24 "$BACKUP_OUTPUT_FILE" | grep -q '^age-encryption.org/v1'; then
  echo "Encrypted output does not have the expected age file header." >&2
  exit 1
fi

digest="$(sha256sum "$BACKUP_OUTPUT_FILE" | awk '{print $1}')"
size="$(wc -c < "$BACKUP_OUTPUT_FILE" | tr -d ' ')"
printf 'Encrypted backup created: %s bytes; SHA-256 %s\n' "$size" "$digest"

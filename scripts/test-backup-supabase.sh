#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"

cat > "$tmp/bin/supabase" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
if [[ "${1:-}" == "--version" ]]; then
  echo "supabase 3.0.0"
  exit 0
fi
: "${MOCK_SUPABASE_LOG:?MOCK_SUPABASE_LOG is required}"
printf '%s ' "$@" >> "$MOCK_SUPABASE_LOG"
printf '\n' >> "$MOCK_SUPABASE_LOG"
if [[ "${1:-}" == "init" || "${1:-}" == "stop" || ( "${1:-}" == "db" && "${2:-}" == "start" ) ]]; then
  exit 0
fi
output=""
role_only=false
data_only=false
use_copy=false
remote_seen=false
while (($#)); do
  case "$1" in
    --remote=*)
      [[ "$1" == "--remote=$SUPABASE_DB_URL" ]] || {
        echo "mock received an unexpected remote database target" >&2
        exit 1
      }
      remote_seen=true
      shift
      ;;
    -f) output="$2"; shift 2 ;;
    --role-only) role_only=true; shift ;;
    --data-only) data_only=true; shift ;;
    --use-copy) use_copy=true; shift ;;
    *) shift ;;
  esac
done
if [[ "$remote_seen" != true ]]; then
  echo "mock requires an explicit --remote database URL" >&2
  exit 1
fi
if [[ -z "$output" ]]; then
  echo "mock could not parse output file" >&2
  exit 1
fi
if [[ "$role_only" == true ]]; then
  printf '%s\n' '-- roles' > "$output"
elif [[ "$data_only" == true ]]; then
  [[ "$use_copy" == true ]] || {
    echo "data dump must use --use-copy" >&2
    exit 1
  }
  printf '%s\n' '-- data' > "$output"
else
  printf '%s\n' 'CREATE TABLE public.volterra_rate_limit_windows (); CREATE FUNCTION public.volterra_check_rate_limit();' > "$output"
fi
MOCK
chmod +x "$tmp/bin/supabase"

cat > "$tmp/bin/psql" <<'MOCK_PSQL'
#!/usr/bin/env bash
set -Eeuo pipefail
: "${MOCK_PSQL_LOG:?MOCK_PSQL_LOG is required}"
printf '%s ' "$@" >> "$MOCK_PSQL_LOG"
printf '\\n' >> "$MOCK_PSQL_LOG"
if [[ "$*" == *"to_regclass"* ]]; then
  echo "1:1:1:0:0:1:0"
fi
MOCK_PSQL
chmod +x "$tmp/bin/psql"

command -v age >/dev/null 2>&1 || { echo "age is required for this test." >&2; exit 1; }
command -v age-keygen >/dev/null 2>&1 || { echo "age-keygen is required for this test." >&2; exit 1; }
base_url='postgresql://postgres.oyoyozdugicmnkfhjovo:placeholder@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require'
age-keygen -o "$tmp/identity.txt" 2> "$tmp/keygen.log"
recipient="$(sed -n 's/^# public key: //p' "$tmp/identity.txt")"
test -n "$recipient"

PATH="$tmp/bin:$PATH" \
MOCK_SUPABASE_LOG="$tmp/supabase-commands.log" \
MOCK_PSQL_LOG="$tmp/psql-commands.log" \
VERIFY_LOCAL_RESTORE=true \
SUPABASE_DB_URL="$base_url" \
AGE_RECIPIENT="$recipient" \
BACKUP_OUTPUT_FILE="$tmp/backup.age" \
bash "$repo_root/scripts/backup-supabase.sh"

# Prove the backup invokes three explicit remote dumps with the intended modes.
test "$(grep -c -- "--remote=" "$tmp/supabase-commands.log")" = "3"
grep -Fq -- "--remote=$base_url" "$tmp/supabase-commands.log"
grep -Fq -- "--role-only" "$tmp/supabase-commands.log"
grep -Fq -- "--data-only" "$tmp/supabase-commands.log"
grep -Fq -- "--use-copy" "$tmp/supabase-commands.log"
grep -Fq -- "storage.buckets_vectors" "$tmp/supabase-commands.log"
grep -Fq -- "storage.vector_indexes" "$tmp/supabase-commands.log"
grep -Fq -- "init" "$tmp/supabase-commands.log"
grep -Fq -- "db start" "$tmp/supabase-commands.log"
grep -Fq -- "stop" "$tmp/supabase-commands.log"
grep -Fq -- "--single-transaction" "$tmp/psql-commands.log"
grep -Fq -- "to_regclass" "$tmp/psql-commands.log"

grep -q '^age-encryption.org/v1' "$tmp/backup.age"
age -d -i "$tmp/identity.txt" -o "$tmp/backup.tar.gz" "$tmp/backup.age"
mkdir "$tmp/restored"
tar -xzf "$tmp/backup.tar.gz" -C "$tmp/restored"
(cd "$tmp/restored" && sha256sum -c SHA256SUMS)
test -f "$tmp/restored/roles.sql"
grep -q "volterra_rate_limit_windows" "$tmp/restored/schema.sql"
echo "Remote-target argument checks, real age encryption/decryption and checksums passed with a mocked database CLI; no live database was accessed."

SUPABASE_DB_URL="$base_url" bash "$repo_root/scripts/validate-supabase-db-url.sh"

mock_path="$tmp/bin:$PATH"

expect_failure() {
  local label="$1"
  shift
  if "$@" >"$tmp/failure.log" 2>&1; then
    echo "Expected failure did not occur: $label" >&2
    cat "$tmp/failure.log" >&2
    exit 1
  fi
  echo "Expected failure verified: $label"
}

expect_failure "missing SUPABASE_DB_URL" \
  env -u SUPABASE_DB_URL PATH="$mock_path" AGE_RECIPIENT="$recipient" \
  BACKUP_OUTPUT_FILE="$tmp/missing-url.age" bash "$repo_root/scripts/backup-supabase.sh"

expect_failure "direct database endpoint rejected for IPv4-only GitHub runners" \
  env SUPABASE_DB_URL='postgresql://postgres:placeholder@db.oyoyozdugicmnkfhjovo.supabase.co:5432/postgres' \
  bash "$repo_root/scripts/validate-supabase-db-url.sh"

expect_failure "pooler from a different Supabase region rejected" \
  env SUPABASE_DB_URL='postgresql://postgres.oyoyozdugicmnkfhjovo:placeholder@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require' \
  bash "$repo_root/scripts/validate-supabase-db-url.sh"

expect_failure "database URL for a different project" \
  env PATH="$mock_path" \
  SUPABASE_DB_URL='postgresql://postgres.otherproject:placeholder@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require' \
  AGE_RECIPIENT="$recipient" BACKUP_OUTPUT_FILE="$tmp/wrong-project.age" \
  bash "$repo_root/scripts/backup-supabase.sh"

expect_failure "invalid AGE_RECIPIENT" \
  env PATH="$mock_path" SUPABASE_DB_URL="$base_url" \
  AGE_RECIPIENT='not-a-valid-age-recipient' BACKUP_OUTPUT_FILE="$tmp/invalid-recipient.age" \
  bash "$repo_root/scripts/backup-supabase.sh"

mkdir -p "$tmp/bad-bin"
cat > "$tmp/bad-bin/age" <<'BAD_AGE'
#!/usr/bin/env bash
set -Eeuo pipefail
output=""
while (($#)); do
  case "$1" in
    -o) output="$2"; shift 2 ;;
    *) shift ;;
  esac
done
test -n "$output"
printf '%s\n' 'not an age ciphertext' > "$output"
BAD_AGE
chmod +x "$tmp/bad-bin/age"
expect_failure "reject output that is not age ciphertext" \
  env PATH="$tmp/bad-bin:$mock_path" SUPABASE_DB_URL="$base_url" \
  AGE_RECIPIENT="$recipient" BACKUP_OUTPUT_FILE="$tmp/plaintext.age" \
  bash "$repo_root/scripts/backup-supabase.sh"

workflow="$repo_root/.github/workflows/supabase-backup.yml"
grep -Fq 'BACKUP_FILE: ${{ steps.backup.outputs.file }}' "$workflow"
grep -Fq 'gh release create "$tag" "$BACKUP_FILE" --target main' "$workflow"
python3 - "$workflow" <<'PY'
import re
import sys
source = open(sys.argv[1], encoding="utf-8").read()
match = re.search(
    r'if \[\[ -z "\$SUPABASE_DB_URL" \|\| -z "\$AGE_RECIPIENT" \]\]; then(?P<body>.*?)\n\s*fi',
    source,
    re.S,
)
assert match, "backup preflight must check both required settings"
body = match.group("body")
assert "exit 1" in body and "exit 0" not in body, "missing configuration must fail closed"
assert "::error::" in body and "No database connection was attempted" in body
print("Missing backup configuration is tested as an explicit failure, not a green skip.")
PY
echo "Release publication wiring verified: the encrypted backup output is the release asset input."

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
output=""
role_only=false
while (($#)); do
  case "$1" in
    -f) output="$2"; shift 2 ;;
    --role-only) role_only=true; shift ;;
    *) shift ;;
  esac
done
if [[ -z "$output" ]]; then
  echo "mock could not parse output file" >&2
  exit 1
fi
if [[ "$role_only" == true ]]; then
  printf '%s\n' '-- roles' > "$output"
else
  printf '%s\n' 'CREATE TABLE public.volterra_rate_limit_windows (); CREATE FUNCTION public.volterra_check_rate_limit();' > "$output"
fi
MOCK
chmod +x "$tmp/bin/supabase"

command -v age >/dev/null 2>&1 || { echo "age is required for this test." >&2; exit 1; }
command -v age-keygen >/dev/null 2>&1 || { echo "age-keygen is required for this test." >&2; exit 1; }
age-keygen -o "$tmp/identity.txt" 2> "$tmp/keygen.log"
recipient="$(sed -n 's/^# public key: //p' "$tmp/identity.txt")"
test -n "$recipient"

PATH="$tmp/bin:$PATH" \
SUPABASE_DB_URL='postgresql://postgres.oyoyozdugicmnkfhjovo:placeholder@db.oyoyozdugicmnkfhjovo.supabase.co:5432/postgres' \
AGE_RECIPIENT="$recipient" \
BACKUP_OUTPUT_FILE="$tmp/backup.age" \
bash "$repo_root/scripts/backup-supabase.sh"

grep -q '^age-encryption.org/v1' "$tmp/backup.age"
age -d -i "$tmp/identity.txt" -o "$tmp/backup.tar.gz" "$tmp/backup.age"
mkdir "$tmp/restored"
tar -xzf "$tmp/backup.tar.gz" -C "$tmp/restored"
(cd "$tmp/restored" && sha256sum -c SHA256SUMS)
test -f "$tmp/restored/roles.sql"
grep -q "volterra_rate_limit_windows" "$tmp/restored/schema.sql"
echo "Real age encryption/decryption and checksum test passed with a mocked database CLI; no live database was accessed."

base_url='postgresql://postgres.oyoyozdugicmnkfhjovo:placeholder@db.oyoyozdugicmnkfhjovo.supabase.co:5432/postgres'
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

expect_failure "database URL for a different project" \
  env PATH="$mock_path" \
  SUPABASE_DB_URL='postgresql://postgres:placeholder@db.otherproject.supabase.co:5432/postgres' \
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
echo "Release publication wiring verified: the encrypted backup output is the release asset input."


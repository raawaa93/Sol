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

cat > "$tmp/bin/age" <<'MOCK'
#!/usr/bin/env bash
set -Eeuo pipefail
output=""
input=""
while (($#)); do
  case "$1" in
    -r) shift 2 ;;
    -o) output="$2"; shift 2 ;;
    *) input="$1"; shift ;;
  esac
done
test -n "$output" && test -s "$input"
printf 'age-encryption.org/v1\n' > "$output"
cat "$input" >> "$output"
MOCK
chmod +x "$tmp/bin/age"

PATH="$tmp/bin:$PATH" \
SUPABASE_DB_URL='postgresql://postgres.oyoyozdugicmnkfhjovo:placeholder@db.oyoyozdugicmnkfhjovo.supabase.co:5432/postgres' \
AGE_RECIPIENT='age1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq' \
BACKUP_OUTPUT_FILE="$tmp/backup.age" \
bash "$repo_root/scripts/backup-supabase.sh"

grep -q '^age-encryption.org/v1' "$tmp/backup.age"
echo "Encrypted backup orchestration test passed (mock CLI and mock age; not a live backup)."

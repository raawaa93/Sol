#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [[ "${OPTIONS_ARCHIVE_ELIGIBILITY_ACK:-}" != "CONFIRMED" ]]; then
  echo "Stop: confirm Binance Options eligibility, current terms, and permitted public-data use first."
  echo "Set OPTIONS_ARCHIVE_ELIGIBILITY_ACK=CONFIRMED only after that review."
  exit 64
fi

if [[ -z "${OPTIONS_PUBLIC_STREAMS:-}" ]]; then
  echo "Set OPTIONS_PUBLIC_STREAMS explicitly; no streams are selected automatically."
  exit 64
fi

if [[ -n "${HTTP_PROXY:-}${HTTPS_PROXY:-}${ALL_PROXY:-}${http_proxy:-}${https_proxy:-}${all_proxy:-}" ]]; then
  echo "Stop: proxy variables are not allowed for this worker. Do not route around regional restrictions."
  exit 65
fi

if [[ -n "${BINANCE_API_KEY:-}${BINANCE_SECRET_KEY:-}${BINANCE_API_SECRET:-}" ]]; then
  echo "Stop: this public-data worker does not accept API credentials."
  exit 65
fi

node -e 'const [major, minor] = process.versions.node.split(".").map(Number); if (major < 22 || (major === 22 && minor < 6)) { console.error("Node.js >=22.6.0 is required; found " + process.versions.node); process.exit(1); }'

export OPTIONS_ARCHIVE_DIR="${OPTIONS_ARCHIVE_DIR:-$HOME/.sol/options-archive}"
export OPTIONS_ARCHIVE_MAX_BYTES="${OPTIONS_ARCHIVE_MAX_BYTES:-134217728}"
export OPTIONS_ARCHIVE_MAX_RUNTIME_MS="${OPTIONS_ARCHIVE_MAX_RUNTIME_MS:-3600000}"
export OPTIONS_ARCHIVE_HEARTBEAT_MS="${OPTIONS_ARCHIVE_HEARTBEAT_MS:-30000}"
export OPTIONS_ARCHIVE_REFRESH_EXCHANGE_INFO=false

mkdir -p "$OPTIONS_ARCHIVE_DIR"
echo "Starting bounded public-stream capture. No API keys, private streams, orders, proxy, or alternate host are used."
echo "Archive: $OPTIONS_ARCHIVE_DIR"
exec node scripts/options-archive-worker.mjs

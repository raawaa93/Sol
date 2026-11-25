# Supervised Options Archive Worker — Operator Runbook

**Status:** PR #216 and reliability hardening PR #219 are merged to main (`50dfed865c75556f96aadcda12a2f8845af3fe07`, `39ca0c7e8525d4ee1b72366d89a80c3a694e77a0`); CI, Project Context Guard, and Lighthouse passed on both PR heads. Not deployed, not scheduled, and not live-market verified.

## Safety boundary

- This worker is an opt-in, Node.js 22+ process for public Binance Options market streams only.
- It has no API-key, account, user-data, trading, or order capability.
- It never selects an alternate host, proxy, VPN, or regional route. Stop on HTTP 403/451 or a rejected WebSocket upgrade; do not retry through another region.
- It does not establish that a user, account, company, or jurisdiction is eligible to access or retain the data. Confirm current product eligibility, legal terms, and permitted data use before any real collection.
- Do not point it at the shared Supabase project. No remote archive destination is configured.
- All data stays in the configured local filesystem directory. Local storage is not an off-device backup.

## Runtime defaults and hard bounds

| Setting | Default | Maximum |
|---|---:|---:|
| Archive quota | 128 MiB | 512 MiB |
| Process runtime | 1 hour | 6 hours |
| Heartbeat interval | 30 seconds | 5 minutes |
| Unique streams | explicitly supplied | 200 |

The worker validates these bounds at startup, including when invoked programmatically with an injected configuration object; duplicate or malformed injected stream lists and non-boolean refresh flags are rejected. Archive writes independently enforce the configured byte quota before publishing segments. A writer lease prevents a second process on the same filesystem host from writing to the same archive root. The collector renews this lease periodically even when streams are quiet; lease-renewal failure aborts the worker and is surfaced as a failure. Archive heartbeat read/quota failures also abort the transport, wait for collector cleanup and lease release, and fail the worker instead of continuing with an unhealthy archive. Heartbeat polling is stopped before final archive verification. Heartbeat archive-read/quota failures now abort the transport, wait for collector cleanup and lease release, and fail the worker instead of merely logging a health warning.

## Start (only after eligibility and legal checks)

Requires Node.js 22.6 or newer and a checked-out copy of this repository.

Set a dedicated archive directory and explicit public stream names. Example configuration only; this is not a claim that Binance access is available from your network or account:

```sh
export OPTIONS_ARCHIVE_DIR="$HOME/.sol/options-archive"
export OPTIONS_PUBLIC_STREAMS="btcusdt@bookTicker"
export OPTIONS_ARCHIVE_MAX_BYTES=134217728
export OPTIONS_ARCHIVE_MAX_RUNTIME_MS=3600000
export OPTIONS_ARCHIVE_HEARTBEAT_MS=30000
export OPTIONS_ARCHIVE_REFRESH_EXCHANGE_INFO=false
node scripts/options-archive-worker.mjs
```

Do not set `OPTIONS_ARCHIVE_REFRESH_EXCHANGE_INFO=true` until the public REST endpoint is confirmed permitted and reachable without alternate routing. It is disabled by default.

## Stop and restart

- Send SIGINT or SIGTERM for a graceful stop. The WebSocket transport is aborted, the collector releases its local writer lease, and the worker verifies the archive before returning.
- The configured runtime bound also aborts the transport. The worker records this as a bounded stop, not as a completed full-duration capture.
- Restart using the exact same `OPTIONS_ARCHIVE_DIR`. The archive rebuilds its idempotency index from committed segments; duplicate records are ignored and conflicting identities fail closed.
- A disconnect/reconnect creates an explicit gap record. Do not interpret a resumed connection as continuous coverage.

## Verify and recover

The archive API is implemented in `scripts/options-archive.mjs`:

- `initialize()` validates the directory and rebuilds the local index.
- `verify()` checks segment hashes, record schema, partitions, cursor integrity, and orphan temporary files.
- `exportTo(destination)` creates a new, verified local export and refuses to overwrite an existing destination.
- `ResumableOptionsArchive.restore(source, destination)` restores to a new destination and verifies it before publication.

These are library APIs, not a separately installed backup service. Keep exports on a different physical device or approved storage location if an off-device backup is required. Do not assume the same disk or same device copy is disaster recovery.

## Monitoring and failure handling

Inspect structured stdout/stderr records:

- `worker_started`: configured streams, archive path, initial byte count.
- `worker_heartbeat`: current archive bytes and configured quota.
- `worker_health_error`: a heartbeat read/health check failed.
- `worker_stopped`: verified bounded/operator stop.
- `worker_completed`: collector ended without an abort signal and archive verification passed.
- `worker_failed` / `fatal`: startup, collection, quota, or integrity failure.

Treat any `worker_failed`, `fatal`, `worker_health_error`, disconnect gap, or eligibility rejection as a condition to inspect before relying on the dataset.
- `WRITER_LEASE_RECOVERY_BUSY` means another process may be creating/recovering the lease; do not start a second writer. `WRITER_LEASE_RECOVERY_CORRUPT` means recovery metadata is malformed and cannot be safely reclaimed automatically; inspect the host and lock state manually, preserve the archive, and do not delete the lock blindly. Never fill missing intervals with interpolated or synthetic observations and label them as observed market data.

## What is not provided

- No scheduler, hosted worker, automatic restart supervisor, cloud destination, off-device backup, alert delivery, or remote monitoring is configured.
- No real Binance WebSocket/REST session, market capture, historical BBO corpus, restore drill on a separate device, or strategy edge has been verified.
- A local lease is not a distributed lock and is not intended for multiple hosts or network filesystems.
- This worker does not model full depth queue position, partial fills, latency, exchange fees, expiry settlement, or hedging. The archive alone is not evidence of a profitable strategy.

## Release gate before unattended operation

1. Confirm account/entity/jurisdiction eligibility and legal data-retention rights.
2. Run a bounded, operator-supervised forward-only trial on a compliant Node 22 host.
3. Verify non-empty observed records, clocks, BBO fields, stream identity, gap markers, byte quota and process-stop behavior.
4. Export to an independent destination and restore into a fresh directory/device; compare record counts and integrity.
5. Choose a durable Sol-specific destination only after ownership, least-privilege access, quota, retention, and restore have been demonstrated. No shared production database or paid resource is authorized by this runbook.
6. Only then consider a supervisor/scheduler and alerts. Keep collection forward-only; no backfill is claimed.

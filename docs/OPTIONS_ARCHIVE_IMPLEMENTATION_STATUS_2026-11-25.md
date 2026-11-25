# Options archive implementation status — 25 November 2026

## Scope delivered in this branch

This is a Node-only local archive foundation. It is deliberately outside the browser bundle and does not open a network connection by itself.

- `scripts/options-archive.mjs`: schema-v1 record validation, canonical JSON, raw-payload SHA-256, content-addressed NDJSON segments, deterministic idempotency, conflict rejection, durable temp-write/fsync/non-overwriting publication, checksummed cursor committed after segments, same-host cross-process writer lease with serialized stale-lock recovery, symlink rejection, orphan-temp recovery, explicit byte quota, restart index rebuild, corruption detection, and verified export/restore.
- `evaluateOptionsPointInTime`: fails closed for missing contract specification, backfill, non-observed fields, missing event clocks, future availability, stale/unbounded fields, and invalid record quality.
- `scripts/options-collector.mjs`: public REST endpoint allowlist and URL validation; 403/451 stop behavior; raw-event parsing for book ticker, option trades (MARKET/BLOCK kept separate and aggressor side derived from maker flag `m`), mark/index, 24-hour ticker, closed klines, and depth diffs with snapshot bridging and explicit gap markers.
- An injected `exchangeInfo` snapshot is archived as a raw source record and mapped only when Binance explicitly identifies `CRYPTO_OPTIONS` / `CRYPTO`, the exact underlying matches, the option side/strike/expiry/unit are present, and quote/settlement currencies agree. It stores premium unit `PER_CONTRACT` separately from the cash settlement multiplier (= verified contract unit), and timestamps spec observation at exchange `serverTime` and availability at local receipt. Snapshots older than five minutes are rejected.
- `collectForwardOptionsEvents` is opt-in and requires an injected async-iterable transport. `createFakeOptionsTransport` exists for deterministic tests. There is no default WebSocket implementation, no live connection, and no real market capture in this branch.
- `npm test` includes deterministic Node-only filesystem and fake-transport tests, including concurrent lease recovery, orphan temp recovery, symlink rejection, partial multi-partition replay, cursor corruption, quota failure, and failed restore.

## Critical limitations — do not overstate readiness

1. **No durable cloud archive exists.** The connected Supabase project is a shared free-tier project used by other workloads, including the active Volterra Binance market-data proxy. A read-only inventory found no Storage buckets. No bucket, table, migration, policy, secret, or production resource was created or changed.
2. **No automatic contract-spec fetch is wired yet.** The mapper and attachment path work only when the injected transport supplies an `exchangeInfo` snapshot before the market event. Without that snapshot, records retain `contractSpec: null` and the point-in-time gate rejects them. There is no default REST client or scheduled refresh.
3. **No actual collector transport is wired.** The parser and orchestration are fake-transport-first. There has been no HTTP request to Binance, WebSocket connection, capture, backfill, or regional egress change.
4. **Lease scope is one shared local filesystem host.** It prevents concurrent processes sharing the same archive root from writing simultaneously. It is not a distributed lease for multiple machines or a network filesystem.
5. **Export/restore is a local filesystem operation.** It is integrity-checked but not an offsite backup until a separately approved durable destination is configured.

## Existing backend reuse assessment

The existing Supabase `volterra-binance-market-data` Edge Function is active and already exposes a narrow public market-data REST allowlist with a shared rate limiter. It is not a historical collector or durable archive; its response cache is isolate-local memory. It is a possible REST source for later ingestion, subject to the configured origin allowlist and request limits. It does not provide WebSocket streaming.

The project is shared with other applications. The safe path is to keep the current code local and tested, then design a Sol-specific private archive namespace and least-privilege storage policy in a reviewed migration only after the storage/backup ownership and access model are confirmed. Do not repurpose a public bucket or expose archive data through the existing market-data proxy.

## Next gates

1. Complete CI, unchanged bundle budgets, Playwright, Project Context Guard and Lighthouse on the latest PR head.
2. Add explicit fault-injection coverage for a process crash between individual segment publications and for failed export/restore after target creation; current tests cover restart replay, checksum corruption, corrupt-source restore rejection and atomic target creation.
3. Implement an opt-in, injected REST refresh for `exchangeInfo` with rate limiting, age checks and exact snapshot retention; the pure mapper and fake-transport attachment path are already implemented.
4. Review Binance's current eligibility, terms and permitted use before any real capture. Stop on HTTP 403/451 or legal/licensing uncertainty; do not route around regional restrictions.
5. Decide on a durable Sol-specific backend. Prefer an existing free resource only if ownership, RLS, quota, backup and restore are proven. Do not write to the shared production database or provision new paid resources as part of this branch.
6. Only then implement a real WebSocket transport and a supervised scheduled worker with restart/gap handling, resource caps and monitoring.

No point-in-time dataset, historical BBO series, measured strategy edge, profitability, or live-trading capability is claimed.

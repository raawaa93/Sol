# Options archive implementation status — 25 November 2026

**Merged:** PR #176, commit `8dcd251e2cc6c03dccf04b82c0cd48eb2ada59a2`. The follow-up source-provenance hardening is PR #187, merged as `41a94cd2c08472e3c4d0d77e70e34782f9fc2200`; opt-in REST exchangeInfo refresh is merged on main as `d67d5629c61369dc388e42216b768a6466a38b12`. CI and Project Context Guard passed on the latest main commit; the Lighthouse baseline, GitHub Pages build/deploy, and published-site smoke/Lighthouse also passed (runs 45550879596, 45550879632, 45550879682, 45550879655). This is a merged local foundation, not a live collector or cloud archive.


## Scope delivered in this branch

This is a Node-only local archive foundation. It is deliberately outside the browser bundle and does not open a network connection by itself.

- `scripts/options-archive.mjs`: schema-v1 record validation, canonical JSON, raw-payload SHA-256, content-addressed NDJSON segments, deterministic idempotency, conflict rejection, durable temp-write/fsync/non-overwriting publication, checksummed cursor committed after segments, same-host cross-process writer lease with serialized stale-lock recovery, symlink rejection, orphan-temp recovery, explicit byte quota, restart index rebuild, corruption detection, and verified export/restore.
- `evaluateOptionsPointInTime`: fails closed for missing contract specification, backfill, non-observed fields, missing event clocks, future availability, stale/unbounded fields, and invalid record quality.
- `scripts/options-collector.mjs`: public REST endpoint allowlist and URL validation; 403/451 stop behavior; raw-event parsing for book ticker, option trades (MARKET/BLOCK kept separate and aggressor side derived from maker flag `m`), mark/index, 24-hour ticker, closed klines, and depth diffs with snapshot bridging and explicit gap markers.
- An injected `exchangeInfo` snapshot is archived as a raw source record and mapped only when Binance explicitly identifies `CRYPTO_OPTIONS` / `CRYPTO`, the exact underlying matches, the option side/strike/expiry/unit are present, and quote/settlement currencies agree. It stores premium unit `PER_CONTRACT` separately from the cash settlement multiplier (= verified contract unit), and timestamps spec observation at exchange `serverTime` and availability at local receipt. Snapshots older than five minutes are rejected. The hardcoded European/cash-settlement terms now carry separate legal provenance references: Binance Options Contract Specifications (published 5 January 2026) and Clearing Procedures 126–130 (expiry payoff, arithmetic-mean Index Price over the 30 minutes before expiry, and cash settlement). The archive records `settlementPriceMethod=INDEX_ARITHMETIC_MEAN` and `settlementWindowMs=1800000`; point-price Black–Scholes outputs must be disclosed as approximations to this averaging settlement, not exact settlement-model values.
- `collectForwardOptionsEvents` is opt-in and requires an injected async-iterable transport. An additional `refreshExchangeInfo` flag now enables a rate-limited public REST `/eapi/v1/exchangeInfo` refresh through a separately injected fetch transport; it archives the raw full snapshot before market events, stages contract-spec changes until the snapshot is durable, and defaults OFF. `createFakeOptionsTransport` and fake REST responses cover this path deterministically. The REST refresh has been implemented through an injected transport and tested only with fake transport. There is still no default HTTP/WebSocket market-stream transport, no live WebSocket connection, and no real market capture.
- `npm test` includes deterministic Node-only filesystem and fake-transport tests, including concurrent lease recovery, orphan temp recovery, symlink rejection, partial multi-partition replay, cursor corruption, quota failure, and failed restore.

## Critical limitations — do not overstate readiness

1. **No durable cloud archive exists.** The connected Supabase project is a shared free-tier project used by other workloads, including the active Volterra Binance market-data proxy. A read-only inventory found no Storage buckets. No bucket, table, migration, policy, secret, or production resource was created or changed.
2. **Contract-spec refresh is implemented but not live-verified.** An opt-in, injected REST refresh fetches the public `exchangeInfo` endpoint through a supplied transport, archives the raw snapshot before market events, rate-limits refreshes (five minutes by default), and clears stale specs on each full snapshot. It remains OFF by default and has only been tested with fake transport; no live Binance request has been made. Without enabling it and supplying a compliant transport, records retain `contractSpec: null` and the point-in-time gate rejects them.
3. **No actual collector transport is wired.** The parser and orchestration are fake-transport-first. There has been no HTTP request to Binance, WebSocket connection, capture, backfill, or regional egress change.
4. **Lease scope is one shared local filesystem host.** It prevents concurrent processes sharing the same archive root from writing simultaneously. It is not a distributed lease for multiple machines or a network filesystem.
5. **Export/restore is a local filesystem operation.** It is integrity-checked but not an offsite backup until a separately approved durable destination is configured.

## Existing backend reuse assessment

The existing Supabase `volterra-binance-market-data` Edge Function is active and already exposes a narrow public market-data REST allowlist with a shared rate limiter. It is not a historical collector or durable archive; its response cache is isolate-local memory. It is a possible REST source for later ingestion, subject to the configured origin allowlist and request limits. It does not provide WebSocket streaming.

The project is shared with other applications. The safe path is to keep the current code local and tested, then design a Sol-specific private archive namespace and least-privilege storage policy in a reviewed migration only after the storage/backup ownership and access model are confirmed. Do not repurpose a public bucket or expose archive data through the existing market-data proxy.

## Next gates

1. Add explicit fault-injection coverage for a process crash between individual segment publications and for failed export/restore after target creation; current tests cover restart replay, checksum corruption, corrupt-source restore rejection, atomic target creation and destination no-overwrite.
2. **Completed in code** on main commit `d67d5629c61369dc388e42216b768a6466a38b12`: opt-in injected REST refresh for `exchangeInfo`, five-minute default rate limit, snapshot age validation, durable raw snapshot retention before market events, and fake-transport regression tests. It remains disabled by default and is not live-verified.
3. Verify the Binance RIE/RCH legal terms applicability to the specific service/account entity before treating those exercise and settlement assumptions as account-specific.
4. Review Binance's current eligibility, terms and permitted use before any real capture. Stop on HTTP 403/451 or legal/licensing uncertainty; do not route around regional restrictions.
5. Decide on a durable Sol-specific backend. Prefer an existing free resource only if ownership, RLS, quota, backup and restore are proven. Do not write to the shared production database or provision new paid resources without the required authorization.
6. Only then implement a real WebSocket transport and a supervised scheduled worker with restart/gap handling, resource caps and monitoring.

No point-in-time dataset, historical BBO series, measured strategy edge, profitability, or live-trading capability is claimed.


## Follow-up verification — 25 November 2026, 05:03 UTC

- PR #187 merged as `41a94cd2c08472e3c4d0d77e70e34782f9fc2200`. Binance 24-hour ticker event time and close time are now distinct from BBO/mark-price timestamps; REST `/eapi/v1/mark` values use their own local receive time rather than aggregate snapshot completion; stale mark-price events cannot overwrite a newer index; model Greeks and risk-neutral EV fail closed on stale or mismatched sources. The duplicate PR #188 was closed unmerged after its latest build failed TypeScript due to using optional `fetchedAt` instead of a dedicated mark receive timestamp. PR #187 passed CI, Lighthouse and Project Context Guard before merge.
- Main commit `d67d5629c61369dc388e42216b768a6466a38b12` adds opt-in injected REST `exchangeInfo` refresh, durable raw snapshot append before publishing the new contract-spec map, rate limiting and lease renewal. CI and Project Context Guard passed. Lighthouse, GitHub Pages deployment and published-site smoke/Lighthouse subsequently passed on the mainline run set (45550879682, 45550879655).
- No real Binance HTTP/WebSocket market-data capture, live account eligibility verification, cloud archive, or historical data collection is claimed.

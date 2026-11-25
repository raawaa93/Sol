# Options archive implementation status — 25 November 2026

**Merged:** PR #176, commit `8dcd251e2cc6c03dccf04b82c0cd48eb2ada59a2`. The follow-up source-provenance hardening is PR #187, merged as `41a94cd2c08472e3c4d0d77e70e34782f9fc2200`; opt-in REST exchangeInfo refresh is merged on main as `d67d5629c61369dc388e42216b768a6466a38b12`. CI and Project Context Guard passed on the latest main commit; the Lighthouse baseline, GitHub Pages build/deploy, and published-site smoke/Lighthouse also passed (runs 45550879596, 45550879632, 45550879682, 45550879655). This is a merged local foundation, not a live collector or cloud archive.


## Scope delivered in this branch

This is a Node-only local archive foundation. It is deliberately outside the browser bundle and does not open a network connection by itself.

- `scripts/options-archive.mjs`: schema-v1 record validation, canonical JSON, raw-payload SHA-256, content-addressed NDJSON segments, deterministic idempotency, conflict rejection, durable temp-write/fsync/non-overwriting publication, checksummed cursor committed after segments, same-host cross-process writer lease with serialized stale-lock recovery, symlink rejection, orphan-temp recovery, explicit byte quota, restart index rebuild, corruption detection, and verified export/restore.
- `evaluateOptionsPointInTime`: fails closed for missing contract specification, backfill, non-observed fields, missing event clocks, future availability, stale/unbounded fields, and invalid record quality.
- `scripts/options-collector.mjs`: public REST endpoint allowlist and URL validation; 403/451 stop behavior; raw-event parsing for book ticker, option trades (MARKET/BLOCK kept separate and aggressor side derived from maker flag `m`), mark/index, 24-hour ticker, closed klines, and depth diffs with snapshot bridging and explicit gap markers.
- An injected `exchangeInfo` snapshot is archived as a raw source record and mapped only when Binance explicitly identifies `CRYPTO_OPTIONS` / `CRYPTO`, the exact underlying matches, the option side/strike/expiry/unit are present, and quote/settlement currencies agree. It stores premium unit `PER_CONTRACT` separately from the cash settlement multiplier (= verified contract unit), and timestamps spec observation at exchange `serverTime` and availability at local receipt. Snapshots older than five minutes are rejected. The hardcoded European/cash-settlement terms now carry separate legal provenance references: Binance Options Contract Specifications (published 5 January 2026) and Clearing Procedures 126–130 (expiry payoff, arithmetic-mean Index Price over the 30 minutes before expiry, and cash settlement). The archive records `settlementPriceMethod=INDEX_ARITHMETIC_MEAN` and `settlementWindowMs=1800000`; point-price Black–Scholes outputs must be disclosed as approximations to this averaging settlement, not exact settlement-model values.
- `collectForwardOptionsEvents` is opt-in and requires an injected async-iterable transport. An additional `refreshExchangeInfo` flag now enables a rate-limited public REST `/eapi/v1/exchangeInfo` refresh through a separately injected fetch transport; it archives the raw full snapshot before market events, stages contract-spec changes until the snapshot is durable, and defaults OFF. `createFakeOptionsTransport` and fake REST responses cover this path deterministically. The REST refresh has been implemented through an injected transport and tested only with fake transport. PR #192 now adds a Node-only public WebSocket transport with bounded queues, cancellation, reconnect policy and explicit disconnect/gap events; it is opt-in and is not wired to a supervised worker. No live WebSocket connection or real market capture has occurred.
- `npm test` includes deterministic Node-only filesystem and fake-transport tests, including concurrent lease recovery, orphan temp recovery, symlink rejection, partial multi-partition replay, cursor corruption, quota failure, and failed restore.

## Critical limitations — do not overstate readiness

1. **No durable cloud archive exists.** The connected Supabase project is a shared free-tier project used by other workloads, including the active Volterra Binance market-data proxy. A read-only inventory found no Storage buckets. No bucket, table, migration, policy, secret, or production resource was created or changed.
2. **Contract-spec refresh is implemented but not live-verified.** An opt-in, injected REST refresh fetches the public `exchangeInfo` endpoint through a supplied transport, archives the raw snapshot before market events, rate-limits refreshes (five minutes by default), and clears stale specs on each full snapshot. It remains OFF by default and has only been tested with fake transport; no live Binance request has been made. Without enabling it and supplying a compliant transport, records retain `contractSpec: null` and the point-in-time gate rejects them.
3. **No supervised collector or real capture exists.** A Node-only public WebSocket transport is merged in PR #192, but the worker remains opt-in and is not scheduled or wired to a durable cloud archive. The REST refresh still requires an injected transport. There has been no HTTP request to Binance, WebSocket connection, capture, backfill, or regional egress change.
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
6. **Completed in code:** PR #192 merged as 8e97c76dea8646eec8a116b1116e2cf1e88dba72 adds the public-only WebSocket transport. Next, implement a supervised worker and durable destination only after the archive ownership/legal gates; add restart/gap recovery, resource caps and monitoring.

No point-in-time dataset, historical BBO series, measured strategy edge, profitability, or live-trading capability is claimed.


## Follow-up verification — 25 November 2026, 05:03 UTC

- PR #187 merged as `41a94cd2c08472e3c4d0d77e70e34782f9fc2200`. Binance 24-hour ticker event time and close time are now distinct from BBO/mark-price timestamps; REST `/eapi/v1/mark` values use their own local receive time rather than aggregate snapshot completion; stale mark-price events cannot overwrite a newer index; model Greeks and risk-neutral EV fail closed on stale or mismatched sources. The duplicate PR #188 was closed unmerged after its latest build failed TypeScript due to using optional `fetchedAt` instead of a dedicated mark receive timestamp. PR #187 passed CI, Lighthouse and Project Context Guard before merge.
- Main commit `d67d5629c61369dc388e42216b768a6466a38b12` adds opt-in injected REST `exchangeInfo` refresh, durable raw snapshot append before publishing the new contract-spec map, rate limiting and lease renewal. CI and Project Context Guard passed. Lighthouse, GitHub Pages deployment and published-site smoke/Lighthouse subsequently passed on the mainline run set (45550879682, 45550879655).
- No real Binance HTTP/WebSocket market-data capture, live account eligibility verification, cloud archive, or historical data collection is claimed.


## Binance Clearing Procedures amendment provenance — 25 November 2026

The canonical legal provenance and archived contract specification now include the official 21 May 2026 amendment notice (https://bin.bnbstatic.com/static/cms/cg08ou2ak0tn7mcplvfg/file/fa97cef498054d23290ba2a132eda63816395d84766af2db7b433d906432dd0b.pdf), its effective date, version 1.3, and `clearingProceduresConsolidatedTextVerified=false`. The canonical validator requires the exact amendment reference; missing or substituted provenance prevents exercise/settlement adapter readiness.

This is provenance tracking only. The notice is for Binance RCH and does not establish applicability to Binance RIE or any specific account/entity. The consolidated v1.3 text and its section-level impact on Crypto Options settlement remain unverified.


## Follow-up verification — 25 November 2026, 07:40 UTC

- PR #192 merged as 8e97c76dea8646eec8a116b1116e2cf1e88dba72. Its local-overflow gap code was corrected to report synthetic abnormal termination (1006) while closing the socket normally (1000), matching the test and preserving the archive gap signal.
- The merged PR passed CI run 45569786353, Lighthouse baseline 45569786394, and Project Context Guard 45569786341. The tests use a fake WebSocket; they do not prove live Binance connectivity.
- The transport is Node-only and opt-in. It does not create a scheduler, persistent worker, cloud archive, credentials, private streams or order path. It does not bypass regional restrictions.
- Still not verified: any live Binance market capture, account/product eligibility, legal permission to trade from Syria, historical BBO coverage, or a strategy edge.


## Follow-up verification — IV history and collector transport, 25 November 2026

- PR #194 merged as 7183ab85eac7e9d7556cc3716b7d1790948c63d6. It adds source-bound IV Rank/Percentile and near-30-day ATM IV extraction from fresh paired Binance REST mark-IV quotes; it interpolates total variance only when expiries bracket 30 days. The series is isolated by underlying, venue, source and IV convention.
- Local IV history is versioned and bounded (400 days, 2,000 records), deduplicates exact observation IDs, fails closed on corrupt storage/quota errors and supports JSON export. It is stored in the current browser only, is unencrypted and is collected only on a user-triggered Binance refresh.
- UI explicitly shows insufficient/partial history and states that IV Rank/Percentile are not probabilities of profit or direction forecasts. Demo/CSV/model/venue-volatility values are not mixed into the observed Binance REST mark-IV series.
- CI 45570010720 passed 293 tests, production build, bundle budget and Playwright; Lighthouse 45570010778 and Project Context Guard 45570010823 passed.
- No real Binance HTTP/WebSocket capture, scheduled worker, cross-device cloud archive, historical BBO dataset, strategy edge, or live trading capability is claimed.


## Follow-up verification — IV history end-to-end coverage — 25 November 2026, 07:49 UTC

- PR #194 merged as `7183ab85eac7e9d7556cc3716b7d1790948c63d6`, adding source-homogeneous IV Rank/Percentile, conservative 30-day ATM REST mark-IV extraction, bounded browser-local history and explanatory UI.
- PR #196 merged as `26b82d63bdd533c96fba8a881a8036fcf7c0b470`, adding a deterministic browser journey for paired 20/40-DTE CALL/PUT quotes, insufficient-history disclosure and provenance-preserving JSON export.
- CI 45570955327 passed 293 unit/property tests, production build, compressed bundle budget and 18 Playwright journeys. Lighthouse 45570955246 and Project Context Guard 45570955274 passed.
- These are code/test results only. No live Binance request, scheduled capture, cloud archive, historical BBO corpus or strategy edge is claimed.


## Follow-up — executable BBO replay evidence — 25 November 2026, 08:04 UTC

PR #204 merged as `337e03fb26d44c906125318affc473030c165da4`.

- Replay requires explicit BBO source, source-event time, local receive time, valid non-estimated bid/ask, explicit size unit and sufficient displayed size at both entry and exit.
- Execution ordering uses receive/availability time; source event time remains separately recorded. REST option-ticker BBO clock is `ticker`; WebSocket `optionTicker` remains a separate 24-hour last-price/statistics stream.
- Binance bookTicker adapter records event/transaction time, local receive time, displayed quantities and contract-count units.
- CSV preserves the evidence fields but does not authenticate the user's source claims.
- Replay applies configurable adverse per-side slippage and reports source, timestamps, displayed size, fills and slippage cost.

Verification:
- CI 45572889900: 303/303 tests passed; production build and compressed bundle budget passed; mocked age-encryption/backup tests passed; 18/18 Playwright journeys passed.
- Bundle: initial JS 96.985/100 KiB, all JS 127.871/240 KiB, CSS 13.571/14 KiB.
- Lighthouse 45572889852: 99/100 Performance, 100/100 Accessibility, Best Practices and SEO.
- Project Context Guard 45572889839 passed.

No live market capture, scheduled worker, cloud archive, PIT dataset, strategy edge or live order capability was added.


## BBO-aware replay update — 25 November 2026

- PR #204 merged as `337e03fb26d44c906125318affc473030c165da4`.
- Replay requires explicit BBO source, source-event/snapshot time, local receive time, non-estimated bid/ask, displayed-size unit and sufficient Ask size at entry/Bid size at exit. It uses receive/availability time for execution chronology and rejects missing, future, stale, mark-only, estimated or undersized quotes.
- Binance `bookTicker` is the executable BBO source and records quantities in contracts/lots. The 24-hour `optionTicker` stream is not BBO. REST `OPTION_TICKER` BBO uses the `ticker` source clock.
- CSV imports preserve source/receive clocks and displayed size, but their provenance is user-asserted and not independently authenticated. Zero fees/slippage are unmodelled and potentially optimistic.
- CI 45572889900: 303/303 tests, production build, bundle budget and 18/18 Playwright journeys passed. Lighthouse 45572889852: Performance 99, Accessibility/Best Practices/SEO 100. Project Context Guard 45572889839 passed.
- The replay remains PAPER-only. No live capture, historical BBO corpus, full depth/queue/partial-fill/latency/expiry-settlement/hedging model or measured strategy edge is claimed.

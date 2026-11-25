# Options Research Engine — Execution Record

**Date:** 25 November 2026  
**Repository:** raawaa93/Sol  
**Status:** Two implementation PRs merged; research/PAPER system only. Not a live trading product.

## Executive result

The options research foundation now has source-bound historical IV metrics and a Node public WebSocket transport. It remains incomplete as a continuous autonomous research service because no supervised worker, durable cloud archive, historical executable BBO corpus or measured strategy edge exists.

## Merged changes

### PR #192 — public Binance Options WebSocket transport
- Merge commit: 8e97c76dea8646eec8a116b1116e2cf1e88dba72.
- Added Node-only public WebSocket transport, bounded queue, cancellation, bounded reconnect and explicit disconnect/gap events.
- Review caught and fixed the local queue-overflow signal: the archive receives abnormal gap code 1006 while the socket is closed with normal local code 1000.
- Passed CI 45569786353, Lighthouse 45569786394 and Project Context Guard 45569786341.
- Not live-verified; transport remains opt-in and is not scheduled or connected to a durable worker.

### PR #194 — IV Rank, Percentile and local history
- Merge commit: 7183ab85eac7e9d7556cc3716b7d1790948c63d6.
- Added deterministic IV Rank and IV Percentile using source-homogeneous daily samples.
- Requires at least 30 distinct UTC days; uses trailing 365 calendar days; one latest observation per UTC day; excludes future, stale, wrong-source and wrong-convention data.
- Added near-30-day ATM IV extraction from fresh paired CALL/PUT Binance REST mark-IV quotes. It selects the nearest ATM strike per expiry and interpolates total variance only when expiries bracket 30 days.
- Added local browser history with versioning, exact-ID deduplication, 400-day retention, 2,000-record cap, corruption/quota failure handling and JSON export.
- Added UI cards with sample count, coverage, min/max, partial-history and limitations.
- Demo, CSV, model IV, bid/ask IV and venue volatility are not mixed into the observed Binance REST mark-IV history.

## Verification

| Check | Evidence | Result |
|---|---|---|
| Unit/property suite | CI 45570010720 | 293 passed, 0 failed |
| Production build | CI 45570010720 | Passed |
| Compressed bundle budget | CI 45570010720 | Passed after dynamic imports |
| Playwright browser journeys | CI 45570010720 | Passed |
| Lighthouse | 45570010778 | Passed |
| Project Context Guard | 45570010823 | Passed |
| Collector transport CI | 45569786353 | Passed |
| Collector Lighthouse | 45569786394 | Passed |
| Collector Project Context Guard | 45569786341 | Passed |

The local runtime could not clone github.com, so no local npm test execution is claimed. Changes were made on isolated GitHub branches and verified by repository CI.

## Current behavior and limitations

- IV metrics are computed only from Binance REST Mark IV with paired CALL/PUT quotes and a 30-day standardized tenor. If the current chain does not provide valid expiries bracketing 30 days, the metric remains unavailable rather than extrapolating.
- A daily sample is recorded only when the user opens or refreshes the Binance view. There is no background sampling.
- History is stored in browser localStorage, unencrypted and device-local. JSON export exists; import is intentionally deferred because imported files cannot independently prove original provider provenance.
- The WebSocket transport is a library layer, not a managed worker. No live connection or market capture was attempted.
- No historical executable BBO tape exists. REST depth snapshots, mark prices, EOD data and recent trades must not be misrepresented as historical executable quotes.
- Existing replay and statistical validation primitives do not establish an edge without point-in-time evidence and forward PAPER results.
- No orders, private streams, API keys, funding, transfers or live execution were added.

## Cloud storage investigation

- Existing Supabase project Ghaioooth-core is shared with other work and was not modified.
- Its existing branch is associated with Raawaa-store and is non-persistent; it is not reused.
- A new Supabase development branch was quoted at USD 0.01344/hour, approximately USD 9.81 per 730-hour month. This is recurring spend and is rejected.
- A new free Supabase project was quoted at USD 0/month. It is the preferred cloud candidate because it isolates Sol from the shared production project.
- The Supabase connector requires the user to choose the organization before project creation. The only organization currently visible is Ghaiooth; project creation has not been attempted.
- A free project can pause after seven days of low database activity and has free-tier quotas. A heartbeat may reduce pause risk but must be verified, not assumed.
- Cloud writes require a secure authenticated design and row-level security. A public unauthenticated insert endpoint is rejected. No service-role secret or shared production credentials are stored in the repository.
- Official references: https://supabase.com/docs/guides/platform/billing-on-supabase, https://supabase.com/docs/guides/platform/branching, https://supabase.com/docs/guides/platform/going-into-prod

## Hosting decision

The zero-cost hosting comparison and operational gates are recorded in [OPTIONS_COLLECTOR_HOSTING_DECISION_2026-11-25.md](./OPTIONS_COLLECTOR_HOSTING_DECISION_2026-11-25.md). Cloudflare Workers Free + R2 is a candidate for scheduled REST sampling, not a deployed service; Render cron/workflows have usage costs, and the connected Render workspace currently has no resources. No capture or deployment was started.

## Remaining work, ordered

1. Choose the Supabase organization for a separate free Sol project and settle the authentication model. No payment or paid branch.
2. Create isolated tables/buckets with RLS and test least-privilege access before any data upload.
3. Add a scheduled, supervised, forward-only public data collector only after permitted source access and region/legal checks. Stop on 403/451; do not change egress to evade restrictions.
4. Build durable daily IV sampling and accumulate at least 30 observations; continue toward a full 365-day series.
5. Capture point-in-time BBO/size, mark/index, trade, contract specs, fees and gaps with consistent source/event/receive timestamps.
6. Upgrade replay and walk-forward strategy validation with bid/ask fills, displayed size, fees, slippage, latency, expiry/settlement, no-trade baseline and multiple-testing controls.
7. Add cross-asset candidate ranking only when data and contract economics are verified; score opportunities for review, never assert profit probabilities from IV Rank alone.
8. Maintain PAPER-only status until local legal advice and exact account/product permissions are verified.

## Final status labels

- **Implemented:** IV history calculations, local storage/export, IV UI, public WebSocket transport.
- **Merged:** PR #192 and PR #194.
- **Tested:** 293 unit/property tests, production build, bundle budget, Playwright, Lighthouse and Project Context Guard passed.
- **Live-verified:** No live market capture.
- **Deployed:** No new cloud service or worker deployed.
- **Profitable:** Not established.
- **Live trading:** Not enabled.


## Follow-up — IV history browser acceptance (25 November 2026, 07:49 UTC)

PR #196 merged as `26b82d63bdd533c96fba8a881a8036fcf7c0b470`. It adds an end-to-end browser journey with mocked Binance REST responses for paired 20/40-DTE CALL/PUT contracts. The test verifies source-bound 30-day IV extraction, keeps IV Rank unavailable with one daily sample, and exports a JSON backup retaining source, underlying and tenor metadata.

- CI 45570955327: 293 unit/property tests passed, production build passed, bundle budget passed, and 18/18 Playwright journeys passed.
- Lighthouse 45570955246: passed.
- Project Context Guard 45570955274: passed.

This test does not change the operational limitations: there is still no live capture, scheduled worker, durable cloud archive or measured strategy edge.


## Follow-up — timestamped BBO replay integrity — 25 November 2026, 08:04 UTC

PR #204 merged to main as `337e03fb26d44c906125318affc473030c165da4` (PR merge commit `d5764779a5070161a7d7c82201d1db12483f5ec6`). It closes the replay execution-evidence gap:

- Replay now requires an explicit BBO source, source-event timestamp, local receive timestamp, non-estimated two-sided prices, explicit displayed-size unit, and enough Ask size to enter plus Bid size to exit.
- Execution chronology uses local receive/availability time; source event time remains separately recorded. The REST `OPTION_TICKER` BBO timestamp remains distinct from the WebSocket `optionTicker` 24-hour statistics clock.
- Binance `bookTicker` captures exchange event time, local receive time, bid/ask quantities and explicit contract-count units.
- CSV import preserves source/receive clocks and size units, but these remain user-asserted and are not independently authenticated.
- Replay applies configurable adverse per-side slippage and exposes source, clocks, displayed sizes, fills and slippage in the UI. The downloadable CSV template and E2E fixtures were updated.
- Opportunity review was deferred/lazy-loaded to preserve the initial bundle budget.

**Fresh verification evidence**
- CI run 45572889900: 303/303 unit/property tests passed; production TypeScript/Vite build passed; compressed bundle budget passed; age-encryption/backup orchestration tests passed against a mocked database; 18/18 Playwright journeys passed.
- Bundle measurements: initial JS 96.985 KiB / 100 KiB; all JS 127.871 KiB / 240 KiB; CSS 13.571 KiB / 14 KiB.
- Lighthouse run 45572889852: Performance 99/100, Accessibility 100/100, Best Practices 100/100, SEO 100/100; FCP/LCP 757 ms, TBT 120 ms, CLS 0.000.
- Project Context Guard run 45572889839: passed.
- PR #201 was closed unmerged as a superseded duplicate; PR #204 is the merged implementation.

**Remaining limits are unchanged:** no live Binance capture, no scheduled/supervised worker, no cloud archive, no historical executable BBO corpus, no walk-forward evidence or measured strategy edge, and no live trading. The replay is a PAPER execution baseline, not a signal strategy or proof of profitability.

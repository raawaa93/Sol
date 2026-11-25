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

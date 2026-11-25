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


## PAPER campaign risk reconciliation — 25 November 2026, 08:26 UTC

- PR #213 merged to main as `bda4a680aa89c983889eabb65c35d6b9ea996503` after the updated head passed CI run 45576189481, Lighthouse run 45576189448, and Project Context Guard run 45576189336.
- The campaign ledger now fails closed on zero/negative or unreconciled premium debits, non-finite/overflowing costs, malformed or internally inconsistent summaries, invalid per-attempt limits, and unsupported/mixed currencies.
- The configured PAPER limits remain a $60 cumulative premium-and-fee allocation ceiling and $20 per attempt. This is a local PAPER allocation guard, not an exchange-side or live loss guarantee.
- The PR-head CI completed successfully, including unit/property tests, production build, compressed bundle budget and browser journeys. Lighthouse and Project Context Guard also completed successfully.

## Remaining archive and research gates — still open

- The archive schema, local resumable filesystem store, public REST allowlist, fake-transport-tested REST refresh, and opt-in Node WebSocket transport exist. They are libraries/primitives, not an operating supervised collector.
- No real Binance market capture, point-in-time historical BBO corpus, scheduled worker, durable off-device archive, restore drill, or strategy edge is verified.
- Do not use the shared Supabase project for archive writes: it is shared with other workloads and no isolated Sol archive namespace, retention policy, quota, or restore path has been approved and tested.
- **Completed in PR #216:** a supervised Node worker with explicit start/stop, bounded runtime/storage, periodic writer-lease renewal during quiet streams, graceful transport cancellation, archive verification at shutdown, and offline tests for bounds, stop semantics and idle-stream lease renewal. It remains opt-in and is not scheduled or deployed.
- Remaining order: (1) select a separately reviewed durable destination with ownership, least-privilege access, cost controls, retention and restore proof; (2) conduct a supervised forward-only capture trial only after legal/product eligibility and network response are confirmed without routing around restrictions; (3) build a verified point-in-time executable quote corpus; (4) run out-of-sample strategy experiments only after adequate data quality and coverage.
- Keep all work read-only/PAPER. No API credentials, account streams, order methods, paid services, new cloud resources, or live trading.


## Supervised worker merge — 25 November 2026, 08:38 UTC

- PR #216 merged to main as `50dfed865c75556f96aadcda12a2f8845af3fe07` (squash). Superseded PR #215 was closed unmerged.
- PR-head CI run 45577826033 passed, including unit/property tests, mocked backup checks, production build, compressed bundle budget and browser journeys. Lighthouse run 45577826088 passed. Project Context Guard run 45577826027 passed.
- The worker requires explicit archive path and public stream names, enforces a 512 MiB maximum archive quota and six-hour maximum runtime, records graceful/operator/runtime stops distinctly, verifies archive integrity at shutdown, and renews the local single-host writer lease during quiet streams. Lease-renewal failure aborts collection.
- An operator runbook is available at `docs/OPTIONS_ARCHIVE_WORKER_RUNBOOK_2026-11-25.md`.
- The worker is opt-in only. No schedule, cloud destination, live Binance capture, off-device backup, or trading capability was activated. No eligibility or legal-use conclusion is inferred from public market-data API documentation.

## Durable storage and unattended compute decision — 25 November 2026

### Compared options

- **Cloudflare R2 — preferred storage candidate, not provisioned.** The current Standard free allowance is 10 GB-month storage, 1 million Class A operations and 10 million Class B operations per month; internet egress is free. Usage above the included allowance is billable, the allowance is monthly, and R2 requires account activation/checkout. Use immutable, batched archive segments and a manifest rather than one object per market event. Do not enable until account ownership, a hard usage ceiling, billing controls, scoped credentials, retention and restore are verified. Sources: https://developers.cloudflare.com/r2/pricing/ and https://developers.cloudflare.com/r2/get-started/
- **GitHub Actions — viable bounded compute, not an always-on guarantee.** Standard hosted runners are free and unlimited for public repositories, but each hosted job has a six-hour maximum. Public scheduled workflows can be delayed or dropped during high load and are disabled after 60 days without repository activity. Actions artifacts have finite retention and the Free plan's artifact-storage allowance is 500 MB, so they are not the canonical long-term archive. Sources: https://docs.github.com/en/actions/reference/runners/github-hosted-runners, https://docs.github.com/en/actions/reference/limits, https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows, https://docs.github.com/en/actions/reference/limits
- **Cloudflare Workers Free — not suitable for the current long-lived WebSocket collector.** Current free limits include 10 ms CPU per invocation and a 15-minute Cron Trigger execution ceiling. It may be useful for small scheduled REST sampling, but it cannot replace the current six-hour Node worker as a continuous stream process. Source: https://developers.cloudflare.com/workers/platform/limits/
- **Supabase Free — rejected for this archive.** The existing project is shared and remains off-limits. The free tier has no automatic backups and may pause after a week of inactivity; a separate project would still require an isolated access/RLS model and a tested restore process. Sources: https://supabase.com/pricing and https://supabase.com/docs/guides/platform/billing-on-supabase

### Decision

No cloud resource, subscription, credential, schedule or billing change was created. The best zero-recurring-cost candidate architecture is a bounded GitHub-hosted runner session that exports immutable, verified segments to a dedicated R2 bucket, with a separate restore drill and usage guard. GitHub scheduled runs are not a reliability guarantee; if continuous 24/7 capture is required, a persistent compute host is still needed and no verified zero-cost, authorized host is currently available.

### Next release gates

1. Confirm current Binance product/account/jurisdiction eligibility and data-retention rights before any real capture. Public API reachability is not proof of permission to trade or redistribute data.
2. Provision an isolated R2 bucket only after account access and cost controls are available; use a narrowly scoped token and never commit credentials.
3. Add an idempotent segment uploader and manifest/cursor reconciliation, with checksums, object-size caps, retry bounds and no destructive overwrite.
4. Restore into a fresh directory/device and compare segment hashes, counts and cursor state.
5. Only then evaluate a scheduled bounded capture. Preserve gap markers and alert on missed sessions; do not describe scheduled Actions as continuous coverage.

### Additional free compute candidate — Oracle OCI Always Free

- OCI documents Always Free compute for the life of the account: up to 2 OCPUs and 12 GB RAM on Ampere A1, plus 200 GB combined block-volume storage in the home region. This is enough capacity for the Node worker, subject to region availability and ARM64 compatibility.
- It is **not provisioned**. Oracle generally requires a credit/debit card for identity verification; a temporary authorization hold may occur. A free account must use accurate billing/contact information, only one free account is permitted per person, and capacity may be unavailable in the selected home region.
- Oracle may reclaim an Always Free VM if CPU, network and memory utilization all remain below its documented thresholds for seven days. Do not generate artificial load to avoid reclamation. A low-volume market stream may not reliably prevent idle classification.
- Therefore OCI is a possible zero-recurring-cost compute host only if the user already has or can legitimately create an eligible account, can tolerate card verification and capacity uncertainty, and the actual worker workload satisfies the provider's idle policy. It is not currently a verified persistent runtime.
- Official sources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm and https://www.oracle.com/cloud/free/faq/

**Current decision:** R2 remains the preferred dedicated archive destination; OCI Always Free is the best candidate found for compute, but neither has been provisioned. No card details, account credentials, resource creation, or paid upgrade were requested or used.


## Worker health fail-closed hardening — PR #219

- PR #219 merged to main as `39ca0c7e8525d4ee1b72366d89a80c3a694e77a0`.
- Heartbeat archive-read/quota failures now abort the collector transport, wait for collector cleanup and writer lease release, and fail the worker rather than merely logging a warning.
- AbortSignal is propagated from worker through collector to WebSocket transport; injected stream configuration rejects duplicates, malformed values and invalid refresh flags.
- Heartbeat polling is stopped before final archive verification, preventing a timer race from misclassifying a final verification error as an operator stop.
- CI 45579436891, Lighthouse 45579436842 and Project Context Guard 45579436903 passed on the PR head.
- This remains local, opt-in and undeployed. No schedule, remote storage, real market capture or trading was enabled.

## Historical options data availability research — 25 November 2026

- Binance's official Options REST market-data catalog includes historical trades, klines, historical exercise records, mark/Greeks, ticker, index and open-interest endpoints. It does **not** expose a historical time-series endpoint for BBO/bookTicker or depth replay. The live WebSocket @bookTicker and depth streams provide forward observations only. Official catalog: https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-options/api/rest-api/market-data and https://developers.binance.info/en/docs/catalog/core-trading-derivatives-trading-options/api/ws-streams
- The Binance Data Vision archive does not currently provide a verified options BBO archive. Do not substitute spot/perpetual order books for option-contract BBO.
- ByKaranteli publishes a free CC0-style options-chain daily snapshot with per-instrument open interest, mark IV and underlying price. This is useful for coarse context, not executable quote reconstruction. Its deeper options OI history and recorded Deribit options tape are pay-per-call x402 endpoints; no paid calls were made. Sources: https://bykaranteli.com/data and https://bykaranteli.com/developers
- Tardis/CryptoStruct and other tick vendors advertise options order-book history, but access is paid or limited to samples; they are outside the current zero-spend policy. Do not use sample days as evidence of full-history coverage.
- **Conclusion:** no verified, free, historical Binance Options executable-BBO corpus was found. Historical trade prints or hourly/daily IV/OI snapshots cannot reconstruct the bid/ask available at each trade timestamp. The defensible choices are (a) forward-only BBO/depth capture on a permitted host, or (b) an explicitly authorized licensed dataset. Until one exists, no fill-quality backtest or strategy-edge claim is valid.

## Replay expiry safety — PR #221

- PR #221 merged to main as `c0a954200206f66649211af18a2ab4ab44a963f5`.
- Replay now rejects missing/malformed expiry, filters quotes received at/after contract expiry, and refuses a fixed-hold trade if its planned exit reaches or crosses expiry. It also counts a final pre-expiry snapshot as blocked when no valid post-expiry exit quote exists.
- This is deliberately conservative: expiry settlement/assignment is not yet simulated. The engine no longer fabricates an executable quote exit after expiry.
- CI 45580093851 passed, Lighthouse 45580093810 passed, and Project Context Guard 45580093838 passed.

## Historical OKX L2 options data lead — 25 November 2026

- OKX's public historical-market-data API documents order-book modules 4/5/6 (400/5000/50 levels); module 5 is listed as 5000-level from 1 November 2025. Its official change log states the endpoint is public and supports historical order-book data. The 6 August 2026 change log reduced query ranges to 10 days for daily and 10 months for monthly requests. Sources: https://www.okx.com/docs-v5/log_en/ and https://www.okx.com/historical-data
- Third-party endpoint schema documentation indicates `instType=OPTION` and `instFamilyList` are accepted for historical order-book modules; module 6 has a special one-family/one-day restriction and is being deprecated. This is a lead only: no sample response was downloaded or verified, and snapshot cadence, completeness, timestamp semantics, and backfill coverage remain unproven. Sources: https://qveris.ai/tools/okx_api_v5.public.market-data-history.list.v5.6b2d6ffc and https://github.com/burakoner/OKX.Api/blob/master/docs/reference/public.md
- **Rejected for current Sol collection:** OKX's Risk & Compliance Disclosure lists Syria among Restricted Locations and says it may restrict all or part of services there; it names UK restrictions for derivatives-related services. Its API Agreement restricts public market data to personal, non-commercial use and prohibits redistribution or use to build a competing analytics/data service without prior written consent. A public unauthenticated endpoint is not a rights grant. Sources: https://www.okx.com/help/risk-compliance-disclosure and https://www.okx.com/help/okx-api-agreement
- Therefore do not probe, collect, store, or integrate OKX options market data for this project under the current Syria eligibility record. Do not publish any OKX raw market data to this public repository. Revisit only if the user's actual residence/eligibility is lawfully different and OKX gives written data-use permission suitable for the intended research and storage.
- **Conclusion unchanged:** no verified, permitted, free historical options executable-BBO corpus is currently available to Sol. Keep forward capture opt-in and disabled until a permitted host/data right is established; no strategy edge or profitability claim is valid without point-in-time executable quotes.

## Archive recovery race and replay expiry guard — PR #223

- PR #223 merged as `1cc8811b566b590be9b96af2441cef2f4fb39e18`.
- Fixed the main-branch CI race where a contender could read a recovery lock between exclusive file creation and its durable JSON write. A recent partial recovery lock now returns `WRITER_LEASE_RECOVERY_BUSY`.
- Malformed recovery locks are no longer deleted automatically, even if old, because owner/process metadata cannot be verified. The worker fails closed with `WRITER_LEASE_RECOVERY_CORRUPT` and requires manual inspection rather than risking deletion of a live recovery lock.
- Added regression tests for recent partial and stale malformed recovery locks. The original failing concurrency test now passes on the PR head.
- Replay now rejects missing/malformed/expired option expiry timestamps and skips hypothetical trades whose planned hold or exit reaches/crosses expiry. The replay has no expiry settlement/assignment model, so it cannot invent a post-expiry quote exit.
- PR-head CI 45580317705, Lighthouse 45580317770 and Project Context Guard 45580317843 passed. Main post-merge CI/Lighthouse/Guard/Pages runs were started on the merge SHA; confirm their final result separately.

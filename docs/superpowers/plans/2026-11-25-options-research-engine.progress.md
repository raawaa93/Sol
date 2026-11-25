# Execution ledger — options research engine

**Date:** 25 November 2026  
**Repository:** raawaa93/Sol  
**Main merge commits:**  
- PR #192: 8e97c76dea8646eec8a116b1116e2cf1e88dba72
- PR #194: 7183ab85eac7e9d7556cc3716b7d1790948c63d6

## Completed and verified

### PAPER campaign risk cap — PR #209
- Merge commit `f413ba8a5453a730fe4649d90c648f27390499b1`.
- Encoded 200 USD campaign capital, 60 USD/USDT cumulative premium-and-fee allocation cap, 20 per-attempt cap, and 140 outside the risk budget.
- Sizing uses remaining campaign allocation; the save handler independently enforces the cap even when quantity is manually edited.
- New legacy journal entries store premium debit and currency. Unknown old costs and mixed currencies block allocation; no implicit FX conversion.
- PAPER journal is append-only; entries remain allocated until export and explicit reset because close/realized-P&L workflow does not exist. Reset requires confirmation.
- CI 45574730769: 309/309 tests, build, bundle budget and 18/18 Playwright passed; Lighthouse 45574730886 and Project Context Guard 45574730851 passed.

### Historical IV analytics
- Pure IV Rank / IV Percentile calculations use the same underlying, venue, source reference and IV convention.
- One latest sample per UTC day is selected; future samples and invalid source/time records are excluded.
- Minimum 30 distinct daily samples; flat range produces undefined IV Rank; partial history is reported.
- Standardized near-30-day ATM IV is derived only from fresh paired CALL/PUT Binance REST mark-IV observations at matching strike/expiry.
- Total variance is interpolated only when valid expiry points bracket 30 days; nearest ATM strike is selected per expiry.
- Venue volatility, bid/ask IV, model IV, stale quotes, unpaired options and ambiguous underlying series are excluded.

### Local persistence and UI
- Versioned browser-local history, exact-ID deduplication, 400-day retention, 2,000-observation cap, corruption/quota failure handling and JSON export.
- UI shows IV Rank, IV Percentile, sample count, date coverage, min/max and limitations.
- Demo/CSV data are not mixed into the observed Binance mark-IV history.
- Dynamic imports keep the initial bundle under the existing budget.

### Collector transport
- PR #192 adds a Node-only public WebSocket transport; no credentials, private streams, proxy, alternate egress or order methods.
- Bounded queue, AbortSignal cancellation, bounded reconnect policy and explicit disconnect/gap events.
- Fixed a local overflow bug: archive gap code is 1006 while the local WebSocket close frame is 1000.
- Transport remains opt-in; no live Binance connection or market capture was attempted.

## Verification evidence
- CI run 45570010720: 293 tests passed, 0 failed; production build passed; compressed bundle budget passed; Playwright browser journeys passed.
- Lighthouse baseline run 45570010778: passed.
- Project Context Guard run 45570010823: passed.
- PR #192 CI 45569786353, Lighthouse 45569786394, Project Context Guard 45569786341: passed.
- PR #194 merged with mainline merge SHA 7183ab85eac7e9d7556cc3716b7d1790948c63d6.
- Local container could not clone github.com, so implementation was performed on isolated GitHub branches and verified through GitHub Actions. No local npm test claim is made.

## Known limitations and blockers

1. **No historical IV corpus yet.** Metrics remain unavailable until at least 30 distinct valid daily samples are collected for the same asset, venue and IV convention. The UI records a sample only when the user opens/refreshes Binance; no background capture.
2. **No historical executable BBO dataset.** REST depth is a point snapshot; recent trades are not a historical quote tape. No strategy backtest can claim executable fills from mark/EOD/last data.
3. **No scheduled hosted worker or cloud archive.** PR #216 added an opt-in supervised local Node worker with bounded runtime/storage, graceful cancellation, idle-stream lease renewal and verified shutdown. It is not deployed, scheduled or connected to a durable remote archive; the NDJSON archive remains a local filesystem primitive.
4. **Local IV history is device-local and unencrypted.** JSON export exists; import is intentionally deferred because an imported file cannot independently prove original source provenance. No cross-device sync.
5. **Supabase cloud destination is not provisioned.** Existing project Ghaioooth-core (ref oyoyozdugicmnkfhjovo) is shared with other workloads and remains untouched. Existing branch rawaa-consent-staging-test is for Raawaa-store and non-persistent; do not reuse. A new development branch costs USD 0.01344/hour (~USD 9.81 per 730-hour month) and is not suitable for a permanent free archive. A new project quote is USD 0/month, but the connector requires the user to choose the organization; only organization Ghaioooth is currently listed. Free projects can pause after seven days of low database activity and have limited quotas. A secure auth/RLS model is required before cloud writes; do not expose unauthenticated public writes.
6. **Legal and account eligibility.** Syrian local legal position for foreign options derivatives remains unverified; Binance product/account eligibility must be checked separately. No live orders, funding or VPN/egress circumvention.
7. **No measured strategy edge.** PBO/Deflated Sharpe and conservative replay foundations do not create performance evidence without point-in-time data. Cross-asset profitability ranking remains blocked.

## Next execution order
1. Resolve the dedicated free Supabase project organization choice and secure authentication/RLS model; only then create it. Do not use the shared project or paid branches.
2. Implement private cloud archive upload/read with least privilege, bounded quotas, export/restore and retention; verify with adversarial RLS tests.
3. Build a supervised, scheduled, forward-only collector only after the permitted source path is verified; stop on 403/451 or any legal/licensing uncertainty.
4. Accumulate at least 30 daily IV samples and a materially longer history before using 365-day IV Rank/Percentile for ranking.
5. Accumulate point-in-time bid/ask/size, mark/index, contract-spec and fee data. Only then extend replay, walk-forward tests, multiple-testing controls and candidate ranking.
6. Add cross-asset opportunity scoring only when contract economics, data freshness, liquidity and risk inputs are all verified. Keep it research-only.

## Decision record
- Keep recurring spend at USD 0 by default.
- Do not create a Supabase branch at USD 0.01344/hour.
- Do not mutate shared Supabase production resources.
- Do not run the WebSocket transport from a US GitHub runner or alter egress to reach Binance.
- Do not claim the system is fully production-ready or profitable.


## Follow-up verification — IV history browser coverage (25 November 2026, 07:49 UTC)

- PR #196 merged as `26b82d63bdd533c96fba8a881a8036fcf7c0b470`.
- Added a deterministic Playwright journey using mocked Binance REST data: paired CALL/PUT at 20 and 40 DTE, source-verified 30-day IV extraction, honest insufficient-history state with one daily sample, and JSON export preserving source/underlying/tenor metadata.
- CI run 45570955327 passed: 293 unit/property tests, TypeScript production build, compressed bundle budget, and all 18 Playwright browser journeys.
- Lighthouse baseline run 45570955246 passed.
- Project Context Guard run 45570955274 passed.
- This is test coverage only; it does not create a live Binance connection, background sampler, cloud archive, or empirical strategy result.


## Follow-up — PAPER risk sizing default (25 November 2026, 08:09 UTC)
- PR #205 merged as `b4c014131be9de4d610740ef30c4ad48308c5c6b`. The per-trade premium-plus-fees budget defaults to 60 quote units; the field label states its scope.
- Added a Playwright regression assertion for the value and label.
- CI 45573552188 passed 303/303 tests, build, bundle and 18/18 Playwright journeys. Lighthouse 45573547735 and Project Context Guard 45573547738 passed.
- Total bankroll, available cash and aggregate open risk are not yet modeled. This does not enable live trading.

### Archive recovery-lock safety — PR #223
- [x] Treat recent partially written recovery locks as busy and stale malformed recovery locks as corrupt; never delete them based on age alone without verifiable owner metadata.
- [x] Add concurrent recovery regressions; document manual inspection and fail-closed recovery.
- [x] Merged as `1cc8811b566b590be9b96af2441cef2f4fb39e18`; PR-head CI/Lighthouse/Project Context Guard passed. Main post-merge CI 45580536983 and Lighthouse 45580536944 passed; GitHub Pages deploy completed, published-site Lighthouse still running at last check.
- [x] Research OKX historical 400/5000-level order-book API as a candidate; rejected collection for the current Syria eligibility and data-use rights (public data restricted to personal non-commercial use; no redistribution). No API call or data download made.

### Replay expiry guard — PR #221
- [x] Reject missing/malformed expiry and snapshots at/after expiry.
- [x] Skip fixed-hold replay trades when planned exit reaches/crosses expiry; count final would-be entries blocked by expiry.
- [x] Regression tests and CI/build/browser/Lighthouse/Project Context Guard passed; merged as `c0a954200206f66649211af18a2ab4ab44a963f5`.
- [ ] Implement a separately validated expiry settlement/assignment model before allowing expiry-crossing backtests.

### Canonical PAPER entry time-integrity — PR #225
- [x] Reject a contract expired at entry time.
- [x] Reject price/index source timestamps in the future or older than five minutes.
- [x] Regression tests and CI/Lighthouse/Project Context Guard passed; merged as `cb0897ddafba5816c7e976e5c10a0aadeaeabc03`.
- [ ] Implement a separate, timestamped, bid-size-aware PAPER close record and realized-loss budget accounting; do not release risk on a user-entered or stale exit price.

### PAPER execution realism — next gate
- Current journal entries are timestamped audit snapshots using midpoint, not Ask-side simulated fills; there is no close record, Bid-side exit, realized P&L or budget release.
- Binance's official options fee formula is `min(rate × index × contract unit, 10% × option traded price) × option traded size`; fee rate varies and exercise fee is separate. Source: https://www.binance.com/en-PH/support/faq/detail/5326e5de61c34fed98abe28d2f175a23
- Next: implement Ask/size-aware entry, Bid/size-aware close, verified same-contract and pre-expiry checks, fee calculation with source index and symbol fee rate, and budget accounting as open debit + realized losses. Keep legacy midpoint-only entries locked until export/reset; never reinterpret them as executable fills.

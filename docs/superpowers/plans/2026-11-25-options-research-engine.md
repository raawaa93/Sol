# Options Research Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver a trustworthy multi-asset options research and PAPER lab with historical volatility metrics, resilient forward data capture and reproducible strategy evaluation.

**Architecture:** Extend the existing TypeScript/React and Node ESM architecture first. Keep market acquisition read-only, store local summaries and append-only archive records with provenance, and defer Python analytics/cloud infrastructure until verified point-in-time data justifies them.

**Tech Stack:** React 18, TypeScript 5.6, Node ESM 22+, native browser storage, native Node tests, existing Playwright/GitHub Actions.

**Spec:** docs/superpowers/specs/2026-11-25-options-research-engine-design.md

## Global Constraints
- Research/read-only and PAPER-only; no live order routes, credentials, transfers or funding.
- Use true Syrian residence for eligibility; no false location, VPN or proxy circumvention.
- USD 15/month total hard ceiling; no new paid provider or cloud resource in this plan.
- Preserve current compressed JavaScript bundle budgets; no new chart or analytics dependency.
- Distinguish OBSERVED, MODELLED, USER_ASSERTED, SYNTHETIC and UNAVAILABLE fields.
- Keep mark IV, bid IV, ask IV, venue volatility, trade, index and BBO as separate source classes.
- Preserve exchange/event, receive and availability timestamps; reject future or stale data.
- Do not change shared Supabase production schemas, buckets, secrets or functions.

## Review Focus
- Source mixing: REST mark IV versus venue vo, bid/ask IV, model IV, EOD and synthetic values.
- Tenor drift: a changing nearest expiry must not silently be compared as a constant 30-day series.
- Duplicate or missing daily observations: multiple refreshes in one UTC day must not inflate sample counts.
- Clock and freshness errors: future, stale, malformed or missing source timestamps must be rejected.
- Storage corruption/quota: malformed local history or full storage must never silently become valid history.

---

### Task 1: Canonical observed IV history analytics

**Files:**
- Create: src/lib/iv-history.ts
- Create: src/lib/iv-history.test.ts

**Interfaces:**
- IVHistoryObservation: schema version, underlying, venue, IV convention, IV decimal, observedAt UTC, receivedAt UTC, source class and source reference.
- computeIVRankPercentile(observations, current, asOf, lookbackDays=365, minimumSamples=30): nullable rank/percentile plus min/max, sample count, coverage and partial-history flag.
- selectDailyIVObservations: one latest valid observation per UTC day and key.

- [x] Add deterministic tests for exact rank/percentile arithmetic, minimum sample count, flat range, separate underlying/venue/convention, duplicate-day selection, future/stale/invalid samples.
- [ ] Verify the RED step in isolation (not captured as a separate successful CI run).
- [x] Implement the pure analytics module without new dependencies.
- [x] Full CI unit/property suite passed: run 45570010720 (303/303).
- [x] Merge source-bound IV analytics as PR #194, commit 7183ab85eac7e9d7556cc3716b7d1790948c63d6.

### Task 2: Observed near-30-day ATM IV extraction

**Files:**
- Modify: src/lib/iv-history.ts
- Modify: src/lib/iv-history.test.ts
- Read-only input: OptionQuote[] from src/lib/types.ts.

**Interfaces:**
- extractObservedAtm30DayIV(quotes, asOf, freshnessMs=300000): source-bound near-30-day ATM IV observation or explicit unavailable reason.
- Require ivStatus=OBSERVED, markIvSource=REST_MARK, valid mark-IV receive timestamp, fresh quotes, positive underlying/strike/IV and matching CALL/PUT at same expiry/strike.
- Use variance-time interpolation only when two observed expiry points bracket 30 days; otherwise accept a nearest point only within a documented narrow tolerance, or return unavailable.

- [x] Add tests for mark-source-only acceptance, rejection of venue vo/model/bid/ask IV, stale/future timestamps, missing call/put pair, bad moneyness, nearest ATM strike and total-variance interpolation.
- [ ] Verify the RED step in isolation (not captured as a separate successful CI run).
- [x] Implement extraction with no invented values and explicit source/tenor metadata.
- [x] Full CI unit/property suite passed: run 45570010720.

### Task 3: Bounded local history and backup

**Files:**
- Create: src/lib/iv-history-store.ts
- Create: src/lib/iv-history-store.test.ts
- Modify: src/App.tsx only for local store integration.

**Interfaces:**
- Versioned local storage key sol-iv-history-v1.
- Append snapshots; do not overwrite earlier observations. Deduplicate exact observation IDs.
- Retain a bounded trailing 400 days and maximum 2,000 observations; surface quota/corruption errors.
- Export JSON with schema validation. Import is deferred: imported records cannot prove original source provenance and must not be merged into the observed Binance series.

- [x] Add tests for append, exact dedupe, ID conflict, invalid provenance, corrupted JSON, cap/prune, storage unavailable and export round-trip.
- [ ] Verify the RED step in isolation (the test-only commit was superseded before a separate RED result was captured).
- [x] Implement storage adapter with injected Storage interface for deterministic tests.
- [x] Wire a successful Binance REST refresh to record only valid observed samples; Demo/CSV/model/venue-vo data are excluded.
- [x] Full CI unit/property suite passed: run 45570010720.

### Task 4: Explainable IV Rank/Percentile UI

**Files:**
- Modify: src/App.tsx
- Modify: src/components/OpportunityReview.tsx
- Modify: src/index.css
- Create/update relevant component tests.

**Acceptance:**
- Show IV Rank, IV Percentile, current IV, min/max, sample count, date coverage and source.
- Show explicit warming/insufficient-history state until 30 distinct daily observations exist.
- Show partial-history status until a full 365-day window exists.
- Keep Demo and imported data clearly separate from provider-observed history.
- Do not convert IV Rank into a probability of profit or directional signal.

- [ ] Add dedicated component tests for available, insufficient, partial, stale and Demo states; current verification is via the full Playwright journeys, not a component-specific test.
- [x] Implement sourced IV Rank/Percentile UI with warming/partial/local-storage disclosures.
- [x] Full CI unit/property tests, production build, bundle budget and Playwright passed in run 45570010720; Lighthouse passed in 45570010778.

### Task 5: Review and complete the forward-only Binance collector transport

**Files:**
- Existing: scripts/options-collector.mjs, scripts/options-archive.mjs.
- Merged PR: #192 feat: add opt-in public Binance Options WebSocket transport.

**Transport acceptance (completed):**
- Fixed documented public endpoint only; no credentials, private streams, orders, proxy or alternate egress.
- Only normal connection rotations reconnect; abnormal close, socket error, overflow and sequence gaps fail closed or emit explicit gap records.
- REST depth remains a snapshot, never historical BBO. Depth deltas require a valid snapshot bridge and contiguous sequence.
- Reconnect emits a new connection/gap event; no interpolation across missing data.
- Collection remains opt-in and disabled by default.

**Verified implementation and CI:**
- [x] Review PR #192 source, tests and workflow checks; review caught and corrected the queue-overflow close-code mismatch.
- [x] Add deterministic tests for disconnect/gap persistence, abort/reconnect behavior, buffer overflow, abnormal close and queue bounds.
- [x] Full unit/property tests, production build, compressed bundle budget and Playwright passed in CI run 45569786353.
- [x] Lighthouse run 45569786394 passed.
- [x] Project Context Guard run 45569786341 passed.
- [x] Merge PR #192 as 8e97c76dea8646eec8a116b1116e2cf1e88dba72.

**Not implemented / not verified (separate future task):**
- [ ] Supervised worker, scheduler, persistent runtime, cloud archive and monitoring.
- [ ] Any live Binance WebSocket connection, HTTP capture or forward market-data collection.
- [ ] Legal, licensing and exact account/product eligibility for live capture from the user's true residence.
- [ ] Cross-process/cloud lease, durable restart recovery and end-to-end cloud backup/restore.

The merged transport is a tested library component, not an operating collector. No live connectivity, historical BBO coverage or strategy edge is implied.

### Task 6: Research-grade strategy replay and evaluation

**Files:**
- Inspect/reuse existing replay engine, docs/research/options-profitability/strategy-evaluation.md and issue #160.
- Modify only after a point-in-time dataset exists.

**Acceptance:**
- No-trade baseline, chronological splits, walk-forward tests, parameter stability, multiple-testing controls, realistic bid/ask/fees/slippage/latency/size/partial-fill rules, contract expiry/settlement and risk.
- Report sample size, coverage, drawdown, tail loss, profit factor, turnover and uncertainty; suppress unsupported statistics.
- E1 volatility-risk-premium and E2 order-flow experiments remain BLOCKED until their data prerequisites are met.

- [x] Audit the existing replay and strategy-evaluation protocol. It remains a conservative one-leg fixed-hold PAPER execution baseline, not a signal strategy.
- [x] Require source-bound BBO event time plus local receive/availability time, explicit source type and size unit, non-estimated two-sided prices, and sufficient displayed Ask/Bid size at entry/exit. Preserve CSV provenance as user-asserted only.
- [x] Apply configurable adverse per-side slippage and expose fills, displayed size, source clocks, fees and slippage in replay output/UI. PR #204 merged as 337e03fb26d44c906125318affc473030c165da4.
- [ ] Extend replay with depth/partial fills, queue position, latency, expiry/settlement, assignment and hedging only after a permitted point-in-time corpus and verified contract economics exist; no supported empirical dataset is currently available.
- [ ] Add a separate deterministic synthetic strategy fixture suite only when a concrete replay defect or extension is selected; existing statistical tests are synthetic and do not establish a market edge.
- [x] Keep strategy performance and cross-asset profitability ranking blocked until a real PIT corpus and forward PAPER run pass the gates.

### Task 7: Operational record and final verification

**Files:**
- Update: docs/OPTIONS_ARCHIVE_IMPLEMENTATION_STATUS_2026-11-25.md
- Update: docs/PRODUCT_REVIEW.md
- Update: README.md
- Create: docs/OPTIONS_RESEARCH_ENGINE_EXECUTION_2026-11-25.md

- [x] Record implemented/tested/merged separately, with commit SHAs and workflow IDs in docs/OPTIONS_RESEARCH_ENGINE_EXECUTION_2026-11-25.md.
- [x] Run full unit/property tests (293/293), production build, bundle budget, Playwright, Lighthouse and Project Context Guard.
- [x] Fresh-review source provenance, local storage, data-quality and Syria legal gates; no production DB writes or live orders.
- [x] Leave unresolved cloud, legal, live-capture and strategy-data blockers explicit.
\n\n### Task 8: Apply and verify conservative PAPER risk sizing defaults

- [x] Default per-trade premium-plus-fees budget to 60 quote units, matching the stated maximum loss for a long-option PAPER trade.
- [x] Label the field explicitly as premium plus fees; it is not total portfolio equity, aggregate open risk or a guarantee for other strategies.
- [x] Add an E2E assertion for the default value and label. PR #205 merged as `b4c014131be9de4d610740ef30c4ad48308c5c6b`.
- [x] Verify CI 45573552188: 303/303 unit/property tests, production build, bundle budget and 18/18 Playwright journeys; Lighthouse 45573547735 and Project Context Guard 45573547738 passed.
- [ ] Separate total bankroll, available cash and aggregate open risk remain unmodeled; do not infer or claim a $200 portfolio-equity field exists.

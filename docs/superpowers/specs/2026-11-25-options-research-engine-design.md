# Options Research Engine — Design

**Date:** 25 November 2026  
**Status:** Approved execution direction under the user's explicit instruction to proceed without further questions.  
**Repository:** raawaa93/Sol  
**Base:** 02686037ef33c658d06178062be69311568c72b9

## Intent
Turn Sol's existing multi-asset options decision lab into a reliable research and PAPER environment that compares opportunities across supported option markets, measures volatility context, preserves point-in-time evidence and tests strategy hypotheses without implying profitability or enabling live orders.

## Current state
- React/TypeScript UI, Node ESM tooling and tests.
- Binance public Options REST snapshots and browser WebSocket feeds for selected market fields.
- analysis.ts already computes IV−RV when both values exist, 25-delta skew and ATM term structure; it does not calculate historical IV Rank/Percentile.
- getMarketSnapshotFromQuotes currently sets rv30 to null; live IV−RV is therefore unavailable without a separate historical underlying series.
- Local append-only archive primitives, point-in-time eligibility checks and conservative replay foundations exist in scripts/options-archive.mjs and scripts/options-collector.mjs.
- Open PR #192 adds a Node-only opt-in public WebSocket transport; it is not merged or live-verified.
- No verified historical options BBO dataset, durable cloud archive or measured strategy edge exists.

## Goals
1. Add reproducible IV Rank and IV Percentile from a homogeneous, timestamped IV series.
2. Record observed market-volatility snapshots locally with provenance and export/backup.
3. Make volatility metrics transparent about lookback, sample count, coverage, missing history and source.
4. Complete a compliant forward-only public capture path with gap detection, bounded queues, resumability and recovery.
5. Improve replay and strategy evaluation with realistic quotes, fees, slippage, latency, contract mechanics and out-of-sample controls.
6. Compare genuine vanilla options markets only where verified data and lawful access exist.

## Non-goals and hard boundaries
- No live orders, order credentials, private user streams, transfers, funding or autonomous trading.
- No VPN/proxy/region changes to evade platform restrictions, false residence or borrowed accounts.
- No paid data or infrastructure above USD 15/month; default recurring spend is USD 0.
- No public redistribution of personal or vendor-restricted market data.
- No claim that Demo, synthetic, EOD, delayed, mark, trade or model data are executable historical quotes.
- No strategy is called profitable or actionable without adequate point-in-time evidence and prospective PAPER validation.

## Approaches considered

### A. Extend the existing TypeScript/Node stack (selected first)
Use the current quote model, analysis.ts, local archive and browser-local persistence. Add dependency-free analytics and explicit provenance. This minimizes operational complexity, preserves the mobile-friendly UI and avoids new services or recurring costs. It supports IV history and forward Binance research, but is not a substitute for licensed multi-venue historical NBBO.

### B. Add a separate Python analytics worker now
QuantLib could act as an independent pricing oracle and NautilusTrader could support event-driven multi-asset replay. This is a good later stage after normalized point-in-time data exists, but adds a second runtime and deployment burden before the data foundation is trustworthy. Defer until a reproducible corpus justifies it.

### C. Buy a hosted universal options-data service
This could shorten the path to US listed-options history, but reviewed sources either exceed USD 15/month, provide delayed/EOD/indicative rather than executable quotes, restrict redistribution, or have unverified Syrian-resident eligibility. Reject as the default path.

## Selected architecture
1. Acquisition: retain Binance public REST and public WebSocket adapters; no credentials. Keep REST snapshots, BBO streams, mark/index, trades, depth and klines as separate data classes.
2. Canonical evidence: use the existing versioned append-only NDJSON archive with raw hashes, contract-spec versions, exchange/event/receive/availability clocks and explicit gaps. Do not write to the shared Supabase production project or expose personal market data through public GitHub.
3. Volatility analytics: compute a documented near-30-day ATM IV series from observed, source-stamped IV only. Keep REST_MARK IV distinct from bid/ask-derived IV and venue vo. Calculate IV Rank/Percentile only after sufficient homogeneous daily history exists; return unavailable for insufficient or flat samples.
4. Persistence: use bounded, versioned browser-local history for daily summaries, clearly disclose localStorage is unencrypted and device-local, and support export/import. Keep raw forward capture in the Node archive, not in the UI bundle.
5. Pricing QA: preserve contract-mechanics routing; use QuantLib as a future independent cross-check, not a data feed. Do not add it to the browser bundle.
6. Replay: retain conservative PAPER-only execution. Do not use mid/mark/last as fill prices; buy at ask, sell at bid, enforce displayed size and exact contract scale, and fail closed when contract mechanics are unknown.
7. Research: use chronological splits, walk-forward validation, no-trade baselines, parameter stability, multiple-testing controls, realistic costs and risk reporting. Do not infer dealer identity or inventory from public prints.

## Volatility metric conventions
- IV Rank = 100 × (current IV − rolling minimum) / (rolling maximum − rolling minimum).
- IV Percentile = 100 × count(historical daily IV strictly below current IV) / valid daily observation count.
- Initial lookback: trailing 365 calendar days, at most one selected observation per UTC day and per underlying/venue/IV convention.
- Minimum sample: 30 distinct UTC days; fewer observations means unavailable, not zero.
- A flat range (maximum equals minimum) makes IV Rank undefined.
- Label history partial until 365 distinct days exist. Show sample count and date coverage.
- Keep near-30-day IV, mark IV, bid IV, ask IV and venue volatility as separate series. Never mix sources or units.
- Do not describe these metrics as probability of profit or a directional forecast.

## Data-provider and infrastructure decision
- Binance public options data is a forward-capture candidate only; it does not supply a complete historical BBO archive before collection begins.
- Deribit is not an execution route for a Syrian resident under reviewed terms; public data access is not permission to trade or bypass restrictions.
- Massive/Polygon free options data is personal-use/EOD and not permission for public redistribution; do not integrate into the public site.
- MarketData.app free data is delayed and limited; consider private research only after current terms and account eligibility are confirmed.
- ThetaData and other institutional quote feeds exceed the recurring cap in reviewed plans.
- Do not provision R2, another bucket, a new Supabase project or paid cloud resource in this phase. The existing Supabase project is shared and project instructions prohibit unreviewed production writes.

## Acceptance criteria
- New metrics have hand-calculated deterministic tests, invalid-input tests, duplicate-day tests and no-lookahead tests.
- IV Rank/Percentile remain unavailable until 30 valid distinct daily observations exist; source-mixed or stale samples are excluded.
- Local history is schema-versioned, bounded, corruption-tolerant and exportable; imports cannot upgrade provenance.
- UI labels show source, lookback, sample count and partial-history state.
- WebSocket collector has explicit reconnect/gap semantics, queue limits, cancellation, restart and archive-integrity tests.
- Full unit/property tests, build, unchanged bundle budgets, Playwright, Lighthouse and Project Context Guard pass before merge.
- No live capture is described as successful unless a permitted capture and archive verification actually occurred.
- No strategy edge is claimed without point-in-time data, realistic fills, out-of-sample results and forward PAPER evidence.

## Research references
- Binance public Options WebSocket streams: https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-options/api/ws-streams/public
- QuantLib licence and library: https://www.quantlib.org/license.shtml
- NautilusTrader options: https://nautilustrader.io/docs/latest/concepts/options
- NautilusTrader backtesting: https://nautilustrader.io/docs/latest/concepts/backtesting
- DuckDB Parquet: https://duckdb.org/docs/stable/data/parquet/overview
- Cloudflare R2 pricing (not provisioned): https://developers.cloudflare.com/r2/pricing/
- OPRA use and redistribution: https://cdn.opraplan.com/documents/OPRA_Exhibit_A.pdf
- Massive market-data terms: https://polygon.io/legal/market-data-terms-of-service

## Decision record
Use approach A first. Defer Python/NautilusTrader until the archive has a stable point-in-time corpus. Defer hosted data vendors and cloud storage until eligibility, license, total cost and account ownership are verified. Maintain the Syria legal gate and PAPER-only status.

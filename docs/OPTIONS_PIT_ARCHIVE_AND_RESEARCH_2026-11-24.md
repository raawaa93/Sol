# Options Point-in-Time Archive and Research Audit — 24 November 2026

## Executive result

This sprint adds a local, append-only research archive primitive, explicit point-in-time eligibility checks, a conservative size-bounded long-option replay with configurable spread slippage, and research-only PBO/Deflated Sharpe calculations. It does **not** start a collector, call a market-data API, add a vendor, or create historical performance evidence.

Five requested repositories were inspected at source, test, manifest, and license level. Their code and tests were **not executed**, and no external source code or dependency was copied into Sol. Binance endpoint semantics below were checked against the generated official [Options SDK](https://github.com/binance/binance-connector-python/tree/master/clients/derivatives_trading_options); no API request was made.

## Binance history: distinct data products

The generated SDK exposes the following public market-data calls:

| Product | Interface checked | What can be archived | What it does not prove |
|---|---|---|---|
| Option Klines | `GET /eapi/v1/klines`, with symbol, interval, start/end time, and limit; bars are keyed by open time | Historical interval OHLC and volume. A bar is usable only after its close/availability time. | Historical bid/ask, displayed size, quote updates, depth, or an executable fill. |
| Recent option trades | `GET /eapi/v1/trades`, with symbol and limit in the SDK method | A bounded recent-trade response; trade IDs/timestamps can be retained when present. | A historical time-range archive or a complete trade tape. The inspected method has no time cursor. |
| Order book | `GET /eapi/v1/depth`, with symbol and depth limit | A point-in-time book snapshot and its sequence/update identifier, if supplied. | A historical BBO/depth series. A REST snapshot must not be relabelled as historical quotes. |
| 24-hour ticker | `GET /eapi/v1/ticker` | Current ticker fields such as 24-hour statistics and any returned top-of-book fields, stamped as one REST observation. | A continuous book-ticker stream or historical quotes between polls. |
| Public streams | Options public WebSocket streams documented by Binance and referenced in the existing [provider evaluation](./DATA_PROVIDER_EVALUATION_2026-11-24.md) | Forward-only observations after a permitted collector starts and receives messages. | Any observations during downtime or a complete historical archive before collection began. |

Use the official generated [market-data client](https://github.com/binance/binance-connector-python/blob/master/clients/derivatives_trading_options/src/binance_sdk_derivatives_trading_options/rest_api/api/market_data_api.py) and [REST examples](https://github.com/binance/binance-connector-python/tree/master/clients/derivatives_trading_options/examples/rest_api/MarketData) as the current implementation references. The new archive accepts only an explicit public-endpoint allowlist. It does not contain authenticated endpoints or order methods.

## Canonical archive contract

`src/lib/options-archive.ts` defines schema version 1. Every archived observation carries:

| Area | Required fields / behavior |
|---|---|
| Identity | Provider/product endpoint, event kind, option symbol, stable idempotency key, raw-payload SHA-256, schema version. |
| Contract terms | Underlying, call/put, strike, expiry, contract size **and unit**, premium unit, quote and settlement currencies, exercise and settlement styles, exchangeInfo provenance, and a fingerprint of the complete specification. Missing/unknown economics cannot pass validation as an executable contract. |
| Clocks | Exchange/event timestamp (nullable only when the source provides none), local receive timestamp, and availability timestamp. Each individual field has the same clocks plus endpoint, source path, optional event ID, and unit. No receive-time substitution for a missing event time is permitted. |
| Klines | Open time and close time are separate. Availability must be no earlier than the interval close; all Kline fields inherit this guard. |
| Market data | Fields can represent BBO and sizes, depth levels, mark, IV/Greeks, underlying/index/forward, open interest, volume, and OHLC. Field values are not silently synthesized. |
| Provenance / quality | Each field is tagged `OBSERVED`, `MODELLED`, or `UNAVAILABLE`, with a unit and a staleness threshold. Record quality is `VALID`, `DEGRADED`, or `INVALID`, with explicit flags. Modelled fields and unmeasured/stale fields are ineligible for point-in-time research. |

`evaluatePointInTime` requires all requested fields to be observed, timestamped, received and available by the decision time, within their staleness threshold, under terms already observed by then. Historical backfill is retained but marked `HISTORICAL_BACKFILL` and is **not** considered proof of point-in-time availability. An absent exchange timestamp, unknown contract mechanics, future timestamp, invalid quality, or stale required field fails closed with reason codes.

## Storage and collector design

`ResumableOptionsArchive` is a filesystem storage primitive, not a network collector:

1. Records are partitioned by kind, a hash of the option symbol, and UTC source date (receive date only when no exchange time exists).
2. A batch is validated, canonicalized, and written to a temporary file; the file is synced and published by a non-overwriting hard link as a SHA-256-named NDJSON segment.
3. Stable event keys deduplicate retries inside the instrument/day partition. Reusing a key with different content raises an integrity error; it never overwrites prior evidence.
4. A checksummed cursor is atomically advanced only after the data segments are durable. Restart rebuilds the active partition index and verifies hashes. Re-fetch after a crash is therefore **at-least-once plus idempotent**, not a claim of distributed exactly-once delivery.
5. Incomplete or tampered segments/checkpoints and orphaned temporary files are reported as errors; the library does not silently truncate or repair evidence.

### Safe service plan (not yet implemented or run)

- Use `exchangeInfo` to snapshot instrument identity and contract-spec versions before capture. Keep each version effective only from its own observation/availability time.
- Backfill Klines with a deterministic key based on symbol, interval, and open time. Preserve their candle window; do not derive historical quotes from them.
- Treat `/trades` as recent-only unless Binance documents and exposes a supported historical cursor. Use a trade stream for forward capture if permitted.
- Capture `bookTicker`, trade, mark/index, and (if needed) depth streams continuously. Store exchange/event and receive times separately; persist event/update IDs; detect reconnects, sequence discontinuities, and stale feeds as explicit gaps.
- For a REST depth request, save a new snapshot, not an interpolated history. If a future depth-diff collector is built, it must implement Binance's snapshot/update sequencing and mark any unbridgeable sequence gap.
- Keep each product field's source, unit, entitlement, and provenance independent. Klines, last trades, mark, index, BBO, and depth must never be merged into one unlabeled “price.”
- Stop on HTTP 451, account/product restriction, legal uncertainty, or licensing uncertainty. Do not change egress, route through another region, use a VPN to bypass restrictions, or add account credentials.
- Enforce one writer process per archive root. The current storage class serializes writes inside one instance but does not yet implement a cross-process lease.

The existing [data-provider evaluation](./DATA_PROVIDER_EVALUATION_2026-11-24.md) remains the cost/licensing decision record. No subscription or new data provider was added. Free public access is not, by itself, a redistribution license or proof of residency eligibility.

## Conservative replay changes

The CSV replay remains a one-leg **paper execution baseline**, not a signal strategy or realized performance:

- Buy at observed Ask plus configured additional spread slippage; sell at observed Bid minus that slippage.
- Charge configured per-side fees on the resulting simulated fill premium.
- Require displayed Ask size at entry and Bid size at exit to cover the configured contract quantity. Missing size, an unknown size unit, or insufficient size rejects the trade. `CONTRACTS` and explicitly declared `UNDERLYING_UNITS` are distinguished; no implicit unit conversion is inferred.
- Reject a nonpositive sell price after slippage. Mark/mid/last prices are never execution prices.
- CSV accepts displayed-size fields only with explicit units. The current Binance adapter does not attach a verified size unit to its displayed quantities, so those raw values are not eligible for this CSV replay path.
- The UI displays observed touch prices separately from simulated fill prices and exposes fee/slippage assumptions. PAPER output is not a real fill or realized P&L.

This remains optimistic in important ways: it models only top-of-book size, rejects rather than simulates partial fills, and does not model queue position, market impact, multi-leg legging, latency, expiry/assignment, liquidation, or venue-specific settlement. A complete order-book history is not available from Klines.

## Statistical validation added

`src/lib/research-validation.ts` provides:

- **DSR:** requires the full finite list of attempted strategy Sharpe ratios and verifies the selected return series is the highest-Sharpe trial. The trial Sharpe series uses the same periodicity and sample-standard-deviation convention; degenerate trial dispersion and invalid numerical moments fail explicitly. Its expected-maximum approximation assumes a normal selection model and does not correct arbitrary dependence among experiments.
- **PBO / CSCV:** uses timestamp-ordered, finite, aligned return matrices; equal contiguous blocks; Sharpe ranking with a zero-risk-free-return assumption; and an even split count from 4 to 12 with a bounded computation budget.
- **Leakage guards:** archive eligibility tests reject future exchange/availability times and any historical-backfill record as point-in-time evidence.

The included tests use deterministic **synthetic returns only**. They verify guard behavior and mathematical directionality; they are not market observations, strategy performance, validation of a real trading edge, or a substitute for walk-forward/out-of-sample testing. No real PBO, DSR, backtest, walk-forward, stress test, or opportunity-ranking score is available yet because Sol has no verified historical options BBO/depth archive.

## Strategy comparison matrix

All rows below require identical dates, asset universe, capital basis, and data timestamps to be comparable. Buy-and-hold underlying and cash/risk-free returns are benchmarks, not option strategies.

| Candidate | Sol status | Required benchmark | Costs that must be included | Tail / operational risks |
|---|---|---|---|---|
| Long call / long put | One-leg payoff and conservative CSV open/close replay exist; not a predictive strategy | Same-underlying buy-and-hold and cash over matching holding windows | Ask entry, Bid exit, displayed-size cap, fees, extra slippage; later include expiry/settlement fees | Premium loss, spread/liquidity gaps, stale data, expiry and settlement mechanics. |
| Buy-and-hold underlying | Benchmark only; no common verified historical portfolio-return series in this sprint | Cash/risk-free benchmark | Fees, FX, funding/borrow where relevant | Underlying drawdown, custody and venue exposure. |
| Vertical spreads | Not supported by Sol's replay | Long option and underlying/cash on same capital and horizon | Both legs' touch, size, fees, partial fills, margin | Legging, assignment, margin offsets not assumed, gaps through strikes. |
| Short put / covered call | Not supported | Underlying buy-and-hold plus cash-secured benchmark | Bid/Ask, commissions, collateral opportunity cost, exercise/assignment and borrow | Downside/assignment, early exercise, collateral and liquidation. |
| Iron condor / short strangle | Not supported | Cash and a same-underlying risk-matched benchmark | Four-/two-leg spread, fees, slippage, margin, assignment, liquidation | Short gamma, gap/tail loss, volatility jumps, margin expansion and legging. |
| Calendar / diagonal | Not supported | Matched underlying/cash and same-expiry alternative | Per-leg spread/fees, carry, borrow, expiry handling | Term-structure/volatility shifts, early exercise, expiry mismatch and liquidity. |
| Cross-asset relative value | Research idea only; no measured edge or “arbitrage” claim | Currency- and multiplier-normalized matched exposures | Both venues' spreads/fees, FX conversion, funding/carry, latency and market impact | Basis/correlation breaks, incompatible settlement, venue access, non-synchronous data. |

No expected return or arbitrage is reported. Until a licensed point-in-time quote dataset exists, opportunity counts, ranking quality, historical strategy returns, and stress losses are **unmeasured**, not zero.

## Professional evidence and research implications — 25 November 2026

The papers below inform hypotheses and data design; they do not establish that the same effects exist on Binance or that any strategy is profitable. Full text was reviewed only where stated. Search indexes are used for discovery and bibliographic cross-checking, not as evidence for quantitative results.

| Evidence | Market, sample and review level | What it supports | Transfer limits |
|---|---|---|---|
| Alexander, Deng, Feng & Wan, [“Net Buying Pressure and the Information in Bitcoin Option Trades”](https://doi.org/10.1016/j.finmar.2022.100764), *Journal of Financial Markets*; author version [arXiv:2109.02776](https://arxiv.org/abs/2109.02776) | Peer-reviewed article; the full author-version text was reviewed. Deribit BTC tick trades, cleaned to 3,427,160 observations from 2017–2021. Their signed demand analysis varies by moneyness, maturity and time of day. | Supports testing volatility-related and directional demand separately, with maturity/moneyness/time controls. The reported patterns are associations under the paper's data and models. | Deribit, not Binance; historical sample and contract conventions differ. It does not identify named traders or institutions, prove causality, establish dealer inventory, or show net-of-cost strategy profits. Do not infer open/close or intent from a trade count. |
| Muravyev, [“Order Flow and Expected Option Returns”](https://doi.org/10.1111/jofi.12380), *Journal of Finance* 71(2), 673–708; working-paper record [SSRN 1963865](https://doi.org/10.2139/ssrn.1963865) | Peer-reviewed US equity-options research. Bibliographic metadata and the study's data-source description were checked; the publisher and SSRN full texts were inaccessible in this review, so no numerical result is repeated. | A reason to treat order flow as a joint information, liquidity and price-impact problem, not a standalone “smart money” signal. | Equity-option evidence is not crypto-option evidence. Public flow cannot reveal a market maker's actual position; any inventory interpretation needs separately observed position data. |
| Alexander & Imeraj, [“Delta Hedging Bitcoin Options with a Smile”](https://doi.org/10.1080/14697688.2023.2181205), *Quantitative Finance* 23(5), 799–817 | Peer-reviewed Bitcoin-options hedging study. Publisher metadata and an open-access repository record were confirmed; the full paper was not independently reviewed here. | A hedge-error/model-risk hypothesis: compare smile-aware hedge deltas with a simpler benchmark before using model Greeks in risk analysis. Hedging error is not directional return or strategy profitability. | No exact effect size is claimed here. The paper's venue, sample and hedge instruments must be checked in full before any replication; results cannot be transferred directly to Binance. |
| Zulfiqar & Gulzar, [“Implied Volatility Estimation of Bitcoin Options and the Stylized Facts of Option Pricing”](https://doi.org/10.1186/s40854-021-00280-Y), *Financial Innovation* 7, 67 | Peer-reviewed, full text reviewed in PubMed Central. Deribit 14-day BTC options in two short windows: 28 Sep–11 Oct 2019 and 7–20 Mar 2020. Studies a smile/forward skew and Newton–Raphson versus bisection IV estimation. | Supports treating smile/skew and numerical convergence as model-validation topics, with quote/price inputs stated. | Two short historical windows and one venue do not establish a stable surface, forecast edge, or representative market-wide behavior. Numerical IV convergence is not economic validity. |

### Operating principles derived for Sol

- **Volatility risk premium:** compare a timestamped, convention-consistent implied-volatility forecast with subsequently realized volatility. Do not interpret IV minus realized volatility as collectible P&L without executable bid/ask, contract units, fees, funding/carry, margin and tail-loss treatment.
- **Surface, term and skew:** normalize by forward/moneyness, expiry, quote currency and contract terms; retain source timestamps and quote-quality flags. Do not fit through stale, crossed, one-sided or missing quotes, and do not extrapolate unsupported strikes or expiries as observations.
- **Order flow:** keep the raw count separate from notional and Greek exposure. For Binance events derive aggressor side only from the documented maker-side field `m`; keep MARKET and BLOCK records separate. Compute Delta/Vega weights only with validated contract economics and timestamp-valid Greeks. A signed count is not an opening/closing flag, a dealer position, an institution identity, or a signal by itself.
- **Liquidity and inventory:** model spread, displayed size, turnover, stale-feed gaps and time-of-day as separate explanatory variables. Since true participant inventory is not observed in the public feed, describe inventory effects as hypotheses, not facts about named market makers.
- **Events and regimes:** pre-register maturity, moneyness, time-of-day and event-window slices; purge overlapping labels; limit the number of tested hypotheses and report every attempted model. A regime association is not causal event attribution.
- **Portfolio risk:** normalize currency and multiplier before aggregation; scenario-test spot/forward, volatility surface, rates, basis and correlation shocks. If the position book or synchronized history is absent, mark portfolio exposure unavailable rather than zero.
No new research or pricing package is adopted. The existing comparison remains: QuantLib is a model cross-check, not data; NautilusTrader/LEAN require suitable licensed historical inputs and their execution assumptions still need validation. Open-source code does not supply a licensed, point-in-time options archive.

### Ranked experiments and go/no-go protocol

The thresholds below are **proposed pre-registration gates**, not industry standards or results. They can be revised only before looking at the out-of-sample results.

| Experiment | Inputs and target | Baseline, costs and walk-forward design | Proposed go/no-go |
|---|---|---|---|
| **E1 — Forward-only venue-reported option volatility vs realized-variance forecast (blocked until capture and unit validation)** | At one daily decision cutoff (00:00 UTC), retain the latest eligible BTC option event from the separate Options mark-price stream (`<underlyingAsset>@markPrice`), not the 24-hour Ticker stream. The generated Binance Options connector model defines `vo` as `volatility`, with `E` event time and symbol `s`; it does not define a transaction-time `T` for this event ([connector schema](https://pkg.go.dev/github.com/binance/binance-connector-go/clients/derivativestradingoptions/src/websocketstreams/models); [Binance stream overview](https://www.binance.com/en/support/faq/detail/fe0be251ac014a8082e702f83d089e54)). Preserve raw `vo` and its source payload; do not call it `markIV` or convert it to variance until the field's precise semantics and scale are verified against authoritative examples. Record `E`, local receive/availability times and versioned `exchangeInfo`. Select the nearest-to-index call with 0.75–1.25 days or 6–8 days to expiry for the 1-day/7-day target; use puts only as a pre-registered secondary check. Take an index observation within 5 minutes of the cutoff, then capture public `/eapi/v1/index` `indexPrice`/`time` hourly for the next 24/168 completed intervals ([REST schema](https://developers.binance.info/docs/derivatives/options-trading/market-data/Test-Connectivity)). Require decision-time volatility and index observations to be no older than 5 minutes; reject timestamps after the cutoff, unsupported terms, unverified volatility units and incomplete windows; never backfill or interpolate. The REST `/eapi/v1/mark` response exposes a field explicitly named `markIV` but has no documented source timestamp, so it cannot alone establish PIT history ([REST mark schema](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-options/api/rest-api/market-data)). None of these fields is an executable quote. | Only after the stream field's definition and scale are verified, compare the matched-expiry venue-reported volatility forecast (converted with the verified scale) with persistence, HAR-RV and ARMA forecasts. Select model settings on chronological validation only; use expanding train/validation/test periods, at least 365 calendar days of initial training, a 7-day purge/embargo, and non-overlapping OOS horizons. Calculate realized variance from timestamped hourly index returns; report QLIKE, MAE/RMSE and calibration by regimes defined using training data. This is a forecast comparison, not option P&L: no orders, fees or fills are modeled. | Require at least 99% of expected hourly index observations and no silent gaps, at least 252 non-overlapping 1-day and 104 non-overlapping 7-day OOS outcomes. Pre-register the BTC call as primary and adjust secondary horizon/put comparisons with Holm correction. Continue only if the verified venue volatility measure improves OOS QLIKE by at least 5% over the best validation-selected baseline, a weekly block-bootstrap 95% confidence interval excludes zero after correction, and the result is not confined to one volatility regime. Otherwise retain the simplest baseline. No eligible captured mark-price/index history or verified `vo` scale currently exists in Sol; this experiment is proposed and unrun. |
| **E2 — Signed option flow and subsequent market-state response (blocked)** | Forward-only public Binance Options events: symbol, event/trade ID, trade-completion/event timestamps, `m`, raw price/quantity, MARKET/BLOCK kind and local receive time; contemporaneous venue-reported option-volatility (`vo`) events from the separate mark-price stream, index observations, quote snapshots and versioned exchangeInfo contract terms. Preserve `vo` as raw venue-reported volatility until its exact meaning and scale are verified; do not relabel it mark IV. Target: subsequent change in the validated venue-volatility measure and underlying-index return at fixed 5-minute and 1-hour horizons. Until units and Greeks are validated, use raw signed contract counts only. | Compare a no-flow model using lagged validated volatility, realized volatility, spread/quote quality, maturity, moneyness and time-of-day against the same model plus pre-registered signed counts. All joins must be point-in-time and use only events available by the decision timestamp; reject stale/missing volatility, index or quote observations and record stream gaps. No trades, execution costs or P&L: this is an event-response study, with a no-trade baseline. Use forward chronological folds, purge overlapping labels and block-bootstrap by day. | **Not testable in Sol yet:** no collector, persisted raw event archive or captured forward history exists, and the `vo` field's units/semantics are not yet verified. After those gates, require at least 180 captured days and 1,000 eligible non-overlapping symbol/horizon buckets in the predeclared strata. Consider follow-up only if the feature improves OOS forecast loss by at least 5%, the block-bootstrap 95% interval excludes zero after a predeclared multiple-testing correction, and the result is not confined to one time regime. This is not a trading signal or proof of trader identity/intent. |

### Explicitly blocked analyses

Historical IV-versus-realized-volatility premium, executable option fills, calendar/skew/vertical-spread returns, delta-/vega-weighted order flow, market impact, dealer inventory, and portfolio stress remain blocked by missing point-in-time option-chain BBO/depth/Greeks, validated contract specifications, and durable timestamped capture. Binance option Klines are bars, not historical quotes; recent trades are not a complete historical tape. No proxy may be relabelled as observed quote history, and no simulated returns or edge claims are reported.

## External project audit

Snapshot metrics below were queried from GitHub on 24 November 2026. Test counts are static counts of test definitions found in the shallow source copies; none of those external test suites was run. Stars/forks are activity context, not a quality or security score.

| Project | License / activity | Source and test findings | Decision for Sol |
|---|---|---|---|
| [OptionChainAnalytics](https://github.com/ArturSepp/OptionChainAnalytics) | MIT; 6 stars, 3 forks, 2 visible contributors; pushed 23 Nov 2026; release `v6.0.2` (6 Nov); 113 test definitions | Quote diagnostics inspect units, crossed/zero/one-sided markets, quote age, source event time, future events, and missing/future rows. Its data-source guide clearly limits CBOE/Tardis/Deribit/ThetaData inputs and redistribution. Existing diagnostic inputs distinguish requested/source time but are not a complete per-field local receive-time archive. Broad Python/quantitative dependency surface. | Adopt diagnostic ideas and negative evidence codes. Do not adopt its data files, provider integrations, or Python package into the React app. |
| [options-backtester](https://github.com/MoriAbdi/options-backtester) | MIT; 0 stars/forks, 1 visible contributor; pushed 21 Oct 2026; no release; 52 test definitions | Useful `MarketView` look-ahead guard and touch execution with optional size, fees, latency and spread slippage. Its own dataset documentation says some daily bid/ask values are reconstructed from marks/spread models and sizes are infinite/unknown; such rows are not observed historical BBO. NumPy/Pandas/SciPy core. | Independently implemented size-bounded touch and spread-slippage checks for Sol. Do not import its modelled quote history or Python runtime. |
| [IronCondor](https://github.com/joaquinbejar/IronCondor) | MIT; 6 stars, 3 forks, 1 visible contributor; pushed 13 Nov 2026; release `v0.10.0` (19 Oct); 226 test definitions | Rust research/backtest core; strong input validation, resource limits, checksums, ordering, and security/property tests in the inspected source. Some analytics/depth are modelled or reconstructed and must remain distinct from observed book data. | Useful bounded-input and integrity design reference. No Rust runtime or external crate added to Sol's UI. |
| [options_portfolio_backtester](https://github.com/lambdaclass/options_portfolio_backtester) | MIT; 287 stars, 53 forks, 5 visible contributors; pushed 3 Nov 2026; release `data-v1` (21 Feb); 16 open issues; 1,429 test definitions | Extensive Python/Rust portfolio, strategy, risk, and property-test code. The repository documents incomplete provenance for some source datasets and missing original data access; reproducibility depends on local datasets and building the Rust extension. Large dependency/build surface. | Do not import or rely on its datasets. Revisit only as a separate research-service comparison once Sol has licensed inputs and a backend decision. |
| [backtest-guard](https://github.com/AgentJDrew/backtest-guard) | MIT; 0 stars/forks, 1 visible contributor; pushed 6 Jul 2026; no release; 73 test definitions | Small NumPy/SciPy library implementing DSR, CSCV PBO, leakage heuristics and purged folds. Its own splitter assumes sorted time/index order without verifying it; leakage correlation is explicitly a heuristic. | Implemented isolated TS utilities with stronger input checks and complete trial-ledger requirement; no Python dependency added. Never interpret the metrics as proof of edge. |

### Static security, maintenance, and licensing limits

- The five named repositories declare MIT in their inspected manifests/GitHub metadata. Sol did not copy code, model/data files, or licenses from them.
- CI definitions, dependency manifests, and test files were inspected, but no external code was executed. No CVE/OSV/Dependabot-alert scan, full contributor-history analysis, benchmark run, compatibility matrix, or formal license counsel was completed. Therefore this audit does **not** claim that any project is vulnerability-free or suitable for production.
- The repositories differ materially in runtime (Python/Rust), data provenance, release cadence, and test surface. No new package, paid service, or external tool/skill was installed.

## Verification and remaining gates

- `npm test`: **210/210 passed**, including archive integrity/resume, point-in-time guards, size-bounded execution, fees/slippage, DSR/PBO input guards, and synthetic return properties.
- Targeted E2E for CSV replay: **1/1 passed**.
- `npm run build`: passed.
- `npm run perf:bundle` on the isolated worktree at `2e4be8988b3fdbcd3c41d5ac04eb3fc9f0952c02`: **failed without changing limits**. The final built output measures Initial JS **100.61/100 KiB**, all JS **240.80/240 KiB**, and CSS **13.55/14 KiB**. Rollup's pre-minification rendered-module report identifies `App.tsx` (124,382 bytes), `csv.ts` (26,394), `HistoricalReplayPanel.tsx` (10,696), and `replay.ts` (8,157) in the entry chunk; the separate Recharts and React chunks gzip to 110.09 and 45.98 KiB. These are source/module sizes, not independently additive gzip contributions. Moving replay to a lazy chunk made initial JS pass at 97.57 KiB but raised all JS to 241.92 KiB; merging Recharts with its D3 vendor chunk raised all JS to 241.67 KiB. Both experiments were reverted. No bundle optimization currently passes, so the code PR remains blocked. PR #158 is still open and its CI, Lighthouse and Project Context Guard checks pass at `65ab3ab55bc2c84e6ccc66f1069fc3d89affd8d2`; it is a separate fix and is not duplicated here.
- No collector, network test, external test suite, pricing cross-check, live account, real order, subscription, or production deployment was run.

### Next gates

1. Resolve the unchanged compressed bundle gate tracked by [#161](https://github.com/raawaa93/Sol/issues/161) and the related [#150](https://github.com/raawaa93/Sol/issues/150): reduce actual gzip output without removing functionality, checks or safety guards. Keep code delivery blocked until both JS budgets pass.
2. Implement the collector only against the explicit acceptance criteria in [#159](https://github.com/raawaa93/Sol/issues/159); add a cross-process archive writer lease and explicit gap/reconnect metadata before running multiple collectors.
3. Review current Binance public-data terms and any intended private/public display or redistribution rights before collection or publication.
4. Start forward-only, public, local capture only after legal/terms and connection-policy review; treat historical backfill separately from PIT evidence.
5. Acquire or generate a legally usable, timestamped, size-aware options quote sample before running walk-forward, stress, PBO/DSR, strategy ranking, or opportunity-efficacy studies.

## Mainline delivery-status correction — 25 November 2026

This section supersedes any wording above that could be read as saying the archive and point-in-time implementation has shipped on `main`.

An independent recursive Git-tree audit of `main` at `82312ae958f548375c395550bb2e96fb5dc13cfa` found:

- `src/lib/options-archive.ts`, `src/lib/research-validation.ts`, their corresponding tests, `ResumableOptionsArchive`, and `evaluatePointInTime` are **not present in that mainline tree**.
- The existing `src/components/HistoricalReplayPanel.tsx` and `src/lib/replay.ts` are the CSV execution-replay implementation; they are not the archive/PIT runtime.
- The archive/research files previously reported by the isolated coding worktree were **LOCAL / UNCOMMITTED**, not merged or delivered. Their current existence and status must be re-confirmed by the coding agent before they are relied on.
- The reported 210/210 and later 219/219 test results belong to that isolated worktree. They do not establish that archive/PIT code exists or passes tests on `main`.
- Mainline verification at the cited SHA covers the code actually committed there. It does not verify the missing archive implementation. The mainline bundle had only 3 bytes of total-JavaScript headroom in the reported passing CI measurement; the isolated feature worktree exceeded both unchanged JavaScript budgets.

Accordingly, the executive statement that this sprint “adds” the archive primitive and PIT checks describes the isolated work claimed in the original worktree report, **not a delivered mainline capability**. Treat archive durability, cross-process writer locking, crash recovery, export/restore, PIT history, and collector readiness as **NOT DELIVERED / NOT VERIFIED ON MAIN** until a reviewed code PR lands with exact source paths, tests, and passing unchanged bundle gates.

No collector, forward market-data capture, production archive, or historical BBO series is available. No strategy result or profitability claim follows from this report. The first implementation gate remains the unchanged bundle budget in [#161](https://github.com/raawaa93/Sol/issues/161); storage integrity gates in [#159](https://github.com/raawaa93/Sol/issues/159) come after it. No merge, deployment, live capture, or production write is authorized by this status correction.


## Superseding mainline status — 25 November 2026

This update supersedes the earlier 24 November statement that archive/PIT code was not delivered on main and that the bundle budget remained blocking. Those statements were correct for the historical snapshot at the time but are no longer current.

### Delivered on main

- **Bundle budget:** PR #165 removed the chart-vendor excess and restored the existing compressed budgets without relaxing thresholds. PR #186 further deferred Binance market depth. Mainline CI, bundle budget, Playwright, Lighthouse, Project Context Guard and deployment have passed on subsequent verified commits.
- **Canonical analytics:** PR #167 routes premium debit and cash-settlement payoff through canonical independent scales; #168 blocks legacy scalar fallback for canonical quotes; #170 adds narrow risk-neutral EV; #172/#175 add source-bound PAPER entry snapshots; #177 enables narrowly gated model position Greeks; #180/#187 harden IV, ticker, mark, BBO and timestamp provenance; #182 discloses the 30-minute averaging settlement approximation; #185 records RIE/RCH legal provenance with account applicability UNVERIFIED.
- **Local archive foundation:** PR #176 is merged as 8dcd251e2cc6c03dccf04b82c0cd48eb2ada59a2. Main contains scripts/options-archive.mjs, scripts/options-collector.mjs, their tests, append-only content-addressed segments, hashes, deterministic idempotency, durable cursor ordering, same-host writer lease, quota, integrity checks, local export/restore and PIT gates.
- **Opt-in REST contract-spec refresh:** main commit d67d5629c61369dc388e42216b768a6466a38b12 adds a separately injected public REST exchangeInfo refresh, five-minute default throttle, durable raw snapshot append before spec publication, and fake-transport tests. It remains OFF by default and has not been tested against Binance live.

### Still not delivered or not verified

- No default WebSocket transport, supervised collector worker, scheduled capture, real HTTP/WebSocket market capture, historical BBO/depth archive, cloud archive, or live dataset.
- The archive writer's lease is same-host/local-filesystem only; it is not a distributed lock.
- Local export/restore is not an offsite backup.
- E1/E2 remain unrun: no eligible forward-captured PIT dataset or verified vo units/semantics. The synthetic PBO/DSR tests are mathematical guard tests only, not evidence of market performance.
- No strategy profitability, expected edge, ranking calibration, dealer inventory, institutional identity or live-trading capability is claimed.
- Binance RIE/RCH legal settlement terms are not verified as applicable to the user's exact account/entity. The project remains read-only/PAPER-only under the Syria legal gate.

### Current experiment gates

| Experiment | Current state | Minimum evidence before running |
|---|---|---|
| E1: venue-reported volatility vs realized variance | Blocked | Verified vo definition/unit; forward event capture; complete timestamped index series; PIT eligibility and no-gap coverage |
| E2: signed option flow and market response | Blocked | Forward MARKET/BLOCK trade events, maker flag m, exact quote/index joins at or before trade completion time, durable gap markers |
| Historical surface/skew/term structure | Blocked | Synchronized multi-expiry BBO and IV observations with source/receive clocks, contract-spec versions and licensed retention |
| Executable strategy replay | Blocked | Point-in-time BBO/depth, displayed size, fee schedule, settlement model, conservative fills and walk-forward splits |
| Portfolio risk and correlation | Unavailable | Position book plus synchronized returns/exposures with consistent currencies, multipliers and timestamps |

### Verification evidence

- Main CI on d67d5629c61369dc388e42216b768a6466a38b12: success (run 45550879596).
- Project Context Guard: success (run 45550879632).
- Lighthouse baseline: success (run 45550879682).
- GitHub Pages build/deploy and published-site smoke/Lighthouse: success (run 45550879655).
- The current execution record is maintained in docs/EXECUTION_STATUS_2026-11-24.md, and archive-specific limits are maintained in docs/OPTIONS_ARCHIVE_IMPLEMENTATION_STATUS_2026-11-25.md.

No live capture, production database write, paid service, account credential, live order or funds movement was used in these changes.
\n\n## Implementation update — BBO-aware replay contract (25 November 2026)\n\nPR #204 merged as `337e03fb26d44c906125318affc473030c165da4`.\n\n- Replay chronology uses local BBO receive/availability time; source event/snapshot time is retained separately. A source-to-receive delay above five minutes, missing/future clocks or mismatched clocks are rejected.\n- Eligible sources are explicit `BOOK_TICKER` or `OPTION_TICKER` BBO. Binance `bookTicker` supplies bid/ask and displayed contract-count quantities; REST `OPTION_TICKER` BBO uses `sourceTimestamps.ticker`. The WebSocket `optionTicker` 24-hour statistics/last-price event is not BBO.\n- Every row needs explicit `bidAskSizeUnit` (`CONTRACTS` or `UNDERLYING_UNITS`), bid/ask quantities and non-estimated two-sided prices. Entry requires enough Ask size; exit requires enough Bid size. Mark-only and modelled prices are not executable.\n- Per-side adverse slippage is configurable and visible with fills, clocks and displayed size. Zero fees/slippage are unmodelled, potentially optimistic assumptions.\n- CSV template/import preserves BBO source, event time, receive time, size unit and quantities. CSV provenance remains user-asserted and unauthenticated; generic `timestamp` is not a BBO clock.\n\nVerification: CI 45572889900 passed 303/303 unit/property tests, production build, compressed bundle budget and 18/18 Playwright journeys; Lighthouse 45572889852 and Project Context Guard 45572889839 passed.\n\nThis is a conservative one-leg fixed-hold PAPER execution baseline, not a predictive strategy. It does not create a historical BBO archive or model full depth, queue position, partial fills, latency distributions, expiry/settlement or hedging. No empirical strategy edge or profitability is established.\n
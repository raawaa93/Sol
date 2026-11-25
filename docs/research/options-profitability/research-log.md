# Research Log — Options Profitability and Professional Practice

Updated: 2026-11-25

## Account-level styles
- Who Profits from Trading Options? Hu, Kirilova, Park, Ryu, Management Science (2024), DOI https://doi.org/10.1287/mnsc.2023.4916. Account-level data: roughly 66% active retail investors predominantly used simple one-sided positions; institutions more often used complex strategies; volatility selling was the most successful style for both groups within the sample. Not universal or risk-free. Source: https://ideas.repec.org/a/inm/ormnsc/v70y2024i7p4742-4761.html

## Retail event volatility and costs
- Losing is Optional: Retail Option Trading and Expected Announcement Volatility, de Silva, So, Smith; Review of Finance 2026 issue (published online 2025). Retail investors buy before earnings/volatility spikes, overpay relative to realized volatility, face wide spreads and respond sluggishly; sample reports losses 5–9%, 10–14% around high expected-volatility announcements. https://academic.oup.com/rof/article-abstract/30/2/489/8301159
- Retail Trading in Options and the Rise of the Big Three Wholesalers, Journal of Finance (2023): retail preference for cheap weekly options, average quoted spread 12.6% in studied sample, average losses. https://onlinelibrary.wiley.com/doi/full/10.1111/jofi.13285
- Very Noisy Option Prices and Inference Regarding the Volatility Risk Premium, Journal of Finance (2024): microstructure/noise and robustness concerns; reports negative returns for some heavily traded OTM calls and delta-hedged ATM options in examined samples. https://onlinelibrary.wiley.com/doi/10.1111/jofi.13365

## Market-maker management
- Options Market Makers, Hu, Kirilova, Muravyev, Ryu (2025 working paper): KOSPI 200 account-level data, positive profits on 74% of days; inventory rebalancing within minutes appears important; most sample market makers did not consistently delta hedge. S&P 500 turnover exceeds net position change by reported factor. Market-specific working-paper evidence. https://www.fma.org/assets/docs/Derivatives2025/Muravyev.pdf

## Professional tool categories (not purchased or tested)
Cboe LiveVol (analytics); OptionMetrics IvyDB (historical research data); ORATS (volatility analytics/research); SpiderRock (data/analytics). Evaluate pricing/licensing before adoption.

## Open-source candidates to audit, not automatically integrate
- QuantLib https://github.com/lballabio/QuantLib — pricing/risk reference.
- vollib https://github.com/vollib/py_vollib — options pricing/IV/Greeks; review package status and license.
- QuantConnect LEAN https://github.com/QuantConnect/Lean — event-driven research/backtesting; study architecture, don't import wholesale.
- vectorbt https://github.com/polakowo/vectorbt — research/backtesting; review licensing.
- LumiBot https://github.com/Lumiwealth/lumibot — framework; exclude live execution pathways from Sol.

## Binance public-data observations
Public trade events expose trade id/time/contract/price/quantity/type/direction and buyer-market-maker flag m. Interpret m independently from direction S and preserve MARKET/BLOCK distinction. Do not infer identity, open/close or inventory from prints. Official docs: https://developers.binance.info/en/docs/catalog/core-trading-derivatives-trading-options/api/ws-streams ; FAQ https://www.binance.com/en/support/faq/detail/fe0be251ac014a8082e702f83d089e54

## Limitations
This is a scoped initial pass, not exhaustive review of papers, vendors, repositories or strategies. Specialized academic retrieval was unavailable. No paid data/services were purchased. No application code or live data collection was run as part of this documentation change.

## Next research questions
- Robustness of realized/implied variance estimation and risk-premium regimes.
- Transaction costs, fill probability, adverse selection, queueing and execution.
- No-arbitrage surface construction/interpolation and extrapolation.
- Crypto venue/settlement/contract differences and quote quality.
- Dispersion/correlation trades and hedging costs.
- Position sizing, drawdowns, margin/liquidation risk and capacity.
- Open-source data/library licensing, freshness and reproducibility.

## Second research pass — surface integrity, dispersion, execution and repositories

### Surface construction and arbitrage checks
- crollila/implied-vol-surface-svi: raw SVI fit and static arbitrage diagnostics described in README; author-reported metrics unverified. https://github.com/crollila/implied-vol-surface-svi
- Arhayout/volatility-surface: SVI/SSVI/eSSVI and butterfly/calendar checks; candidate for audit. https://github.com/Arhayout/volatility-surface
- amm-kej/ssvi_live: SSVI pipeline; review slice refitting penalties and verify whether no-arbitrage guarantees hold after refitting. https://github.com/amm-kej/ssvi_live

### Dispersion
- Marshall (2009), Global Finance Journal: compares component and index implied volatility during 2005-2007; discrepancies vary direction and transaction costs matter. https://www.sciencedirect.com/science/article/pii/S1044028309000593
- Dispersion is correlation exposure; inferred correlation depends on weights, surfaces, execution and regime. Research only until realistic costs and component data are validated.

### Execution and spreads
- Pinder (2003): spreads related to option value, term, absolute hedge ratio and underlying volatility; trading activity relates inversely to spreads. https://www.sciencedirect.com/science/article/pii/S1057521903000632
- Limit-order placement literature stresses execution probability vs adverse selection, and latency can erode predictive value. https://openurl.ebsco.com/contentitem/doi:10.1142/s2382626617500095
- Capture spread, quote age, depth, trade size, fill assumptions and price impact. Mid-price backtests alone are not acceptable.

### Additional repositories to audit, not reuse blindly
- khayreali/OptionsBacktester: delta-hedged backtest and Greek attribution. https://github.com/khayreali/OptionsBacktester
- Scott-Switzer/options-backtester: crossing bid/ask and commissions described; audit correctness/license. https://github.com/Scott-Switzer/options-backtester
- gianni04/options-hedging-risk: risk/hedging example, author claims unverified. https://github.com/gianni04/options-hedging-risk
- TheRealKwabena/vol-surface: inspect claimed numerical tests and arbitrage diagnostics. https://github.com/TheRealKwabena/vol-surface
- FilipNowakowicz/option-vol-surface: educational IV/Greek attribution candidate. https://github.com/FilipNowakowicz/option-vol-surface
- Aaaaarin/vol-surface-dispersion: implied-correlation and costed dispersion code, claims must be reproduced. https://github.com/Aaaaarin/vol-surface-dispersion
- anthonymakarewicz/volatility-trading: claimed realistic-cost research pipeline; verify methodology and licensing. https://github.com/anthonymakarewicz/volatility-trading

Recent repo performance claims may rely on synthetic, proxy or incomplete data. Treat them as research leads, not evidence of strategy profitability.


## Third research pass — new 2025–2026 evidence and Sol implementation audit

### Important update: do not treat volatility selling as a timeless edge
- Dew-Becker & Giglio, *The Decline of the Variance Risk Premium: Evidence from Traded and Synthetic Options* (Chicago Fed WP 2025-17, 4 Sep 2025): report that traded equity-index option alphas over the last 15 years became statistically indistinguishable from zero, despite historical negative returns; their synthetic options show no negative alpha over a 100-year sample. This directly qualifies the 2024 account-level result: selling volatility was strongest in that sample, but the premium can vary and decline. https://www.chicagofed.org/-/media/publications/working-papers/2025/wp2025-17.pdf
- Bali, Kelly & Mörke, *Volatility Disagreement in the Options Market*, NBER WP 35500 (July 2026): a cross-sectional disagreement measure from heterogeneous realized-variance forecasts is associated with option opening; sorting delta-hedged straddles produces a reported long-short return of -5.14% per month. This is a working paper, not a deployable signal; investigate sample construction, turnover, costs, model disagreement and out-of-sample robustness. https://www.nber.org/papers/w35500
- Terstegge, *Intermediary Option Pricing* (Nov 2025 working paper): argues option risk premia compensate market makers for equity inventory risk when overnight hedging is impaired; inventory exposure is not captured fully by common gamma measures. https://www.fma.org/assets/docs/Derivatives2025/Terstegge.pdf

### Execution quality is broker/route-dependent
- Huang, Jorion & Schwarz, *Some Anonymous Options Trades Are More Equal than Others* (revised June 2025): simultaneous market-order tests across six brokers found round-trip execution costs ranging from 0% to 7%, with variation linked to wholesaler routing and execution method. Treat as a small controlled sample, not a universal broker ranking. https://papers.ssrn.com/sol3/Delivery.cfm/4951825.pdf
- *Option Auctions*, Review of Financial Studies (2026): studies option auctions, price improvement and market-maker revenues; reports auctions can improve execution for investors while market makers may lose on some auction trades and earn revenue in continuous trading. This reinforces that quoted spread alone is not net market-maker profit and execution economics are route- and venue-dependent. https://academic.oup.com/rfs/article/39/3/783/8193725

### Surface modelling research
- Del Valle Saragoni, *Arbitrage-Free Volatility Surface Construction: SVI, SABR, SSVI, and Vanna-Volga* (SSRN, Jan 2026): a useful technical survey/implementation lead, but SSRN preprint with no cited references in its page metadata; do not treat as peer-reviewed validation. https://papers.ssrn.com/sol3/Delivery.cfm/6197858.pdf
- Guney, *Arbitrage-Free Construction of Volatility Surfaces in the Ultra-Short Tenor Regime* (SSRN, Mar 2026): reports severe butterfly-arbitrage violations from unconstrained spline interpolation in a 0DTE SPY tick dataset. Highly relevant to avoiding naive interpolation, but preprint and U.S. equity index domain; verify independently before generalizing to crypto options. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6457378

### Sol code audit (main branch at commit d6ae5ca5d27b6b6146259e5362f6cd07a522c91c)
Reviewed `src/lib/binance-option-trades.ts`, its tests, `src/lib/pricing-model.ts`, `src/lib/binance-crypto-options-economics.ts`, `src/lib/types.ts`, `PROJECT_CONTEXT.md`, `package.json`, `docs/DATA_PROVIDER_EVALUATION_2026-11-24.md`, and Issue #155.

Confirmed strengths:
- Trade parser retains raw payload, schema version, event/transaction/receive timestamps, trade ID, execution type, raw side and maker flag.
- Aggressor classification uses `m` independently from `S`; MARKET and BLOCK are kept in separate aggregates.
- Batch dedup key is venue + symbol + trade ID; aggregates explicitly label venue quantities as unnormalized.
- Crypto contract adapter separates premium multiplier (1 per contract) from settlement unit and validates canonical economics.
- Pricing model explicitly separates Black-76 forward delta from spot Black-Scholes-with-carry; source Greeks are typed as unverified and audit-only.

Gaps / risks to resolve before any feature claim:
1. `deduplicateBinanceOptionTrades` is batch-local only; durable cross-batch idempotency/replay is not yet established by the reviewed parser.
2. The reviewed parser does not itself establish feed continuity, sequence/gap detection, reconnect lifecycle, stale-feed alarms or clock-skew policy; those require a collector/runtime and operational tests.
3. Parser accepts positive timestamps but does not enforce a documented event-time/transaction-time ordering tolerance; define this from Binance semantics rather than assume a strict order.
4. `aggregateBinanceOptionTradeFlow` only aggregates raw contract quantity; no premium-notional, delta or vega exposure should be displayed until canonical economics, quote-time joins and units are validated.
5. A batch of trade events is not a persistent event store; no durable storage, retention, quota, export/restore or replay guarantee was established in this code audit.
6. `pricing-model.ts` supports specific Black-family assumptions; it is not a calibrated stochastic-volatility/local-volatility surface model. Surface fit and arbitrage diagnostics remain unverified.
7. Current package scripts show tests/build/E2E/bundle checks, but this review did not execute CI or a live endpoint. Do not label any unrun test or live stream as verified.

### Issue #155 status at audit time
Issue remains open and has no assignee. Requirements are extensive and explicitly require a persistent collector, quote joins, contract economics, storage/replay, and live smoke test. Do not assume Copilot is working until GitHub shows it assigned or a new PR/commit appears.

### Updated priority order
P0: durable collector lifecycle + continuity/staleness/gap telemetry and event-time quote matching; persistent idempotency and replay; tests for clock skew and future/stale quote rejection.
P1: volatility surface integrity diagnostics and source/model provenance; do not interpolate without static-arbitrage checks.
P2: execution-cost/fill model and route/venue-sensitive spread metrics.
P3: regime-aware VRP and disagreement research; report uncertainty and tail risk, not one static short-volatility signal.
P4: dispersion only after component coverage, covariance/weight methodology and hedging costs are available.


## Fourth research pass — crypto risk premia, arbitrage-free surfaces and Binance stream operations

### Crypto volatility risk premia are regime- and definition-dependent
- Almeida, Grith, Miftachov & Wang, *Risk Premia in the Bitcoin Market* (arXiv:2410.15195, revised 1 Aug 2025): compares Bitcoin option-implied and realized first/second-moment premia with U.S. equity index premia. The authors report a higher Bitcoin variance risk premium in their sample and different state-space contributions; this is a working paper, not a stable forecast or a direct Binance strategy. https://arxiv.org/abs/2410.15195
- Grith, Almeida, Miftachov & Wang, *Option-Implied Risk Premia and Cryptocurrency Market Regimes* (SSRN, revised 26 Jun 2026): reports two volatility regimes and changes in the composition of Bitcoin variance premia across regimes. SSRN working paper; independently reproduce definitions, option surface construction and regime classification before use. https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5374295
- Han, *The price of crypto-market volatility risk*, Research in International Business and Finance (2026), DOI 10.1016/j.ribaf.2026.103374: studies cross-sectional crypto returns using Bitcoin implied-volatility exposure, not direct option-selling P&L. Its reported premium concerns crypto-asset portfolios and must not be misread as evidence that shorting BTC options is profitable. https://doi.org/10.1016/j.ribaf.2026.103374
- Karim et al., *Exploring asymmetries in cryptocurrency intraday returns and implied volatility* (International Review of Financial Analysis, 2024): analyzes 6.5 million BTC/ETH observations and reports frequency- and quantile-dependent asymmetries. Supports regime/frequency-conditioned diagnostics, not a standalone trade signal. https://doi.org/10.1016/j.irfa.2024.103617

### Volatility surface construction: hard constraints, not cosmetic fit
- Gatheral & Jacquier, *Arbitrage-free SVI volatility surfaces*, Quantitative Finance 14(1), 2014, DOI 10.1080/14697688.2013.819986: constructs SVI parameterizations that guarantee absence of static arbitrage under stated conditions. Use as the theoretical baseline for SVI diagnostics; a numerically good fit alone is insufficient. https://doi.org/10.1080/14697688.2013.819986
- Engineering implication for Sol: validate calendar monotonicity and butterfly convexity on the total-variance/option-price representation, retain fit residuals and parameter constraints, and run checks again after interpolation/extrapolation. Reject or mark unavailable any surface that fails. Do not equate an SVI fit with a proof of dynamic/no-arbitrage profitability.

### Official Binance WebSocket operational constraints
- Current Binance Options WebSocket docs specify the public wss://fstream.binance.com/public/ws/ route and combined stream route; optionTrade updates are documented at 50 ms. Trade event fields include E event time, T trade-completion time, s option symbol, t trade ID, p, q, X, S, and m. https://developers.binance.info/en/docs/catalog/core-trading-derivatives-trading-options/api/ws-streams
- Binance connection guidance says a connection is valid for 24 hours, server ping frames arrive every 5 minutes and require pong within 15 minutes, incoming client messages are limited to 10/second, and a connection can listen to at most 200 streams. These are operational constraints for reconnect scheduling and subscription batching; they are not guarantees of uninterrupted event delivery. https://developers.binance.info/en/docs/products/derivatives-trading-options/websocket-market-streams/Connect
- Consequence: collector should schedule a controlled rotation before 24 hours, implement ping/pong at the WebSocket protocol layer, rate-limit subscription control messages, cap stream subscriptions, and explicitly mark reconnect intervals as coverage gaps. Do not infer event sequence continuity from trade IDs unless Binance documents a contiguous sequence guarantee for this stream.

### Updated implementation priorities
1. P0: archive integrity, raw payload retention, cross-process single-writer lease, deterministic restart/replay, explicit export/restore verification and bounded storage.
2. P0: collector state machine with 24-hour planned rotation, protocol ping/pong, bounded backoff, subscription acknowledgements/rate limits, stale-feed and gap accounting; fake transport tests before any live public smoke test.
3. P1: point-in-time quote/Greek joins and canonical contract economics; reject future/stale observations.
4. P1: constrained SVI/SSVI surface diagnostics and explicit static-arbitrage rejection; no unconstrained spline fallback.
5. P2: realistic execution/fill/adverse-selection model and venue-specific cost measurement.
6. P3: regime-aware crypto variance-premium research with separate definitions for option P&L, underlying cross-sectional volatility exposure, and risk-neutral vs realized variance.

Research classification: peer-reviewed theory/studies, working papers/preprints, and official venue documentation are explicitly distinguished. No profitability claim, paid service, account access, live collector, or production deployment is established by this research pass.

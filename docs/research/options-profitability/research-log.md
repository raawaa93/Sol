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

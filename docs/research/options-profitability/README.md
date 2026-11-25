# Options Profitability Research — Sol

Research hub for evidence on how options traders generate returns, professional practices, evaluation methods, and ideas Sol can safely test in read-only/PAPER mode.

## Safety and scope
- Research only; Sol remains read-only and PAPER-only.
- No orders, transfers, private streams, credentials, paid services, eligibility circumvention, or real-money trading.
- Do not infer institutional identity, open/close intent, dealer inventory, or market-maker positioning from public prints without validated evidence.
- Distinguish observed data, estimates, model outputs, and hypotheses.
- No strategy is a recommendation or presumed profitable.

## Initial research hypotheses
1. Execution costs, adverse selection, liquidity, and fill assumptions can erase apparent edge.
2. Volatility selling has sample-specific empirical support, but carries substantial tail risk and is not universal.
3. Market-maker profitability involves spreads, inventory turnover, quoting, and hedging; simplistic delta-hedging assumptions may misrepresent behavior.
4. Relative-value volatility trades require reliable surfaces, quotes, hedge costs, and out-of-sample testing.
5. Retail event and short-dated option buying can incur expensive implied volatility and wide spreads.
6. Backtests must include fees, spread, slippage, stale quotes, liquidity, tail risk, leverage, selection/survivorship, look-ahead and multiple-testing controls.

## Files
- research-log.md: sources and findings.
- strategy-evaluation.md: testing protocol and gates.

## Next work
Audit Sol's options pipeline; add volatility-surface diagnostics, market-microstructure metrics, portfolio risk/stress scenarios, realistic strategy replay and a no-trade baseline, and a forecast/decision journal.

## Source hygiene
Prefer peer-reviewed research, official docs, licensed datasets, maintained repositories and reproducible methods. Record source URL, date, sample, limitations and implications.
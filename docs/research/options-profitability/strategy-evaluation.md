# Strategy Evaluation Protocol

## Hard constraints
Research/read-only and PAPER-only. A strategy is a hypothesis, not a recommendation. Use chronological train/validation/test splits and walk-forward tests; include a no-trade baseline; prevent look-ahead, survivorship, selection and multiple-testing bias. Model bid/ask, fees, slippage, latency, fill probability, liquidity limits, hedge costs and financing/funding where applicable. Include tail risk, drawdown and leverage. Reject stale, malformed, future or inconsistent quotes. Record lineage and both event/receive timestamps. Historical returns do not establish future profitability.

## Families to research
1. Volatility/variance risk premium and delta-hedged volatility selling.
2. Long volatility and convexity across regimes.
3. Skew/relative-strike valuation.
4. Term structure/calendar spreads.
5. Dispersion/correlation only with reliable component data.
6. Event volatility and realized event movement.
7. Microstructure/execution; simulated market-making only if data and controls justify it.

## Required report
Thesis/falsifiable hypothesis; data source/coverage/missingness; contract economics; entry/exit assumptions; cost/fill model; exposures and stress tests; net returns and risk metrics with caveats; drawdown/tail loss/turnover/capacity proxy; robustness/sensitivity/failure conditions; reproducible code/tests; explicit status (idea/prototype/tested/robust/rejected).

## Gate
No strategy is actionable in Sol. Only research/PAPER outputs may be shown, with provenance, data-quality status, limitations and risks.
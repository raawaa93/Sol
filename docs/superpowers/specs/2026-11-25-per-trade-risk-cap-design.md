# Per-trade USD risk cap — design

**Date:** 25 November 2026  
**Project:** Sol Financial and Investment Intelligence  
**Scope:** PAPER-only single-option entry sizing and recording.

## Intent

Enforce the user's stated maximum loss of USD 60 per option position when recording a PAPER entry. The cap must apply to manually entered quantities as well as quantities calculated by the budget helper; a visible default alone is not a risk control.

## Current behavior

- The trade lab defaults `riskBudget` to 60.
- The budget button calculates an affordable quantity using premium and entered fees.
- The quantity field remains manually editable.
- `savePaperTrade` validates price, contract scale and Binance quantity filters, but does not reject a manually entered quantity whose maximum loss exceeds the budget.
- The budget is denominated in the selected quote asset. Applying a USD limit to EUR/GBP/etc without a verified FX conversion would be incorrect.

## Decision and approaches

1. **Advisory-only cap:** retain the current budget calculator and warn on overspend. Rejected because manual quantity bypasses it.
2. **Hard per-trade guard (selected):** clamp the configurable budget to a hard USD 60 ceiling; calculate maximum buyer loss including fees; block PAPER save if the loss cannot be calculated, the quote currency is unsupported, or loss exceeds the selected budget. Apply to canonical and supported legacy contract scales.
3. **Automatic FX conversion for every quote currency:** deferred because no verified FX source/freshness/conversion path is currently part of the trade-lab risk calculation.

## Rules

- Default and absolute maximum per-trade budget: 60 USD.
- Lower user-selected budgets are allowed; values above 60 are clamped to 60.
- Only USD, USDT and USDC quote assets are accepted as dollar-denominated proxies. USDT/USDC are not guaranteed to equal USD; this is an approximation, not a conversion.
- Maximum loss is premium debit plus entered fees for a long option. Use the canonical contract-economics calculation when available; otherwise use only the existing supported, explicitly consistent legacy scale.
- Reject recording if maximum loss is missing/non-finite, if quote currency is unknown/non-dollar, or if calculated maximum loss exceeds the selected budget.
- Apply the same validation in the save handler and disable the save control with a visible reason. The button's disabled state is not the only guard.
- Label this explicitly as a **per-trade** limit. It does not enforce aggregate risk across multiple PAPER journal entries.
- No live orders, API credentials, market capture, cloud writes, FX API, paid service or changes to legal gates.

## Acceptance

- A manually increased quantity above the budget cannot be saved.
- Increasing the budget input above 60 cannot raise the effective limit.
- Fees are included in the maximum-loss check.
- USD/USDT/USDC can use the USD-equivalent cap; EUR/GBP/unknown quote currency cannot.
- If contract scale or maximum loss is not supported, recording fails closed.
- Existing within-budget PAPER flow and journal export continue to work.

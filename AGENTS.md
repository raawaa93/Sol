# Repository-wide operating instructions

## Product scope
- The product's research universe is **options across all asset classes and venues**, not gold-only and not crypto-only. Include listed equity/index options, options on futures (rates, FX, energy, metals, agriculture), crypto options, and other legally accessible option markets.
- Gold (XAU) and silver (XAG) are individual underlyings, not the product scope.
- Always distinguish intended coverage from implemented coverage. Current Demo includes BTC, ETH, SOL, XRP, DOGE, BNB, XAU, XAG, CL and BZ. Live data is Binance-specific and limited to instruments returned by its current catalogue. CSV is more generic. This is not universal live market coverage.
- Never label a perpetual, CFD, binary contract, prediction market or synthetic payoff as an exchange-listed option. Describe rights, exercise style, expiry, settlement, multiplier, collateral and margin explicitly.

## User jurisdiction and connectivity
- The account owner is physically resident in **Syria**, not the United Kingdom.
- A VPN may be necessary for ordinary internet connectivity. Treat VPN egress IP as network routing only; it does not change residence, KYC, legal jurisdiction, tax residence, sanctions screening or venue eligibility.
- Never recommend false addresses, false residence, borrowed accounts, VPN geofencing evasion, proxy rotation or other circumvention of platform restrictions.
- Check eligibility against truthful residence and identity, exact contracting legal entity, product-specific terms and account-level permissions. A country absent from a public list is not proof of acceptance.
- As of 2026-11-24, Binance's Syria-specific FAQ says Syrian residents may register and verify subject to KYC/compliance and explicitly lists Options trading among available products. Treat Binance as the primary conditional execution candidate; verify actual Options entitlement and contract availability in the account.
- As of 2026-11-24, reviewed terms explicitly list Syria as restricted for Deribit, Bybit and OKX. Interactive Brokers' available-country list does not include Syria and its FAQ excludes sanctioned/high-risk countries. Do not route this user to these venues unless official policies change and eligibility is confirmed in writing.
- Traditional multi-asset options require an accepting broker/FCM. CME's exchange catalogue is not a retail account. Optimus Futures advertises international customers and options on futures but retains country restrictions; Syria-specific approval is unconfirmed. AMP's restricted-country list is an image and compliance must confirm Syria in writing; do not infer acceptance from a missing text match.
- Revalidate platform and product eligibility before every new execution integration and after material terms/regulatory changes.

## Trading, data and safety boundaries
- Current Volterra application is research, analysis, CSV replay and PAPER only. It does not send orders and must not gain live execution credentials by accident.
- Separate research/public-data adapters from authenticated account/execution adapters. No private trading keys in browser code, GitHub Actions logs, source control, screenshots or client storage.
- Do not label Demo or model-derived data as live. Preserve provider, legal entity, instrument ID, source timestamp, receive timestamp, currency, multiplier, exercise style, settlement, expiry, fees, margin method and per-field provenance.
- Never claim a strategy has an edge from an in-sample backtest. Include bid/ask fills, fees, slippage, liquidity, partial fills, expiry/assignment, margin/liquidation, funding/carry, delistings, outages and out-of-sample/forward validation.
- No live order placement or paid market-data subscription without a separate operational decision after compliance, risk and cost validation. Prefer free/public permitted data first; keep recurring spend at or below the user's USD 15/month ceiling unless changed by the user.
- Treat account-level and location-specific access errors separately from network errors. HTTP 451 from a CI runner is not proof of global unavailability or this user's account eligibility.
- Keep financial calculations unit-aware and instrument-specific. Never compare OI, volume, prices or Greeks across venues without multiplier, currency and settlement normalization.

## Durable context
Keep the multi-asset scope, Syrian residence, VPN connectivity distinction, platform findings and execution guardrails in repository documentation. Update this file and docs/PLATFORM_ELIGIBILITY_2026-11-24.md when verified facts change. Do not describe the project as a gold-only tool. Use “Volterra Multi-Asset Options Decision Lab” consistently.

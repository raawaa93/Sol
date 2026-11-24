---
name: volterra-options-research
description: Research, classify, price and compare options across all asset classes while respecting Syria residency, venue eligibility, contract mechanics and data licensing.
---

# Volterra Universal Options Research

## When to use
Use this workflow for any request involving options markets, venues, contract discovery, market data, Greeks, implied/realized volatility, strategy comparison, backtesting, eligibility or execution architecture.

## Permanent scope
The universe is **all options markets and asset classes**, not gold-only or crypto-only:
- Listed equities and ETFs
- Index options
- Options on futures: rates, FX, energy, metals and agriculture
- Crypto options on centralized or decentralized venues
- OTC FX and other OTC options only when the contract, counterparty and licensed data are explicit

A future, perpetual, CFD, tokenized share, binary/event contract or prediction market is not automatically an option. Verify the holder's right, strike, expiry, exercise style, settlement, deliverables, multiplier, margin and assignment mechanics.

## Required workflow

1. **Resolve actual eligibility first.**
   - Use the user's actual residence: Syria.
   - Identify the contracting legal entity, product family, KYC state, account permissions, funding and withdrawal routes.
   - Read current official terms and product-specific FAQs; distinguish global, EU, US and other regional entities.
   - VPN is connectivity only. Never use it to misstate residence or bypass a venue restriction.
   - A general country FAQ does not prove access to a later-launched sub-product.

2. **Classify the contract.**
   Capture venue, instrument ID, underlying, asset class, quote currency, settlement asset, spot/forward/index reference, strike, expiry timestamp and timezone, multiplier, contract size, deliverables, exercise style, settlement style, trading hours, exercise cutoff, corporate-action adjustments, margin and fees.
   Preserve both multiplier and contractSize; they may differ after corporate actions.

3. **Establish data provenance.**
   Every market field should retain source, source timestamp, received timestamp, delay class, license class and venue. Distinguish executable bid/ask, mark, last, midpoint, indicative, delayed and model-derived values. Never label delayed/indicative data as live or tradable.

4. **Select a pricing model by contract mechanics.**
   - European options on spot/index/FX: generalized Black-Scholes with explicit rate and carry/dividend assumptions.
   - European options on futures/forwards: Black-76 using the forward, never silently substitute spot.
   - American/Bermudan, discrete dividends, adjusted deliverables, perpetual references or unknown settlement: reject unless a separately validated model and full contract inputs exist.
   - Keep raw source Greeks for audit; do not use unverified source Greeks as model truth.
   - Label outputs OBSERVED_ONLY, ASSUMED or SUPPORTED and expose assumptions/reasons.

5. **Evaluate the market, not just direction.**
   Assess IV vs realized volatility, term structure, skew, delta bands, open interest, volume, bid/ask spread, order-book depth, time-to-expiry, theta, gamma, vega, rho, fees, slippage, funding/carry and event/jump risk. OI alone does not reveal dealer positioning or gamma exposure.

6. **Compare strategies on defined risk.**
   Calculate premium, multiplier, maximum loss, maximum gain, break-even, payoff at expiry, scenario Greeks, assignment/exercise risk and liquidity. Do not assume cross-product margin netting or atomic multi-leg execution unless the venue documents it.

7. **Separate research from execution.**
   Default to Demo/Paper. Do not enable live order placement, private API keys, deposits or paid data feeds without explicit user authorization and a verified eligible account. Keep secrets out of Git and browser bundles.

## Venue rules known at the 2026-11-24 research snapshot
- Binance: Syria FAQ explicitly lists Options subject to KYC/compliance. Crypto Options, XAU/XAG Commodity Options and U.S. Stock Options are separate product families; each needs account-level eligibility verification.
- Binance Crypto Options: current writing eligibility is restricted by underlying/account; do not assume short permission. Ordinary accounts lack portfolio-margin risk netting and options orders are limit-only.
- Binance Commodity Options: XAU/XAG first batch; European, USDT cash-settled, retail long-only.
- Binance U.S. Stock Options: selected U.S. stocks/ETFs, physically settled, long-only and limit-only; manual exercise/auto-liquidation risk. The API market endpoints provide reference contract data, not option quotes/Greeks/IV. Product access for a Syrian resident is unverified because the Syria FAQ predates launch.
- Gate EU explicitly lists Syria as restricted. Any non-EU Gate entity remains unverified until written compliance confirmation names the entity and product.
- Deribit, Bybit, OKX and Paradex list Syria restrictions in the reviewed terms. Hyperliquid geo-gating and product taxonomy do not make HIP-3 perpetuals or HIP-4 outcomes vanilla options.

## Output requirements
Return:
- What was verified, what was only reported, and what remains unknown
- Exact source links and retrieval dates
- Contract-level assumptions and model status
- Eligibility decision separated from API reachability
- Liquidity/data limitations
- Safe next action, with no invented live prices or fabricated execution claims

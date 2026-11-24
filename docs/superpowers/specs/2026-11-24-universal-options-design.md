# Universal Options Lab — Design Specification

**Date:** 2026-11-24  
**Status:** Approved for execution by the user's standing instruction to proceed without repeated approval.  
**Primary reference:** docs/PLATFORM_ELIGIBILITY_2026-11-24.md  
**UX evidence:** docs/UX_AUDIT_2026-11-24.md

## Intent

Evolve Volterra from a crypto/commodity-oriented options lab into a provider-neutral research and simulation workspace for options across asset classes and venues. Gold remains one instrument family, not the product definition.

## Goals

- Represent listed equity/index options, options on futures (rates, FX, energy, metals, agriculture), crypto options and other option contracts without lossy assumptions.
- Let the user navigate Asset Class → Venue → Underlying → Expiry → Strike.
- Display contract mechanics and data provenance before calculating price, Greeks, payoff or margin.
- Keep Demo, CSV, public market data and future licensed data clearly separated.
- Improve mobile use without requiring horizontal scrolling through every option-chain/Greeks column.
- Preserve Arabic RTL and the existing dark Volterra visual identity.

## Non-goals

- Do not add live order execution in this phase.
- Do not use VPN routing to evade geofencing or misstate Syrian residence.
- Do not claim every asset class is live merely because the data model supports it.
- Do not import a new paid data subscription or recurring service without cost and licensing validation.
- Do not silently apply Black–Scholes to futures options or contracts with incompatible carry/settlement mechanics.

## User and compliance context

The account owner is a Syrian resident. Binance's Syria-specific FAQ confirms registration/KYC subject to compliance but does not explicitly name Options in its enumerated products; do not infer product eligibility from general account access. Binance remains a technical public-data candidate only where the upstream product endpoints are available. Deribit, Bybit and OKX list Syria as restricted in reviewed terms; IBKR has no Syria country acceptance evidence. Traditional options-on-futures access requires a broker/FCM that confirms Syrian residency acceptance in writing. VPN is connectivity only, never eligibility.

## Approaches considered

1. **Keep a static underlying chip strip:** smallest code change, but it does not scale beyond a handful of symbols and has no venue or contract semantics.
2. **Add only an asset-class filter:** improves navigation but leaves the pricing model and imported contracts ambiguous.
3. **Provider-neutral instrument metadata plus cascading filters (selected):** larger foundational change, but it prevents cross-asset contract errors and allows multiple providers without hardcoding the whole world into the UI.

## Design decisions

- Introduce a canonical instrument specification carrying asset class, venue/legal entity, underlying kind, quote and settlement currency, multiplier, tick/lot sizes, exercise style, settlement style, expiry timezone, fees and margin method.
- Extend option quotes and CSV import with explicit metadata and provenance. Unknown metadata remains unknown; it must not be inferred silently.
- Add filters for asset class, venue and underlying. Populate options from actual loaded instruments and support text search.
- Keep Binance's current adapter limited to Binance catalogue results. A new provider adapter must pass compliance/licensing checks and adapter conformance tests before appearing as a live source.
- Route pricing by contract kind: Black–Scholes with appropriate carry for spot-style contracts, Black-76 for futures options, and explicit model selection for other product types. Unsupported model/contract combinations show an unavailable result rather than a misleading price.
- On mobile, use compact chain cards and a contract-detail sheet for secondary metrics. Desktop may retain dense tables.
- Continue PAPER-only; no private account keys or order endpoints.

## Acceptance criteria

- A CSV can represent a non-crypto option with asset class, venue, currency, multiplier, exercise style and settlement style without losing fields.
- The UI can filter multiple asset classes and venues and only offers underlyings present in the loaded dataset.
- Changing filters never selects a contract outside the selected asset class/venue.
- Unknown or incompatible contract mechanics do not silently enter a pricing model.
- Demo values remain labeled synthetic; live data shows source and timestamp; stale data is visible.
- Mobile chain and contract details remain usable at 390px width without forcing users to pan across all columns.
- Existing pricing, CSV, replay, freshness and no-live-order tests continue to pass.

## Implementation boundaries

Start with metadata and navigation, then mobile chain layout, then pricing-model routing. Provider expansion and live execution are separate later projects with their own compliance gates.

# Canonical Contract Economics — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-11-24-contract-economics-canonical-model.md`  
**Tracking:** #91  
**Precondition:** merged fail-closed guard from PR #101 remains active.

## Phase 0 — Freeze unsafe paths

- [x] Block unsupported scalar per-contract P&L and budget sizing.
- [x] Block unsupported position Greeks, opportunity EV and replay.
- [x] Prevent CSV venue labels from granting provider trust.
- [x] Keep the legacy CSV IV-inference guard.
- [x] Document the remaining distinction between internal consistency and exchange verification.
- [x] Reject historical replay when contract scale or settlement metadata changes between entry and exit snapshots (PR #111).

## Phase 1 — Canonical types and validators

- [x] Add ContractEconomics, PremiumScale, ExerciseTerms, DeliverableComponent and provenance types.
- [x] Add strict validators for positive scales, currencies, delivery component completeness, aggregate exercise cash and source provenance.
- [ ] Add round-trip serialization tests for CSV v2 fields.
- [x] Keep legacy fields read-only/observed-only unless a source adapter maps them.

**Phase 1 verification:** PR #119 merged. `adapterReady` means structurally complete and trusted enough to pass to a provider/model adapter; it does not imply that any pricing or Greek model supports the instrument. No runtime calculations or provider adapters were enabled in Phase 1.

## Phase 2 — Premium cost and exercise payoff primitives

- [ ] Implement premium cost using only premium multiplier.
- [ ] Implement deliverable-package valuation by component and currency.
- [ ] Implement aggregate exercise cash independently of premium multiplier.
- [ ] Add standard 100-share and adjusted 10-share-plus-cash test vectors.
- [ ] Block cross-currency totals without explicit FX conversion evidence.

## Phase 3 — Provider adapters

- [ ] Binance Crypto Options adapter: map contract unit, quote/settlement assets and published exercise/settlement terms.
- [ ] Binance Stock Options reference adapter: map premium multiplier, contractSize and deliverables; no quote/Greeks claim.
- [ ] OCC/standard-equity reference adapter for test vectors only until a licensed/live data source exists.
- [ ] Keep futures and commodity adapters blocked until exchange-specific point value and delivery specifications are sourced.

## Phase 4 — Analytics routing

- [ ] Route premium debit/credit and break-even through canonical economics.
- [ ] Route expiry payoff, max loss and scenario series through deliverable-aware payoff.
- [ ] Route position Greeks through model-specific deliverable scaling.
- [ ] Route opportunity EV and historical replay through the same validation result.
- [ ] Add invariants proving no component uses legacy unit/multiplier as a universal shortcut.

## Phase 5 — UI, CSV and migration

- [ ] Show premium multiplier, deliverables, aggregate exercise cash, quote/settlement currencies and provenance in contract detail.
- [ ] Add CSV v2 columns for premium scale, deliverable components and exercise cash.
- [ ] Preserve older CSV rows for observation; no silent backfill.
- [ ] Add unsupported-state explanations and export/import round-trip tests.

## Verification gates

- Unit/property tests for all numeric and currency invariants.
- Official reference vectors for standard and adjusted contracts.
- Playwright coverage for CSV import, mobile contract details and blocked unsupported products.
- Full CI, bundle budgets, Lighthouse, Project Context Guard and published-site smoke tests.
- No live trading, private keys, paid APIs or production database migrations in the first phases.


### Phase 1 implementation note — 24 November 2026

PR #119 adds the canonical types and fail-closed validator without wiring the new object into existing analytics. Tests cover standard equity, adjusted multi-component equity/cash delivery, cash-settlement formulas, missing terms, provenance, cross-currency blocking, futures delivery and JSON round-trip preservation. CSV v2 serialization and import/export round-trip remain intentionally unchecked; existing legacy CSV rows are not backfilled.


### Provider mapping evidence — 24 November 2026

The adapter work must preserve the differences between Binance's two Options product families:

- **Binance Crypto Options** (/eapi/v1/exchangeInfo): the official market-data schema exposes quoteAsset, settleAsset, underlying, and per-symbol unit, defined as the quantity of underlying represented by one contract. The published schema does not expose the Stock Options multiplier/contractSize pair. Map unit only to the documented contract-unit/deliverable quantity. Do not silently relabel it as a separate premium multiplier; premium price-unit semantics must be independently evidenced before enabling per-contract cost calculations. Source: https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-options/api/rest-api/market-data
- **Binance Stock Options** (/sapi/v1/equity/option/market/*): official docs explicitly distinguish multiplier (premium-cost multiplier) from contractSize (shares delivered), and expose component-level deliverables including equity and cash. These values can differ for corporate-action-adjusted contracts. Map each field independently; never infer one from the other. Source: https://developers.binance.me/en/docs/catalog/advanced-trading-stock-option-trading/api/rest-api
- Stock Options documentation also states that the product has separate account enablement/KYC steps, uses USD quote prices and USDC order payment, and does not provide option quotes/Greeks from its reference-data endpoints. This adapter is reference-data only until those capabilities and account permissions are separately verified. Source: https://developers.binance.me/en/docs/products/stock-options/introduction

**Implementation consequence:** the Phase 3 Crypto Options adapter must not invent a premium multiplier from unit; it must keep any unsupported premium scale fail-closed until a documented price-cost formula and source fixture establish the mapping. The Stock Options reference adapter is the positive test case for independent premium multiplier, contractSize and multi-component deliverables. No signed account requests, order routes, or live trading are in scope.

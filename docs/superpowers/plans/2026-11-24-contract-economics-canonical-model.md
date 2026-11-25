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
- [x] Add round-trip serialization tests for CSV v2 fields.
- [x] Keep legacy fields read-only/observed-only unless a source adapter maps them.

**Phase 1 verification:** PR #119 merged. `adapterReady` means structurally complete and trusted enough to pass to a provider/model adapter; it does not imply that any pricing or Greek model supports the instrument. No runtime calculations or provider adapters were enabled in Phase 1.

## Phase 2 — Premium cost and exercise payoff primitives

- [x] Implement premium cost using only premium multiplier.
- [x] Implement deliverable-package valuation by component and currency.
- [x] Implement aggregate exercise cash independently of premium multiplier.
- [x] Add standard 100-share and adjusted 10-share-plus-cash test vectors.
- [x] Block cross-currency totals without explicit FX conversion evidence.

## Phase 3 — Provider adapters

- [x] Binance Crypto Options adapter: map contract unit, quote/settlement assets and published exercise/settlement terms (PR #128; runtime attachment confirmed in main).
- [x] Binance Stock Options reference adapter: map premium multiplier and component deliverables; preserve contractSize independently; no quote/Greeks claim.
- [ ] OCC/standard-equity reference adapter for test vectors only until a licensed/live data source exists.
- [ ] Keep futures and commodity adapters blocked until exchange-specific point value and delivery specifications are sourced.

## Phase 4 — Analytics routing

- [x] Route premium debit/credit and break-even through canonical economics for provider-verified Binance Crypto Options cash-settlement terms (PR #167).
- [x] Route expiry payoff, max loss and scenario series through canonical cash-settlement payoff for the supported Binance Crypto Options adapter (PR #167).
- [ ] Route position Greeks through model-specific deliverable scaling.
- [ ] Route opportunity EV and historical replay through the same validation result.
- [ ] Add invariants proving no component uses legacy unit/multiplier as a universal shortcut.

## Phase 5 — UI, CSV and migration

- [ ] Show premium multiplier, deliverables, aggregate exercise cash, quote/settlement currencies and provenance in contract detail.
- [x] Add CSV v2 columns for premium scale, deliverable components and exercise cash.
- [x] Preserve older CSV rows for observation; no silent backfill.
- [x] Add unsupported-state explanations and export/import round-trip tests.

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

- **Binance Crypto Options** (/eapi/v1/exchangeInfo): the official market-data schema defines `unit` as underlying quantity per contract. The same API's order-book/trade examples show price and quantity as contract-denominated values (`price=1300`, `qty=0.1`, `quoteQty=130`), while ticker `volume` is contracts and `amount` is quote-asset value. Thus premium cash is not `price × quantity × unit`; `unit` belongs to the deliverable/payoff scale. The legacy scalar path is only numerically safe at `unit=1`; contracts with `unit>1` stay observed-only until premium debit, model-price normalization and deliverable payoff are separated. Source: https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-options/api/rest-api/market-data
- **Binance Stock Options** (/sapi/v1/equity/option/market/*): official docs explicitly distinguish multiplier (premium-cost multiplier) from contractSize (shares delivered), and expose component-level deliverables including equity and cash. These values can differ for corporate-action-adjusted contracts. Map each field independently; never infer one from the other. Source: https://developers.binance.me/en/docs/catalog/advanced-trading-stock-option-trading/api/rest-api
- Stock Options documentation also states that the product has separate account enablement/KYC steps, uses USD quote prices and USDC order payment, and does not provide option quotes/Greeks from its reference-data endpoints. This adapter is reference-data only until those capabilities and account permissions are separately verified. Source: https://developers.binance.me/en/docs/products/stock-options/introduction

**Implementation consequence:** keep `unit` as deliverable quantity, not premium multiplier. The trade schema supports premium cost as `price × contract quantity`; the legacy app's existing scalar formula still conflates premium and payoff scales, so `unit>1` remains blocked until the new Phase 2 primitives are routed into production analytics and model-price normalization is independently verified. `unit=1` remains a narrow numerical-parity exception. The Stock Options reference adapter is the positive test case for independent premium multiplier, contractSize and multi-component deliverables. No signed account requests, order routes, or live trading are in scope.


### Phase 2 implementation and verification — 24 November 2026

Added `src/lib/contract-economics-calculations.ts` with three pure calculation primitives:

- `calculatePremiumCash`: quoted premium × premium multiplier × contract count + fees; it does not read deliverable amount or exercise-cash multiplier.
- `valueDeliverablePackage`: values equity/underlying components using exact symbol and matching-currency reference prices, preserves explicit cash components, and returns component-level values. Futures remain blocked pending a futures-specific adapter.
- `calculateAggregateExerciseCash`: resolves source-defined strike multiplier or fixed per-contract cash independently of the premium multiplier.

Regression vectors cover standard 100-share equity, adjusted 10-share-plus-cash, separate premium/exercise multipliers, fixed exercise cash, and explicit rejection of cross-currency totals without FX evidence. The calculation API requires `adapterReady`; it does not enable calculations for user-asserted, synthetic, unknown, incomplete, or cross-currency terms.

Verification on commit `171c0b762eb79ce5d0592060a7f66f03a03278d9`:
- CI completed successfully, including unit/property tests, mocked backup encryption/orchestration, production build, bundle budgets and Playwright browser journeys.
- Project Context Guard passed.
- GitHub Pages deployment and published-site market-data proxy smoke test passed.
- Published-site Lighthouse representative run: Performance 98, Accessibility 100, Best Practices 100, SEO 100, Agentic Browsing 100. Other two published-site samples were 81 and 99 Performance; all three scored 100 in the other four categories. Lighthouse scores vary with runner load.
- The accessibility-tree defect found in the previous published report was fixed; the new published report confirms the agentic accessibility-tree audit passes.

No existing P&L, Greeks, opportunity EV, replay, CSV import/export or production calculation paths have been switched to these primitives yet. That remains Phase 4/5 work; no claim of full analytics integration is made.


### CSV v2 implementation — merged 24 November 2026

PR #124 merged as `037d776cb1c30808bffa12b024e2e03ddb7b886e`.

- Added a versioned CSV v2 codec for premium multiplier/currency/price unit, exercise style and settlement, aggregate exercise cash, deliverable components, and cash-settlement formula.
- Extended the downloadable options CSV template and parser.
- JSON deliverables are preserved as quoted CSV cells and round-trip tested.
- Imported economics are always marked `USER_ASSERTED`; any claimed provider status/provider/source/timestamp is retained only as raw audit data. CSV content cannot promote itself to `PROVIDER_VERIFIED` or enable calculations.
- Legacy CSV rows remain accepted and are not silently backfilled with canonical terms.

Verification on PR head `0be47bc03b423d5d4f82894c86d3c7416f6ea2a6`: CI passed (unit/property tests, mocked backup encryption/orchestration, production build, bundle budgets, Playwright journeys); Project Context Guard passed; Lighthouse completed successfully. No production pricing or trading path was enabled by this change.


### Analytics guard hardening — 24 November 2026

PR #127 merged as `c5272332ba0afca2ad01098314f3d834d7d70784`.

- `getRiskNeutralExpiryMetrics` now requires the active trusted data mode and applies `getContractScaleIssue` internally. This prevents a future direct caller from bypassing the UI's scale gate.
- `OpportunityReview` passes the current data mode into the calculation.
- Regression tests confirm Binance `unit=1` remains eligible under the narrow existing profile while `unit=100` remains blocked, including when a matching legacy `contractMultiplier=100` is supplied.
- The corrected PR CI passed unit/property tests, mocked backup orchestration, production build, bundle budget and Playwright browser journeys. Project Context Guard and Lighthouse also passed on the PR head.

**Scope clarification:** this is defense-in-depth for the risk-neutral EV/probability function only. It does not complete Phase 3 provider adapters or Phase 4 routing of premium cash, break-even, expiry payoff, max loss, Greeks, opportunity EV and replay through one canonical economics result. The legacy scalar path remains intentionally blocked for Binance `unit > 1`; no previously unsupported contract was enabled.


### Binance Crypto Options reference adapter — merged 24 November 2026

PR #128 merged as `b5acdf1fa0b9c3f963222863549968af26ac0f0f`.

- Added `mapBinanceCryptoOptionEconomics`, which accepts only explicit `underlyingType=CRYPTO` and `contractType=CRYPTO_OPTIONS` source metadata.
- Maps premium multiplier = 1 and price unit = PER_CONTRACT independently from Binance `unit`, which is mapped only to the cash-settlement intrinsic multiplier (underlying quantity per contract).
- Maps quote and settlement assets separately; cross-currency terms remain unavailable without FX evidence.
- Preserves source endpoint, server timestamp and raw contract fields as provider provenance.
- Binance quote normalization attaches canonical economics only when product family and required fields are explicitly present. No inference from asset symbol or venue label is used for this adapter.
- Tests cover unit 1, 100 and 1,000, premium cash parity, source-family rejection, missing fields and currency mismatch.

Verification on PR head `5a62815cedf39fc6f4cb70624082c2c2ab0073f8`: CI passed (unit/property tests, mocked backup test, production build, bundle budgets and Playwright); Project Context Guard passed; Lighthouse completed successfully.

**Scope boundary:** this is a reference/economics mapping adapter only. It does not enable the legacy scalar analytics for Binance unit > 1, and does not route payoff, break-even, max-loss, position Greeks, EV or replay through canonical economics. Model capability and production analytics routing remain separate work.


### Binance Stock Options reference adapter — implementation branch, 24 November 2026

Added `mapBinanceStockOptionEconomics` and focused regression tests on `feat/binance-stock-options-reference-adapter`.

Official Binance Stock Options market-data documentation defines:
- `multiplier` as the premium-cost multiplier.
- `contractSize` as shares delivered per contract; it may differ after corporate actions.
- `deliverables` as component-level equity/cash amounts.
- Prices in USD, while order payment is USDC; the adapter does not treat this as an FX conversion.
- The market-data endpoints do not provide option quotes, IV or Greeks.

The mapper preserves `multiplier`, `contractSize`, root/underlying symbols and component deliverables independently. It does **not** infer an exercise style or aggregate exercise-cash obligation because the reference fields used here do not establish those terms. Settlement and exercise style remain `UNKNOWN`, so the canonical validator keeps all calculations blocked. This is reference metadata only, not a pricing/Greeks adapter or trading integration.

Test vectors cover standard contracts and an adjusted contract with 10 shares plus a USD cash component while premium multiplier remains 100; incomplete and unrecognized deliverable data are rejected.


### Canonical cash-settlement expiry payoff primitive — implementation branch, 24 November 2026

Added `calculateCashSettlementPayoff` as a pure, fail-closed calculation for contracts whose provider-verified canonical terms explicitly specify `CASH` settlement with `INTRINSIC_VALUE` formula.

- Payout uses the cash-settlement formula multiplier.
- Entry premium uses the independent premium multiplier.
- CALL/PUT intrinsic value, contract count and supplied fees are applied separately.
- Quote and settlement currency must already pass canonical validation; no FX conversion is inferred.
- Physical delivery, unknown settlement, unsupported formulas and invalid numeric inputs are rejected.
- Reference tests cover a call, a put, worthless expiry and unknown settlement.

This is a calculation primitive only. It is not yet wired into the legacy payoff chart, break-even, max-loss, scenario, EV, Greeks or replay paths. In particular, break-even and max-loss need product-specific payoff bounds and must not be inferred for physical multi-component deliverables by this helper.


### Phase 4 Binance cash-settlement integration — 25 November 2026

PR #167 merged to main as `acd5efcdbec53c2fbcee27a0a4e198a85454eb64`.

- The live Binance adapter already attached provider-verified canonical Crypto Options economics to each eligible `OptionQuote`; this was confirmed in `src/lib/binance.ts`, not assumed from a symbol or venue string.
- The app now calculates per-contract premium debit and affordability using the canonical premium multiplier, and calculates cash-settlement breakeven, maximum loss and expiry scenario series using the independent cash-settlement multiplier.
- The Spot Price Index settlement reference is accepted only when the quote includes a source timestamp for the index.
- Legacy scalar calculations are not used when canonical terms exist, even when unit=1. The app keeps position Greeks, PAPER journal writes, risk-neutral EV and legacy replay blocked until those consumers have explicit canonical/model-aware adapters.
- PR verification passed CI, including unit/property tests, mocked backup orchestration, production build, bundle budgets and Playwright browser journeys; Project Context Guard and Lighthouse passed. The published-site smoke-test workflow was skipped by its schedule/conditions, so do not claim a post-merge published-site smoke test from this PR.

Remaining Phase 4 work: model-specific position Greeks, canonical risk-neutral EV, canonical PAPER journal schema and calculations, and canonical replay. CSV v2 remains USER_ASSERTED on import and cannot grant provider provenance.


### Canonical cash-settled risk-neutral EV — PR #170 merged 25 November 2026

Merged to main as `71a8a027659e880f22aa3b998b0c075c1a071bd3`.

- Added a narrowly scoped risk-neutral expiry model for provider-verified Binance European Crypto Options cash-settled against the index.
- Uses the canonical cash-settlement multiplier for payoff/model price and the independent premium multiplier for entry debit; computes ITM probability separately from probability of positive expiry P&L and includes user-entered fees in the latter.
- Requires observed IV, a valid timestamped index, an observed risk-free rate (estimated/missing rate is rejected), supported Black–Scholes-with-carry metadata, and provider-verified contract economics. Binance carry remains an explicit 0% assumption shown in the UI.
- The UI calls this a risk-neutral model diagnostic, not a real-world forecast or trade recommendation. It does not establish profitability or historical edge.
- Binance model Greeks/price normalization now uses canonical cash scale only when premium multiplier is 1 and the verified adapter maps the product. Unsupported products and unknown scales remain blocked.
- CI, Project Context Guard and Lighthouse passed on PR head `d93a9a9bacae6edc1ecc98bbb00a82a43680a0c5`. Published-site smoke test was skipped by workflow conditions.

Remaining: model-aware position Greek aggregation/shock P&L, canonical PAPER lifecycle valuation and replay. Entry-only PAPER snapshots are handled separately by PR #171 and remain unmerged pending checks.

### Canonical PAPER entry snapshot — PR #169

PR #169 adds a PAPER-only entry snapshot for verified Binance Crypto Options. It stores canonical economics, independent premium multiplier and unit, premium debit, exact observed price basis and its source timestamp. It rejects CSV provenance, model-generated prices and missing/mismatched timestamps. It does not implement mark-to-market, exits, P&L, Greeks, EV or replay. Await PR checks before calling it delivered.

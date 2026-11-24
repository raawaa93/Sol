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

## Phase 1 — Canonical types and validators

- [ ] Add ContractEconomics, PremiumScale, ExerciseTerms, DeliverableComponent and provenance types.
- [ ] Add strict validators for positive scales, currencies, delivery component completeness and aggregate exercise cash.
- [ ] Add round-trip serialization tests for CSV v2 fields.
- [ ] Keep legacy fields read-only/observed-only unless a source adapter maps them.

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

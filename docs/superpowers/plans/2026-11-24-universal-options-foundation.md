# Universal Options Foundation Implementation Plan

> **For agentic workers:** Use the repository's GitHub branch/PR workflow. Apply test-first changes and verify CI before merging.

**Goal:** Add provider-neutral option metadata and a scalable multi-asset navigation model to Volterra.

**Architecture:** Normalize contract metadata before analysis. Keep provider adapters responsible for translating venue-specific instruments. UI filters derive from actual loaded instruments and do not assume every asset class is live.

**Tech Stack:** React 18, TypeScript, Vite, Node test runner, fast-check, Playwright.

**Spec:** docs/superpowers/specs/2026-11-24-universal-options-design.md

## Global Constraints

- The intended universe is options across all asset classes; gold is one underlying.
- User residence is Syria; VPN is connectivity only, never eligibility.
- Binance is the conditional first execution candidate; no live order execution in this phase.
- No false live data, no silent contract metadata defaults, no unapproved paid data services.
- Keep the existing Arabic RTL and dark Volterra visual identity.
- Existing Demo/CSV/Binance/PAPER modes remain distinct.

## Review Focus

- CSV records with an unknown asset class must remain importable but must not be misclassified as a known class.
- Futures options and spot options must not share a pricing model by default.
- Duplicate symbols across venues must remain distinct instruments.
- Expiry timestamps with different venue timezones must not be normalized to an incorrect UTC date.
- Empty asset-class/venue filters must show an explicit empty state without silently falling back to Demo.

---

### Task 1: Canonical contract metadata

**Files:**
- Modify: src/lib/types.ts
- Modify: src/lib/csv.ts
- Modify: src/lib/csv.test.ts and src/lib/csv.property.test.ts

**Interfaces:**
- Add a closed AssetClass type for crypto, equity, index, rates, FX, energy, metals, agriculture, and other.
- Add an optional InstrumentMetadata shape to OptionQuote and PaperTrade: venue, assetClass, underlyingKind, quoteAsset, settlementAsset, multiplier, exerciseStyle, settlementStyle, expiryTimezone, sourceTimestamp and provenance.
- CSV accepts explicit metadata columns; absent metadata remains unknown.

- [x] Add CSV tests for non-crypto metadata round-trip and unknown/invalid enum values.
- [x] Run the focused CSV tests and observe the expected failure.
- [x] Implement metadata parsing/validation without guessing absent fields.
- [x] Run focused tests, then the full unit/property suite.

### Task 2: Provider normalization

**Files:**
- Modify: src/lib/demo.ts
- Modify: src/lib/binance.ts
- Test: src/lib/binance.test.ts

**Interfaces:**
- Demo fixtures assign explicit asset classes and synthetic provenance.
- Binance normalization assigns only metadata proven by exchangeInfo/contract specs; unsupported exercise/settlement details remain unknown until sourced.
- Preserve source venue and exact instrument identifier.

- [ ] Add tests for crypto, commodity and unknown instrument metadata.
- [ ] Run the tests first and observe failure.
- [ ] Implement normalization.
- [ ] Run the full test suite.

### Task 3: Asset-class and venue navigation

**Files:**
- Modify: src/App.tsx
- Modify: src/index.css
- Test: e2e/product-flows.spec.ts

**Interfaces:**
- Replace the unbounded underlying chip strip with Asset Class, Venue and Underlying filters plus search.
- Derive filter choices from loaded OptionQuote metadata.
- Preserve current selected underlying if still valid; otherwise choose the first available result only within the active filters.
- Show empty states when a filter has no instruments.

- [x] Add Playwright coverage for imported Equity contracts across two venues.
- [x] Run E2E and verify the new test fails for the missing filter.
- [x] Implement Asset Class and Venue selectors and responsive styles.
- [x] Run E2E, unit tests and production build.
- [ ] Add broader Playwright coverage for all asset classes and empty states.

### Task 4: Mobile chain and contract details

**Files:**
- Modify: src/App.tsx
- Modify: src/index.css
- Modify: src/components/GreeksPanel.tsx
- Test: e2e/product-flows.spec.ts

**Interfaces:**
- Keep desktop table comparison.
- At narrow widths, show strike, bid/ask, IV and Delta first; reveal OI, volume, spread and Greeks in a detail panel.
- Preserve keyboard focus and visible selection.

- [ ] Add 390px Playwright assertions for no clipped primary controls and accessible labels.
- [ ] Verify the test fails before implementation.
- [ ] Implement compact mobile layout.
- [ ] Run all tests and Lighthouse.

### Task 5: Pricing-model guard

**Files:**
- Create: src/lib/pricing-model.ts
- Create: src/lib/pricing-model.test.ts
- Modify: src/lib/options.ts

**Interfaces:**
- Model routing takes contract metadata and required inputs.
- Support Black–Scholes only for compatible spot-style contracts.
- Add Black-76 for futures options with forward price and discount factor.
- Return an explicit unsupported result when required contract mechanics are missing.

- [x] Add failing tests for Black–Scholes vs Black-76 routing and unsupported contracts.
- [x] Implement a standalone contract-aware pricing library with explicit European exercise, settlement, rate and carry requirements.
- [x] Verify analytical values, put-call parity and finite-difference Greeks.
- [x] Run full suite and build.
- [ ] Wire the pricing router into CSV normalization, source quote valuation and UI risk panels; keep unsupported mechanics visibly blocked.

## Rollout

Keep the feature behind no hidden live-trading capability. Merge only after CI, mobile E2E and source/contract metadata tests pass. Publish the research/UI changes first; pricing-model routing can follow as a separately reviewable PR.

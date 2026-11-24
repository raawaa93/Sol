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

- [x] Add tests for crypto, commodity and unknown instrument metadata.
- [x] Run the tests first and observe failure.
- [x] Verify existing normalization preserves explicit crypto, commodity and unknown contract metadata without model fallback.
- [x] Run the full test suite.

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

- [x] Add 390px Playwright assertions for no document-level horizontal overflow, accessible selectors, 44px primary touch targets and keyboard focus visibility.
- [ ] Verify the test fails before implementation.
- [x] Implement compact mobile cards for the option chain, Greek sensitivities and PAPER journal (PRs #76/#78); this follow-up raises primary toolbar/navigation targets to at least 44px.
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
- [x] Wire the pricing router into CSV normalization, Binance source valuation, Demo fixtures and UI risk panels; keep unsupported mechanics visibly blocked.
- [x] Remove the legacy CSV Black–Scholes fallback for contracts without explicit compatible mechanics. Missing IV is solved only when a validated model accepts the supplied contract metadata; rows with observed IV/quotes remain importable as OBSERVED_ONLY.

## Rollout

Keep the feature behind no hidden live-trading capability. Merge only after CI, mobile E2E and source/contract metadata tests pass. Publish the research/UI changes first; pricing-model routing can follow as a separately reviewable PR.


## Verification follow-up — 24 November 2026

- CSV without exercise/settlement/underlying model metadata no longer receives a generic Black–Scholes IV solve or Greeks. Observed IV and observed market quotes remain available with `OBSERVED_ONLY`; no synthetic model is substituted.
- Explicit European spot inputs with rate and carry continue to route to Black–Scholes with Carry; explicit futures inputs route to Black–76; perpetual, American/Bermudan and unknown mechanics remain unsupported.
- Regression coverage added for missing metadata, supported explicit inputs, and Binance crypto/commodity/unknown metadata classification.


### Mobile accessibility follow-up — 24 November 2026

- The mobile chain, Greek and journal card layouts were already shipped in PRs #76 and #78. The follow-up adds 44px minimum height to the option-type tabs, expiry selector, strike search control and bottom-navigation buttons.
- Playwright now checks 390px primary-control labels, target dimensions, keyboard focus visibility and document/card horizontal overflow.
- The test-first red run has not yet been captured for the new touch-target assertion; CI verification is pending on this branch. Physical-device and screen-reader validation remain outstanding.

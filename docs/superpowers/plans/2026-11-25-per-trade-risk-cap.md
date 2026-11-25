# Hard per-trade USD risk cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent any PAPER option entry from exceeding the user's USD 60 per-trade maximum-loss budget.

**Architecture:** Add a small pure risk-budget helper for dollar-denominated quote validation, budget clamping and maximum-loss comparisons. Apply it consistently to the trade-lab budget calculator, visible save state and save handler.

**Tech Stack:** Existing React/TypeScript, Node test runner, Playwright.

**Spec:** docs/superpowers/specs/2026-11-25-per-trade-risk-cap-design.md

## Global Constraints

- Research/PAPER only; no live order routes or funds movement.
- Maximum loss includes premium debit plus entered fees.
- Hard per-trade ceiling is USD 60; USD/USDT/USDC are approximate dollar quote assets only.
- Unknown/non-dollar quote currencies and unsupported contract scales fail closed.
- No FX conversion, paid data, new dependency, or cloud change.

## Review Focus

- Manual quantity edits must not bypass the budget calculator.
- Fees must count toward maximum loss.
- EUR/GBP/unknown quote currency must not be treated as USD.
- Canonical and supported legacy contract economics must use the same budget gate.
- Non-finite/negative values and an unsupported maximum-loss calculation must fail closed.

---

### Task 1: Pure risk-budget rules

**Files:**
- Create: `src/lib/risk-budget.ts`
- Create: `src/lib/risk-budget.test.ts`

- [ ] Write tests for USD/USDT/USDC acceptance, non-dollar rejection, budget clamping to [0, 60], exact-limit acceptance, over-limit rejection, and invalid numeric inputs.
- [ ] Run the focused test and confirm the expected failure.
- [ ] Implement minimal pure helpers with literal, independently derived expected values.
- [ ] Run the focused test and full unit/property suite.

### Task 2: Enforce risk budget in the trade lab

**Files:**
- Modify: `src/App.tsx`
- Test: `e2e/product-flows.spec.ts`

- [ ] Add a Playwright case that sets a manual quantity whose premium plus fees exceeds 60 and verifies that PAPER save is disabled.
- [ ] Verify the budget input cannot be raised above 60.
- [ ] Verify the save path rejects unsupported/non-dollar quote currencies and unknown max-loss calculations.
- [ ] Run the focused E2E test and confirm it fails before implementation.
- [ ] Clamp the input, calculate the risk gate from the existing canonical/legacy maximum-loss result, and block in both UI and handler.
- [ ] Run all unit/property tests, production build, compressed bundle budget and all Playwright journeys.

### Task 3: Record and review

**Files:**
- Update: `README.md`
- Update: `docs/PRODUCT_REVIEW.md`
- Update: `PROJECT_CONTEXT.md`
- Update: `docs/OPTIONS_RESEARCH_ENGINE_EXECUTION_2026-11-25.md`

- [ ] Document the per-trade USD-equivalent limit and its non-dollar/aggregate limitations.
- [ ] Review the complete diff and run final CI, Lighthouse and Project Context Guard.
- [ ] Merge only after checks pass; record merge SHA and workflow evidence.

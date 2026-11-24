# Copilot instructions — Sol

Before any task, read `PROJECT_CONTEXT.md`, `AGENTS.md`, and the relevant product/architecture docs. Confirm this is `raawaa93/Sol`; do not import context from other projects.

## Product truth and boundaries
- Sol is a personal financial and investment intelligence assistant: personal finance, portfolio analysis, market/company research, strategy comparison, risk analysis, and decision journaling. The options lab is one specialist module, not the whole product.
- This is a research and PAPER-only application. Never add live order placement, account trading, fund transfers, automatic rebalancing, paid subscriptions, or irreversible financial actions.
- User residence is Syria. A VPN/IP is network routing, not residence or legal eligibility. Never suggest false identity/residence or bypassing jurisdiction, KYC, sanctions, venue, or product restrictions. Preserve the Syria legal gate in `PROJECT_CONTEXT.md`.
- Distinguish target, implemented, live-verified, and legally/account-eligible coverage. Never imply public API reachability proves account eligibility.
- Never label perps, CFDs, binaries, prediction markets, tokenized shares, or synthetic payoffs as listed vanilla options.

## Data and financial correctness
- Prefer primary sources: official exchange specifications/APIs, regulators, filings, central banks, and provider documentation. Record URL, access date, effective date, exact product/entity, and limitations.
- For GitHub projects, inspect maintenance activity, license, security advisories, releases, dependency footprint, architecture, and tests before recommending adoption. Do not copy code without license compatibility.
- Keep observed source data, model estimates, assumptions, timestamps, and user assertions distinct. Unknown or unsupported mechanics fail closed; never infer multipliers, deliverables, exercise or settlement terms from symbols or convenient defaults.
- All financial arithmetic must use deterministic, unit-aware, tested functions—not unverified language-model calculations. Include currencies, units, fees, settlement, timestamps, and provenance.
- Show downside, liquidity, uncertainty, stale/missing data, counterarguments, and no-action alternatives where relevant. Do not claim a persistent strategy edge from in-sample results.

## Engineering workflow
- Research first; produce a concise evidence-backed inventory of architecture, flows, data sources, security boundaries, technical debt, UX, performance, accessibility, and test coverage before proposing changes.
- Separate research, prioritization, and implementation. Rank opportunities by user impact, correctness/risk reduction, evidence strength, effort, recurring cost, and maintainability. Prefer the smallest high-value changes.
- Inspect existing code and reuse existing dependencies/services before adding tools or packages. Prefer free/open-source, actively maintained, low-resource solutions. State license, costs, hosting, privacy, lock-in, and operational burden. Do not incur spend or introduce paid APIs.
- Do not add a dependency, provider, external service, schema migration, or major architecture framework without a concrete measured benefit and a documented alternative comparison.
- Keep changes focused on a branch and PR. Do not weaken thresholds, remove tests, suppress errors, fabricate fixtures, or mark unsupported values as trusted to make CI green.
- Preserve mobile-first Arabic RTL behavior, keyboard accessibility, semantic labels, and existing design language.
- Never expose secrets, request private account keys, put credentials in source, or log sensitive financial data.

## Required verification and delivery
Use the repository's current scripts; at minimum run:
`npm test`
`npm run build`
`npm run perf:bundle`
`npm run test:e2e` (when browser journeys are affected; otherwise explain why not)
Also inspect relevant GitHub Actions, deployment smoke tests, and security checks. Report exact commands, pass/fail results, bundle sizes, and commit SHA. Do not claim tests passed unless their output proves it.
Do not merge or deploy unless the task explicitly authorizes it and all required checks pass. Never merge a failing or unverified change.

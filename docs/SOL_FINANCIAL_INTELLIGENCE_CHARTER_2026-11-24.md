# Sol Financial Intelligence — Product Charter & Architecture

**Status:** Proposed product direction, authorized for staged implementation  
**Date:** 24 November 2026  
**Repository:** https://github.com/raawaa93/Sol

## 1. Product decision

Sol is evolving from an options-focused decision lab into a **personal financial and investment intelligence assistant**. Its job is to help the user understand their financial position, research opportunities, compare strategies, assess risk, and make better-informed decisions.

Sol is **not an autonomous trading system**. It must not place, route, amend, or cancel live orders; transfer funds; rebalance accounts; subscribe to paid services; or make irreversible financial changes. Recommendations are decision support, not delegated authority.

The existing multi-asset options research capability remains a specialist module. It is not the whole product.

## 2. Product outcomes

Sol should help answer:
1. What is my current financial position, liquidity, obligations, and net worth?
2. How is my investment capital allocated, and where is risk concentrated?
3. What changed in markets, companies, assets, rates, currencies, and the economy?
4. What are the strongest arguments for and against an investment thesis?
5. Which strategies fit a stated goal, horizon, liquidity need, and risk tolerance?
6. What could go wrong under adverse scenarios, and how severe could the loss be?
7. What alternatives exist, including holding cash or taking no action?
8. Which assumptions or facts changed since the last recommendation?
9. How did prior recommendations perform, and where was the analysis wrong?

## 3. Product modules

### A. Financial cockpit (personal finance)
- Assets, liabilities, cash, income, expenses, recurring obligations and savings goals.
- Net-worth history and cash-flow runway.
- Budget plans, emergency reserve coverage, debt-cost comparisons and goal tracking.
- Multi-currency balances with explicit FX source, timestamp and conversion convention.
- Forecasts as scenarios, never as guaranteed outcomes.

**Data entry order:** manual records and CSV import/export first; optional read-only connectors only after security, privacy, availability and cost review. No bank credentials or account passwords in the browser, chat, GitHub or logs. Bank linking is never required to use Sol.

### B. Portfolio and wealth manager
- Holdings and transactions across cash, equities, funds, bonds, commodities, crypto and options where source data and instrument mechanics support them.
- Allocation by asset, currency, geography, sector, issuer, strategy and liquidity.
- Cost basis, realized/unrealized P&L, income, fees, taxes (only where jurisdiction-specific rules are verified), benchmark-relative performance and money/time-weighted returns.
- Concentration, correlation, factor, duration, currency, counterparty and liquidity exposure.
- Rebalancing analysis as a proposal only; no execution.
- Goals and investment policy statement (IPS), with horizon and drawdown constraints.

### C. Investment research analyst
- Company and asset research, financial statements, filings, valuation, earnings, catalysts, macro and sector analysis.
- Evidence-backed news and event monitoring.
- Bull/base/bear theses, valuation ranges, sensitivity tables and falsification conditions.
- Source citations, source dates, original currency, restatement handling and confidence.
- Separate facts, derived metrics, estimates, analyst interpretation and user-provided assumptions.

### D. Strategy lab
- Compare long-term investing, value, growth, income, index allocation, DCA, factor strategies, hedging, options and multi-asset allocations.
- Deterministic calculations for returns, fees, taxes when known, volatility, drawdown, Sharpe/Sortino, VaR/CVaR, scenario loss and liquidity.
- Historical backtests only when point-in-time data and survivorship/look-ahead controls are available.
- Out-of-sample and walk-forward validation; benchmark comparison; stress periods.
- Display uncertainty, parameter sensitivity and failure modes. No claim of a persistent edge from in-sample results.

### E. Risk officer
- Portfolio and position-level risk, concentration, liquidity, leverage, counterparty, currency and tail risk.
- Scenario library: equity crash, rate shock, inflation, FX shock, volatility spike, crypto drawdown, correlation convergence and liquidity gap.
- Exposure maps and loss attribution.
- Hard warnings when data is stale, incomplete, unlicensed, mismatched or based on unsupported instrument mechanics.

### F. Decision journal and governance

Every material recommendation stores:
- Decision question and date/time.
- User goal, horizon, constraints and assumptions used.
- Data snapshot identifiers, sources, timestamps and freshness.
- Bull/base/bear cases and alternatives including no action.
- Expected return range, downside, liquidity and key sensitivities where supportable.
- Evidence for and against, uncertainty, confidence calibration and invalidation triggers.
- User decision and later outcome, recorded separately from the original recommendation.

### G. Sol Intelligence (orchestrator)

A coordinator routes work to specialist roles. Agents do not vote on unsupported facts. The final synthesis resolves disagreements against evidence and deterministic calculations.

Suggested roles:
- Financial planner (cash-flow and goals).
- Portfolio analyst (allocation and performance).
- Equity/fund/credit/crypto/options research analysts.
- Macro and news analyst.
- Quantitative/risk analyst.
- Skeptical reviewer / red team.
- Chief investment analyst (synthesis, not execution).

Use a single orchestrator and bounded specialist tasks before considering complex autonomous agent frameworks. A multi-agent design is not automatically more accurate.

## 4. Evidence and recommendation contract

Every answer that may influence a financial decision must:
1. State the decision question and relevant horizon.
2. Distinguish source facts, calculations, estimates, assumptions and opinions.
3. Cite primary sources first: regulators, company filings, exchanges, central banks and official data providers.
4. Show source timestamp, observation period, currency and data delay.
5. Explain material evidence for and against the conclusion.
6. Compare at least one alternative and the option of no action when relevant.
7. Show downside, liquidity and sensitivity, not just upside.
8. Disclose missing, stale, conflicting or unlicensed data.
9. Use calibrated confidence labels; do not invent precise probabilities.
10. Record what evidence would change the conclusion.

The language model must not perform unverified arithmetic in prose. Financial values, ratios, portfolio weights, cash flows and risk metrics must come from tested deterministic functions with unit-aware inputs.

## 5. Architecture

### Current state

The deployed application is a static Arabic RTL React/TypeScript app on GitHub Pages, with a Supabase Edge Function used as a server-side public Binance market-data proxy. Most personal state (watchlist and paper journal) is currently browser-local. There is no verified secure personal-finance ledger, portfolio sync, authenticated user workspace, or persistent recommendation journal yet.

### Target architecture (incremental)

- **Presentation:** existing responsive Arabic RTL web app; accessible mobile-first views.
- **Domain core:** typed financial entities and deterministic calculations, independent of UI.
- **Data adapters:** source-specific connectors for market prices, fundamentals, filings, macro data, FX, news and user imports.
- **Normalization:** canonical assets, instruments, currencies, accounts, transactions, holdings, prices, corporate actions and provenance.
- **Storage:** private user workspace with encryption, access control, export and deletion; start with manual/CSV and a minimal secure persistence design before adding integrations.
- **Research service:** source retrieval, document parsing, citation registry, dated evidence snapshots and report generation.
- **Analysis service:** portfolio metrics, valuation models, scenario engine and strategy evaluation.
- **AI orchestration:** tool-constrained agents that call reviewed data and calculation services; no unrestricted browser-side secrets or arbitrary financial actions.
- **Quality and observability:** freshness checks, schema validation, source health, calculation regression tests, decision audit logs and cost monitoring.

Do not introduce a new backend, database, agent framework or paid service until a small vertical slice demonstrates a real need. Reuse the existing Supabase project only after auditing authentication, row-level security, backup, retention and secret handling. GitHub Pages is public: never embed personal financial records or private source credentials in its build artifacts.

### Canonical data entities

FinancialAccount, BalanceSnapshot, Transaction, Asset, Instrument, Holding, Lot, PriceObservation, FXObservation, CorporateAction, Liability, IncomeStream, ExpenseCategory, FinancialGoal, PortfolioPolicy, ResearchSource, EvidenceClaim, Scenario, Recommendation, Decision, Outcome.

Every observation carries provider, source identifier, event time, receive time, currency/unit, period, delay/entitlement class, and field-level provenance where applicable. Never silently merge incompatible prices or currencies.

## 6. Open-source project evaluation

These projects are candidates to study or integrate selectively, not a mandate to embed every repository.

| Project | Useful role | Decision / caution |
|---|---|---|
| [OpenBB](https://github.com/openbb-finance/OpenBB) | Financial data provider framework, typed Python client, REST and MCP | Strong data/research adapter candidate. It is a framework, not a free universal feed; each provider has its own credentials, limits and license. |
| [FinRobot](https://github.com/AI4Finance-Foundation/FinRobot) | Financial research pipelines, analyst roles, valuation and report patterns | Study pipelines and deterministic operators. Do not import its full desktop stack into the current web app. |
| [Wealthfolio](https://github.com/wealthfolio/wealthfolio) | Private portfolio/net-worth/spending tracker with AI/MCP integration | Strong UX and privacy reference. AGPL-3.0: review license obligations before code reuse. |
| [Ghostfolio](https://github.com/ghostfolio/ghostfolio) | Wealth tracking and portfolio analytics | Useful comparison for asset/activity model and performance; review license and provider dependencies. |
| [Actual Budget](https://github.com/actualbudget/actual) | Local-first cash-flow and envelope budgeting | Useful reference for budgeting and privacy. Its API is a Node package, not a general REST API. |
| [Firefly III](https://github.com/firefly-iii/firefly-iii) | Double-entry personal finance, budgets and transaction reports | Strong accounting/API reference; AGPL-3.0 and self-hosting complexity matter. |
| [PyPortfolioOpt](https://github.com/PyPortfolio/PyPortfolioOpt) | Mean-variance, Black-Litterman and HRP allocation | MIT; useful as an optional Python analytics service. Optimizers are sensitive to noisy expected returns. |
| [Riskfolio-Lib](https://github.com/dcajasn/Riskfolio-Lib) | Portfolio optimization and risk measures | Evaluate for CVaR and broader risk allocation; heavier scientific Python dependencies. |
| [QuantStats](https://github.com/ranaroussi/quantstats) | Performance and risk reporting | Use for reproducible metrics after validating return-series assumptions. |
| [VectorBT](https://github.com/polakowo/vectorbt) | Research and strategy simulation | Research-only candidate; verify version/license and avoid look-ahead bias. |
| [QuantLib](https://github.com/lballabio/QuantLib) | Independent pricing and fixed-income/derivatives calculations | Specialist calculation engine; not market data. |

### Selection rule

Prefer modular libraries with explicit licenses, active maintenance, tests, deterministic APIs and no mandatory paid data dependency. Before integration, inspect current release activity, security advisories, license, transitive dependencies, data provider terms, and whether the code solves a concrete Sol gap. Do not copy entire applications into this repository.

## 7. Data source strategy

Prioritize primary and public sources where permitted:
- SEC EDGAR submissions and XBRL company facts for U.S. issuer filings (public APIs; comply with SEC fair-access policy).
- FRED/ALFRED for U.S. macroeconomic series and historical vintages (API key required).
- ECB Data Portal SDMX for euro-area and European statistical series.
- Exchange and issuer sources for instrument terms, corporate actions and official notices.
- Binance public endpoints only for the product data actually documented and returned.
- CSV/manual imports for user-held accounts and assets until a secure, lawful connector is justified.
- Reputable news sources with source links and publication timestamps; never scrape around paywalls or violate terms.

No source is universally free, real-time, complete or licensed for redistribution. Keep provider terms and field freshness visible. Never show delayed data as live.

## 8. Skills, plugins and agent tools

- Use available research tools for discovery and source-backed synthesis; use GitHub for repository-level review and tests.
- Use the Data Analytics skill for quantitative datasets, portfolio metric validation and durable analytical reports when its supported source/output workflow fits.
- OpenBB MCP is a candidate external integration for financial data tools, subject to provider credentials and deployment/security review.
- A ChatGPT plugin/connector is not automatically an integration inside the Sol application. Product integrations require explicit application code, authentication, privacy review and tests.
- Skills should be portable, versioned playbooks with input schema, allowed tools, evidence requirements, deterministic calculation calls, output schema, test cases and prohibited actions.
- Candidate skill packs to evaluate: financial research, equity research, portfolio analytics, personal finance/accounting, macro research, risk review and source verification. Avoid persona prompts that merely imitate famous investors without measurable evaluation.

## 9. Evaluation and safety

Create a golden evaluation set covering:
- Filing extraction and source citation correctness.
- Financial statement normalization and unit/currency handling.
- Portfolio return and cost-basis calculations.
- FX conversion and stale-price detection.
- Allocation and risk calculations against independent reference results.
- Bull/bear evidence balance and hallucination detection.
- Strategy leakage, survivorship and out-of-sample controls.
- Recommendation consistency and calibration.
- Privacy: tenant isolation, export/delete, no secrets in browser or public builds.

A reviewer agent must challenge the recommendation, but automated agreement between agents is not evidence. Track factual precision, citation coverage, numerical error, stale-data rate, calibration, reproducibility, latency and cost.

## 10. Delivery roadmap

### Phase 0 — Product foundation
- Adopt this charter and update repository identity.
- Map the existing UI, data models, backend, auth, storage and deployment boundaries.
- Define the financial profile and investment-policy schema without requiring sensitive data upfront.
- Add architecture decision records and evaluation fixtures.

### Phase 1 — Trustworthy financial cockpit
- Manual entry and CSV import/export for accounts, balances, income, expenses, liabilities and assets.
- Multi-currency net worth and cash-flow calculations.
- Local-first/private by default; clear backup and data-loss warnings.
- No bank integrations, no execution and no AI access to private records until permissions are explicit.

### Phase 2 — Portfolio intelligence
- Holdings, transactions, cost basis, performance, allocation, concentration and risk.
- Benchmarks, goals and scenario analysis.
- Reconciliation and explainable calculation details.

### Phase 3 — Research intelligence
- Company/asset research with primary filings, macro data, news and citations.
- Bull/base/bear analysis, valuation and thesis monitoring.
- Saved research and decision journal.

### Phase 4 — Strategy and risk lab
- Strategy comparisons, robust portfolio construction, stress tests and backtests.
- Point-in-time data and leakage controls before publishing historical performance claims.
- Existing options lab becomes one specialist strategy module.

### Phase 5 — Personal AI manager
- Orchestrator and bounded analyst roles.
- Daily/weekly briefings and user-configured alerts.
- Memory of goals and prior decisions with review, export and deletion controls.
- Recommendations require evidence and explicit user decision; no autonomous financial actions.

## 11. Cost and rollout constraints

- Recurring spend target: USD 0–15/month. No paid subscriptions, premium data, model API or infrastructure upgrade without explicit approval.
- Prefer free public data, browser-side local calculations and scheduled low-frequency refreshes.
- Never assume free API tiers permit commercial use or public redistribution.
- Keep a cost ledger per provider and feature; disable providers before exceeding limits.
- Release each phase behind tested feature flags or isolated routes. Keep the existing options experience working during the transition.

## 12. Immediate engineering sequence

1. Audit current domain types, Supabase configuration/auth/RLS/backups, browser storage and public deployment exposure.
2. Design a privacy-safe canonical personal-finance and portfolio schema.
3. Add pure deterministic calculation modules and fixtures before adding AI-generated recommendations.
4. Build one narrow vertical slice: manually entered accounts + balances + assets -> net worth/cash flow -> cited explanation -> export.
5. Test tenant isolation and public-build privacy before storing any real financial data.
6. Only then add portfolio analytics, research ingestion and the orchestrator.

**Acceptance rule:** Sol is not considered a reliable financial manager until calculations are independently tested, source provenance is inspectable, private data is protected, and recommendations show uncertainty and downside. A polished chat interface alone does not satisfy this bar.

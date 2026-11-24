# Project Context Lock — Volterra

**Status:** ACTIVE  
**Canonical project:** Volterra Multi-Asset Options Decision Lab  
**Repository:** https://github.com/raawaa93/Sol  
**Default branch:** main  
**Last verified:** 24 November 2026

## 1. Product identity and scope

Volterra is a provider-neutral research, analysis and paper-trading workspace for **vanilla options across all asset classes and venues**. The target universe includes crypto, listed equities and ETFs, indices, options on futures (rates, FX, energy, metals and agriculture), and other genuine options markets where lawful access and reliable data exist.

Gold and silver are individual underlyings, not the product definition. Never reduce this project to gold-only or crypto-only. Never classify a perpetual, CFD, binary/event contract, prediction market, tokenized share or synthetic payoff as an exchange-listed vanilla option.

Always distinguish:
- **Target coverage:** markets the system is designed to understand.
- **Implemented coverage:** adapters and product mechanics actually coded.
- **Live verified coverage:** instruments and fields actually returned by a permitted source at the time of the check.
- **Legal/account eligibility:** the exact person, country of residence, contracting entity, product and account permission.

An underlying trading on a venue does not prove that options on it exist there.

## 2. User jurisdiction and connectivity

- The user is physically resident in **Syria**, not the United Kingdom.
- A VPN may be necessary for ordinary internet connectivity. VPN egress is network routing only; it does not change residence, KYC, legal jurisdiction, tax residence, sanctions screening or product eligibility.
- Never suggest false addresses, false residency, borrowed accounts, proxy rotation or VPN geofencing evasion.
- Use only the user's truthful identity and actual country of residence when evaluating a venue. A generic country list or successful public API request is not approval.

## 3. Syria legal gate — mandatory

Publicly reported Syrian Central Bank and Securities Authority warnings (2025) raise a serious local-law issue for cryptocurrency and FX platform activity. The Central Bank statement reported by SANA on 19 August 2025 described dealing in digital currencies as illegal/unapproved and called for no buying, selling, investment or trading in them. The Securities Authority warning reported on 17 June 2025 addressed unlicensed Forex and crypto platforms. No later official clarification specifically covering offshore options contracts was located in the 24 November 2026 review.

Do not convert these warnings into a definitive legal ruling on every foreign-listed equity, index, futures or commodity option; no specific ruling for all such contracts was found. But do not infer permission either.

**Operating restriction:** keep Volterra read-only, research and PAPER-only for a Syrian resident. Do not enable live order execution or recommend funding for options trading from Syria until the user obtains written advice from qualified Syrian counsel or the relevant regulator on the exact product and settlement route.

A venue accepting registration/KYC does not establish that the activity is lawful under Syrian domestic law.

See:
- [Syria residence, sanctions and local-law review](docs/SYRIA_RESIDENCY_AND_SANCTIONS_2026-11-24.md)
- [Platform eligibility matrix](docs/PLATFORM_ELIGIBILITY_2026-11-24.md)

## 4. Platform decision — product and legal entity specific

- **Binance:** technical data candidate for the option products it actually lists, not a universal options venue and not locally cleared for live trading from Syria. Its Syria FAQ confirms general registration/KYC subject to compliance, but its enumerated product list does not explicitly name Options. Verify Crypto Options, Commodity/TradFi Options and Stock Options separately in the actual account or with written support confirmation.
- Binance Crypto Options writing is currently limited to BTC and ETH, requires margin and can be liquidated. Commodity Options (XAU/XAG in the first published batch) are retail long-only. Ordinary accounts lack cross-product portfolio-margin/risk netting and Options order types are Limit-only. Do not assume multi-leg offsets.
- Binance Stock Options are a separate U.S. equities/ETF product with physical settlement; its documented market-data API is contract-reference data and does not provide option quotes/Greeks/IV. Product availability for Syrian accounts is not established by the general Syria FAQ.
- **Gate EU:** excluded; its latest located EU User Agreement (23 September 2026) explicitly lists Syria as a Restricted Location.
- **Gate Global (non-EU):** inquiry-only; current generic terms are non-exhaustive and an older agreement differs. Do not fund or use until written Compliance confirmation names the contracting entity, Syrian residence and Crypto Options product.
- **Deribit, Bybit and OKX:** reviewed terms explicitly restrict Syria. **Paradex** explicitly lists Syria and prohibits VPN circumvention.
- **IBKR:** Syria is absent from the reviewed available-country list. **AMP Futures:** official restricted-country material lists Syria. Optimus and Ironbeam remain inquiry-only without Syria-specific written approval.
- **Hyperliquid HIP-3 perps and HIP-4 outcome markets are not vanilla listed options.** Do not misclassify them as options.

No second execution venue for a Syrian resident has been verified for global listed options. Recheck dated terms before any venue change.

## 5. Current implementation boundary

- Arabic RTL React/TypeScript research UI.
- Demo data is synthetic and must always be labelled as such.
- CSV import is local and must preserve provenance and estimated-field warnings.
- Binance public market data is read-only through a server-side proxy; public market-data endpoints do not require the user's private trading key.
- The app does not connect to the user's private Binance account and does not place live orders.
- Search and watchlist are local to the browser; they are not cloud-synced.
- Contract-aware pricing routes supported European spot/index contracts through carry-aware Black-Scholes and supported futures options through Black-76. Unsupported mechanics (including American exercise and Binance commodity perpetual-index mechanics) must remain unsupported/clearly labelled rather than silently approximated as vanilla European options.
- Missing/unknown Binance contract units are excluded rather than defaulted to one.
- Source Greeks, model Greeks, assumptions, timestamps and provenance must remain distinguishable.

## 6. Engineering direction

- Maintain a canonical instrument master with asset class, venue/legal entity, underlying kind, multiplier, tick/lot sizes, quote and settlement currencies, exercise and settlement style, expiry timezone, deliverables, fees, margin, source timestamps, receive timestamps, delay class and data entitlement.
- Build one adapter per venue/product line; do not hard-code a gold-only or Binance-only schema.
- Use model routing by contract mechanics: Black-Scholes with carry for supported spot/index options; Black-76 for futures options; a suitable American model for American contracts only after validated implementation. If inputs or mechanics are unknown, show unavailable/assumed status rather than fabricated precision.
- QuantLib is the independent pricing/Greeks validation candidate; it is not a data feed.
- NautilusTrader is the event-driven replay/backtesting candidate; it requires historical QuoteTick and OptionGreeks data and its options backtest does not model L2 queue position. Keep it as a separate Python research service, not a dependency bundled into the browser UI.
- Historical options backtests require timestamped chains, bid/ask, Greeks/IV, contract specs, fees, settlement/exercise, funding and realistic fill assumptions. Never invent historical chains or imply that EOD/delayed data proves executable fills.

## 7. Cost, credentials and change control

- Prefer free/open-source services. Total recurring spend target is at most USD 15/month; no paid subscriptions, data entitlements or infrastructure changes without explicit spending approval.
- No API secrets in browser code, Git history, README, issues or logs. Public read-only endpoints need no private trading key. Any future private key must be least-privilege, trade-only if ever authorized, withdrawal-disabled, IP-restricted where supported and stored server-side in a secret manager.
- Before work: read this file and AGENTS.md; inspect main, recent commits, open PRs, relevant code and workflows. Do not import unrelated project memory.
- Make coherent changes on a dedicated branch. Run unit/property tests, build, bundle budget, E2E, Lighthouse and production smoke tests where relevant.
- Report separately what is proposed, implemented, tested, merged and deployed. Never claim success without the run or deployment evidence.
- Merge only after checks pass and the change is consistent with this context. Record risks, source dates and unresolved eligibility/legal questions.
- Do not place live trades or bypass a legal/account restriction. Paper and read-only research remain the operating mode until the Syria legal gate is cleared.

## 8. Canonical project documents

- AGENTS.md — repository-wide agent instructions.
- README.md — current user-visible behavior and test commands.
- docs/UNIVERSAL_OPTIONS_RESEARCH_2026-11-24.md — market/platform/data architecture research.
- docs/DATA_PROVIDER_EVALUATION_2026-11-24.md — verified data-provider coverage, pricing, freshness and licensing evaluation.
- docs/PLATFORM_ELIGIBILITY_2026-11-24.md — venue and product eligibility.
- docs/SYRIA_RESIDENCY_AND_SANCTIONS_2026-11-24.md — residency, VPN and legal context.
- docs/PRODUCT_REVIEW.md — decision and product roadmap.
- docs/UX_AUDIT_2026-11-24.md — interface and accessibility roadmap.

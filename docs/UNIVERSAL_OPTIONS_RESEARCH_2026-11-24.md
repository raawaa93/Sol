# Universal Options Market & Platform Research — 24 November 2026

**Scope:** Options across all asset classes and venues. Gold is one underlying, not the scope.  
**User residency:** Syria (actual residence, not UK).  
**Decision status:** Research and paper trading only. No live orders or private account credentials are enabled by this document.

## 1. Executive decision

1. Keep Binance as the first **conditional** venue for the products it explicitly lists and permits to this account. Binance's Syria-specific FAQ says Syrian residents can register and verify subject to KYC/compliance and lists "Options trading". That FAQ predates Binance Commodity Options, so it does not prove that the newer TradFi commodity product is enabled for every Syrian account.
2. Binance is not a universal options venue. Its currently documented product families include crypto options and commodity options (currently XAUUSDT and XAGUSDT in the first batch). This is not a substitute for the full listed equity, index, rates, FX, energy and agricultural options markets.
3. Deribit, Bybit and OKX explicitly restrict Syria in the reviewed current terms. Do not attempt to use them from Syria through VPN/IP masking.
4. AMP Futures explicitly excludes Syria in its official high-risk country image. Optimus Futures and Ironbeam describe international account opening but do not publish Syria-specific acceptance; they remain unverified prospects, not approved routes. IBKR's current eligibility information does not establish acceptance of a Syrian resident.
5. Build a venue-neutral research and paper-trading system now. Keep execution adapters disabled until the exact legal entity, product, residency, funding route and account permissions are verified.

## 2. What "all options" means in this system

The canonical research universe must cover:

- Equity options: individual listed stocks and ETFs.
- Index options: broad and sector indices, cash- or futures-settled.
- Rates options: options on short-term rates, bonds and interest-rate futures.
- FX options: listed currency futures options and, separately, OTC FX options if a licensed data source is available.
- Energy options: crude, refined products, natural gas and related futures.
- Metals options: precious and industrial metals.
- Agricultural options: grains, oilseeds, softs and livestock where listed.
- Crypto options: centralized and decentralized venues, subject to legal and technical eligibility.
- Other standardized exchange-traded options where full contract terms are available.

A perpetual, future, CFD, tokenized stock, binary contract, prediction market or synthetic payoff is not automatically an option. A record is classified as an option only when its contract defines a holder right, strike, expiry, exercise style, settlement, multiplier and relevant margin/assignment mechanics.

## 3. Syria eligibility and venue comparison

### Binance

Binance's Syria-specific help article, published 12 June 2025, states that Syrian nationals residing in Syria may register and verify if they pass KYC and compliance checks. Its product list explicitly includes Options trading. It also says that previous blocked accounts may require support review.

This is positive, first-party evidence for the general Options service. It does **not** establish that every newly launched sub-product or every short-option permission is enabled for each account.

**Crypto Options (official contract specifications, published 5 January 2026):**
- European-style calls and puts.
- Underlyings listed in the specification: ETH, BTC, BNB, XRP, DOGE and SOL.
- Settlement asset: USDT.
- Automatic exercise at expiry.
- Short selling is currently available for BTC and ETH only after account upgrade; the FAQ updated 28 July 2026 says BNB, XRP, SOL and DOGE writing is not available at this time.
- Short positions require initial/maintenance margin and can be liquidated. Long buyers pay the premium upfront and have zero initial/maintenance margin under the published schedule.
- Ordinary accounts use Cross Margin without portfolio-margin/risk netting across Options, Futures and Margin. Binance explicitly says strategies such as covered calls or spreads that require combined margin calculation are not supported in the standard margin system. Portfolio Margin SPAN is limited to the Enhanced Program with >100M USDT 30-day volume and >1M USDT assets.
- Binance Options supports Limit orders only; BBO is a limit order priced at the best bid/ask, not a market order.

**Commodity Options (Binance FAQ dated 29 July 2026):**
- First underlyings: XAUUSDT (gold) and XAGUSDT (silver).
- European-style, cash-settled in USDT; no physical commodity delivery.
- One-day and one-week expiries; the FAQ describes a limited strike set per expiry.
- Retail users may buy and sell-to-close, but may not write/sell to open; only pre-approved market makers can write.
- The underlying price is based on Binance TradFi Perpetual Contract Index Price. This is a distinct option contract, not the same thing as the underlying perpetual.
- exchangeInfo exposes contractType (including TRADFI_OPTIONS), underlyingType (including COMMODITY), and a trading-session status. Do not assume underlyingType=EQUITY in the schema means Binance currently lists equity options.

**API:** Binance documents REST and WebSocket Options APIs for exchange information, index prices, klines, open interest, mark prices, order books, trades, user account/positions, orders and user data streams. The public API documentation is a data interface, not proof of account eligibility.

**Fees:** use the current Options fee page and account-specific rate at execution time. Promotional or regional rates can change; do not hard-code a fee from an old screenshot or marketing page.

**Conclusion:** Binance is a useful initial venue for long single-leg options on products enabled for the account. It is not an institutional multi-leg options workstation: ordinary accounts lack cross-product risk netting, short-writing is restricted, and only limit orders are supported. It is not the whole options universe. Confirm in the actual Syrian KYC account whether both Crypto Options and Commodity/TradFi Options are enabled before funding or trading those products.

### Other crypto venues

| Venue | Official residency evidence | Decision for Syrian resident |
|---|---|---|
| Deribit | Restricted Jurisdictions page explicitly lists Syrian Arab Republic and prohibits access/use by people located in or resident there. | Do not use for execution. |
| Bybit | Service Restricted Countries page, updated 16 October 2026, explicitly lists Syria and warns that false residence/location statements may lead to account termination and liquidation. | Do not use for execution. |
| OKX | Risk & Compliance Disclosure updated 8 July 2026 explicitly lists Syria as a Restricted Location. | Do not use for execution. |

Public market data can only be used where its published terms allow it; a public endpoint is not permission to open an account or trade.

### Traditional brokers / futures commission merchants

| Provider | What official public material establishes | Status |
|---|---|---|
| Interactive Brokers | Accepts most countries but excludes jurisdictions on sanctions lists or otherwise designated higher-risk. The current public country list does not establish Syrian acceptance. | Not an available route on current evidence. |
| AMP Futures | Official restricted-country page updated 19 November 2026 says it will not open accounts for listed high-risk countries. The linked official image includes Syria. | Excluded for Syrian residents. |
| Optimus Futures | Says it supports international futures clients but also says some countries are restricted. Access depends on the carrying FCM and product. | Unverified; obtain written confirmation from Optimus and the exact FCM. |
| Ironbeam | Says it opens accounts for clients outside the US and asks applicants to contact it to confirm supported countries. It does not name Syria as accepted. | Unverified inquiry candidate only. |
| CME Group | Offers exchange-listed options on futures across asset classes; it is not a retail account-opening broker. | Product venue only; needs an accepting FCM. |
| Phillip Capital / StoneX / other carrying FCMs | Public product and contact pages do not prove Syrian-resident acceptance. | Do not infer eligibility; exact FCM compliance response required. |

A generic "international clients accepted" statement is not a country-specific approval. A broker must confirm in writing: actual Syrian residence, nationality if relevant, account type, specific options products, carrying FCM/legal entity, funding/withdrawal channels, and any minimum deposit or market-data requirements.

## 4. VPN and truthful location

- The user's actual residence remains Syria regardless of VPN egress country.
- IP geolocation is a technical signal, not proof of legal residence or eligibility.
- A VPN may be used only for ordinary connectivity/security when the service's terms permit it. Do not use it to falsify residence, conceal a restricted location or bypass product/country controls.
- Never enter a borrowed/false address, use another person's account, or rotate IPs to defeat a venue restriction.
- Keep residency/KYC data, source of funds and payment ownership accurate and consistent.
- A network error from GitHub Actions or a particular IP does not establish the eligibility of the user's personal account.

## 5. Market structure differences that matter

| Market | Contract / settlement differences | Practical risks and frictions |
|---|---|---|
| US listed equity/ETF options | Often American exercise; physical delivery of 100 shares is common, though corporate actions and adjusted contracts change multipliers. | Early assignment, dividends, pin risk, corporate actions, complex exercise/assignment, US market hours and licensed OPRA data. |
| Index options | May be European or American; cash settlement is common. Multiplier and settlement index vary. | Special opening/closing settlement values, AM/PM settlement, tax treatment and wide markets outside benchmark expiries. |
| Options on futures | Exercise/assignment can create a futures position; Black-76 is a common European futures-option model. | Futures margin, variation margin, delivery/notice dates, FCM house margin, exchange fees and expiry conversion. |
| FX options | Listed futures options differ from OTC bank FX options. | OTC counterparty/credit, premium conventions, expiry cut and settlement conventions; public chain coverage may be limited. |
| Crypto options | Venue-specific exercise, coin or stablecoin settlement, continuous or near-continuous trading, exchange custody and collateral risk. | Venue concentration, fragmented liquidity, exchange outages, stablecoin/collateral basis, liquidation and limited independent historical data. |
| Binance commodity options | European, USDT cash settlement, retail long-only in the published FAQ, session-based trading tied to underlying market hours. | Limited underlyings/strikes/expiries and no retail writing; index and perpetual basis can diverge from exchange-traded futures or spot benchmarks. |

Do not compare option premiums or Greeks across markets without normalizing multiplier, quote currency, settlement, forward/carry, day count, volatility convention and contract size.

## 6. Open-source research and engine choices

| Project | Recommended role | Licensing / caveats |
|---|---|---|
| QuantLib — https://github.com/QuantLib/QuantLib | Primary independent pricing/curve/volatility-model library; use for model cross-checks, not as the data feed. | Modified BSD-style license. Broad traditional derivatives support; C++/Python integration has engineering cost. |
| NautilusTrader — https://github.com/nautechsystems/nautilus_trader | Event-driven simulation, market-data replay, multi-asset/venue abstraction and future paper/live execution boundary. | LGPL-3.0; current 2.0.0 release candidate must be pinned and validated. Option chain backtests require prepared option quotes/Greeks/catalog data; it does not conjure missing history. |
| OpenBB v5 — https://github.com/openbq-org/OpenBB | Provider-normalized research and data-adapter interface. | Verify exact module/version license and each provider's market-data license. It is not an exchange, clearing broker or guaranteed free chain feed. |
| Optopsy — https://github.com/goldspanlabs/optopsy | Strategy screening and research/backtest comparisons for common option structures. | AGPL-3.0; isolate as a research service or obtain legal review before embedding in proprietary network service. Requires quality historical chains and execution assumptions. |
| OptionLab — https://github.com/rgaveiga/optionlab | Supplementary payoff/probability/strategy evaluation. | Confirm license and maintenance before production use; not a market-data or execution engine. |
| OptionSuite — https://github.com/sirnfs/OptionSuite | Reference for stock/options backtesting workflows. | MIT, but repository data coverage and operational completeness are not enough to make it the production core. |
| py_vollib / py_vollib_vectorized | Lightweight pricing, implied volatility and Greeks calculations. | MIT; useful utility, not a complete multi-asset risk system or volatility-surface arbitrage validator. |

**Selected architecture:** QuantLib as independent valuation oracle + a provider-neutral TypeScript domain model in the web app + a Python/Rust research worker using NautilusTrader for event replay once instrument/data coverage is validated. Optopsy and OptionLab remain isolated benchmark tools, not core runtime dependencies. OpenBB is an optional provider adapter only when a source's coverage, cost and redistribution terms pass review.

No open-source project supplies free, complete, licensed, survivorship-clean, tick-level historical option books for every asset class. A reliable backtest requires historical bid/ask/depth/trades, underlying/forward, rates/dividends/carry, contract masters, corporate actions, calendars, exercise/assignment and realistic fees/slippage/partial fills. Free daily snapshots are not sufficient for intraday execution claims.

## 7. Data and execution architecture

1. **Canonical instrument master:** asset class, venue/legal entity, underlying, underlying kind (spot/index/future/perpetual), quote and settlement currency, multiplier, tick/lot sizes, exercise style, settlement style, expiry timezone, calendar, fees and margin model.
2. **Provider adapters:** separate adapters for Binance crypto options, Binance TradFi commodity options, CSV/manual datasets and future licensed traditional-market data. Preserve exact provider symbols and raw source payloads.
3. **Provenance:** every value has source, event timestamp, receive timestamp, sequence/version, stale status and estimated/observed status.
4. **Pricing router:** Black–Scholes only for compatible spot-style contracts with explicit carry assumptions; Black-76 for futures options with a valid forward and discount factor; reject unknown/perpetual or incompatible mechanics rather than silently pricing them as spot.
5. **Volatility/risk:** fit IV surfaces by expiry/moneyness, test monotonicity/convexity and calendar consistency, compute normalized Greeks and portfolio stress across spot/forward, vol, rates, skew, liquidity and gaps.
6. **Backtesting:** event-driven replay with quote freshness, spread, market impact, partial fills, exchange fees, exercise/assignment, expiry, settlement, futures conversion and margin.
7. **Execution gate:** research → paper → read-only account reconciliation → manual small live orders only after jurisdiction, product, data and operational gates pass. No automated order placement is in scope now.

## 8. Prioritized next actions

- [ ] Ask Binance Support, using the real Syrian KYC account, to confirm separately: Crypto Options buy permission; Crypto Options write permission per underlying; Commodity/TradFi Options (XAU/XAG) buy permission; any restrictions specific to Syrian residents; API trading permissions.
- [ ] Keep Binance API keys out of the browser. If eventually needed, create a read-only key first, IP-restrict it if a stable permitted endpoint exists, and never grant withdrawal permissions.
- [ ] Send an eligibility inquiry to Optimus and Ironbeam only if needed, asking the carrying FCM to answer in writing for a Syrian resident before any application or deposit.
- [ ] Build multi-asset metadata, asset/venue filtering and contract-aware pricing before adding new live providers.
- [ ] Keep the UI visibly distinguishing Live, Demo, CSV and Paper, and expose missing/stale contract metadata instead of inventing it.
- [ ] Add source/licensing tests and adapter conformance tests before enabling any additional provider.
- [ ] Recheck venue terms, fees, and product availability quarterly and before any account funding.



## 10. Product-specific candidates: Bitget Stock+ and Gate U.S. Stock Options

These products surfaced after the initial platform matrix and must be assessed separately from the general exchange account.

### Bitget: general account eligibility is not Stock+ eligibility

Bitget's official 12 June 2025 announcement says Syria was removed from the restricted-country list for its general platform services and that Syrian residents can register and complete KYC. This supports general crypto account access, not every sub-product.

Stock+ is a separate Securities Sub-account. Its 2026 service terms identify Parsa Financial Services (South Africa) and foreign service providers for execution, clearing and custody, and refer to OCC rules, exercise/assignment and settlement mechanics. The Block's 22 June 2026 launch coverage listed Syria among Stock+'s excluded jurisdictions. The Stock+ terms updated 11 September 2026 do not publish a standalone country table; they refer back to platform/providing-party restrictions. Therefore the general Bitget Syria announcement and the Stock+ product-specific restriction report are not equivalent and should not be conflated.

If available to an eligible customer, Stock+ is materially broader than Binance for U.S. equity options:
- Bitget announced 2,800+ U.S. stock/ETF option contracts at launch; actual live universe changes.
- Initial buy-to-open Call/Put and sell-to-close; short options were announced from 1 September 2026, and multi-leg strategies from 29 September.
- Product terms reference OCC rules, automatic exercise/assignment and T+1 settlement; the service involves external providers rather than being a simple Bitget crypto perpetual.
- Published fees include a $0.60 platform fee per contract plus clearing/regulatory/exercise/audit and applicable SEC/FINRA fees; "zero commission" is not zero total cost.
- OPRA options data and Stock Level 1 API access require whitelist/entitlement; an app UI quote does not prove API access.

**Decision:** Do not treat Bitget Stock+ as eligible for this Syrian resident until Bitget/Parsa confirms in writing that a person whose true residence is Syria may open the Securities Sub-account and trade the U.S. options product. Do not use VPN/IP masking to test around the restriction.

Sources:
- General Syria eligibility: https://www.bitget.com/support/articles/12560603829392
- Stock+ terms: https://www.bitget.com/terms/legal/12560603885499
- Stock+ service provider / terms information: https://www.bitget.com/support/articles/12560603887309
- Launch restriction report: https://www.theblock.co/news/markets/2026-06-22-bitget-us-stock-purchases-crypto-405507
- Stock+ contract catalogue announcement: https://www.bitget.com/support/articles/12560603889520
- Short options: https://www.bitget.com/support/articles/12560603893942
- Multi-leg strategies: https://www.bitget.com/support/articles/12560603896255
- API overview: https://www.bitget.com/legacy-docs/uta/stockplus/overview

### Gate: U.S. stock options are not necessarily equivalent to OCC-listed stock options

Gate launched U.S. stock options on an initial nine U.S. underlyings (including NVDA, TSLA, AAPL, META, AMD, MU, AMZN, GOOGL and AVGO). Its product documentation describes USDT cash settlement and no delivery of the underlying shares. That is materially different from standard U.S. single-stock options, which commonly involve physical delivery of 100 shares on exercise/assignment.

The Gate pages reviewed do not clearly establish that these contracts are listed on a U.S. options exchange or cleared through OCC. Do not label them OCC-listed or equivalent to CBOE/NYSE standard contracts without explicit contract documentation. Gate's global user agreement list did not expressly name Syria in the version reviewed, but the list is non-exhaustive and Gate states product availability can vary by region/account. Absence from the general list is not approval.

**Decision:** Gate is an inquiry candidate only. Before use, obtain written confirmation for Syrian residence and the exact U.S. Stock Options product, and verify the counterparty, exchange/clearing status, settlement calculation, order types, short-writing permissions, fees, data API and withdrawal path.

Sources:
- Launch announcement: https://www.gate.com/it/announcements/article/102291
- Product guide: https://www.gate.com/uk/help/other/stockoptions/101318
- Order/fee details: https://www.gate.com/uk/help/other/stockoptions/101328
- Product FAQ: https://www.gate.com/uk/help/other/stockoptions/101334
- User agreement: https://www.gate.com/legal/user-agreement

### Additional traditional broker checks

- **tastytrade:** Syria is not included in the published eligible international-account country list: https://tastytrade.com/learn/accounts/account-types/international-account
- **Saxo:** its help page says services cannot be accessed from Syria: https://www.help.saxo/hc/en-us/articles/9342722900765-Can-I-access-my-account-when-I-travel-abroad
- **KuCoin:** announced that all Options services would close and be removed on 15 January 2026 UTC: https://www.kucoin.com/announcement/kucoin-option-trading-notice-251224

## 9. Primary sources

### Binance
- Syria resident FAQ (12 June 2025): https://www.binance.com/en/support/faq/detail/863795c36a224bd7aa7d677996328ff9
- Syria availability announcement: https://www.binance.com/en/support/announcement/detail/7b11496ac43a42ceac50a1895c454d25
- Crypto Options contract specifications (5 January 2026): https://bin.bnbstatic.com/static/cms/cg08ou2ak0tn7mcplvfg/file/443bcc67fde7274898ff8e3f7af23c7d89e654c5e609d250772e0ddaa96409be.pdf
- Commodity Options FAQ (29 July 2026): https://www.binance.com/en-UZ/support/faq/detail/dc9e52b4440b48bd900a767cc5024c84
- Crypto Options short-selling FAQ (updated 28 July 2026): https://www.binance.com/en/support/faq/detail/1ceb77f837344e3085ecf98d9a6a8097
- Binance Options order types (updated 2 January 2026): https://www.binance.com/en/support/faq/detail/6b0dc23370ee4153a6581355e92555c1
- Commodity Options launch: https://www.binance.com/en/blog/markets/7906742128714440461
- Options API market data: https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-options/api/rest-api/market-data
- Options fee schedule: https://www.binance.com/en-BH/fee/optionsTrading
- Terms: https://www.binance.com/terms

### Other venues
- Deribit restricted jurisdictions: https://support.deribit.com/hc/en-us/articles/25944487427741-Restricted-Jurisdictions
- Bybit restricted countries (updated 16 October 2026): https://www.bybit.com/en/help-center/article/Service-Restricted-Countries
- OKX risk and compliance disclosure (updated 8 July 2026): https://www.okx.com/en-eu/help/risk-compliance-disclosure
- IBKR applicant-country FAQ: https://www.interactivebrokers.com/support/faq/content/accept-applicants-country-28216848
- AMP restricted countries (updated 19 November 2026): https://faq.ampfutures.com/hc/en-us/articles/10797726829463-Restricted-Countries-List
- AMP official restricted-country image: https://faq.ampfutures.com/hc/article_attachments/34904272364951
- Optimus international futures: https://support.optimusfutures.com/international-futures-trading
- Ironbeam international account eligibility: https://www.ironbeam.com/knowledge-base/does-ironbeam-open-accounts-for-people-outside-the-united-states/
- CME options on futures: https://www.cmegroup.com/markets/options
- CME find a broker: https://www.cmegroup.com/tools-information/find-a-broker.html

### Open source
- QuantLib: https://github.com/QuantLib/QuantLib
- NautilusTrader options documentation: https://nautilustrader.io/docs/latest/concepts/options/
- OpenBB: https://github.com/openbq-org/OpenBB
- Optopsy: https://github.com/goldspanlabs/optopsy
- OptionLab: https://github.com/rgaveiga/optionlab
- OptionSuite: https://github.com/sirnfs/OptionSuite
- py_vollib: https://github.com/vollib/py_vollib


## 10. مراجعة موسعة لمنصات on-chain والمنتجات الملتبسة — 24 نوفمبر 2026

| Venue / product | Product classification | Syria evidence | Operational decision |
|---|---|---|---|
| Gate U.S. Stock Options | USDT cash-settled product; exchange/OCC equivalence not established by reviewed docs | Current Gate User Agreement explicitly names Syria as an embargoed/restricted location | Exclude for Syrian resident |
| Bitget Stock+ | Separate U.S. securities sub-account with options features | General Bitget account accepts Syria, but June 2026 Stock+ launch report lists Syria among exclusions | Do not use; require written Stock+ eligibility confirmation |
| Paradex | On-chain order-book options/perpetual venue | Official Restricted Persons page explicitly names Syria; Terms prohibit VPN circumvention | Exclude |
| Hyperliquid HIP-4 | Binary/outcome contracts, not vanilla options; HIP-3 are perpetuals | Broad sanctions/export-control terms and independent live test reported Syria trading gate | Exclude as execution; do not misclassify HIP-3/4 as options |
| Aevo | On-chain options and perps | Independent terms analysis identifies Syria as restricted; no official Syria exception found | Unavailable/unverified; not a workaround |
| Deriv Vanilla/Digital/Accumulator | Broker-issued OTC/house-priced options and digital products | Country and contracting entity are product-dependent; Syria acceptance not established | Separate OTC product category; not an approved listed-options route |
| Optimus / Ironbeam | Traditional futures broker/FCM routes to CME/ICE/Eurex etc. | General international support only; no Syria-specific acceptance confirmed | Written compliance inquiry only; no deposit/account opening until explicit approval |

### لماذا لا نساوي كل المنتجات باسم Options؟

- Exchange-listed vanilla options have standardized contract specs, exchange order books, clearing and published exercise/settlement rules.
- Broker-issued OTC vanilla options are bilateral contracts priced/managed by the broker; counterparty and quote methodology differ.
- Digital/binary/event-outcome products pay according to a discrete event condition and do not have the same payoff, Greeks, exercise or liquidity model as ordinary calls/puts.
- Futures/perpetuals/CFDs/tokenized shares are not options simply because a platform markets them alongside options.

### Venue selection for the actual user

1. **Conditional primary:** Binance, because its official Syria FAQ explicitly lists Options and permits eligible Syrian residents to register/KYC. This is not evidence that every option family or API permission is active. Verify the actual product and permissions in the real Syrian KYC account.
2. **No currently confirmed second execution venue:** Deribit, Bybit, OKX, Gate and Paradex list Syria restrictions; Hyperliquid's trading gate has been observed blocking Syria; Bitget Stock+ is reported to exclude Syria; IBKR and AMP do not establish eligibility. Optimus and Ironbeam remain inquiry-only.
3. **Research architecture:** venue-neutral canonical contracts, separate adapter per exchange/FCM, common provenance/freshness, normalized multiplier/currency/settlement, independent pricing and risk engines, and no cross-venue equivalence unless contract terms prove it.
4. **No VPN workaround:** use VPN only for connectivity/privacy where lawful and allowed; do not route execution through another country to misrepresent residence or defeat a venue's terms.

### Data and engineering stack decision

- **Market data:** official exchange/FCM feeds first; free public REST/WebSocket data only where terms permit; historical option chains must be archived prospectively or acquired under a data license. There is no verified free universal real-time options-chain feed for all listed markets.
- **Pricing reference:** QuantLib as an independent validation engine; current in-app TypeScript models remain small transparent primitives, not a replacement for a full curve/volatility-surface library.
- **Execution-aware research:** NautilusTrader is the strongest candidate to evaluate for event-driven replay/backtesting and live/data adapter parity; keep it as an isolated Python service, not bundled into the static React UI. Validate options fills, assignment, exercise, margin and queue modelling before relying on it.
- **Strategy research:** Optopsy/OptionLab can be used in isolated research environments after GPL/AGPL compatibility review; do not import copyleft code into the frontend bundle without legal review.
- **Data platform:** OpenBB is an extensible research interface, not a guaranteed licensed options data vendor. Each provider's symbol coverage, history depth, delayed/real-time entitlement and redistribution rights must be checked.
- **Plugin catalog:** discovery for options-chain/broker/exchange data plugins returned no dedicated market-data/broker connector. Existing GitHub, Context7, Consensus and Data tools can assist engineering/research, but they do not replace an exchange API or data license. No paid plugin/service was installed.

### Primary/secondary source links

- Gate User Agreement: https://www.gate.com/en-us/legal/user-agreement
- Bitget Syria general account announcement: https://www.bitget.com/support/articles/12560603829392
- Bitget Stock+ support: https://www.bitget.live/support/articles/12560603887309
- Bitget Stock+ launch exclusions (secondary): https://www.theblock.co/news/markets/2026-06-22-bitget-us-stock-purchases-crypto-405507
- Paradex restricted persons: https://paradex.trade/restricted-persons
- Paradex terms: https://www.paradex.trade/terms-of-service
- Hyperliquid terms: https://hyperliquid.gitbook.io/hyperliquid-docs/policies/terms-of-use
- Hyperliquid Syria geo-gate research (secondary): https://restricted.cp0x.com/monitor/hyperliquid
- Aevo terms analysis (secondary): https://defillama.com/exchange/aevo/information
- Deriv trading terms: https://deriv.com/terms-and-conditions/trading-terms
- Deriv general terms: https://deriv.com/terms-and-conditions/general-terms-of-use
- On-chain product taxonomy: https://research.castlelabs.io/p/mapping-onchain-options-exchanges


### تحديث أهلية إضافي

- Deriv: قائمة البلدان المدعومة الرسمية لا تتضمن سوريا، وشروطها تجعل إتاحة المنتجات مرتبطة ببلد الإقامة والكيان والمنتج؛ لا نعتبرها متاحة للمستخدم. المصدر: https://legacy-docs.deriv.com/docs/country-list
- NinjaTrader: نموذج فتح الحساب الحي يمنع فتح حساب ممول إذا لم يظهر بلد الإقامة في القائمة؛ تقرير مستقل ينقل تأكيد امتثال بعدم قبول المقيمين في سوريا في سبتمبر 2026. القرار الحالي: مستبعد، ويعاد تقييمه فقط إذا تغيّر نص/رد الشركة. المصادر: https://vendor-support.ninjatrader.com/s/article/Applying-for-a-Live-NinjaTrader-Account?language=en_US ، https://unblocksyria.com/en/services/ninjatrader


## 11. مزودو بيانات الخيارات: ما الذي يمكن الحصول عليه مجاناً؟

لا يوجد مصدر مجاني موحد وموثوق يغطي كل خيارات الأسهم والمؤشرات والعقود الآجلة والفائدة والعملات والطاقة والمعادن والزراعة والكريبتو. تغطية OPRA الأمريكية منفصلة عن CME/ICE/Eurex، وبيانات OTC FX options مختلفة عن الخيارات المدرجة.

- **Binance:** أفضل مصدر عام مجاني داخل النطاق الذي تسرده Binance؛ REST وWebSocket للعقود المتاحة فقط، ولا يوسع التغطية إلى البورصات التقليدية.
- **Alpaca Basic:** يعطي US options indicative feed مجاناً؛ الوثائق تميّزه عن OPRA الحقيقي وتوضح أن OPRA يتطلب خطة مدفوعة. لا نستخدم indicative feed كـBBO قابل للتنفيذ.
- **MarketData.app Free Forever:** 100 credit يومياً، سنة تاريخية، وتأخير 24 ساعة للخيارات؛ مناسب لاستكشاف EOD لا للمضاربة أو قياس التنفيذ. التحقق من هوية المشترك واتفاقيات البيانات مطلوب قبل البيانات الأسرع.
- **Massive Options Basic:** بيانات نهاية اليوم؛ flat files لأسعار الخيارات ليست ضمن المجاني. خطة 15-minute delayed تبدأ من 29$/شهر، وخطة Real-time أعلى بكثير.
- **CME:** يوفر بيانات خيارات آجلة للفائدة والعملات والطاقة والمعادن والزراعة وغيرها عبر DataMine/MDP/REST/WebSocket، لكن المنتج والترخيص والتكلفة يجب طلبها حسب السوق.
- **Cboe:** يبيع بيانات أسواقه ومؤشراته عبر feeds وCloud وDataShop وموزعين؛ لا توجد تغطية عالمية مجانية موحدة.

**التوصية الهندسية:** لا نضيف اشتراكاً مدفوعاً الآن. ابدأ بموصل Binance العام، وموصل CSV موحد، ثم أضف مزود بيانات أمريكي مجاني مؤخر فقط بعد تحقق حسابي وترخيصي. خزّن تاريخ السلسلة من وقت التفعيل فصاعداً في Parquet؛ لا تخترع تاريخاً خلفياً. كل Quote يحمل source وsourceTimestamp وreceivedAt وdelayClass وlicenseClass وvenue وinstrumentId، مع فصل indicative عن tradable.

المصادر الرسمية:
- https://docs.alpaca.markets/us/docs/about-market-data-api
- https://docs.alpaca.markets/us/docs/historical-option-data
- https://www.marketdata.app/docs/account/plan-limits/
- https://www.marketdata.app/docs/account/data-policies/free-accounts/
- https://massive.com/docs/flat-files/options/quotes?assetClass=options&license=personal&name=options_advanced
- https://www.cmegroup.com/market-data/browse-data.html.html
- https://www.cboe.com/data/market-data-services

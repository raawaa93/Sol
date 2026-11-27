# Options research tools stack — 27 November 2026

**Status:** research completed; no third-party connector deployed; no paid service subscribed; no market-data credentials created.
**Scope:** ready-made web/Telegram tools for options research, with priority on Binance SOL options. Sol remains read-only/research/PAPER only.

## Executive decision

There is no verified, free, single product that provides all of:
1. Binance-specific SOL options chain and quote detail;
2. multi-venue context and positioning;
3. reliable trade-by-trade options flow / block alerts;
4. historical replay and alerting;
5. a free API suitable for persistent integration.

The practical low-cost stack is:

- **Primary ready-made dashboard:** [Loris Tools — Binance options](https://loris.tools/options/binance) and [SOL on Binance](https://loris.tools/options/sol/binance). The live page was scraped on 27 Nov 2026 and showed Binance SOL with 4 expiries / 88 instruments, OI around $259.1K, 24h notional volume around $354.7K and ATM IV around 119.22%. These are a time-specific third-party snapshot, not execution quotes and not a guarantee of current values. A subsequent page scrape showed an important internal consistency defect: the same page displayed ATM IV around 118.6% in the headline, 132.75% for the nearest expiry in the volatility table, but 11,921.73% in the top-expiry table. Do not rely on the top-table IV field or import any Loris IV into Sol until this scaling discrepancy is explained and reconciled against Binance mark IV.
- **Independent structure / GEX context:** [GammaFlip](https://gammaflip.io/) supports SOL and Binance alongside Deribit, Bybit, OKX and Derive. It provides per-venue or combined GEX, gamma flip, walls, max pain, history/replay and Telegram flip alerts. Its crypto plan is $39/month; 3-day trial is advertised without a credit card. This exceeds the project's $15/month recurring spend ceiling, so do not subscribe. Public daily GEX pages can be used as secondary context, but they are not a substitute for the paid venue-filtered intraday view.
- **Exchange source of truth:** Binance's public European Options API documentation at [Binance Developer Docs](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-options/api/rest-api/market-data). Sol should continue using its existing approved read-only path and exact product/contract metadata. Do not create another Binance adapter.
- **Optional API candidate:** Loris documents GET /options/snapshot as a free endpoint, with all-tier access and an explicit symbol=SOL&exchange=binance supported pair in the current API search result and July 18, 2026 changelog. API key is required. However, its general Quickstart says the Free API tier returns only BTC/ETH for other datasets, and the Options Snapshot page has older cached content that omits SOL. No authenticated SOL API call was made. Therefore mark API integration **not live-verified** until a free key is obtained and a response is tested. Loris explicitly warns not to rely on its API for production trading systems.
- **Telegram:** [GammaFlip official Telegram channel](https://t.me/s/gammaflip) and its bot [@GammaFlipioBot](https://t.me/GammaFlipioBot) are the most directly relevant surfaced source for SOL gamma-flip alerts. These are alerts about a modelled GEX level, not options trade-flow alerts and not buy/sell calls. Laevitas's [Options Trade Tape channel](https://t.me/s/laevitas) explicitly advertises large/block alerts from Deribit, Bybit, OKX and Bullish; it does **not** list Binance in the channel's source coverage, so do not use it as Binance SOL flow.

## Four-pass research log

### Pass 1 — market tools and dashboards
- Scraped Loris Tools Binance dashboard and SOL venue page. Binance is broken out as a separate venue; SOL is present in its current dashboard snapshot.
- Scraped Laevitas options overview and flow dashboard. The overview is multi-exchange; the flow dashboard's comparison includes Binance, but its Telegram tape channel does not list Binance among its sources. A venue comparison table is not proof that each alert is sourced from that venue.
- Scraped option.watch SOL and Binance pages. SOL page states Bybit and Derive only. Binance page states BTC and ETH only. **Not suitable for Binance SOL chain.**
- Scraped Basis Charts options page. The currently indexed free options page names BTC and ETH and its SOL terminal scrape remained in a loading state. **Do not count Basis as verified Binance SOL coverage.**

### Pass 2 — Telegram, alerting and positioning
- GammaFlip public pages and official Telegram state that Binance was added as a fifth crypto options venue for BTC, ETH, SOL and XRP; its app supports venue-only or combined views.
- GammaFlip methodology says crypto chains refresh about every minute, spot about every five seconds, and computes GEX from gamma, OI, multiplier and spot. It explicitly relies on the standard call-positive / put-negative open-interest convention. Actual market-maker inventory is not public; GEX is a modelled positioning proxy, not ground truth.
- GammaFlip pricing: Crypto plan $39/month, 3-day trial, no card required; recurring price is above the approved budget. No subscription action taken.
- Laevitas Telegram trade tape is not a Binance alert feed based on its own published channel description.

### Pass 3 — APIs and exchange-native data
- Binance public Options endpoints include exchangeInfo, index, mark (mark IV and Greeks), ticker, depth, trades and openInterest. The official docs describe OI by underlying and expiry. These are preferable to treating a vendor's aggregated market view as the exchange's own book.
- Loris API search result and changelog report SOL support on Binance, Bybit, Deribit and Derive, with GET /options/snapshot available on all tiers. A live authenticated API request was not performed, because no API key was available and no account was created. Its production-trading warning is retained.
- Laevitas API documents market-level options analytics, but account entitlement, current free tier, and live SOL/Binance response were not verified in this run. Keep as an optional research vendor only.
- No Telegram source with verified Binance SOL trade-by-trade/block alerts was established.

### Pass 4 — GitHub, GitLab and implementation fit
- [crypto-gamma-dashboard](https://github.com/sfdcShrikant/crypto-gamma-dashboard) is an MIT-licensed, small Binance EAPI GEX dashboard using FastAPI + ECharts. Its README documents exchangeInfo, index, mark and openInterest. It assumes dealer calls-positive / puts-negative and explicitly says this is a heuristic, not ground truth. It also states contract unit=1; Sol must not copy this assumption because its instrument master must read each live contract's actual unit and settlement mechanics. The repo is a reference, not an adopted dependency.
- [oggregator](https://github.com/dzmbs/oggregator) advertises a cross-venue real-time options aggregator for Binance, Bybit, Deribit, Derive and OKX with normalized quotes, Greeks, IV, chain, surface, flow and block-flow endpoints, using WebSocket adapters. It is a promising architecture reference; its SOL coverage, license compatibility, source-quality, operational health and live demo were not independently verified in this pass. Do not deploy it or merge its code without a separate source review and tests.
- [GammaGrid](https://github.com/gammagrid/gammagrid) is oriented to US-listed equity options/Yahoo Finance and explicitly lacks European/Asian options from its free data source. Not suitable for Binance SOL.
- GitLab searches did not surface a stronger, verified, maintained Binance SOL options product than the candidates above.

## Candidate matrix

| Candidate | Binance SOL | Live chain / Greeks | Cross-venue | Flow alerts | Price / decision |
|---|---|---|---|---|---|
| Loris Tools web | Yes, page shows SOL/Binance | Dashboard and API surface claim IV/OI/Greeks; authenticated API not tested | Yes | No verified Binance SOL Telegram flow | Best immediate free dashboard candidate |
| GammaFlip | Yes | Modelled GEX / levels, not an execution chain | Yes, venue filters | Telegram gamma-flip alerts | Best all-in-one positioning/alert product, but $39/mo exceeds budget |
| Laevitas | API/docs support options analytics; live SOL/Binance response not rechecked here | Broad options analytics | Yes | Telegram tape does not list Binance | Secondary research source, not Binance tape |
| option.watch | No verified Binance SOL; SOL page says Bybit/Derive | Live SOL chain for those venues | Yes, but not Binance SOL | No relevant Binance alert verified | Exclude for this use case |
| Basis Charts | Not verified | Current free page explicitly highlights BTC/ETH; SOL terminal remained loading | Yes for listed BTC/ETH | No verified Binance SOL alert | Do not rely on for SOL |
| crypto-gamma-dashboard | Binance EAPI source; underlying-specific coverage needs live check | GEX model | No | No | MIT reference only; low activity and heuristic assumptions |
| oggregator | Binance adapter claimed | Normalized real-time quotes/Greeks/IV claimed | Yes | Flow/block-flow endpoints claimed | Strong architecture reference; further validation needed |
| GammaGrid | No | US options only via Yahoo Finance | No crypto options | Periodic snapshot anomaly alerts, not trade tape | Not suitable |

## Sol integration plan

### Implement now (no code change to market-data path)
1. Keep the current Binance adapter and Syrian-network-only policy unchanged.
2. Use Loris Tools web dashboard manually as a secondary independent comparison. Label every value with provider, venue, capture time and field freshness.
3. Use GammaFlip's public daily SOL page only as a secondary structural reference. Do not pay for the $39 plan under the current budget.
4. Use [GammaFlip's free daily SOL GEX page](https://gammaflip.io/gex/sol) for a daily, combined-market structural snapshot. At the 27 Nov 2026 08:00 UTC publication it showed SOL spot 73.31, gamma flip 72.00 and a positive regime. It is a once-daily combined crypto snapshot, not a live Binance-only signal. Treat Telegram alerts as contextual notifications only. Do not turn a gamma-flip alert or block alert into an automatic signal.

### Optional adapter, only after free API verification
- Test GET /options/snapshot?symbol=SOL&exchange=binance with a free Loris API key, in a private server-side test environment.
- Verify response schema, instrument IDs, expiry, strike, call/put, IV units, Greeks units, OI units, underlying price, timestamps, rate limits, free-tier access, terms, and data redistribution rights.
- Compare instrument-by-instrument against Binance's current public exchangeInfo, /mark, /ticker, /openInterest, and order-book BBO, fetched only via Sol's existing approved Syrian-origin route.
- Reject stale/mismatched/unsupported instruments; never substitute a cross-venue aggregate for Binance values.
- Store no third-party API key in browser code or Git. Do not expose it in logs.
- If free access or redistribution is not confirmed, use the vendor page manually and do not integrate it.

### Data interpretation safeguards
- Keep venue-specific OI and IV separate from combined multi-venue aggregates.
- Treat GEX, gamma flip, call/put walls and dealer positioning as modelled estimates, not published dealer positions.
- A block print or BUY/SELL flag alone does not establish opening demand, directional intent, or profitable follow-through. Reconcile aggressor, trade type, contract OI changes, IV, underlying move, spread/depth and post-trade response.
- Do not create a live collector or persistent cloud storage from this research note. The existing options archive is local/tested foundation only; no live capture or durable cloud archive is currently deployed.
- No execution, account key, order routing, subscription, or funds movement is enabled by this research.

## Reproducible source links

- Binance Options Market Data API: https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-options/api/rest-api/market-data
- Loris Binance dashboard: https://loris.tools/options/binance
- Loris Binance SOL dashboard: https://loris.tools/options/sol/binance
- Loris Options Snapshot API: https://loris.tools/docs/api/options/snapshot
- Loris API changelog: https://loris.tools/docs/api/changelog
- GammaFlip: https://gammaflip.io/
- GammaFlip pricing: https://gammaflip.io/pricing
- GammaFlip methodology: https://gammaflip.io/methodology
- GammaFlip Telegram: https://t.me/s/gammaflip
- GammaFlip bot: https://t.me/GammaFlipioBot
- Laevitas options flow: https://app.laevitas.ch/crypto/options-flows
- Laevitas Telegram tape: https://t.me/s/laevitas
- option.watch SOL page: https://www.option.watch/sol-options.html
- Basis options page: https://www.basischarts.com/options
- crypto-gamma-dashboard: https://github.com/sfdcShrikant/crypto-gamma-dashboard
- oggregator: https://github.com/dzmbs/oggregator
- GammaGrid: https://github.com/gammagrid/gammagrid

## Verification status

- **Researched:** four distinct web research passes, current vendor pages, API docs/changelogs, official Telegram channel descriptions, GitHub repository metadata/README.
- **Live web scrape verified:** Loris Binance dashboard includes SOL row and current OI/volume values; however its ATM IV fields disagree materially within the same page (about 118.6%, 132.75%, and 11,921.73%). This is a data-quality hold, not a validated IV source. GammaFlip's public daily SOL GEX page was scraped and its current daily levels were recorded; GammaFlip publicly documents Binance+SOL support and Telegram alert functionality.
- **Not verified:** authenticated Loris API call; Laevitas authenticated SOL/Binance API response; GammaFlip account/bot subscription state; direct live Binance chain comparison from the user's approved Syrian-origin network. Loris IV scaling inconsistency remains unresolved.
- **Not implemented:** no adapter, secret, account, subscription, cloud worker, archive or production setting changed.
- **No trading advice or order execution:** project remains read-only/PAPER under its Syria legal and account-eligibility gates.


## Follow-up correction — 27 November 2026, 09:15 UTC

This section supersedes earlier statements in this report that treated Loris as the primary ready-made dashboard and described Basis SOL coverage as unverified. A fresh review of the current Basis data-source and SOL options pages found stronger direct evidence.

### Updated ready-made stack

1. **Basis — primary free options workspace for SOL.** Its current SOL page states that the free workspace merges SOL options from Deribit, OKX, Bybit and Binance, with no account, trial or subscription. It provides OI by strike/expiry, max pain, modelled GEX, smile/term structure, and a full chain with bid, mark, ask, IV, delta, OI and volume, exportable to CSV. The venue panel shows each venue's share, and the chain can be inspected per expiry. The current Basis data-source page says Binance contributes European option marks, tickers and per-expiry OI. This is a browser-based research tool, not an execution quote source. Do not interpret merged OI/GEX as Binance-only positioning.
2. **Binance official — execution and contract truth.** Keep the official SOL chain and Options API as the last word for the selected Binance contract, its live bid/ask/size, status, unit, expiry, strike and mark IV/Greeks. Continue through Sol's existing approved Syrian-origin Volterra route only; no direct client or foreign-runner Binance access.
3. **Laevitas — secondary venue-specific analysis.** The current options-flow dashboard lists Binance in its exchange comparison and exposes market-level volume, OI and block-volume columns. A current page snapshot showed Binance in the table, while its Telegram trade-tape description still does not establish a Binance SOL alert feed. The web dashboard's Binance row is not proof that every displayed block/trade metric is available for SOL or that Telegram sends Binance alerts. The direct Binance/SOL chain URL remains the intended venue-specific view; verify the exact contract and timestamp against Binance before relying on it.
4. **Loris — optional manual comparison only.** Keep it out of Sol's automated path. Its public page previously showed materially inconsistent IV figures. Its terms prohibit unauthorized scraping/automated extraction and integrations without prior written consent. Its API requires an API key; the Options Snapshot page lists SOL/Binance among supported pairs and says all tiers, while the generic Quickstart says the Free tier returns only BTC/ETH. No free authenticated SOL/Binance response or written redistribution permission has been verified. Do not create an account, key, or integration as part of this work.
5. **Telegram — context, not a consolidated Binance SOL feed.** Follow official Binance announcements for product/maintenance news. Laevitas Telegram may be useful for its stated venue coverage, but do not treat it as Binance SOL trade flow. GammaFlip's Telegram alerts concern modelled gamma-flip levels, not confirmed opening trades or execution signals; the paid crypto tier remains above the approved monthly budget.

### Evidence reviewed in this follow-up

- Basis SOL free options page: https://www.basischarts.com/free/free-solana-options-data
- Basis data-source coverage: https://www.basischarts.com/data-sources
- Basis options-flow coverage note: https://www.basischarts.com/free/free-crypto-options-flow
- Basis free crypto options workspace: https://www.basischarts.com/free/free-crypto-options-data
- Laevitas current options-flow dashboard: https://app.laevitas.ch/crypto/options-flows
- Laevitas Binance/SOL chain route: https://app.laevitas.ch/crypto/options?exchange=binance&currency=SOL&view=contracts&presentation=chain
- Loris Options Snapshot: https://loris.tools/docs/api/options/snapshot
- Loris Quickstart: https://loris.tools/docs
- Loris terms, especially Sections 4 and 6: https://loris.tools/terms
- Binance Options market-data API: https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-options/api/rest-api/market-data

### Revised conclusion

For immediate use without subscriptions, start with **Basis + Binance official + Laevitas web**. Basis is the strongest free merged options workspace; Binance remains authoritative for a specific Binance contract; Laevitas provides a separate market-flow and venue-comparison lens. There is still no verified free Telegram group or bot that combines Binance SOL trade-by-trade flow, venue-specific options Greeks, cross-venue positioning, and reliable alerts in one place.

### Status and guardrails

- This follow-up is a research/documentation correction only.
- No application code, data adapter, API key, account, Telegram bot configuration, subscription, cloud worker, or production setting was changed.
- No automated scraping or redistribution from Basis, Laevitas or Loris was enabled.
- Sol remains read-only/research/PAPER; all Binance market-data retrieval remains subject to the existing Syrian-network-only policy.

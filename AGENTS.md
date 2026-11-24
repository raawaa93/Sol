# Repository-wide operating instructions

## Product scope
- The product's research universe is **options across all asset classes and venues**, not gold-only and not crypto-only. Include listed equity/index options, options on futures (rates, FX, energy, metals, agriculture), crypto options, and other legally accessible option markets.
- Gold (XAU) and silver (XAG) are individual underlyings, not the product scope.
- Always distinguish intended coverage from implemented coverage. Current Demo includes BTC, ETH, SOL, XRP, DOGE, BNB, XAU, XAG, CL and BZ. Live data is Binance-specific and limited to instruments returned by its current catalogue. CSV is more generic. This is not universal live market coverage.
- Never label a perpetual, CFD, binary contract, prediction market or synthetic payoff as an exchange-listed option. Describe rights, exercise style, expiry, settlement, multiplier, collateral and margin explicitly.

## User jurisdiction and connectivity
- The account owner is physically resident in **Syria**, not the United Kingdom.
- A VPN may be necessary for ordinary internet connectivity. Treat VPN egress IP as network routing only; it does not change residence, KYC, legal jurisdiction, tax residence, sanctions screening or venue eligibility.
- Never recommend false addresses, false residence, borrowed accounts, VPN geofencing evasion, proxy rotation or other circumvention of platform restrictions.
- Check eligibility against truthful residence and identity, exact contracting legal entity, product-specific terms and account-level permissions. A country absent from a public list is not proof of acceptance.
- As of 2026-11-24, Binance's Syria-specific FAQ says Syrian residents may register and verify subject to KYC/compliance and explicitly lists Options trading. The FAQ predates the July 2026 Commodity/TradFi Options launch: it supports general Crypto Options eligibility, but does not prove XAU/XAG Commodity Options are enabled for every Syrian account. Verify each product and each writing permission in the real account or with Binance Support. Crypto Options writing is currently limited to BTC and ETH, requires margin and can be liquidated; BNB/XRP/SOL/DOGE writing is unavailable. Commodity Options are retail long-only. Ordinary Binance accounts lack portfolio-margin/risk netting across Options/Futures/Margin, so do not assume spread legs offset margin. Binance Options supports Limit orders only. Treat Binance as a conditional single-leg/limited-options venue, not an all-asset options venue.
- Bitget's general platform FAQ says Syrian residents may register and complete KYC, but Stock+ is a separate securities sub-account. A June 2026 launch report lists Syria among Stock+ excluded jurisdictions; current Stock+ terms do not publish a clear country appendix. Treat Stock+ as unavailable/unverified until Bitget/Parsa confirms in writing.
- **Gate Global is an inquiry-only candidate, not confirmed blocked or approved.** Its current global User Agreement's non-exhaustive Restricted Locations list does not name Syria, while an older 2022 Gate agreement PDF did. Gate US is a separate U.S.-resident-only entity/product and its U.S. agreement names Syria; do not confuse Gate US with Gate Global. Gate documents crypto options REST/WS APIs, short positions and market/IV/limit order paths, but live eligibility, KYC tier, regional access and product scope must be confirmed in writing for a Syrian resident before funding. Never use VPN/IP masking to bypass an eligibility decision.
- Bitget's general account FAQ welcomes Syrian residents, but Bitget Stock+ is a separate securities sub-account. The June 2026 launch coverage lists Syria among Stock+ excluded jurisdictions; do not infer Stock+ eligibility from general Bitget access.
- Paradex's official Restricted Persons page explicitly names Syria; its Terms of Service state that it makes no exceptions and prohibit VPN use to circumvent restrictions.
- Hyperliquid's interface applies a legal/location gate; third-party live testing in October 2026 reported Syria blocked. Its HIP-4 outcome markets are binary/event contracts, not vanilla listed options. Do not treat public Hyperliquid market-data reachability as permission to trade.
- Aevo's terms parsing in independent venue research identifies Syria as a restricted territory. Treat it as unavailable/unverified, not a workaround; require an official current compliance response before any change in status.
- Deriv offers broker-issued vanilla/digital/accumulator products with house pricing and product-specific limits. Its official supported-country list does not include Syria, so it is not a verified access route for this user. These are not equivalent to exchange-listed options on CME/CBOE/OPRA; never mix these contracts into listed-option comparisons.
- NinjaTrader's live-account documentation says a country absent from its application list cannot open a funded account; an independent 2026 Syria-access tracker reports direct NinjaTrader compliance confirmation that accounts from Syria are not accepted. Treat it as unavailable unless the broker publishes a policy change.
- As of 2026-11-24, reviewed terms explicitly list Syria as restricted for Deribit, Bybit and OKX. Interactive Brokers' available-country list does not include Syria and its FAQ excludes sanctioned/high-risk countries. Do not route this user to these venues unless official policies change and eligibility is confirmed in writing.
- Traditional multi-asset options require an accepting broker/FCM. CME's exchange catalogue is not a retail account. AMP Futures' official restricted-country image explicitly lists Syria, so AMP says it will not open accounts for residents located there. Optimus Futures advertises international customers and options on futures but retains country restrictions; Syria-specific approval is unconfirmed.
- Detailed market/platform decision and provider-neutral architecture: `docs/UNIVERSAL_OPTIONS_RESEARCH_2026-11-24.md`.
- Revalidate platform and product eligibility before every new execution integration and after material terms/regulatory changes.

## Trading, data and safety boundaries
- Current Volterra application is research, analysis, CSV replay and PAPER only. It does not send orders and must not gain live execution credentials by accident.
- Separate research/public-data adapters from authenticated account/execution adapters. No private trading keys in browser code, GitHub Actions logs, source control, screenshots or client storage.
- Do not label Demo or model-derived data as live. Preserve provider, legal entity, instrument ID, source timestamp, receive timestamp, currency, multiplier, exercise style, settlement, expiry, fees, margin method and per-field provenance.
- Never claim a strategy has an edge from an in-sample backtest. Include bid/ask fills, fees, slippage, liquidity, partial fills, expiry/assignment, margin/liquidation, funding/carry, delistings, outages and out-of-sample/forward validation.
- No live order placement or paid market-data subscription without a separate operational decision after compliance, risk and cost validation. Prefer free/public permitted data first; keep recurring spend at or below the user's USD 15/month ceiling unless changed by the user.
- Treat account-level and location-specific access errors separately from network errors. HTTP 451 from a CI runner is not proof of global unavailability or this user's account eligibility.
- There is no verified free universal real-time options feed covering all asset classes. Free U.S. equity-options tiers are indicative, end-of-day or at least 24-hour delayed; they are research-only and must never be used as executable quotes or realistic fill data. Check identity classification, exchange entitlements, personal-use/redistribution terms and residence acceptance before adding any provider.
- Keep financial calculations unit-aware and instrument-specific. Never compare OI, volume, prices or Greeks across venues without multiplier, currency and settlement normalization.

## Durable context
Keep the multi-asset scope, Syrian residence, VPN connectivity distinction, platform findings and execution guardrails in repository documentation. Update this file and docs/PLATFORM_ELIGIBILITY_2026-11-24.md when verified facts change. Do not describe the project as a gold-only tool. Use “Volterra Multi-Asset Options Decision Lab” consistently.

## قرار تغطية المنتجات — مراجعة المصادر الرسمية في 24 نوفمبر 2026

### النطاق الدائم
هذا المشروع **Multi-Asset Options**: جميع أسواق الخيارات عبر Crypto, Equity, Index, Rates, FX, Energy, Metals, Agriculture وغيرها. الذهب سوق فرعي لا محور المنتج. لا يُستنتج وجود خيار قابل للتداول من وجود Spot/Perpetual/Futures أو Tokenized asset على المنصة.

### خريطة منتجات Binance — لا تخلط بين خطوط المنتج

| Product line | ما تدعمه المصادر | القيود التي يجب أن تظهر في التطبيق |
|---|---|---|
| Crypto Options (/eapi) | API مستقل للعقود والـorder book والصفقات والـmark/Greeks/IV وticker وindex وOI وWebSocket؛ مشترٍ يدفع القسط ولا يحتاج هامش مشتري وفق FAQ | رمز العقد/الأصل الفعلي يُكتشف ديناميكياً من exchangeInfo ولا نثبت قائمة أصول؛ أوامر Limit فقط؛ البيع/الكتابة ليس متاحاً لكل رمز/منطقة؛ لا نعتبر صلاحية بيع الخيارات مفعلة لحساب سوري دون فحص الحساب |
| Commodity Options | XAUUSDT وXAGUSDT أول مجموعة منشورة؛ European، USDT cash-settled، expiry يومي/أسبوعي؛ retail long-only | لا نخلطها بعقود TradFi Perpetual أو CME futures options؛ لا short writing للعميل التجزئة وفق FAQ؛ عدد الأصول محدود |
| U.S. Stock Options | خيارات على أسهم وETFs مدرجة في الولايات المتحدة؛ physical settlement؛ تنفيذ long-only Buy Call/Put؛ NTL introducing broker وAlpaca clearing broker | ليست سلسلة خيارات عالمية؛ التسوية قد تسلم أسهماً؛ أهلية Stock Options للسوريين غير مثبتة بصفحة Syria العامة وحدها لأن إعلان المنتج يقول إن التوفر الإقليمي قد يختلف؛ Stock Options API يعطي مرجع العقود فقط ولا يعطي option quotes/Greeks/IV في endpoints السوق الموثقة |

**أثر ذلك:** Binance مناسبة كبوابة تنفيذ متعددة الفئات ضمن منتجاتها المتاحة، لكنها لا تحقق مطلب «كل الخيارات العالمية». Crypto Options API هو أكثر خطوط Binance اكتمالاً للبيانات الحية؛ Stock Options يحتاج مزود بيانات أمريكياً منفصلاً إذا أردنا سلسلة سعرية/Greeks موثوقة؛ والسلع الحالية تقتصر على XAU/XAG. لا نعدّ وجود أسهم/سلع/أصول في صفحة الأسواق دليلاً على وجود Options لها.

### أهلية سوريا والمنصات البديلة

- Binance نشرت FAQ تقول صراحةً إن السوريين المقيمين في سوريا يستطيعون التسجيل والتحقق، وتذكر Options ضمن المنتجات المتاحة. هذه موافقة عامة على المنتج وقت النشر، وليست ضماناً لكل منتج فرعي أُطلق لاحقاً؛ Stock Options خصوصاً يتطلب التحقق من ظهوره وصلاحيته داخل حساب KYC الحقيقي أو جواب دعم مكتوب.
- Bybit وDeribit وOKX تذكر سوريا صراحةً ضمن المناطق المستبعدة/المقيدة. **Gate Global حالة مختلفة:** اتفاقيته الحالية لا تذكر سوريا في القائمة المنشورة لكنها تصفها بأنها غير حصرية، بينما اتفاقية أقدم تذكر سوريا؛ لذلك Gate Global مرشح استفسار مكتوب فقط، وليس منصة مقبولة أو محظورة مثبتة. Gate US كيان منفصل لا ينطبق على المقيم السوري. لا تستخدم VPN لتجاوز قيود أي منتج.
- قائمة IBKR الرسمية للبلدان المتاحة لا تتضمن سوريا وقت الفحص؛ لا نفترض إمكانية فتح حساب أو تداول Cboe/CME من خلالها.
- Paradex يذكر سوريا صراحة في Restricted Persons؛ لا يستخدم كبديل.
- Hyperliquid HIP-3 perpetuals وHIP-4 outcome markets ليست Vanilla Options مدرجة؛ لا نضعها في قائمة منصات الخيارات القياسية مهما كانت نتيجة الوصول الجغرافي.
- لا يوجد حتى هذا التاريخ وسيط تقليدي ثانٍ ثبت رسمياً أنه يقبل المقيم السوري لحساب ممول وخيارات بورصات متعددة الأصول. أي FCM/وسيط آخر يبقى inquiry-only حتى رد امتثال مكتوب.

### VPN — فصل الاتصال عن الهوية

يجوز استخدام VPN كوسيلة اتصال/خصوصية فقط إذا لم تمنع شروط المنصة ذلك، مع إبقاء بلد الإقامة وKYC ومصدر الأموال صحيحاً. لا نوصي باختيار بلد خروج بهدف تمويه الإقامة أو فتح منتج محظور. لا نستخدم VPN لإخفاء سوريا عن Binance أو أي جهة امتثال. إذا كان الوصول من الشبكة السورية متقطعاً، نسجل هذا كـconnectivity failure مستقل عن account eligibility أو product permission. لا تخزن API secrets في المتصفح أو المستودع؛ استخدم صلاحيات أقل وقيود IP عند دعمها، ومفتاح بيانات عام بلا صلاحية سحب/تحويل.

### Data API and pricing distinction

- Binance Crypto Options API يقدم سلسلة بيانات حية للعقود المدعومة، ويجب اكتشافها من exchangeInfo؛ Binance Stock Options API منفصل ويصف endpoints الخاصة بالسوق بأنها contract reference data فقط دون option prices/quotes/Greeks/IV.
- Massive Options Basic: مجاني، 5 طلبات/دقيقة وEOD ومرجع بيانات؛ Starter $29/month لتأخير 15 دقيقة، Advanced $199/month للحظي. غير مناسب لسقف 15$/month إلا المجاني EOD.
- MarketData.app Free: 100 API credits/day، سنة تاريخية، وتأخير خيارات لا يقل عن 24 ساعة؛ Starter يتطلب التزاماً سنوياً ويعطي 15-minute delayed options؛ لا نشترك حالياً.
- لا توجد تغطية مجانية موحدة للحظي عبر OPRA + CME + ICE + Eurex + OTC FX. لا نخلط data entitlement الشخصية مع حق إعادة توزيع البيانات داخل واجهة عامة؛ ترخيص إعادة التوزيع منفصل وقد يكون مكلفاً.

### الاختيار الهندسي المعتمد

1. **Live venue adapter الآن:** Binance Crypto Options (/eapi) كموصل حي أول، مع دعم Commodity وStock كـproduct adapters مستقلة فقط عندما تتوفر صلاحيات/بيانات فعلية.
2. **Canonical instrument model:** يحتفظ بـasset class، venue، underlying kind، contract multiplier/size، quote/settlement currency، exercise/settlement style، timezone، expiry، deliverables، fee/margin model، data entitlement، provenance، event/receive timestamps.
3. **Pricing:** لا تستخدم Black-Scholes تلقائياً لكل العقود. Crypto/commodity European vanilla يمكنه استخدام النموذج المناسب وفق convention/forward/rate/settlement؛ futures options تحتاج Black-76؛ American equity options تحتاج نموذجاً يأخذ early exercise/dividends/borrow بعين الاعتبار. إذا كانت المواصفات أو المدخلات ناقصة، اعرض Greeks/IV على أنها غير متاحة أو model-estimated بوضوح ولا تخلطها بقيم المصدر.
4. **Independent model QA:** QuantLib مرجع تسعير/Greeks واختبارات cross-check، وليس مزود بيانات.
5. **Backtest / replay candidate:** NautilusTrader مرشح أول لمحرك Python مع دعم OptionContract/CryptoOption/OptionSpread/OptionGreeks وParquet replay. يتطلب QuoteTick وOptionGreeks تاريخية؛ لا يجلبها تلقائياً. وثائقه تقول إن نموذج خياراته لا يحاكي L2 queue position، لذلك يجب عدم ادعاء محاكاة ترتيب الطابور أو تنفيذ واقعي كامل. يبقى خدمة بحث منفصلة ولا يُدمج في React frontend.
6. **No live automation yet:** لا نرسل أوامر حقيقية حتى يكتمل contract normalization، permissions، risk checks، idempotency، reconciliation، paper tests، وkill switch. الواجهة الحالية research/decision-support فقط.

### المراجع الرسمية الرئيسية
- Binance Syria eligibility: https://www.binance.com/en/support/faq/detail/863795c36a224bd7aa7d677996328ff9
- Binance Crypto Options overview: https://www.binance.com/en/support/faq/detail/374321c9317c473480243365298b8706
- Binance Crypto Options API: https://www.binance.com/en-AE/support/faq/detail/fe0be251ac014a8082e702f83d089e54
- Binance Stock Options FAQ: https://www.binance.com/en-IA/support/faq/detail/3dddc209bb564b448c0948fc4c5e6d80
- Binance Stock Options API: https://developers.binance.me/en/docs/products/stock-options/introduction
- Binance Commodity Options FAQ: https://www.binance.com/en-UZ/support/faq/detail/dc9e52b4440b48bd900a767cc5024c84
- IBKR available countries: https://www.interactivebrokers.com/en/accounts/open-account-country-list.php
- Massive options pricing: https://massive.com/options
- MarketData.app free-account limits: https://www.marketdata.app/docs/account/free-accounts/
- QuantLib: https://www.quantlib.org/
- NautilusTrader options: https://nautechsystems.github.io/nautilus_docs/latest/concepts/options/
- NautilusTrader backtesting: https://nautechsystems.github.io/nautilus_docs/latest/concepts/backtesting/

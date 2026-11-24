# مراجعة المنتج وخطة التطوير

**تاريخ المراجعة:** 23 نوفمبر 2026
**الحالة:** نموذج أولي تحليلي؛ ليس منصة تداول أو منتجاً تشغيلياً لاتخاذ قرارات مالية.

## تصحيح مهم — نطاق المستخدم وأهلية المنصات (24 نوفمبر 2026)

هذا التصحيح يعلو على أي استنتاج أقدم في هذه المراجعة عن أن Binance غير متاحة للمستخدم أو أن خياراتها غير متاحة للمقيم السوري.

المستخدم مقيم فعلياً في **سوريا**، وليس في المملكة المتحدة. قد يستخدم VPN للاتصال بالإنترنت فقط؛ لا يجوز استنتاج الإقامة أو الأهلية من بلد خروج الشبكة، ولا يُستخدم VPN لتجاوز شروط المنصات.

صفحة Binance الرسمية المخصصة للمقيمين السوريين (يونيو 2025) تقول إن السوريين المقيمين في سوريا يمكنهم التسجيل والتحقق وفق KYC والامتثال، وتدرج **Options trading** صراحةً ضمن المنتجات المتاحة. هذا يدعم أهلية خدمة الخيارات العامة، لكنه لا يحسم أهلية كل منتج أُطلق لاحقاً: Commodity/TradFi Options على XAU/XAG أُطلقت في يوليو 2026، أي بعد FAQ سوريا. لذلك يجب تأكيد تفعيل Crypto Options وCommodity Options كلٌ على حدة في الحساب السوري. Binance هي مرشح التنفيذ الأول المشروط، وليست منصة لكل أسواق الخيارات. ولا يُعد خطأ HTTP 451 من GitHub Actions دليلاً على منع المستخدم السوري أو منع Binance عالمياً.

المصادر:
- https://www.binance.com/en/support/faq/detail/863795c36a224bd7aa7d677996328ff9
- https://www.binance.com/en/blog/markets/7906742128714440461
- https://www.binance.com/en-UZ/support/faq/detail/dc9e52b4440b48bd900a767cc5024c84
- https://bin.bnbstatic.com/static/cms/cg08ou2ak0tn7mcplvfg/file/443bcc67fde7274898ff8e3f7af23c7d89e654c5e609d250772e0ddaa96409be.pdf

في المقابل، الشروط الرسمية التي تمت مراجعتها تدرج سوريا ضمن القيود لدى Deribit وBybit وOKX. وسوريا غير مدرجة في البلدان المتاحة لدى Interactive Brokers. لا يُنصح بفتح أو استخدام هذه المنصات من خلال تغيير IP أو معلومات الإقامة.

المصادر:
- https://support.deribit.com/hc/en-us/articles/25944487427741-Restricted-Jurisdictions
- https://www.bybit.com/en/help-center/article/Service-Restricted-Countries
- https://www.okx.com/en-gb/help/us-risk-and-compliance-disclosures
- https://www.interactivebrokers.com/en/accounts/open-account-country-list.php

**هل Binance تكفي؟** تكفي كبداية لشراء خيارات الكريبتو أحادية الرجل وبعض خيارات السلع التي تدرجها وتسمح بها حسابياً؛ لا توفر كامل نطاق خيارات الأسهم والمؤشرات والفائدة والعملات والطاقة والزراعة. كتابة Crypto Options متاحة حالياً لـBTC وETH فقط، وتتطلب هامشاً ويمكن تصفيتها؛ BNB/XRP/SOL/DOGE لا تدعم الكتابة حالياً. Commodity Options على XAU/XAG متاحة للتجزئة long-only. الحساب العادي لا يطبق Portfolio Margin أو Risk Netting بين أرجل الاستراتيجيات، والأوامر Limit فقط؛ لذلك لا نعتبر Binance مناسبة لاستراتيجيات متعددة الأرجل تعتمد على تعويض الهامش.

المصادر:
- https://www.binance.com/en-UZ/support/faq/detail/dc9e52b4440b48bd900a767cc5024c84
- https://www.binance.com/en/support/announcement/detail/e80dd709384244719e653c1e9d1541c2
- https://www.binance.com/en/support/faq/detail/1ceb77f837344e3085ecf98d9a6a8097

المسار التقليدي يحتاج وسيطاً/FCM يقبل المقيم السوري صراحةً. AMP Futures تستبعد سوريا في قائمتها الرسمية المصورة؛ أما Optimus Futures فهو مرشح للاستفسار فقط ولا يوجد قبول سوري مثبت حتى الآن. لا تعني قائمة CME أن الوسيط يقبل كل بلد أو أن CME تفتح حساباً مباشراً للأفراد.

التفاصيل والمصادر ومخطط التوسع في [PLATFORM_ELIGIBILITY_2026-11-24.md](PLATFORM_ELIGIBILITY_2026-11-24.md)، و[UNIVERSAL_OPTIONS_RESEARCH_2026-11-24.md](UNIVERSAL_OPTIONS_RESEARCH_2026-11-24.md)، و[AGENTS.md](../AGENTS.md).

---

## الخلاصة التنفيذية

الأساس جيد لمختبر شخصي: مصادر Demo وCSV وBinance منفصلة، اكتشاف عقود Binance ديناميكي، العرض للقراءة فقط، ولا توجد مفاتيح حساب أو واجهات أوامر. أكثر المخاطر أهمية قبل توسيع الاستخدام ليست نقص ميزات التداول، بل موثوقية الوصول إلى الوسيط العام، توحيد وقت/وحدة البيانات، والتحقق من لقطة Binance الحية داخل المتصفح. **لا ينبغي إضافة حساب أو تنفيذ تداول إلى هذا النطاق.**

## تشخيص Binance المؤكد وبحث هندسي محدث

فحص الإنتاج الأحدث في [التشغيل 45313729691](https://github.com/raawaa93/Sol/actions/runs/45313729691) وصل عبر وسيط Supabase إلى Binance، ثم أعاد `exchangeInfo` حالة HTTP 451 ورسالة تشير صراحة إلى `b. Eligibility` في شروط Binance. مشروع Supabase في `eu-west-1` والوظيفة بالإصدار 6 والخدمات الأساسية نشطة وسليمة؛ لذلك لا تدعم الأدلة فرضية خطأ CORS أو غياب مفتاح أو عطل في وسيطنا. السبب المباشر رفض أهلية/منطقة/منتج من Binance؛ تحديد الأهلية القانونية النهائية يتطلب مراجعة شروط Binance أو دعمها.

لا توجد معالجة برمجية مشروعة تضمن فتح هذا المصدر. تغيير عنوان الخروج أو تدوير النطاقات لإخفاء المنطقة سيكون التفافاً على قيد المصدر؛ لم نفعله. بدلاً من ذلك أضيف تصنيف خطأ HTTP 451 مخصص إلى العميل، ورسالة عربية تشرح أن الرفض upstream، ورابط لشروط الأهلية وخيار صريح للعودة إلى Demo. لا تُعرض بيانات المحاكاة على أنها Binance، ولا يُعاد تلقائياً استخدام سعر حي بديل أو دمج مصدر غير متوافق. حتى يرفع Binance الرفض أو يُعتمد مزود مرخص ومتاح، تبقى بيانات Binance الحية **غير متحققة**.

### ما استفدناه من مشاريع GitHub

- [CCXT error taxonomy](https://github.com/ccxt/ccxt/blob/master/ts/src/base/errors.ts) يفصل `RestrictedLocation` عن أخطاء الشبكة و`RateLimitExceeded`؛ طُبّق المبدأ هنا بتصنيف HTTP 451 كخطأ مصدر مستقل بدلاً من عرضه كـCORS/Network.
- [Binance official Options connector — error handling](https://github.com/binance/binance-connector-js/blob/master/clients/derivatives-trading-options/docs/rest-api/error-handling.md) و[retry configuration](https://github.com/binance/binance-connector-js/blob/master/clients/derivatives-trading-options/docs/rest-api/retries.md) يبرزان فصل فئات الأخطاء عن إعداد إعادة المحاولة والمهلة. لا ينبغي إعادة المحاولة العمياء لرفض أهلية؛ retries تفيد فقط الأخطاء المؤقتة وفق سياسة محدودة.
- [Hummingbot Binance order-book source](https://github.com/hummingbot/hummingbot/blob/master/hummingbot/connector/exchange/binance/binance_api_order_book_data_source.py) يستخدم لقطة REST وقنوات WebSocket منفصلة للتداولات وتغييرات دفتر الأوامر؛ النظام المتقدم يحتاج مزامنة snapshot/deltas واكتشاف فجوات التسلسل وإعادة التزامن، لا تكرار طلب REST وادعاء live streaming.
- [Hummingbot inventory-skew calculator](https://github.com/hummingbot/hummingbot/blob/master/hummingbot/strategy/pure_market_making/inventory_skew_calculator.pyx) و[market-making controllers](https://github.com/hummingbot/hummingbot/tree/master/controllers/market_making) يعرضان أن إدارة المخزون جزء من تصميم صانع السوق، لا مجرد وضع أوامر حول السعر.
- [NautilusTrader RiskEngine](https://github.com/nautechsystems/nautilus_trader/blob/develop/crates/risk/src/engine/mod.rs) يضع التحقق السابق للتداول، وحدود القيمة الاسمية، ومحددات معدل الأوامر في طبقة مخاطر مستقلة عن الاستراتيجية. استُخدمت هذه كمراجع تصميمية فقط؛ لم ننسخ شيفرتها أو نضف اعتماداً عليها.
- [NautilusTrader Deribit adapter](https://github.com/nautechsystems/nautilus_trader/blob/develop/crates/adapters/deribit/README.md) يذكر دعم بيانات حية/تاريخية للأوبشن عبر API v2؛ يمكن تقييمه كمرشح بيانات كريبتو فقط، لا كحل جاهز: يجب التحقق من أهلية الوصول في المملكة المتحدة وشروط إعادة عرض البيانات وتغطية العقد. لا يثبت ذلك أن Deribit متاح أو مناسب لهذا المستخدم، ولا يغطي أصول السلع.

### كيف تتحقق الإيرادات لدى المحترفين — بلا ضمان للربح

مصدر الإيراد قد يكون نشاط الشركة لا تداولها: اشتراكات التحليلات والبيانات المرخصة وواجهات API. أما دفاتر التداول الاحترافية فقد تحاول كسب فارق العرض/الطلب مع إدارة المخزون والتحوط، أو فروقاً نسبية/تحكماً بالأساس بين أسواق، أو علاوة تقلب/تداولاً اتجاهياً. المحصلة لا تساوي الربح الإجمالي: يجب خصم الرسوم والـrebates، والانزلاق والأثر السوقي، والتمويل والاقتراض، وخسائر adverse selection، والبيانات والبنية والتشغيل. لا يثبت أي مشروع مفتوح المصدر وجود ميزة قابلة للربح؛ لا توجد طريقة مضمونة أو توصية هنا.

قبل أي اختبار جاد نحتاج بيانات مرخصة متسقة حسب الأصل والعقد، أوقات مصدر منفصلة وحدود freshness، رسوم/وحدة عقد/تسوية صحيحة، سجل تاريخي للـbid/ask/IV/spot مع تجنب look-ahead، اختباراً خارج العينة وforward paper، قياس drawdown والسعة والحساسية، وحدود خسارة وتعرض/تركيز، وkill switch وتدقيقاً ومراقبة. نطاق الموقع الحالي تحليلي فقط ولا يرسل أوامر.

## ما راجعناه وحسّناه في هذه الجولة

- أزيل قيد BTC/ETH الثابت من مستورد CSV؛ يمكن الآن استيراد رموز أصول عامة مثل XAU ما دامت حقول العقد والسعر المرجعي صالحة.
- صار `daysToExpiry` في CSV يُحسب عند طابع الصف الزمني، وهو مهم للملفات التاريخية. إذا غاب الوقت أو كان غير صالح، يستخدم وقت الاستيراد كتقريب موسوم، مع تحذير، بدلاً من الإيحاء بأن القيمة تاريخية دقيقة. Binance يستخدم وقت خادم المنصة للحساب.
- كانت Bid/Ask في سلسلة العقود تُعرض بلا كسور، ما قد يحول علاوات صغيرة إلى صفر بصرياً. التنسيق صار يعتمد `priceScale` و`PRICE_FILTER.tickSize`، والكمية على `quantityScale` أو خطوة العقد؛ كما يحفظ دفتر PAPER دقة الكمية والسعر عند التسجيل.
- تكرار عقد CSV كان يضخّم المجاميع ويكرر نقاط الرسوم. بقيت الصفوف الأصلية في السلسلة مع التحذير، لكن ملخصات السوق والرسوم التجميعية تستخدم أحدث صف مؤرّخ لكل عقد؛ وفي حال غياب الوقت يُستخدم آخر صف.
- عند تقدير حجم تداول CSV، كان الحساب يستخدم سعر Spot رغم أن حجم الخيارات قيمة علاوة. صار التقدير من علاوة الخيار المرجعية × حجم العقود × وحدة العقد، مع دعم `volumeQuote` و`openInterestUsd` كمبالغ مباشرة وبيان ما إذا كانت مجاميع USD تقديرية.
- أضيفت حماية من صيغة جداول البيانات عند تصدير النصوص التي تبدأ بصيغ شائعة (`=`, `+`, `-`, `@`).
- حُدّثت GitHub Actions إلى الإصدارات الحالية التي تستخدم Node 24 للتخلص من تحذيرات runtime القديمة؛ إصدار Node المستخدم لبناء المشروع ما زال Node 22 كما هو.
- أُضيف حد معدل مشترك ذري للوسيط عبر PostgreSQL بحد 240 طلباً في الدقيقة لكل عنوان عميل، مع HMAC بدلاً من تخزين IP صريح، وفشل مغلق عند تعطل RPC. طُبّقت قيود الوصول على الجدول، ونُشرت الوظيفة بالإصدار 6؛ اختُبر عقد RPC محلياً ومع قاعدة البيانات.
- صحّح محلل IV حدود عدم المراجحة الأوروبية لتستخدم سعر التنفيذ المخصوم بمعدل الفائدة؛ قبل ذلك كان يرفض أحياناً أسعار Put أوروبية صحيحة عند الفائدة الموجبة، وقد يقبل أسعار Call مستحيلة. واستُبدل تقريب CDF منخفض الدقة بصيغة rational عالية الدقة لـ`erf`/`erfc` مع حفظ إشعار الترخيص. أُضيفت قيم مرجعية مستقلة لـCDF وBlack–Scholes لمدة سنة واختبارات خصائص للأسعار والـGreeks واستعادة IV وP&L وCSV.
- أُضيفت `fast-check` كاعتماد تطويري فقط. تختبر المجموعة 950 مدخلاً مولداً ببذرة ثابتة في كل تشغيل، بما في ذلك بقاء السعر والـGreeks ضمن حدود معقولة واستعادة التقلبات، لا تعتمد على أرقام Demo وحدها.
- فُصلت رسوم Recharts إلى وحدات lazy تُحمّل قرب ظهورها. بعد إضافة freshness وتحسين تجميع الرسوم من دون اعتماد runtime جديد، اجتازت الميزانية: JavaScript الأولية (entry + React) 80.19 KiB gzip من 100 KiB، ومجموع JavaScript 212.71 KiB من 240 KiB، وCSS ‏10.51 KiB من 14 KiB. تبقى أقل من السقوف المعتمدة؛ أحجام الحزم لا تثبت تحسناً ميدانياً ولا تُساوى بـCore Web Vitals.
- توسعت محاكاة Demo فعلياً من BTC/ETH إلى عشرة أصول، مع سلاسل Calls/Puts لأربعة آجال وتسعة strikes. ضُبطت خطوات Strike للأصول منخفضة السعر كي لا تتحول XRP/DOGE إلى عقود عند أسعار غير منطقية؛ كل القيم موسومة بوضوح كمصطنعة.
- أضيف مستكشف مرئي يقارن IV−RV عند وجود بيانات حقيقية متوافقة، وPut/Call skew قرب ±25Δ، وATM IV عبر الآجال. قائمة العقود تختار عروضاً ثنائية الجانب بحسب spread ثم OI/volume، ولا تعطي عائداً متوقعاً أو توصية شراء/بيع.
- شُددت جودة المدخلات للاختيار: IV30 وابتسامة/منحنى IV وskew تستبعد الحقول الموسومة كمقدرة، وكذلك مدة الانتهاء الموسومة عند بناء الرسوم والمقارنات؛ ولا تدخل Delta المشتقة في تفضيل قائمة المراجعة. إذا لم تتوفر حقول كافية تظهر الحالة كغير متاحة بدلاً من إدخال قيم نموذجية بصمت. علامة التقدير تكشف ما اشتقه التطبيق صراحةً فقط؛ غيابها لا يثبت حداثة الحقل أو توثيق المصدر أو صحة القيمة upstream. تُجمع أحدث صفوف العقود للرسوم ويُستخدم منطق ATM term structure الموحد، وحسابات OpportunityReview داخل `useMemo` لتفادي الحساب عند تغيّر حالة لا تمسّ عروض السوق.
- أضيف تتبع freshness قابل للاختبار: يجدول تحديثاً محلياً واحداً عند تجاوز لقطة Binance حد 60 ثانية، فيحوّل المؤشر إلى تحذير ويعرض تنبيهاً وزر تحديث يدوي، من دون rerender متكرر أو polling تلقائي. هذا حد محلي لوقت استلام التطبيق فقط؛ لا يثبت حداثة ticker أو mark أو OI upstream. تعرض الواجهة كذلك انحراف الساعة بدلاً من وسم لقطة مستقبلية على أنها حديثة.
- أضيف Rho إلى Black–Scholes وCSV وBinance normalization، بوحدة لكل نقطة مئوية من المعدل السنوي، مع لوحة Greeks تشمل تفسير الوحدات ومصدر/حالة كل قيمة وحساسية الكمية وصدمات محلية Δ+½Γ وVega وTheta وRho. Rho وGreeks المفقودة تقديرية؛ لا نستخدمها كحقائق منصة أو كبديل عن تحقق وحدات العقد.
- أضيفت اختبارات لانحراف 25Δ وبنية الأجل وترتيب العرضين، ودقة Rho وصدمات المركز وCSV. بعد اختبار تصنيف HTTP 451 كانت 64 حالة وحدة؛ أضافت الجولة السابقة اختبارين للـfreshness، وأضافت هذه الجولة خمسة اختبارات لاستبعاد الحقول الموسومة كتقديرية، وحماية المدخلات غير الصالحة، والحفاظ على طرفي قائمة المراجعة عند توفر Delta مقدّرة فقط. `npm test` الآن 71 اختباراً ناجحاً، مع استمرار 950 حالة `fast-check` مولّدة ببذرة ثابتة.

## المخاطر والفجوات المتبقية حسب الأولوية

### أولوية عالية قبل نشر أوسع

1. **وسيط Supabase عام وما زال يحتاج مراقبة للسعة والتكلفة.** الوظيفة تتعمد `verify_jwt=false` لأن الموقع ثابت ولا يتطلب دخولاً. CORS يقيّد المتصفحات، لكنه ليس مصادقة؛ يمكن استدعاء endpoint خارج المتصفح. أضيف حد مشترك ذري من PostgreSQL عبر `volterra_check_rate_limit`: 240 طلباً في الدقيقة لكل عنوان عميل، باستخدام HMAC لمعرف IP من رأس `cf-connecting-ip` من دون تخزين العنوان الصريح. لا توجد صلاحية مباشرة للأدوار العامة أو `service_role` على جدول العدّاد؛ ومن أدوار Data API، `service_role` وحده يستطيع تنفيذ دالة RPC. الوسيط يفشل مغلقاً بـ503 إذا فشل الحد المشترك. نُشرت الوظيفة بالإصدار 6 وطُبّقت هجرتا الجدول والقيود على مشروع Supabase المطابق. المتبقي: كل طلب، حتى cache hit، يستهلك RPC قاعدة بيانات؛ لم تُضف تنبيهات ميزانية أو حماية من هجوم موزع على مستوى إجمالي الخدمة، لذا نحتاج مراقبة الاستخدام والتكلفة، وقد يكون Redis/Upstash أنسب عند ارتفاع الحركة. لا تُضاف أسرار إلى الواجهة.
2. **Binance live data غير متاح ومقيّد حالياً.** فحص الإنتاج وصل إلى Binance لكنه تلقى HTTP 451 ورسالة `b. Eligibility`; لذلك لا يصح وصف الحالة كعطل شبكة أو بوعد ببيانات حية. أصبحت الحالة ظاهرة في الواجهة ويمكّن المستخدم من الرجوع صراحةً إلى Demo. فحص Playwright بمحاكاة HTTP 451 يختبر سلوك المنتج فقط، ولا يثبت أو يتجاوز أهلية المصدر. المتبقي: تأكيد الإتاحة مع Binance إذا كان المستخدم مؤهلاً، أو اختيار مزود بيانات مشتقات مرخص يوافق تغطيته وأهليته وسياسة إعادة العرض احتياج الأصول والبلد. لا نبدل بيانات المصدر ولا نستخدم مسارات خروج بديلة للتحايل.

### أولوية متوسطة لتحسين دقة التحليل

3. **لقطة REST غير ذرّية.** بيانات exchangeInfo وmark وticker وindex وopen interest قد تتحدث في أوقات مختلفة. أُضيف تحذير محلي عند تجاوز 60 ثانية منذ استلام التطبيق للقطة، لكنه لا يثبت أوقات تحديث الحقول upstream؛ ما زلنا نحتاج metadata موثقة لكل endpoint/حقل وحدود freshness منفصلة وتحذيراً على مستوى العقد عند توافر timestamps مناسبة.
4. **وحدات Greeks والتحقق المستقل.** تعرض الواجهة الآن Delta الوارد من Binance عند توفره، وتقدّر Gamma/Theta/Vega/Rho بنموذج Black–Scholes؛ أما CSV فيقبل قيم Greeks صريحة مع وحدة موثقة في القالب، ويحسب القيم الناقصة. تُعرض حالة المصدر لكل Greek ولا تُخلط التقديرات بقيم المصدر، لكن وحدات Greeks الخام ومضاعفات العقود ومعدل `riskFreeInterest` لم تُثبت بشكل مستقل لكل أصل/منصة. قبل اعتمادها على منتج حي، قارن عينات بعقد مرجعي ومحرك مستقل ولا تعتمد على إشارة آلية.
5. **المقياس النقدي للمجاميع يجب أن يبقى صريحاً.** يستخدم Binance `amount` كقيمة تداول بعملة التسعير و`volume` كعدد عقود؛ قيمة CSV المباشرة تتوقع USDT حسب القالب. إذا ظهرت عملة تسعير أخرى أو أصل بوحدة مختلفة، يجب إظهارها لا تحويلها بصمت.
6. **دقة النموذج والتكاليف.** Black–Scholes لا يلتقط قفزات السوق والتمويل والسيولة والتسعير السلعي، ورسوم Binance المنشورة لا تدخل تلقائياً في محاكاة الربح/الخسارة. يستعمل المحلل `riskFreeInterest` كما يرد ويعامله كمعدل سنوي عشري مركب باستمرار؛ يلزم تثبيت وحدة المصدر قبل تفسيره كمعدل موثوق. حد IV المستنتج الحالي 500%، وقد يرفض أسعاراً تتطلب تقلباً أعلى. يجب أيضاً فصل التكلفة المقدرة عن المؤكدة وعرض افتراضات الوحدة دائماً.

### أولوية لاحقة

7. **لا يوجد أرشيف أو backtest موثوق.** ذلك يحتاج حفظ عروض/طلبات وIV وSpot ووقت المصدر والرسوم تاريخياً، وضوابط تمنع تسرب المستقبل؛ لا ينبغي تسمية سيناريوهات الانتهاء الحالية backtest.
8. **اختبارات الواجهة الآلية.** Playwright يغطي حالياً Demo وتبديل الأصول وCSV ودفتر PAPER والتصدير ولقطة Binance المموهة وحالة HTTP 451 والهاتف وانتقال عمر اللقطة بساعة افتراضية. نجح تحقق PR في التشغيل [`45313029135`](https://github.com/raawaa93/Sol/actions/runs/45313029135)؛ هذه اختبارات واجهة بمصادر mock، وليست إثباتاً لتوفر Binance الحي؛ يلزم فحص يدوي فقط إذا أُتيح مصدر فعلي للمستخدم.
9. **الأداء الميداني.** سجل Lighthouse CI المحلي [`45313735588`](https://github.com/raawaa93/Sol/actions/runs/45313735588) وسيط 3 جولات: Performance 100، Accessibility 91، Best Practices 96، SEO 91، وFCP/LCP 756 ms، TBT 71 ms، CLS 0.000. أما فحص الموقع المنشور في [`45313729691`](https://github.com/raawaa93/Sol/actions/runs/45313729691) فسجل 99/91/96/100، وFCP/LCP 755 ms، TBT 102 ms، CLS 0.000. كلاهما قياس مختبري لا قياس ميداني دائم أو INP للمستخدمين الحقيقيين؛ ما زال ينقصنا RUM بموافقة وخصوصية مناسبة ومراقبة أجهزة/شبكات فعلية.
10. **تحمل بيانات المتصفح.** حد CSV البالغ 5 MiB مفروض قبل القراءة. ما يزال يلزم ترحيل مخطط `localStorage` عند تغييره، مع واجهة استعادة/تصدير للدفتر المحلي على المدى الطويل.

## الأدوات: القرار الحالي

- **`fast-check` — مفعّل الآن كاعتماد تطويري.** مناسب لتوليد حالات كثيرة قابلة لإعادة التشغيل واكتشاف حدود/تركيبات غير متوقعة في التسعير وIV وP&L وCSV. لا يدخل حزمة المتصفح.
- **Playwright — مفعّل في CI.** يغطي Demo وCSV وPAPER وBinance mock وHTTP 451 والهاتف؛ أضيف اختبار بساعة افتراضية يثبت انتقال لقطة REST من حديثة محلياً إلى قديمة بعد الحد، من دون اتصال سوق حي. لا يثبت الـmock أهلية Binance ولا حداثة حقوله الحقيقية.
- **Lighthouse CI + ميزانية الحزم — مفعّلان.** Lighthouse يقيس مسارات مختبرية، بينما `npm run perf:bundle` يفرض حدود gzip مستقلة؛ نستخدمهما معاً ولا نساوي نتائج المختبر بـCore Web Vitals الميدانية. لا نضيف محلل bundle آخر الآن، لأن الميزانية تعرض أحجام entry والـchunks المؤجلة بالفعل.
- **Chrome DevTools Performance/React Profiler — عند التحقيق فقط.** إذا ظهرت بطءات في جداول كبيرة أو rerender مكلف، خذ profile على عينة ممثلة قبل تعديل الـmemoization؛ لا نضيف مكتبة runtime أو تحسينا بلا قياس.
- **`web-vitals` — مرشح RUM لاحق لا مفعّل.** مفيد لقياس تجربة المستخدم الميدانية، لكنه يحتاج موافقة/خصوصية مناسبة ونقطة استقبال first-party ومراجعة سياسة البيانات؛ لن نرسل تحليلات إلى طرف ثالث الآن.
- **QuantLib — مرجع اختبار مستقل فقط، لا اعتماد متصفح.** قارن لاحقاً أسعاراً وGreeks عيّنية بمحرك تحليلي مرجعي، مع اختبار وحدات ومعدلات متوافقة. لم يُدمج QuantLib في التطبيق أو يُستخدم لإنتاج بيانات السوق.

## ترتيب التنفيذ المقترح

1. اختيار مزود بيانات خيارات مرخّص ومتاح قانونياً للمستخدم، بعد التحقق من تغطيته لكل مجموعة أصول ومن صلاحيات العرض/التخزين. Binance لا يعود مصدراً متحققاً إلا بعد رفع الرفض رسمياً؛ لا تغيير لموقع الخروج للتحايل.
2. إضافة طبقة provider adapters ومخطط provenance موحد: venue/endpoint/وقت المصدر/وقت الاستلام/عملة التسعير/مضاعف العقد، مع سياسة stale وقياسات latency/error/availability لكل مصدر.
3. مراقبة كلفة RPC والحد المشترك، ووضع ميزانية وتنبيهات إجمالية؛ إذا زاد الحمل ننقل عدادات المعدل إلى مخزن ملائم ونضيف قيوداً إجمالية موثقة.
4. قبل أي backtest: ترخيص تاريخ bid/ask/IV/spot والرسوم، replay زمني واختبار خارج العينة/forward paper، ثم اختبار Greeks/الوحدات بمحرك مستقل وحدود تعرض وخسارة وسجلات تدقيق. لا نضيف تنفيذ أوامر إلى هذا المنتج.

## مراجع منهجية وتحليل خيارات

- [Options Industry Council — Understanding the Options Greeks](https://www.optionseducation.org/advancedconcepts/understanding-options-greeks): Greeks حساسية نظرية محلية وليست تغيرات سعر دقيقة مضمونة.
- [Cboe — Hanweck Options Analytics Content Overview](https://cdn.cboe.com/resources/indices/documents/Cboe_Hanweck_Options_Analytics-Content_Overview-v1.5.pdf): تحليلات السوق تشمل IV وGreeks ومدخلات السعر والتمويل وبنية التقلب.
- [CME — Strike-level Greeks and volatility trading](https://www.cmegroup.com/articles/2025/unlocking-volatility-trading-with-strike-level-greeks.html): مقارنة Greeks وIV عبر strikes والاستحقاقات.
- [CME — Precision risk management starts with quality Greeks](https://www.cmegroup.com/articles/2025/precision-risk-management-starts-with-quality-greeks.html): أهمية السيناريوهات وجودة بيانات Greeks في إدارة المخاطر.

## مراجع رسمية

- [Binance Options REST API — Market Data](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-options/api/rest-api/market-data): Exchange Information، Mark Price، Ticker، Index وOpen Interest.
- [Binance Options — Option Mark Price](https://developers.binance.com/docs/derivatives/options-trading/market-data/Option-Mark-Price): حقول Greeks المتاحة في نقطة Mark.
- [Binance Options — 24hr Ticker](https://developers.binance.com/docs/derivatives/option/market-data/24hr-Ticker-Price-Change-Statistics): يعرّف volume كعقود وamount كقيمة بعملة التسعير.
- [Supabase — Rate Limiting Edge Functions](https://supabase.com/docs/guides/functions/examples/rate-limiting): استخدام مخزن مشترك مثل Redis/Upstash للحد المشترك.
- [Supabase — Edge Functions Architecture](https://supabase.com/docs/guides/functions/architecture): بيئة تنفيذ موزعة؛ الحالة المحلية للعامل ليست مخزناً مشتركاً.
- [Supabase — Log field reference](https://supabase.com/docs/guides/observability/log-field-reference): يعرّف `cf-connecting-ip` ضمن حقول الطلب المسجلة؛ لا نستخدم `x-forwarded-for` أو `x-real-ip` كبدائل قابلة للتزوير.
- [Supabase — Securing your API](https://supabase.com/docs/guides/api/securing-your-api): مرجع grants وRLS والتحكم بصلاحيات الجداول والدوال.
- [Playwright documentation](https://playwright.dev/docs/intro): اختبارات E2E للمتصفحات.
- [fast-check documentation](https://fast-check.dev/docs/introduction/): اختبار الخصائص والحالات المولّدة.
- [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) و[Core Web Vitals](https://web.dev/articles/vitals): قياس الأداء والميزانيات بعد baseline.
- [GoogleChrome/web-vitals](https://github.com/GoogleChrome/web-vitals): مكتبة قياس RUM مرشحة؛ لم تُفعّل لغياب موافقة/مسار استقبال ميداني معتمد.
- [QuantLib — vanilla option pricing engines](https://www.quantlib.org/reference/group__vanillaengines.html): محرك مرجعي مستقل للتحقق، لا اعتماد إنتاجي للمتصفح.


## تحديث أهلية المنصات — 24 نوفمبر 2026

استكمالاً للمراجعة، Gate غير متاح للمقيم السوري لأن اتفاقية المستخدم الحالية تذكر سوريا صراحة ضمن البلدان المحظورة. Paradex يذكر سوريا صراحة في صفحة Restricted Persons ويمنع VPN لتجاوز القيود. Hyperliquid لديه قيود عقوبات/تصدير، واختبار طرف ثالث في أكتوبر 2026 وثّق بوابة تداول تمنع سوريا؛ كما أن HIP-4 outcome markets ليست Vanilla Options. Bitget العام يقبل السوريين، لكن Stock+ منتج حساب أوراق مالية منفصل وقد أدرجت تغطية الإطلاق سوريا ضمن المستثنيات. Aevo مدرج في تحليل شروط مستقل على أنه يقيد سوريا، دون إثبات استثناء رسمي. Deriv Vanilla/Digital/Accumulator منتجات وسيط ذات تسعير وشروط مختلفة وليست بديلًا مكافئاً لخيارات البورصات القياسية؛ قبول سوريا غير مثبت.

**القرار:** لا توجد حتى الآن منصة ثانية ثبت قبولها للمستخدم السوري لتداول الخيارات القياسية متعددة الأصول. Binance هي المرشح الأول المشروط فقط بسبب FAQ سوريا الرسمي، ولا تُعتبر كافية لتغطية جميع أسواق الخيارات. Optimus وIronbeam استفسار امتثال مكتوب فقط. لا يُستخدم VPN لتغيير بلد الإقامة أو تجاوز الحظر.

المصادر التفصيلية في [UNIVERSAL_OPTIONS_RESEARCH_2026-11-24.md](UNIVERSAL_OPTIONS_RESEARCH_2026-11-24.md) و[PLATFORM_ELIGIBILITY_2026-11-24.md](PLATFORM_ELIGIBILITY_2026-11-24.md).

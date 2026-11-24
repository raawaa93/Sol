# بحث الخيارات والاستراتيجيات المؤسسية وقراءة تحركات كبار المستثمرين

**التاريخ:** 24 نوفمبر 2026  
**النطاق:** بحث وتصميم منتج Sol؛ لا يمثل توصية تداول أو اعتماداً لاستراتيجية بعينها.  
**القرار:** بناء محرك بحث وتحليل استراتيجيات الخيارات والمؤسسات كجزء من Sol، مع إبقاء التطبيق decision-support فقط ومنع تنفيذ الصفقات.

## 1. الخلاصة التنفيذية

لا ينبغي أن يتحول Sol إلى شاشة تعرض إشارات مثل "الحيتان اشترت Call" أو "الصناديق تشتري السهم" ثم تستنتج شراءً تلقائياً. هذه البيانات متأخرة أو جزئية أو ملتبسة في كثير من الأحيان:

- تدفق الخيارات يصف صفقة أو طباعة، وليس بالضرورة المركز الكامل للمتداول أو اتجاه محفظته.
- بيانات 13F ربع سنوية وقد تصل بعد نهاية الربع بما يصل إلى 45 يوماً؛ هي أثر تاريخي لا تدفق حي.
- بيانات CFTC COT أسبوعية: مركز الثلاثاء ينشر عادة يوم الجمعة، وتصنيف فئة المتداول لا يشرح غرض الصفقة.
- بيانات Open Interest لا تكشف وحدها هل المراكز Long أم Short، ولا من فتحها أو أغلقها.
- تقديرات Dealer Gamma / GEX ليست دفتر مراكز فعلياً منشوراً؛ هي نماذج مبنية على افتراضات حول توزيع المراكز.

**القرار المعماري:** بناء نظام Evidence Convergence يضع كل دليل في سياقه الزمني والاقتصادي، ويعرض نقاط الاتفاق والاختلاف بدلاً من إخفائها داخل "درجة ذكاء" واحدة.

## 2. ما الذي نتعلمه من المستثمرين ومديري الأموال المعروفين؟

لا ننسخ محافظ أو أسماء أو صفقات أشخاص؛ نستخرج مبادئ قابلة للاختبار ونحولها إلى أدوات.

| المدرسة / المستثمر | المبدأ الذي يستحق التحويل إلى Sol | ما يجب ألا يتحول إليه |
|---|---|---|
| Benjamin Graham / Warren Buffett | هامش الأمان، قيمة الأعمال، جودة التدفقات النقدية، حدود دائرة الكفاءة، تكلفة الفرصة | تقدير قيمة مستقبلية بنقطة واحدة أو تقليد محفظة Berkshire |
| Charlie Munger | التفكير متعدد النماذج، عكس السؤال، تجنب الأخطاء الكبيرة، الحوافز | اقتباسات تحفيزية بدلاً من تحليل |
| Peter Lynch | فهم محركات نمو الشركة، ربط القصة بالأرقام، فصل النمو الحقيقي عن التوقعات | تصنيف "شركة نمو" دون فحص السعر والتقييم |
| Stanley Druckenmiller | الجمع بين التحليل الكلي والجزئي، مراقبة تغيرات السيولة والسياسة، عدم التمسك برأي خاطئ | استنتاج مراكز سرية أو تقليد توقيت صفقاته |
| George Soros | الانعكاسية: كيف تؤثر التوقعات والتمويل والسلوك في الأساسيات ثم تعود فتؤثر في السعر | اعتبار كل حركة سعرية انعكاسية أو قابلة للتنبؤ |
| Ray Dalio / Bridgewater | موازنة المخاطر بين بيئات النمو والتضخم، فصل مصادر العائد، تحليل مساهمة المخاطر | اعتبار Risk Parity آمناً تلقائياً؛ الرافعة قد تضخم الخسائر |
| AQR / Cliff Asness | عوامل القيمة والزخم والحمل والدفاعية عبر الأصول، مع اختبارات خارج العينة | توقيت العوامل بناءً على تاريخ قصير أو الإفراط في الملاءمة |
| CTA / Managed Futures | الزخم الزمني متعدد الأسواق والأطر، تنويع مصادر الاتجاه، استهداف التقلب | افتراض أن الاتجاه يعمل في كل سوق وكل أفق؛ تكاليف التداول والـwhipsaw مهمة |

مصادر أصلية/بحثية:
- [Berkshire Hathaway — 1992 Chairman's Letter](https://www.berkshirehathaway.com/letters/1992.html): هامش الأمان ودائرة الكفاءة.
- [Berkshire Hathaway — 1996 Chairman's Letter](https://www.berkshirehathaway.com/letters/1996.html): الاستثمار طويل الأجل وحدود المعرفة.
- [Bridgewater — All Weather story](https://www.bridgewater.com/resources/all-weather-story.pdf): موازنة المخاطر عبر بيئات اقتصادية مختلفة.
- [AQR — Investing with Style](https://www.aqr.com/Insights/Research/Journal-Article/Investing-With-Style): Value, Momentum, Carry, Defensive.
- [AQR — A Century of Evidence](https://www.aqr.com/insights/research/journal-article/how-do-factor-premia-vary-over-time): دليل تاريخي واسع، مع انخفاض ملحوظ في تقدير العلاوات خارج العينة مقارنة بالتقديرات داخل العينة.
- [Man Group — Crisis Alpha](https://www.man.com/insights/trend-following-equity-and-bond-crisis-alpha): دور الاتجاه في تنويع مخاطر الأسهم والسندات.
- [Hurst, Ooi & Pedersen — Demystifying Managed Futures](https://people.stern.nyu.edu/lpederse/papers/DemystifyingManagedFutures.pdf): علاقة عوائد CTA بالزخم الزمني ومحددات التنفيذ.

**ترجمة هذه المدارس إلى المنتج:** كل تقرير استثماري يتضمن جودة الأصل، التقييم، الزخم، البيئة الكلية، مصادر العائد، مخاطر الذيل، السيولة، والبدائل. لا يوجد نموذج واحد يهيمن على القرار.

## 3. تصنيف استراتيجيات الخيارات التي ينبغي أن يدعمها Sol

### A. استراتيجيات الاتجاه Directional
- Long Call / Long Put.
- Call Debit Spread / Put Debit Spread.
- Bull Call / Bear Put.
- Diagonal وCalendar عند وجود فرضية واضحة عن المسار أو الزمن/التقلب.

**المطلوب:** اتجاه الأصل، الأفق، نقطة التعادل، أقصى خسارة، الحساسية للتقلب والزمن، السيولة، وتكلفة الدخول والخروج.

### B. استراتيجيات الدخل والبيع Short Volatility / Yield
- Covered Call.
- Cash-Secured Put.
- Put Write.
- Credit Spreads.
- Iron Condor / Iron Butterfly.
- Short Strangle / Short Straddle.

**المطلوب:** العائد المحتمل لا يكفي؛ يجب إظهار خسارة الذيل، متطلبات الهامش، مخاطر الفجوات، التخصيص المبكر، التصفية، تكلفة التحوط، والتعرض المتزامن للمحفظة. لا تصف هذه الاستراتيجيات بأنها دخل آمن أو عائد ثابت.

### C. استراتيجيات التقلب Long Volatility
- Long Straddle / Long Strangle.
- Call/Put Backspread.
- Long Gamma / Delta-Hedged Volatility.
- Calendar Volatility Trades.

**المطلوب:** مقارنة التقلب الضمني بتوقع للتقلب المحقق، وليس مقارنة IV بتاريخ RV فقط؛ تحليل أثر المسار، إعادة التحوط، spread، theta bleed، والـvolatility surface.

### D. القيمة النسبية Relative Value
- Calendar / Diagonal Spreads.
- Skew / Risk Reversal / Vertical Relative Value.
- Term-Structure Trades.
- Dispersion / Correlation.
- Variance-Risk-Premium Research.

هذه الفئة تحتاج بيانات متزامنة لعقود متعددة، معايرة سطح التقلب، قياس الارتباط، تكلفة تنفيذ الأرجل، واختبارات استقرار العلاقة.

### E. التحوط Portfolio Hedging
- Protective Put.
- Put Spread.
- Collar.
- Put-Spread Collar.
- Index/Futures Overlay عندما تكون بيانات التحوط وشروطه متاحة.

يجب أن يقيس Sol تكلفة الحماية، الخسارة المتبقية، حماية السيناريوهات، ومدى تغير مخاطر المحفظة بعد التحوط.

### F. صانع السوق Market Making / Gamma Scalping
- Delta Hedging.
- Gamma Scalping.
- Inventory Skew.
- إدارة Vega وVanna وCharm وCross-Gamma.

هذه أدوات مهنية مرتبطة بإدارة دفتر مراكز ومخزون وتحوط متكرر. لا ينبغي تقديمها كاستراتيجية تجزئة سهلة أو تحويلها إلى توصيات دون بيانات لحظية وتنفيذ فعلي وتكلفة تحوط موثقة.

### G. الأحداث والنتائج Event-Driven / Earnings
- Earnings Volatility / IV Crush.
- Event Calendars.
- Expected Move مقابل النتائج الفعلية.
- Merger / Regulatory / Macro Event Volatility.

يحتاج هذا إلى سجل أحداث مؤرخ، تقلب قبل الحدث وبعده، تغير السطح، وفصل النتائج المتوقعة عن الفعلية.

### H. استراتيجيات 0DTE
تحتاج بيانات داخل اليوم، مزامنة الأسعار، عمق دفتر الأوامر، محاكاة تعبئة واقعية، ومراقبة Gamma/hedging. تُعامل كمسار بحث متخصص منخفض الأولوية، ولا تدخل في توصيات المستخدم العامة قبل توفر بيانات point-in-time واختبارات تنفيذ واقعية.

## 4. ما الذي تقوله الأدلة عن تدفق الخيارات و"الحيتان"؟

### 4.1 Unusual Options Flow

سجل Benzinga الذي تمت مراجعته يحتوي على العقد والرمز والسعر والتنفيذ مقارنة بالـBid/Ask، وحجم العقود والتكلفة الإجمالية، ونوع Sweep / Block / Large / Unusual، وتصنيف المزود Bullish / Bearish / Neutral، وOpen Interest وVolume وقت السجل.

هذا مفيد كدليل أولي، لا كإشارة شراء. يجب ألا يساوي Sol بين شراء Call وبين رهان صعود صافٍ؛ قد تكون الصفقة تحوطاً، جزءاً من Spread، إغلاقاً لمركز قديم أو جزءاً من محفظة أكبر.

دراسة Fahlenbrach وSandås في سوق خيارات FTSE-100 وجدت أن تدفق الاستراتيجيات الحساسة للتقلب يحمل بعض المعلومات عن التقلب المحقق اللاحق، لكنها لم تجد دليلاً مماثلاً على أن التدفق الاتجاهي يتنبأ بعوائد الأصل؛ كما ربطت جزءاً من التداول الاتجاهي بملاحقة الاتجاه بعد تحرك السعر.
- [Does information drive trading in option strategies?](https://www.sciencedirect.com/science/article/pii/S037842661000097X)

### 4.2 Institutional 13F

يمكن استخدام SEC 13F لاكتشاف المراكز الجديدة أو الزيادات/التخفيضات، وتركيز المحفظة، وبعض مراكز Put/Call المبلّغ عنها، وتغيرات المالك المؤسسي عبر الأرباع.

لكنها ليست بيانات لحظية. لا تمثل بالضرورة كامل المحفظة، ولا تكشف كل التحوطات أو المراكز القصيرة، وقد تتأخر حتى 45 يوماً بعد نهاية الربع. يجب أن تظهر **تاريخ نهاية الربع وتاريخ الإيداع** جنباً إلى جنب.

### 4.3 Insider Transactions

تمييز جوهري بين:
- شراء مفتوح من السوق بأموال الشخص.
- بيع مفتوح من السوق.
- Exercise / Grant / Vesting / Tax Withholding.
- تحويلات أو تغييرات ملكية لا تعادل شراءً أو بيعاً اقتصادياً.

لا تُحسب عمليات التمرين أو الاستحقاق تلقائياً كإشارة اتجاهية.

### 4.4 CFTC COT

COT يوفر تمركز فئات مثل Managed Money وDealer وAsset Manager في أسواق العقود الآجلة والخيارات على العقود الآجلة. لكنه:
- أسبوعي، مبني على مراكز الثلاثاء وينشر عادة الجمعة.
- لا يحدد سبب الصفقة.
- يعتمد تصنيف الفئة على نشاط المتداول المبلغ عنه، وليس على نية كل عقد منفرد.
- قد تتغير المقارنات الأسبوعية بسبب دخول/خروج متداولين أو إعادة تصنيفهم.

إذن يستخدم لاكتشاف الازدحام والتطرف النسبي ومخاطر الانعكاس، لا لمعرفة "ما يفعله شخص بعينه".
- [CFTC COT Reports](https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm)
- [CFTC Release Schedule](https://www.cftc.gov/MarketReports/CommitmentsofTraders/ReleaseSchedule/index.htm)

### 4.5 Dealer Gamma / GEX وMax Pain

- GEX تقدير مبني على Open Interest وGreeks وافتراضات حول الجهة التي تحمل المراكز؛ لا توجد لدينا قاعدة بيانات منشورة مؤكدة لدفتر صانع السوق الكامل.
- يجب عرض الافتراضات والحساسية، لا تقديم رقم GEX كحقيقة مباشرة.
- Max Pain وPCR وتغير OI لا ينبغي أن تكون إشارات مستقلة؛ يلزم اختبار خارج العينة وإثبات أن الإشارة تضيف معلومات بعد التحكم في الاتجاه والتقلب والسيولة.

## 5. طبقة الإشارات المقترحة: Evidence Convergence

بدلاً من "Smart Money Score" واحد، نعرض بطاقات أدلة مستقلة:

| الدليل | ما يقيسه | الزمن | الحد الرئيسي |
|---|---|---|---|
| Options Flow | صفقات كبيرة وتوقيت التنفيذ وموقعه من السبريد | لحظي/حسب المزود | قد يكون تحوطاً أو جزءاً من استراتيجية متعددة الأرجل |
| Open Interest | العقود المفتوحة | لقطة/تحديث المصدر | لا يحدد Long مقابل Short |
| IV Surface | السعر النسبي للتقلب حسب Strike/Expiry | لقطة متزامنة | حساس لرداءة الأسعار والاقتباسات غير السائلة |
| IV vs Forecast RV | علاوة/خصم التقلب المتوقع | حسب نموذج التوقع | خطأ التوقع قد يبتلع الإشارة |
| Dealer Gamma Proxy | حساسية السوق المقدرة للتحوط | لقطة/نموذج | لا يساوي دفتر صانع السوق الحقيقي |
| COT | تمركز فئات المتداولين | أسبوعي ومتأخر | لا يكشف نية المتداول أو كل مراكز OTC |
| 13F | حيازات المؤسسات المعلنة | ربع سنوي ومتأخر | لا يمثل كامل المحفظة ولا توقيت الصفقة |
| Insider Open-Market Trades | شراء/بيع المطلعين المبلغ عنه | بعد الإيداع | يجب فصل المعاملات الآلية وغير السوقية |
| Fundamentals | جودة الشركة وتقييمها | ربع سنوي/سنوي | تأخر الإفصاح وإعادة التصنيف |
| Events & News | محفزات ومخاطر جديدة | حسب النشر | الخبر لا يحدد وحده أثر السعر |

**مخرجات Sol:** ما الذي يتفق؟ ما الذي يتعارض؟ ما مدى حداثة كل دليل؟ ما الذي لا نعرفه؟ ما الذي سيبطل الفرضية؟ لا يتم تحويل الاتفاق إلى احتمال رقمي إلا بعد معايرة تاريخية على بيانات مؤرخة.

## 6. مشاريع GitHub: ما الذي يستحق الدراسة أو الاستخدام؟

| المشروع | ما وجدناه | القرار |
|---|---|---|
| [QuantLib](https://github.com/lballabio/QuantLib) | مكتبة C++ واسعة للتسعير، المنحنيات، التقويمات والمشتقات؛ نشاط مستودع مرتفع جداً في 24 نوفمبر 2026. واجهة GitHub API لم تُظهر SPDX license مؤكداً في هذه المراجعة. | مرجع تحقق مستقل وحسابات متقدمة لاحقاً؛ لا ندمجها مباشرة في React/Pages. تحقق من الترخيص والربط قبل الاعتماد. |
| [py_vollib](https://github.com/vollib/py_vollib) | MIT؛ تسعير Greeks وIV، لكن آخر دفع ظاهر في API كان مايو 2026. | مرجع اختبار/مقارنة، لا أساس الإنتاج الوحيد. |
| [Riskfolio-Lib](https://github.com/dcajasn/Riskfolio-Lib) | BSD-3-Clause؛ تخصيص محافظ ومقاييس مخاطر. | مرشح خدمة تحليل اختيارية للمحافظ، لا dependency للواجهة. |
| [PyPortfolioOpt](https://github.com/PyPortfolio/PyPortfolioOpt) | MIT؛ تحسين المحافظ وBlack-Litterman وHRP. | مرشح تخصيص الأصول بعد بناء مدخلات العوائد والارتباط وعدم اليقين. |
| [VectorBT](https://github.com/polakowo/vectorbt) | مستودع نشط، لكن GitHub API لم يثبت SPDX license. | لا نعيد استخدامه قبل حسم الترخيص والفرق بين المجتمع وPRO. |
| [Scott-Switzer/options-backtester](https://github.com/Scott-Switzer/options-backtester) | MIT؛ 28 اختباراً وفق README، ثمانية نماذج، Greeks، IV، backtest، bid/ask والعمولات؛ البيانات الصناعية موسومة Synthetic، والنموذج محدود بخيارات أوروبية بلا توزيعات. | مرجع جيد لبناء fixtures ومقارنة النتائج؛ ليس backtester عاماً أو بيانات تاريخية حقيقية. |
| [anthonymakarewicz/volatility-trading](https://github.com/anthonymakarewicz/volatility-trading) | MIT، pipeline موثق لبيانات الخيارات وفحص الجودة والسطح والتوقع والاختبار مع bid/ask/slippage/fees؛ يدعم ORATS ويصف المشروع بأنه alpha 0.7.x. | دراسة هندسية ممتازة، لكن لا نعتمد ORATS أو أي مصدر مدفوع ضمن الميزانية دون موافقة. |
| [rixiong27/Volatility-Surface](https://github.com/rixiong27/Volatility-Surface) | SVI وBlack-76 وput-call parity وفحوص arbitrage؛ README يذكر yfinance وتأخر البيانات. لم يظهر ترخيص واضح أو نشاط إصدار قوي. | دراسة طريقة المعايرة فقط؛ لا ننسخ الشيفرة قبل الترخيص والمراجعة. |
| [NeuroTechh/OpenQuant](https://github.com/NeuroTechh/OpenQuant) | نموذج NIFTY يجمع FastAPI وNext.js وRedis وLLM، لكن نشاط/انتشار المستودع محدود ولم يظهر ترخيص في API. | لا ندمج؛ يمكن مراجعة تنظيم الواجهة والأفكار فقط. |
| [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents) | Apache-2.0 واهتمام مجتمعي كبير؛ README الحالي يطلب Tauric API key أو مفاتيح مزودات النماذج، ويقدم workflow لأبحاث التداول. | ندرس تقسيم الأدوار والتوثيق؛ لا نستورد منظومة التداول أو نفترض أن تشغيلها مجاني. |

ملاحظة: عدد النجوم ليس معيار جودة. الترخيص، الاختبارات، البيانات، نشاط الصيانة، الاعتماديات، ونطاق صلاحية الاستخدام أهم.

## 7. اكتشاف مزودي بيانات ومهارات داخل Firecrawl

فحص دليل Alexandria المتصل كشف مصادر عملية أكثر مما ظهر في نتائج البحث العامة:

### مصادر أولية ومفتوحة أو عامة
- **SEC EDGAR:** ملفات 10-K/10-Q/8-K، XBRL، 13F، Form 4، و13D/13G. أفضل طبقة إثبات للأسهم الأمريكية.
- **CFTC COT:** فئات المتداولين في العقود الآجلة، مع تاريخ أسبوعي طويل.
- **FRED / FRED CSV:** بيانات اقتصادية؛ بعض المسارات keyless، لكن CSV العام يعرض الـvintage الحالي ولا يتيح تاريخ النسخ القديمة في هذا المسار.
- **ECB / Bank of Canada / Federal Reserve / BLS / BEA / IMF / World Bank:** مؤشرات كلية ومعدلات وأسعار وتوظيف وإنتاج.
- **CME public data:** مواصفات العقود وتسويات وحجم/مراكز مفتوحة متأخرة؛ ليست بديلاً عن بيانات تنفيذ لحظية مرخصة.
- **EIA:** بيانات الطاقة والمخزونات.
- **Coinbase Exchange / Hyperliquid / DeFiLlama:** بيانات سوق عامة للكريبتو وDeFi؛ ليست مصدراً شاملاً لعقود الخيارات المدرجة.

### مصادر قد تكون مدفوعة أو مقيدة بالشروط
- **Benzinga:** unusual options activity، أخبار، تقييمات المحللين؛ لا نفترض مجانية إعادة الاستخدام أو الترخيص العام.
- **Fiscal.ai:** بيانات مالية موحدة، ملكية، معاملات المطلعين، نصوص مكالمات الأرباح، ورسائل صناديق الاستثمار. مفيد جداً للبحث المؤسسي لكن يجب التحقق من تكلفة الخطة وحقوق البيانات.
- **CME/Cboe/ORATS ومزودو الخيارات التاريخية:** مصادر متقدمة محتملة، لكن لا نشتريها ضمن سقف الإنفاق الحالي.

### مهارات Firecrawl القابلة لإعادة الاستخدام
- **smart-money-convergence:** مقارنة 13F مع شراء المطلعين ورسائل الصناديق وتغيرات المحللين.
- **crowded-commodity-positioning-check:** COT + منحنى العقود + الحجم + الأحداث القادمة.
- **earnings-preview-pack:** KPIs + وعود الإدارة + توقعات السوق + تدفق الخيارات.
- **short-seller-report-triage:** اختبار ادعاءات تقارير البيع على المكشوف مقابل الإفصاحات والمعاملات والدعاوى.
- **economic-release-revision-check:** مقارنة الإصدار الأول بالبيانات المعدلة وقياس أثر المراجعات.
- **weekly-crude-balance-and-positioning:** مخزونات النفط + السعر + المنحنى + تمركز Managed Money.
- **guidance-hit-rate-scorecard:** قياس مدى موثوقية توجيهات الإدارة عبر الأرباع.
- **fomc-odds-cross-check:** مقارنة FedWatch وتوقعات السوق وخطاب الاحتياطي الفيدرالي والبيانات.

هذه ليست "مهارات خيارات كاملة" جاهزة؛ بعضها يعتمد على بيانات أو مزودين لا نعرف تكلفة الوصول إليهم بعد. نستخدمها كإجراءات قابلة للتدقيق، لا كوعود بتغطية مجانية.

## 8. ما الذي نوصي ببنائه داخل Sol؟

### 8.1 Strategy Registry
لكل استراتيجية سجل موحد:
- الفرضية والميزة الاقتصادية المفترضة.
- الأسواق والأدوات المسموح بها.
- بيئة السوق التي يُفترض أن تعمل فيها.
- شروط الدخول والخروج وإعادة التوازن.
- الأرجل، الكميات، المضاعفات، التمرين، التسوية، وتوقيت الانتهاء.
- payoff عند الانتهاء، P&L خلال المسار، Greeks، ومخاطر المحفظة.
- أقصى خسارة نظرية/عملية، هامش، سيولة، تكاليف، مخاطر فجوات وتخصيص.
- متطلبات البيانات التاريخية وجودتها.
- الأدلة المنشورة، نتائج الاختبارات، خارج العينة، وفترات الفشل.
- الحالات التي يجب فيها الامتناع عن إعطاء توصية.

### 8.2 Options Research Engine
أولوية التطوير:
1. فحص quote quality: bid/ask، crossed/locked، العمر، حجم السوق، السبريد، OI، volume وتزامن spot/chain.
2. سطح تقلب قابل للتدقيق: IV inversion، forward/discount، skew، term structure، SVI/SSVI، وفحوص static arbitrage.
3. Greek aggregation للمركز والمحفظة، مع وحدات ومضاعفات صحيحة.
4. سيناريوهات spot × volatility × time × rates، مع P&L attribution.
5. استراتيجية متعددة الأرجل مع سعر دخول/خروج قابل للتنفيذ، رسوم، انزلاق، هامش، تسوية وتخصيص.
6. إشارات IV/forecast-RV، skew، term structure، event risk، flow وCOT، كل واحدة منفصلة ومؤرخة.

### 8.3 Portfolio & Investor Intelligence
- تحليل ملف المستثمر والأهداف والأفق والسيولة والقيود.
- توزيع الأصول ومساهمة المخاطر والارتباط والتركيز والعملات.
- عامل Value / Momentum / Carry / Defensive / Trend.
- قراءة الإفصاحات والملكية المؤسسية والمعاملات الداخلية.
- تحليل الشركات والأرباح والتوجيهات والديون والتدفقات النقدية.
- اختبار الضغط: ركود، تضخم، صدمة أسعار الفائدة، صدمة عملة، أزمة سيولة، انهيار ارتباطات.
- سجل قرار يربط الفرضية بالأدلة والنتيجة لاحقاً.

### 8.4 AI Roles — لا نبدأ بعشرات الوكلاء
نبدأ بمنسق واحد وخمس وحدات متخصصة:
1. Fundamental & Business Analyst.
2. Macro & Cross-Asset Analyst.
3. Options & Volatility Analyst.
4. Portfolio & Risk Officer.
5. Skeptical Evidence Reviewer.

كل وحدة تستدعي أدوات وبيانات واضحة. المراجع لا يصوت؛ بل يتحقق من الدليل والحسابات والافتراضات.

## 9. قواعد الاختبار التي لا يجوز تجاوزها

لا نقبل backtest كدليل على ميزة قبل التحقق من:
- Point-in-time chains ووجود كل عقد في التاريخ الفعلي، لا إعادة بناء الكون من اليوم.
- Bid/Ask التاريخي وتعبئة على أسعار قابلة للتنفيذ، لا midpoint مثالي.
- رسوم، عمولات، انزلاق، market impact، وقيود السيولة.
- هامش، تمويل، borrow، توزيعات، corporate actions، وتكاليف التحوط.
- توقيت الإعلان والأحداث، وإمكانية التداول قبل ظهور المعلومة.
- Look-ahead، survivorship، selection، multiple testing، وتغيير المعلمات.
- Walk-forward وout-of-sample وstress periods.
- مقارنة مع benchmark وبديل بسيط وعدم التداول.
- Bootstrap / parameter sensitivity / regime split.
- فصل العوائد النظرية عن الصافي بعد التكلفة.

يجب أن يتضمن كل تقرير نتيجة سلبية عندما تفشل الاستراتيجية. لا ننتقي الفترة التي تبدو ناجحة.

## 10. قرارات التنفيذ النهائية

| القرار | الاختيار |
|---|---|
| هل نستورد TradingAgents بالكامل؟ | لا؛ نقتبس الأدوار والتوثيق فقط، ولا نعتمد خدمة API مدفوعة |
| هل ندمج QuantLib مباشرة؟ | لا الآن؛ نستخدمه لاحقاً للتحقق المستقل إذا احتجنا حسابات C++ متقدمة وبعد حسم الترخيص |
| هل نعتمد py_vollib أو سكربت صغير واحد؟ | لا كمصدر وحيد؛ نستخدم محرك Sol الحالي ونبني اختبارات مقارنة متعددة |
| هل نستخدم بيانات Benzinga/Fiscal.ai؟ | ندرسها كطبقة اختيارية بعد حسم التكلفة وشروط الاستخدام |
| هل نستخدم CFTC وSEC وFRED؟ | نعم كطبقة بحث أولية مع تأخيرها ونطاقها وفينتج البيانات ظاهرين |
| هل نبني smart-money score واحداً؟ | لا؛ Evidence Convergence يعرض مصادر مستقلة ودرجة حداثة وتعارض |
| هل نبدأ بـ0DTE وMarket Making؟ | لا؛ أولوية متأخرة لأنها تحتاج بيانات دقيقة وتكاليف تنفيذ ومخاطر عالية |
| هل ننقل المحرك إلى Python الآن؟ | لا؛ نثبت أولاً الحسابات الحالية في TypeScript، ونضيف خدمة Python فقط عند وجود حاجة مقاسة |
| هل نضيف تنفيذ صفقات؟ | لا؛ Sol يبقى مساعداً ومديراً للقرار، لا نظام تداول آلي |

## 11. ترتيب العمل المقترح

**P0 — موثوقية البيانات والحسابات**
- توحيد source provenance / observed_at / received_at / freshness / unit / currency.
- فحص quote quality والتوقيت والمضاعفات.
- إضافة fixtures مرجعية مستقلة للأسعار وIV وGreeks والـpayoff.
- إبقاء بيانات Demo معلّمة بوضوح.

**P1 — محرك الخيارات**
- سطح التقلب وفحوص عدم المراجحة.
- Greek aggregation وسيناريوهات المحفظة.
- سجل الاستراتيجيات متعددة الأرجل وتكاليفها ومخاطرها.

**P2 — الأدلة المؤسسية والبحث**
- CFTC/SEC/Insider/Events/News.
- تحليل التقارب والتعارض بين الأدلة.
- earnings preview وcrowding وshort-seller triage.

**P3 — مدير الاستثمار والذكاء الاصطناعي**
- ملف المستثمر والأهداف.
- تحليل العوامل وتخصيص الأصول.
- الوكلاء الخمسة والمراجع.
- تقييم النتائج التاريخية ومعايرة الثقة.

**P4 — البيانات التاريخية المتقدمة**
- بحث مزود خيارات تاريخية مرخص وضمن الميزانية.
- لا نبدأ باختبارات واسعة لاستراتيجيات الخيارات قبل حل فجوة البيانات التاريخية.

## 12. مراجع إضافية
- [CFA Institute — Options Strategies (2026)](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/options-strategies)
- [CFA Institute — Hedge Fund Strategies (2026)](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/hedge-fund-strategies)
- [Carr & Wu — Option-specific volatility risk premia](https://www.sciencedirect.com/science/article/pii/S0304405X16000052)
- [Guo & Loeper — Volatility risk premium empirical study](https://www.monash.edu/__data/assets/pdf_file/0010/1726228/WP_CQFIS_2019_3.pdf)
- [Market makers, hedging costs and inventory management](https://www.sciencedirect.com/science/article/pii/S1386418113000207)
- [Option Market Making Costs and HFT](https://www.systemicrisk.ac.uk/sites/default/files/2022-01/dp-113.pdf)
- [0DTE gamma risk and volatility propagation](https://papers.ssrn.com/sol3/Delivery.cfm/4692190.pdf?abstractid=4692190)
- [2026 Deep Hedging 0DTE paper](https://www.sciencedirect.com/science/article/pii/S1572308926000379)
- [Very Noisy Option Prices and VRP Inference](https://onlinelibrary.wiley.com/doi/10.1111/jofi.13365)
- [CFTC COT definitions and limitations](https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm)

**الخلاصة:** القيمة التنافسية لـSol لن تأتي من جمع أكبر عدد من المؤشرات أو تقليد أكبر عدد من المستثمرين، بل من الجمع المنضبط بين اقتصاديات الاستراتيجية، جودة البيانات، الحسابات الصحيحة، المخاطر، وسجل أدلة قابل للمراجعة.
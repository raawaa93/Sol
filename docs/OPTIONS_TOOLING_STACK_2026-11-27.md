# حزمة أدوات تحليل الخيارات الجاهزة — 27 نوفمبر 2026

## القرار التنفيذي

لا يوجد موقع واحد يحقق في الوقت نفسه: سلسلة Binance SOL الفعلية، تدفق صفقات Binance المؤكد، تموضع السوق عبر المنصات، تنبيهات Telegram موثوقة، وواجهة API مجانية قابلة للدمج وإعادة العرض. أفضل تركيب عملي حالياً هو **أربع طبقات تستخدم معاً من المتصفح**:

1. **Binance الرسمي — مرجع العقد والسوق الخاص بـBinance SOL.**
2. **Laevitas — تحليل مستقل لسلسلة Binance SOL وGreeks/IV والـflows عبر المنصات.**
3. **Basis — صورة مجمعة لسوق SOL عبر المنصات، مع استبعاد تدفق Binance من الـflow.**
4. **Telegram — تنبيهات سياقية وإعلانات، لا توصيات دخول أو خروج.**

هذا تركيب بحثي يدوي جاهز، وليس اتصالاً آلياً بين الخدمات. لم يتم شراء اشتراك أو إنشاء حساب أو إدخال بطاقة أو مفتاح API أو ربط حساب تداول.

## ترتيب الاستخدام العملي

| الدور | الأداة | ما الذي نستخدمه منها؟ | الحكم |
|---|---|---|---|
| مرجع Binance الأول | [Binance SOL Options Data](https://www.binance.com/en/markets/trading_data/eoptions-data/perpetual/trading-data/SOLUSDT) | OI والحجم حسب Strike/Expiry، Call/Put، Max Pain، 24hr Taker Flow | المصدر الأول لقراءة سوق Binance |
| تحقق العقد قبل القرار | [Binance SOL Options Chain](https://www.binance.com/en/eoptions/SOLUSDT) | العقد المحدد، Bid/Ask والكمية وشروط العقد في شاشة المنصة | المرجع الأخير للسعر القابل للتنفيذ |
| تحليلات سلسلة Binance | [Laevitas — Binance SOL Chain](https://app.laevitas.ch/crypto/options?exchange=binance&currency=SOL&view=contracts&presentation=chain) | السلسلة، Bid/Ask/Mark، IV، Delta/Gamma/Theta/Vega، OI والحجم | أفضل طبقة تحليل إضافية تم التحقق منها |
| سياق السوق الكامل | [Basis — SOL Options](https://www.basischarts.com/free/free-solana-options-data) | OI/strike/expiry، Put/Call، Max Pain، GEX وIV عبر عدة منصات | سياق مجمع فقط؛ لا يمثل Binance وحدها |
| مقارنة إضافية | [Loris — Binance Options](https://loris.tools/options/sol/binance) | OI، الحجم، ATM IV، الاستحقاقات وعدد العقود | فحص ثانوي مع تحذير جودة |
| تنبيه صفقات متعدد المنصات | [Laevitas Options Trade Tape](https://t.me/laevitas) | صفقات كبيرة وBlock Trades في المنصات التي يعلنها المصدر | سياق عام، وليس Binance SOL feed |
| تحديثات المنصة الرسمية | [Binance Announcements على Telegram](https://t.me/binance_announcements) | تغييرات المنتج، الإعلانات، صيانة المنصة | أخبار رسمية لا إشارات تداول |

## نتائج التحقق الحي

### 1. Binance الرسمي

تم فتح صفحة SOL الرسمية وفحص المحتوى المستخرج. تتضمن الصفحة:
- أعلى خمسة عقود حسب Open Interest.
- أعلى خمسة عقود حسب حجم 24 ساعة.
- نسبة وقيمة Call OI مقابل Put OI.
- نسبة وحجم Call/Put خلال 24 ساعة.
- OI وVolume حسب Strike وحسب Expiration.
- 24hr Taker Flow مقسماً إلى Calls Bought وCalls Sold وPuts Bought وPuts Sold.
- Max Pain وسجل Exercised History في تبويبات منفصلة.

الصفحة تعرض بياناتها بعناوين زمنية داخلية، لكن لا تُظهر المنطقة الزمنية بوضوح في النص المستخرج؛ لذلك لا أعتبر وقت الالتقاط الذي يظهر على الصفحة دليلاً كافياً على حداثة كل حقل. افتح الصفحة وحدّثها، ثم قارن العقد المحدد مع شاشة العقد في Binance. لا تستخدم نسب Call/Put وحدها كإشارة اتجاه.

الروابط الرسمية:
- https://www.binance.com/en/markets/trading_data/eoptions-data/perpetual/trading-data/SOLUSDT
- https://www.binance.com/en/eoptions/SOLUSDT
- https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-options/api/rest-api/market-data

### 2. Laevitas

تم التحقق من أن الرابط التالي يفتح سلسلة **Binance / SOL** وليس صفحة Deribit الافتراضية:
https://app.laevitas.ch/crypto/options?exchange=binance&currency=SOL&view=contracts&presentation=chain

ظهر فيه:
- استحقاقات SOL منفصلة.
- Calls وPuts حسب Strike.
- Bid وMark وAsk.
- Mark IV وDelta وGamma وTheta وVega وRho.
- Open Interest وحجم التداول.
- روابط إلى الرسوم والصفقات الخاصة بالعقد.

حدود الاستخدام:
- الموقع يعلن خطة مجانية بـ$0 وتاريخاً يصل إلى أسبوع واحد ورسوم أساسية محدودة (8 رسوم في الصفحة).
- Premium معلن بـ$50/مقعد/شهر، وEnterprise بـ$500/مقعد/شهر.
- واجهة MCP تتضمن أدوات خيارات كثيرة، لكنها تطلب Enterprise API key.
- يوجد مسار x402 للدفع بـUSDC لكل استدعاء؛ لم نستخدمه ولم نوافق على أي إنفاق.
- لا نخلط بيانات Binance مع بيانات المنصات الأخرى في قراءة العقد. يجب تسجيل exchange وcurrency وinstrument والوقت لكل نتيجة.

المراجع:
- https://www.laevitas.ch/
- https://apiv2.laevitas.ch/mcp/
- https://apiv2.laevitas.ch/slate/
- https://apiv2.laevitas.ch/changelog.html
- https://apiv2.laevitas.ch/x402

**ملاحظة جودة مهمة:** سجل تغييرات Laevitas يذكر أن بعض صفقات Binance التاريخية كانت تفتقد التسعير/المؤشر، وأن Greeks وPremium وNotional جرى اشتقاقها لاحقاً من أحدث بيانات سوق متاحة. لذلك قد تكون بيانات الصفقة المعاد بناؤها أقل يقيناً من سجل تنفيذ مباشر؛ لا نعامل كل Greeks/Notional تاريخي كقيمة أصلية أرسلتها Binance.

### 3. Basis

تم التحقق من صفحة SOL المجانية ومن وثيقة تغطية المصادر. Basis يدمج بيانات الخيارات العامة من Deribit وOKX وBybit وBinance، ويحوّل وحدات العقود قبل جمع OI وبيانات التموضع. يعرض:
- OI حسب Strike وExpiry.
- Put/Call OI.
- Max Pain.
- Gamma Exposure وZero Gamma.
- Volatility Smile وATM Term Structure.
- سلسلة مجمعة قابلة للتصدير.

**القيد الحاسم:** وثيقة المصادر تقول صراحةً إن Binance توفر Marks وTickers وOI لكل استحقاق، لكن لا تنشر Basis تدفق صفقات Binance ضمن خيارات الـFlow؛ لذلك تستبعد Binance من تحليل تدفق الصفقات. لا تستنتج من GEX المجمّع أن هناك شراء Calls على Binance أو أن صانعي السوق فعلياً Long/Short Gamma.

الروابط:
- https://www.basischarts.com/free/free-solana-options-data
- https://www.basischarts.com/data-sources
- https://www.basischarts.com/docs/professional-analysis-workflow

### 4. Loris Tools

وثائق API تسرد SOL/Binance صراحةً، وتذكر أن endpoint اللقطة متاح عبر الخطط، لكنه يتطلب API key. كما أن شروط الموقع:
- تسمح بمشاهدة/تحليل بيانات السوق كاستخدام غير تداولي.
- تحظر scraping والاستخراج الآلي غير المصرح به.
- تحظر framing/mirroring ونقل المواد أو دمجها في خدمة أخرى دون إذن مكتوب.

أظهرت لقطات البحث أرقام SOL/Binance متباينة بدرجة كبيرة بين عمليتي جلب منفصلتين، لذلك لا نعتمد أرقام لوحة Loris كمرجع أول أو كمدخل آلي قبل فهم توقيت اللقطة ومنهجها. نستخدم الموقع يدوياً للمقارنة فقط، ولا نربطه بـSol أو ننسخ بياناته إلى الواجهة.

المراجع:
- https://loris.tools/options/sol/binance
- https://loris.tools/docs/api/options/snapshot
- https://loris.tools/terms

### 5. أدوات استبعدناها

**option.watch**
- واجهة مجانية وسريعة، لكن صفحاتها متناقضة: صفحة Binance العامة تدعي تغطية عدة أصول، بينما FAQ يذكر BTC/ETH فقط، وصفحة SOL تذكر Bybit وDerive لا Binance.
- صفحة About تشرح Binance على أنها BTC/ETH، وصفحة SOL تعرض Bybit/Derive.
- شروطها تمنع scraping وإعادة التوزيع.
- القرار: لا نعتمدها لسلسلة Binance SOL.

المراجع:
- https://www.option.watch/binance-options.html
- https://www.option.watch/sol-options.html
- https://www.option.watch/about.html
- https://www.option.watch/terms.html

**OptionsMatch**
- يجمع سلسلة SOL عبر عدة منصات، ويعرض Scanner وGEX وFlow.
- صفحات السلسلة التي فُحصت أظهرت Saved/last-good summaries، لكن جدول Quote Age وNBBO كان فارغاً وظهر أن 0 quote rows عادت في بعض اللقطات.
- القرار: يصلح للبحث والمقارنة عندما تكون تغذيته حية، لكنه لا يصلح للتحقق من سعر تنفيذ أو لاتخاذ قرار عند غياب الاقتباسات.

المراجع:
- https://optionsmatch.com/t/sol/chain
- https://optionsmatch.com/t/sol/scanner

**Derivatives Monkey**
- يعلن تغطية متعددة المنصات وGEX وVol Surface وBacktesting.
- يصف أمثلة الأرقام على الصفحة بأنها Sample Snapshot / illustrative only.
- لم نثبت سلسلة Binance SOL قابلة للتحقق مستقلاً؛ لا نعتمدها كمصدر بيانات أو إشارات.

المصدر:
- https://www.derivativesmonkey.com/

## Telegram: ما يستحق المتابعة وما لا يستحق

### قناة Laevitas

القناة الرسمية المنشورة باسم Options Trade Tape تعلن تنبيهات Large/Block Trades عبر Deribit وBybit وOKX وBullish. لا تذكر Binance ضمن نطاق تغطية التنبيهات. لذلك:
- تابعها لرصد صفقات الخيارات الكبيرة على الأسواق التي تغطيها.
- لا تعتبرها تدفق صفقات Binance.
- لا تنسخ إشارة شراء/بيع من صفقة Block دون معرفة هل هي فتح أم إغلاق، وهل هي جزء من Spread أو Hedge، وما أثرها على OI وIV والسيولة.

https://t.me/laevitas

### Binance Announcements

قناة الإعلانات الرسمية مفيدة لتحديثات إدراج العقود وتغييرات المنتج والصيانة، وليست غرفة توصيات:
https://t.me/binance_announcements

### Greeks.live

الغرفة الرسمية التي فُحصت هي مجتمع نقاش تابع لمزود أدوات خيارات، ولا يوجد دليل كافٍ على أنها تقدم تغطية Binance SOL أو تدفق Binance. لم أضعها ضمن مصادر Sol الأساسية:
https://t.me/GreeksLive

**ضوابط Telegram:** لا ترسل API Secret أو كلمة مرور أو Seed Phrase لأي مشرف أو بوت. لا تحول أموالاً إلى مدير مجموعة، ولا تثبت برامج أو ملفات يرسلها أعضاء مجهولون. لا نوصي بمجموعات توصيات غير رسمية.

## GitHub وGitLab والمشاريع المفتوحة

### sfdcShrikant/crypto-gamma-dashboard

- مستودع عام بترخيص MIT.
- يحتوي على عميل Binance EAPI مباشر، وتجميع عقود وMarks وOI، وحساب GEX حسب Strike وExpiry.
- الصيغة المستخدمة: `gamma × openInterest × spot² × 0.01`.
- يفترض أن Dealer Long Calls وShort Puts؛ ويصرح الكود بأن هذا افتراض شائع وليس حقيقة عن مراكز المتعاملين.
- اتصال المشروع المباشر بـ`eapi.binance.com` يتعارض مع سياسة Sol الحالية التي تحظر الاتصال المباشر وتستخدم وسيط Volterra من الشبكة السورية فقط.
- القرار: لا ننسخ الكود ولا نعيد تفعيل اتصال مباشر. يمكن الاستفادة من شرح الصيغة فقط بعد تدقيق الوحدات والمضاعف وعلامة المراكز.

المصدر:
- https://github.com/sfdcShrikant/crypto-gamma-dashboard

### مشاريع أخرى

- https://github.com/gwrxuk/quant-tool : منصة تحليل خيارات عامة تشمل Greeks وVol Surface وVaR، لكنها ليست موصلاً مثبتاً لـBinance SOL.
- https://github.com/gammagrid/gammagrid : مشروع GEX، لكن مصدر بياناته لا يثبت تغطية Binance European Options؛ لا يصلح كموصل لهذا المسار.
- لم يظهر في البحث الموجه مشروع GitLab نشط يمكن إثبات أنه يغطي Binance SOL EAPI end-to-end مع اختبارات وبيانات قابلة للتحقق.

**قرار GitHub:** لا يوجد مشروع خارجي وجدناه أفضل من البنية الحالية لـSol في موصل Binance والقيود السورية. إعادة استخدام كود مباشر من مستودع آخر ستعيد المشكلة التي أزلناها سابقاً.

## Plugins وMCP وSkills

### Binance ChatGPT App

صفحة OpenAI الرسمية تصف تطبيق Binance بأنه قراءة عامة فقط لبيانات Spot وFutures وOptions، دون الوصول إلى الحساب أو تنفيذ صفقات. لكن البحث في دليل Plugins المتاح لهذه الجلسة لم يُرجع تطبيق Binance؛ لذلك لم أتمكن من تثبيته أو تشغيله من هنا.

- https://openai.com/business/plugins/binance/

### Binance Agent OS / MCP

يوفر Binance MCP endpoint رسمياً، ويمكنه إتاحة بيانات سوق عامة، لكنه يتيح أيضاً صلاحيات حساب/تداول/تحويل وفق scopes والأهلية. الوثائق التي فُحصت لم تثبت أن MCP الحالي يقدم أدوات خيارات Binance SOL تحديداً؛ كما أن صلاحيات التداول والتحويل لا تتوافق مع اتجاه Sol كمساعد تحليلي غير منفذ للصفقات. لذلك لم نربطه.

- https://www.binance.com/en/agent-os
- https://agent.binance.com/mcp/agentic
- https://www.binance.com/en/support/announcement/detail/07d45cdd3831498f8a4ff339031a8480

### Laevitas MCP

يوفر أدوات خيارات تشمل trades وflow وOI وvolatility وGreeks وlevel-1 وdealer exposure. لكنه يتطلب Enterprise API key أو دفع x402؛ لا يوجد ربط مجاني دائم مثبت. يمكن تقييمه لاحقاً إذا توفر مفتاح وحق استخدام مناسب، دون تضمين البيانات في موقع عام قبل مراجعة الترخيص.

- https://apiv2.laevitas.ch/mcp/

### Plugin Directory

بحثنا عن Binance/crypto options/derivatives market data في دليل Plugins المتصل ولم يظهر Plugin قابل للتثبيت. لم يتم تثبيت أي Plugin غير ذي صلة.

## ما تم تنفيذه في Sol وما لم يتم

**تم إنجازه الآن:**
- إجراء أربع دورات بحث ومقارنة: مواقع السوق، التغطية الحية لـSOL/Binance، GitHub/GitLab، ثم APIs/الترخيص/Telegram/Plugins.
- تحديد Stack جاهز للمستخدم عبر المتصفح وترتيب مصادره حسب الموثوقية.
- توثيق الفروق بين Binance-specific وAggregated وTrade-flow، ومنع تحويل تنبيهات Telegram إلى إشارات تداول.
- إضافة هذه المذكرة إلى مستودع Sol وربطها من README.

**لم يتم تنفيذه عمداً:**
- لا scraping آلي من Basis أو Loris أو option.watch.
- لا نسخ بيانات مواقع أخرى أو إعادة عرضها في Sol دون ترخيص واضح.
- لا إضافة API key أو MCP secret إلى GitHub أو المتصفح.
- لا شراء Laevitas Premium/Enterprise أو x402 credits.
- لا تفعيل Binance MCP scopes للتداول أو التحويل.
- لا اتصال مباشر جديد بـBinance ولا WebSocket؛ سياسة Volterra السورية تبقى كما هي.
- لم يتم اختبار هذه المواقع من شبكة المستخدم السورية نفسها؛ الفحص هنا تحقق بحثي للصفحات والمستندات، وليس إثباتاً لوصولها من جهازه أو من الشبكة السورية.

## دورة الاستخدام المقترحة

1. افتح لوحة Binance SOL أولاً، واقرأ OI/Volume حسب Strike وExpiry وTaker Flow.
2. افتح عقد Binance المحدد وتحقق من Bid/Ask والكمية والـSpread ووقت تحديث البيانات.
3. افتح نفس الأصل والمنصة في Laevitas لفحص IV وGreeks والسلسلة والصفقات.
4. افتح Basis لمعرفة هل تموضع SOL الكلي عبر المنصات يؤيد أو يعارض ما يظهر في Binance، مع تذكر أن Binance مستبعد من Flow هناك.
5. راجع قناة Laevitas فقط للصفقات الكبيرة في المنصات التي تغطيها، وقناة Binance الرسمية للإعلانات.
6. إذا تعارض مصدران أو غابت الطوابع الزمنية أو كانت الاقتباسات فارغة، تكون النتيجة **غير محسومة** ولا نولد إشارة.

## معايير قبول أي تكامل مستقبلي

لا يدخل أي مصدر إلى Sol كـLIVE إلا بعد:
- إثبات تغطية Binance + SOL على endpoint محدد، لا مجرد شعار المنصة.
- توثيق venue وinstrument وexpiry وstrike وside وsettlement currency وcontract unit/multiplier.
- حفظ source timestamp وreceived timestamp وdelay class لكل حقل.
- مقارنة عينة مع Binance الرسمي على العقد نفسه.
- اختبارات stale/crossed/missing quotes وschema drift وrate limits.
- تأكيد حقوق API والتخزين والعرض وإعادة التوزيع كتابةً.
- الالتزام بوسيط Volterra ومسار الشبكة السورية فقط، دون VPN أو proxy التفافي.
- بقاء التطبيق للقراءة والتحليل وPAPER؛ لا أوامر تداول أو تحويلات آلية.

**الخلاصة:** ابدأ عملياً بـBinance + Laevitas + Basis + قناة Laevitas، مع Binance Announcements للأخبار. هذه أقوى حزمة جاهزة وجدناها لـSOL Options. لا يوجد Telegram واحد موثوق يدمج تدفق Binance SOL مع كل تحليلات السوق، ولا ينبغي أن نحاول اصطناع هذا الدمج من مصادر لا تغطي Binance أو لا تسمح بإعادة توزيع بياناتها.

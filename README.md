# Sol — Financial and Investment Intelligence Assistant

**Canonical project context:** read [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) before making changes. Sol is a personal finance and investment decision-support assistant. It is not an autonomous trading system and does not place orders or move funds. The multi-asset options decision lab remains one specialist module.

واجهة عربية RTL لمساعد مالي واستثماري ذكي: فهم الوضع المالي وصافي الثروة والتدفقات النقدية، تحليل المحافظ والأصول والأسواق، البحث المالي والاقتصادي، مقارنة الاستراتيجيات، وإدارة المخاطر وتوثيق القرارات. الهدف تقديم معلومات موثقة وتحليلات قابلة للفحص تساعد المستخدم على اتخاذ قراراته؛ لا ينفذ التطبيق صفقات أو تحويلات مالية. التغطية الحية والبيانات المتاحة تعتمد على المصادر والتراخيص والقيود الفعلية.

راجع [ميثاق المنتج والمعمارية وخارطة التنفيذ](docs/SOL_FINANCIAL_INTELLIGENCE_CHARTER_2026-11-24.md) لفهم النطاق الجديد ومراحله. تبقى مراجعة خيارات الأسواق والمنصات وأهلية الاستخدام ضمن [بحث الخيارات متعدد الأصول](docs/UNIVERSAL_OPTIONS_RESEARCH_2026-11-24.md) والمذكرات التنظيمية المرتبطة به.

**نطاق المشروع الدائم وأهلية المنصات:** اقرأ [AGENTS.md](AGENTS.md)، [بحث جميع أسواق الخيارات والمنصات](docs/UNIVERSAL_OPTIONS_RESEARCH_2026-11-24.md)، [مراجعة أهلية المنصات](docs/PLATFORM_ELIGIBILITY_2026-11-24.md)، [سياق الإقامة والعقوبات السورية](docs/SYRIA_RESIDENCY_AND_SANCTIONS_2026-11-24.md)، و[تدقيق الواجهة](docs/UX_AUDIT_2026-11-24.md). الذهب أصل واحد فقط، والمستخدم مقيم في سوريا؛ لا تستنتج الإقامة من VPN أو عنوان IP.

للتقييم التفصيلي والفجوات وخطة الأولويات، راجع [مراجعة المنتج وخطة التطوير](docs/PRODUCT_REVIEW.md).

## ما يعمل حالياً

- لوحة Demo مولّدة بوضوح لعشرة أصول: BTC وETH وSOL وXRP وDOGE وBNB، والذهب XAU والفضة XAG والنفط CL وBZ؛ لكل أصل سلسلة Calls/Puts بأربعة استحقاقات وتسعة مستويات Strike. كل الأسعار والإحصاءات محاكاة وليست سوقاً حية. ويمكن تحميل لقطة عامة منفصلة من Binance Options.
- عند توفر الوصول إلى Binance، يجلب التطبيق العقود النشطة والأصول ديناميكياً من `exchangeInfo` (ولا يثبت قائمة عملات داخلية). قد تشمل الأصول التي يعيدها المصدر BTC وETH وBNB وXRP وDOGE وSOL وXAU وXAG وCL وBZ، لكن التغطية الفعلية تعتمد على استجابة المنصة وأهلية الوصول وقت الطلب. تظهر فقط العقود التي أمكن ربطها بمؤشر أصل صالح؛ لا تُستبدل بيانات المنصة المفقودة أو المحظورة ببيانات Demo. ثم يدمج التطبيق mark/IV وBid/Ask والتداولات والفائدة المفتوحة العامة حيث تتوفر. لا يحتاج مفاتيح API.
- تعرض واجهة Binance عمر استلام اللقطة محلياً، وتحوّله إلى تحذير مع تحديث يدوي بعد 60 ثانية. هذا حد تشغيلي لوقت استلام التطبيق، ولا يثبت حداثة كل حقل upstream؛ اللقطة ليست بثاً لحظياً ولا polling تلقائياً.
- سلسلة خيارات Calls/Puts حسب تاريخ الانتهاء، وسعر التنفيذ، والتقلب، وDelta، والفائدة المفتوحة، وفارق العرض والطلب.
- بحث عام عن الرمز أو اسم الأصل ضمن العقود المحمّلة، مع قائمة مفضلات محلية تحفظ الاختيارات في المتصفح وتبقى بعد إعادة التحميل (لا يوجد مزامنة سحابية).
- يضيف تحليل انتهاء محايداً للمخاطر لعقود CSV/Binance ذات IV وSpot وDTE ووحدة عقد تساوي 1 وغير معلّمة كتقديرية: احتمال ربح نظري عند الانتهاء، واحتمال ITM، والقيمة المتوقعة غير المخصومة وفجوة القيمة النظرية عن Ask. يستبعد Demo صراحةً، ويستخدم Ask كدخول محافظ، ويفترض r=0% وغياب الرسوم والانزلاق؛ هذه احتمالات تسعير وليست توقعات واقعية أو إشارات تداول. P&L لكل عقد وحساسية المركز والميزانية وإعادة التشغيل التاريخية محصورة حالياً في Demo الاصطناعي، أو Binance/CSV crypto spot الأوروبي النقدي عندما تكون unit=1 (ومضاعف CSV صريحاً يساوي 1) وعملتا التسعير/التسوية متطابقتين. عقود Binance التي unit فيها أكبر من 1 تبقى أسعاراً مرصودة فقط؛ فـunit كمية الأصل الأساسي لكل عقد وليست مضاعف القسط، ولم يُدمج بعد محول يفصل سعر القسط لكل عقد عن كمية التسليم. بقية العقود (بما فيها futures وperpetual والمعادن والطاقة والأسهم الأمريكية) تبقى بيانات مرصودة بلا P&L لكل عقد حتى يكتمل نموذج التسليم والمضاعف الخاص بها. هذا فحص اتساق للحقول لا تحقق مستقل من مواصفات البورصة؛ اسم venue داخل CSV ليس إثبات مصدر. بالنسبة إلى XAU/XAG، سعر الأصل هو مؤشر عقد Binance TradFi Perpetual؛ مرجع Black–Scholes هنا تقريب استكشافي ولا ينمذج أساس/تمويل العقد أو اختلاف ساعات السوق، لذلك لا يُعامل كقيمة عادلة مؤكدة.
- مستكشف وصفي للسوق يقارن IV−RV عندما تتوفر بيانات تاريخية، وانحراف جناحي ±25Δ، وبنية التقلب حسب الاستحقاق؛ وتُستبعد الحقول المعلّمة كتقديرية من هذه المقارنات ومن تفضيل Delta في قائمة المراجعة. علامة التقدير تكشف ما اشتقه التطبيق صراحةً فقط؛ غيابها لا يثبت حداثة الحقل أو توثيق المصدر أو صحة القيمة. يعرض عقوداً للمراجعة بحسب Bid/Ask وOI والحجم فقط، لا بحسب ربح متوقع أو اتجاه.
- حاسبة Black–Scholes توضيحية بمعدل فائدة مفترض 0% في Demo/CSV، مع Greeks مفصلة: Delta وGamma وTheta/يوم وVega لكل نقطة تقلب مئوية وRho لكل نقطة مئوية من معدل الفائدة السنوي.
- حساسية الكمية وصدمات صغيرة من الدرجة الأولى/الثانية، بجانب سيناريوهات P&L عند الانتهاء من −20% إلى +20% في سعر الأصل.
- استيراد CSV محلي داخل المتصفح، مع فحص حقول البيانات والطوابع الزمنية وإظهار الحقول المقدرة أو غير المتاحة بدلاً من خلطها ببيانات Demo.
- دفتر صفقات تجريبي محفوظ في `localStorage`، مع تصدير CSV.
- تنبيهات واضحة بأن التحليل ليس توصية وأنه لا يتم إرسال أوامر.

## التشغيل والاختبار

يتطلب Node.js 22.6 أو أحدث:

```bash
npm install
npm run dev
```

```bash
npm test
npm run build
```

تشمل `npm test` اختبارات خصائص بـ`fast-check` للحساب المالي ومسار CSV، ببذرة ثابتة لإعادة إنتاج النتائج. تُحمّل مكتبة Recharts ديناميكياً عندما يقترب المستخدم من الرسوم بدلاً من إدخالها في JavaScript اللازم لبدء الواجهة.

### وسيط Binance العام

- نقطة النهاية المنشورة: `https://oyoyozdugicmnkfhjovo.supabase.co/functions/v1/volterra-binance-market-data`.
- يحقن سير عمل GitHub Pages قيمة `VITE_BINANCE_PROXY_URL` وقت البناء. أصل المتصفح المسموح به للوسيط هو `https://raawaa93.github.io` وحده؛ لا تنسخ رابط الإنتاج إلى `.env.local` أو تستخدمه من `localhost`. تظل أوضاع Demo وCSV والاختبارات المحلية مستقلة عن الوسيط.
- مصدر الكود في `supabase/functions/volterra-binance-market-data`. إعداد `verify_jwt = false` مقصود لأن الموقع ثابت؛ يقيّد الوسيط المسارات إلى واجهات السوق العامة الست `exchangeInfo` و`mark` و`ticker` و`index` و`openInterest` و`depth` فقط، ولا يقدّم endpoints للتداول أو بيانات الحساب. CORS ليس مصادقة، لكنه يسمح للمتصفح من أصل الموقع المنشور وحده.
- أحدث مراجعة لسجلات وسيط Binance خلال 24 ساعة حتى 08:22 UTC في 24 نوفمبر 2026 شملت إصدارات الدالة 1–10، لا الإصدار 10 وحده: إجمالاً 50 طلباً مصنّفاً SY نجحت HTTP 200، و337 طلباً GB نجحت، و6 طلبات US نجحت عبر eu-central-2 (من الإصدارين 8 و9)، و58 طلب US رُفضت HTTP 451، و5 طلبات US أعادت HTTP 400. عند عزل الإصدار 10 فقط: 50 SY/200، و92 GB/200، و12 US/451، و2 US/400، ولا توجد نجاحات US/200. التصنيف الجغرافي هو Cloudflare country classification وليس إثباتاً لمكان إقامة أو هوية مستخدم؛ كما أن سجلات النجاح لا تحتوي Origin/Referer. هذه النتائج لا تثبت أهلية حساب Binance أو الإذن القانوني بالتداول أو الوصول لكل منتجات الخيارات، ولا تبرر تثبيت منطقة التنفيذ أو تجاوز القيود. راجع [سجل التحقق](docs/BINANCE-LIVE-DATA-VERIFICATION-2026-11-24.md).
- لا يوجد عنوان API خاص بـBinance Syria؛ واجهة الخيارات العامة الرسمية هي `https://eapi.binance.com`. نجحت سابقاً 50/50 طلباً مصنّفاً من شبكة Syriatel / دمشق عبر Supabase Edge `eu-west-2` تلقائياً. هذا ليس خادماً سورياً داخل Binance، بل اتصال من الشبكة السورية إلى المضيف العالمي عبر أقرب Edge متاح. لا نثبت منطقة تنفيذ ولا نستخدم `x-region`.
- فحص GitHub Pages الإنتاجي يفحص الموقع والملفات الثابتة فقط، ولا يطلب بيانات Binance من GitHub-hosted runner؛ فقد كانت طلبات CI المصنّفة US تعيد 451، ولا تمثل شبكة المستخدم. تحقق من الاتصال الحي من المتصفح والشبكة المقصودة. لا يخزن التطبيق لقطات Binance في localStorage؛ والوسيط لا يخزن ردود 451.
- لإعادة نشر تحديثات الوسيط باستخدام Supabase CLI: `supabase functions deploy volterra-binance-market-data --project-ref oyoyozdugicmnkfhjovo`. لا تضف مفاتيح Binance أو أسرار Supabase إلى الواجهة.



### إعادة التشغيل التاريخية (CSV)

- عند استيراد CSV يحوي لقطات متعددة للعقد نفسه، لا يدخل replay إلا الصفوف ذات مصدر BBO صريح، ووقت حدث المصدر ووقت استلام محلي، وأسعار Bid/Ask غير مقدّرة، وحجم معروض معروف الوحدة. يستخدم وقت الاستلام لترتيب التنفيذ، ويحتفظ بوقت المصدر منفصلاً؛ ويرفض اللقطات المستقبلية أو المتأخرة أو ناقصة المصدر أو الحجم.
- يشتري المحرك عند Ask ويغلق عند Bid بعد مدة يحددها المستخدم، ويشترط أن يكفي حجم Ask للدخول وحجم Bid للخروج. يطبق انزلاقاً سلبياً اختيارياً لكل طرف، ويعرض المصدر والأوقات والأحجام وسعر التعبئة وتكلفة الانزلاق. قيم الرسوم والانزلاق صفر افتراضياً؛ يجب إدخال افتراضات مناسبة، ولا تُستنتج رسوم المنصة أو رسوم التمرين.
- هذا خط أساس لتنفيذ PAPER وليس اختبار استراتيجية ذات إشارة دخول أو دليل ربحية. مصدر BBO وأوقاته وأحجامه في CSV ادعاءات من الملف ولا يتحقق التطبيق مستقلاً من أصالتها. لا توجد نتيجة قابلة للاعتماد دون سجل تاريخي كافٍ ومرخّص؛ لا يملأ التطبيق فجوات التاريخ ولا يحوّل سيناريوهات الانتهاء إلى Backtest.

## استيراد CSV

يمكن تنزيل قالب فارغ من الواجهة. الأعمدة المتعرّف عليها:

```text
symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,delta,gamma,theta,vega,rho,openInterest,openInterestUsd,volume,volumeQuote,spot,forward,unit,timestamp,assetClass,venue,underlyingKind,carryYield,riskFreeRate,quoteAsset,settlementAsset,contractMultiplier,exerciseStyle,settlementStyle,expiryTimezone
```

الحد الأدنى اللازم لكل صف صالح: رمز أصل أساسي من 2 إلى 16 حرفاً أو رقماً، نوع العقد، تاريخ الانتهاء، سعر التنفيذ، سعر مرجعي موجب مناسب لنوع الأصل (`spot` أو `forward`)، وسعر سوق مرصود موجب واحد على الأقل من `bid` أو `ask` أو `markPrice`، إضافة إلى IV مرصود صالح أو مواصفات عقد صريحة تسمح بحل IV بنموذج مدعوم. لا تقتصر ملفات CSV على BTC/ETH؛ يمكن أن يحدد رمز مثل `BTC-261230-95000-C` أو `XAU-261230-4000-P` الأصل والنوع والتنفيذ والانتهاء.

- يمكن كتابة IV كعدد عشري (`0.58`) أو نسبة (`58%`). إذا غاب IV، لا يُحل إلا عندما تتوفر مواصفات صريحة يقبلها موجّه النماذج: عقد أوروبي مع تسوية معلومة ومعدل فائدة صريح؛ `SPOT`/`INDEX`/`FX_SPOT` يحتاج `spot` و`carryYield` صريحين، و`FUTURE` يحتاج `forward` موجباً. كما يتطلب الاستنتاج `unit` صريحاً، وألا يختلف `contractMultiplier` عنه إن وُجد. في Binance لا يُستنتج IV من السعر إلا عندما `unit=1`؛ عند `unit>1` يظل IV المرصود من المنصة فقط، لأن `unit` كمية الأصل لكل عقد وليست مضاعف القسط. يُرفض الصف بدلاً من استنتاج IV من سعر قد يكون على مقياس مختلف. يُعلّم IV المستنتج كتقدير. لا يوجد fallback عام إلى Black–Scholes.
- إذا غاب Bid أو Ask، لا يخترع المختبر الطرف الناقص؛ يظهر الفارق السعري كغير متاح. لا ينشئ المستورد سعر Mark نموذجياً من دون نموذج مدعوم؛ يجب أن يحتوي الصف على Bid أو Ask أو Mark مرصود موجب.
- تُحسب Greeks الناقصة فقط عندما يعيد موجّه التسعير حالة `SUPPORTED`؛ وإلا تبقى القيم النموذجية محجوبة، بينما تُحفظ Greeks التي قدمها الملف كقيم مرصودة غير متحقق من وحداتها. `theta` لكل يوم، و`vega` لكل نقطة تقلب مئوية، و`rho` لكل نقطة مئوية من المعدل السنوي؛ `gamma` تغير Delta لكل وحدة من السعر المرجعي المستخدم في النموذج (Spot أو Forward). عند استيراد `rho` يجب أن يكون لكل نقطة مئوية، لا لكل 1.00 من المعدل. حقل `unit` يحدد كمية الأصل لكل عقد؛ و`contractMultiplier` حقل مستقل ولا يُستخدم بديلاً عنه. إذا غابت `unit` يستخدم المستورد 1 للعرض مع تحذير، لكن تُحجب حسابات P&L لكل عقد وحساسية المركز وإعادة التشغيل. لا تُفتح هذه الحسابات إلا في DEMO، أو Binance Crypto Options الأوروبي النقدي على Spot عندما `unit=1` وعملتا التسعير/التسوية متطابقتين، أو CSV Crypto Spot أوروبي نقدي مع venue مسمى و`unit=1` و`contractMultiplier=1` صريحين وعملتي تسعير/تسوية متطابقتين. إذا كانت `unit>1` تبقى العقود مرصودة فقط حتى فصل premium multiplier عن deliverable quantity. هذا فحص اتساق للحقول وليس إثباتاً مستقلاً لمواصفات التسليم؛ تبقى بقية الأسواق مرصودة فقط حتى يكتمل نموذج المضاعف والتسليم الخاص بكل سوق.
- يقرأ التطبيق `timestamp` أو حقول وقت شائعة لعرض عمر أحدث صف، ويحسب الأيام حتى الانتهاء عند وقت كل صف عندما يتوفر. إذا غاب وقت المصدر، يستخدم وقت الاستيراد كتقريب معلّم بوضوح؛ وقت الاستيراد ليس وقت السوق، والملفات التاريخية تحتاج طوابع مصدر صحيحة.
- يلزم أن تكون `spot` والأسعار ووحدة العقد متسقة في العملة والمقياس. استيراد CSV يتم محلياً ولا يُرفع إلى خادم.
- يمكن إدخال `openInterestUsd` و`volumeQuote` مباشرةً (بوحدة عملة التسعير، المتوقعة هنا USDT). عند غياب OI USD يُقدّر من OI × السعر المرجعي × وحدة العقد؛ وعند غياب قيمة حجم التداول المقوّمة يُقدّر من حجم العقود × علاوة الخيار المرجعية × وحدة العقد، لا من Spot. تعرض الواجهة ما إذا كانت مجاميع USD تقديرية.
- إذا تكرر العقد في الملف، يبقى صفه ظاهراً في السلسلة مع تحذير، لكن الملخص والرسوم التجميعية يستخدمان أحدث صف مؤرّخ لكل عقد لتفادي جمع اللقطات المكررة؛ ومع غياب الطوابع يختاران آخر صف.
- تُصدّر خلايا CSV باقتباس صحيح، وتُعطّل بادئات الصيغ الشائعة في النصوص حتى لا تُفسّر قيم مثل رموز العقود كصيغ عند فتحها في جداول البيانات.
- حد الاستيراد 5000 صف و5 MiB. الصفوف غير الصالحة تُرفض مع تحذيرات.

## حدود النموذج والبيانات

- بيانات Demo اصطناعية لا تستخدمها لاتخاذ قرارات تداول.
- في وضع CSV، لا تُستعار بيانات التقلب المحقّق من Demo؛ RV وفرق IV−RV يظلان غير متاحين ما لم تتوفر سلسلة تاريخية مناسبة.
- Black–Scholes مع Carry وBlack–76 نموذجان تحليليان محدودان وليسا تسعيراً موثوقاً لكل الأسواق. موجّه النماذج يتطلب مواصفات أوروبية صريحة وتسوية ومعدل فائدة صريحاً؛ spot/index/FX يحتاج carry صريحاً، وfutures يحتاج forward. لا تُسعّر العقود الأمريكية أو Bermudan أو Perpetual أو ذات الميكانيكيات المجهولة. Demo وحده يصرح بافتراضات معدلات/Carry اصطناعية؛ CSV لا يفترض 0% عند غياب المعدل أو Carry. Binance يمرر `riskFreeInterest` كما يرد، لكن وحدة المصدر تحتاج تحققاً مستقلاً قبل الاعتماد عليه.
- استنتاج IV محصور حالياً في المجال `(0, 5]` (حتى 500% تقلب سنوي)؛ الأسعار التي تتطلب تقلباً أعلى تبقى غير محلولة بدلاً من إظهار قيمة مختلقة.
- زر Binance يستخدم وسيط Supabase Edge Function للقراءة فقط لتجاوز قيود CORS الخاصة بتحميل REST من صفحة ثابتة؛ يمرر الوسيط قائمة محددة من واجهات بيانات السوق العامة ولا يقبل مسارات أوامر، ولا يخزن مفاتيح Binance ولا يملك صلاحيات حساب أو تداول. سر Supabase المستخدم للـRPC يبقى في بيئة الوظيفة على الخادم ولا يدخل الواجهة. إذا أعادت Binance رفضاً جغرافياً أو شبكياً، يمرر الوسيط الخطأ ولا يحاول الالتفاف على القيود؛ ولا تُستبدل بيانات فشل الاتصال ببيانات Demo أو CSV بصمت.
- يسمح الوسيط بطلبات المتصفح من GitHub Pages فقط، لكن CORS ليس مصادقة؛ يمكن استدعاء endpoint العام خارج المتصفح. يفرض الآن حداً مشتركاً ذرياً قدره 240 طلباً في الدقيقة لكل عنوان عميل موثوق عبر RPC في PostgreSQL، ويُخزن HMAC للعنوان لا العنوان الصريح. لا يملك `anon` أو `authenticated` أو `service_role` صلاحية مباشرة على جدول العدّاد؛ ومن أدوار Data API، `service_role` وحده يستطيع تنفيذ دالة الـRPC. يفشل الوسيط مغلقاً بـ503 إذا غابت إعدادات الحد أو تعذّر الوصول إلى قاعدة البيانات، ويستخدم عدّاداً محلياً محدوداً كحماية إضافية. هذا يضيف استدعاء قاعدة بيانات لكل طلب حتى مع وجود cache؛ يلزم مراقبة الأداء والتكلفة قبل توسيع الاستخدام، وقد يكون Redis/Upstash أنسب عند ارتفاع الحركة. لا ترسل بيانات خاصة إليه ولا تستخدمه لبيانات حسابك.
- لقطة Binance ليست تدفق WebSocket ولا أرشيفاً تاريخياً. السعر والمؤشر وبيانات OI قد تتحدث بمعدلات مختلفة، وتُعرض تحذيرات عند النقص. يستعمل التطبيق Delta من Binance إن توفر، بينما Gamma وTheta وVega وRho محسوبة بنموذج Black–Scholes، مع وسم القيم المقدّرة. لا تُستخدم القيم الخام كقياسات مؤكدة لوحدات كل عقد.
- يتطلب تفسير عقد Binance التحقق من `unit` و`minQty` و`maxQty` والدقة والرسوم ووحدات Greeks. `unit` تعني كمية الأصل الأساسي لكل عقد، ولا يجوز استخدامها كمضاعف للقسط؛ في العقود ذات `unit>1` تبقى الحسابات المالية محجوبة حتى يكتمل المحول الاقتصادي. رسوم العقد المنشورة لا تُضاف تلقائياً إلى المحاكاة.
- اختبار تاريخي جاد يتطلب أرشيفاً زمنياً لعروض وطلبات الخيارات والتقلبات والسيولة والرسوم، مع تجنب تسرب المستقبل والملاءمة الزائدة.

## منهج الفحص المرئي وما لا يدّعيه

- مقارنة IV−RV لا تظهر إلا عند وجود القيمتين وبفترة/وحدات متوافقة. في Binance وملفات CSV بلا تاريخ Spot كافٍ، RV غير متاح ولا يُستبدل بقيمة محاكاة.
- مقارنة skew تقابل IV لخياري Put وCall قرب |Delta| ≈ 25 على الاستحقاق نفسه، وتعرض فرق IV ووحدتي Delta الفعليتين؛ لا تحوّل الفرق إلى توصية risk-reversal.
- بنية الأجل تستخدم IV ومدداً حتى الانتهاء غير معلّمة كتقديرية قرب السعر المرجعي عبر الاستحقاقات. قائمة العقود للمراجعة تفضّل عروض 20–40 يوماً و|Delta| بين 0.25 و0.75 إذا توافرت حقول غير معلّمة كتقديرية، ثم ترتب حسب الفارق والفائدة المفتوحة والحجم. هذه مؤشرات فرز فقط؛ عدم وسم حقل كتقديري لا يثبت جودة المصدر، وليست هذه القيم عائداً متوقعاً أو احتمال نجاح.
- صدمات Greeks محلية من الدرجة الأولى/الثانية، مع وحدة كل حساسية ومصدر/حالة تقدير. لا تمثل تغير السعر الكامل عند تحركات كبيرة، ولا تشمل Greeks المتقاطعة أو تغير skew/التنفيذ.

المنهج ينسجم مع طريقة عرض حساسية Greeks وبنية التقلب والسيناريوهات في المراجع التعليمية والمؤسسية؛ لكنه لا يعادل بيانات surface معايرة أو تحليل محفظة/اختباراً تاريخياً. للمراجعة:
- [Options Industry Council — Understanding the Options Greeks](https://www.optionseducation.org/advancedconcepts/understanding-options-greeks)
- [Cboe — Hanweck Options Analytics Content Overview](https://cdn.cboe.com/resources/indices/documents/Cboe_Hanweck_Options_Analytics-Content_Overview-v1.5.pdf)
- [CME — Strike-level Greeks and volatility trading](https://www.cmegroup.com/articles/2025/unlocking-volatility-trading-with-strike-level-greeks.html)
- [CME — Precision risk management starts with quality Greeks](https://www.cmegroup.com/articles/2025/precision-risk-management-starts-with-quality-greeks.html)

## تحسينات عملية تالية

1. حفظ أوقات مصدر مستقلة لكل feed، ثم تحذير stale موحّد عند اختلاف أوقات mark وSpot وOI.
2. جمع تاريخ للأسعار/IV/Bid/Ask والرسوم لتقييم الاستراتيجيات خارج العينة ومن دون تسرب مستقبلي؛ لا يُسمّى ذلك backtest حتى تتوفر البيانات.
3. توسيع E2E ليشمل لوحة المفاتيح وإمكانية الوصول والحالات الطرفية؛ Playwright وLighthouse CI يعملان الآن، لكن يلزم RUM اختياري بعد مراجعة الخصوصية.
4. قبل استخدام Greeks غير نموذجية، توحيد وحدات كل منصة/مضاعف ومقارنة عينات بمحرك مستقل مثل QuantLib.

## مراجع للتطوير

- [Binance Options — Exchange Information docs](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-options/api/rest-api/market-data#exchange-information)
- [Binance Options — current public `exchangeInfo` response](https://eapi.binance.com/eapi/v1/exchangeInfo)
- [Binance Options — Option Mark Price](https://developers.binance.com/docs/derivatives/options-trading/market-data/Option-Mark-Price)
- [Binance Options — 24hr Ticker](https://developers.binance.com/docs/derivatives/option/market-data/24hr-Ticker-Price-Change-Statistics)
- [Binance Options — Open Interest](https://developers.binance.com/docs/derivatives/option/market-data/Open-Interest)
- [Binance Options — Market Data API catalog](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-options/api/rest-api/market-data)
- [FCA — Cryptoasset regulatory regime](https://www.fca.org.uk/firms/new-regime-cryptoasset-regulation)
- [HMRC — derivatives over cryptoassets](https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto10150)

إشعار الترخيص لمعاملات التقريب العددية المستعارة من Cephes موجود في [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## خريطة المنصة والنطاق — 24 نوفمبر 2026

Volterra هو مختبر خيارات متعدد الأصول وليس منتجاً للذهب فقط. Binance هي موصل التنفيذ الأول المشروط: Crypto Options API يوفر بيانات سوقية/Greeks/IV/OI وWebSocket للعقود المدرجة؛ Commodity Options الحالية تشمل XAU/XAG فقط وتجزئة long-only؛ U.S. Stock Options تغطي أسهماً وETFs أمريكية بتسوية مادية وlong-only، لكن API السوق لا يعرض option quotes/Greeks/IV، كما أن أهلية المنتج للسوريين تحتاج تحققاً منفصلاً. Binance لا تغطي وحدها خيارات الفائدة والعملات والطاقة والزراعة والمؤشرات العالمية. Bybit/Deribit/OKX وParadex تستبعد سوريا في الشروط التي راجعناها؛ Gate Global يبقى مرشح استفسار مكتوب بسبب تعارض قائمة حديثة غير حصرية مع وثيقة أقدم، وGate US كيان مختلف؛ IBKR لا يدرج سوريا في قائمة البلدان المتاحة. لا يُستخدم VPN لتغيير بلد الإقامة أو تجاوز القيود.

للتسعير المرجعي نقيّم QuantLib؛ ولإعادة التشغيل والاختبار الحدثي نقيّم NautilusTrader في خدمة Python منفصلة بعد توفير بيانات QuoteTick وOptionGreeks. لا يوجد feed مجاني عالمي حي؛ ضمن سقف 15$/شهر نستخدم Binance API العام ومصادر EOD/CSV المؤخرة للبحث فقط، ولا نشتري اشتراكاً أو نعرض بيانات OPRA داخل منتج عام دون ترخيص.


**تنبيه قانوني للمقيم في سوريا:** قبول منصة أجنبية للحساب لا يثبت قانونية التداول محلياً. نشر مصرف سوريا المركزي في 19 أغسطس 2025 تحذيراً من التعامل بالعملات الرقمية، وحذرت هيئة الأوراق والأسواق المالية من منصات الفوركس والعملات الرقمية غير المرخصة. لذلك يبقى Volterra للبيانات والتحليل والمحاكاة فقط إلى أن يتضح قانونياً وضع عقود الخيارات الخارجية. راجع [مذكرة الإقامة والقانون السوري](docs/SYRIA_RESIDENCY_AND_SANCTIONS_2026-11-24.md).


## IV Rank وIV Percentile — سجل التقلب التاريخي

- يعرض Volterra هذين المقياسين فقط عندما تكون القراءة الحالية مستخرجة من Binance REST Mark IV المرصود، مع زوج CALL/PUT متزامن قرب السعر المرجعي وآجال تسمح ببناء قراءة موحدة لأجل 30 يوماً.
- IV Rank يقارن القراءة الحالية بأدنى وأعلى قراءة يومية في السجل؛ IV Percentile يعرض نسبة العينات اليومية التي كانت أقل من القراءة الحالية. لا يمثل أي منهما احتمال ربح أو توقع اتجاه.
- لا تظهر القيم قبل 30 عينة يومية صالحة على الأقل. التاريخ الجزئي موسوم بوضوح، ويُفصل كل أصل ومنصة ومنهج IV عن الآخر. لا تُخلط بيانات Demo أو CSV أو IV النموذجي أو bid/ask IV مع Binance REST Mark IV.
- تُسجل العينات عند فتح/تحديث شاشة Binance فقط، وليس في الخلفية. تُحفظ في localStorage في المتصفح الحالي، بحد 400 يوم و2,000 سجل، ويمكن تصدير نسخة JSON. التخزين المحلي غير مشفر ولا يتزامن بين الأجهزة.
- لا يوجد بعد أرشيف سحابي دائم أو جامع بيانات مجدول أو سلسلة تاريخية موثقة لعروض وطلبات الخيارات. لذلك لا تُستخدم هذه المؤشرات وحدها لترتيب صفقة على أنها مربحة.
\n\n## BBO-aware PAPER replay

- Multi-row CSV replay requires `bidAskSource`, `bidAskTimestamp`, `bidAskReceivedAt`, `bidAskSizeUnit`, `bidQuantity` and `askQuantity`. The engine uses source-event and local receive clocks separately, buys at Ask, exits at Bid, checks freshness and requires enough displayed size on both sides.
- Binance `bookTicker` is the BBO source. Its quantities are recorded in contracts/lots. The `optionTicker` WebSocket stream is 24-hour statistics/last-price data, not BBO; its event time must not be used for bid/ask. REST `OPTION_TICKER` BBO snapshots use `sourceTimestamps.ticker`.
- Mark-only, estimated, stale, future, missing-clock, unknown-size-unit and undersized rows are rejected. Per-side adverse slippage and fees are visible; zero values are optimistic unmodelled costs. CSV provenance remains user-supplied and unauthenticated.
- This is a one-leg fixed-hold PAPER execution baseline. It does not model full depth, queue priority, partial fills, market impact beyond configured slippage, latency distributions, expiry/settlement or hedging. No historical BBO corpus or measured strategy edge exists.

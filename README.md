# Volterra Options Decision Lab

واجهة عربية RTL لتحليل خيارات العملات المشفرة ومحاكاتها. هذه النسخة تعليمية/تجريبية فقط: لا تتصل بحساب Binance، ولا تنفّذ أوامر، ولا تحتوي على مفاتيح API.

## ما يعمل حالياً

- لوحة سوق Demo لـBTC وETH ببيانات محاكاة مولّدة بوضوح، مع خيار تحميل لقطة عامة من Binance Options.
- عند اختيار Binance، يجلب التطبيق قائمة العقود النشطة من `exchangeInfo` ويكتشف الأصول والانتهاءات والـstrikes وCalls/Puts تلقائياً؛ ثم يدمج mark/IV، وBid/Ask/التداولات، ومؤشر الأصل، والفائدة المفتوحة العامة حيث تتوفر. لا يحتاج مفاتيح API.
- سلسلة خيارات Calls/Puts حسب تاريخ الانتهاء، وسعر التنفيذ، والتقلب، وDelta، والفائدة المفتوحة، وفارق العرض والطلب.
- حاسبة Black–Scholes توضيحية بمعدل فائدة مفترض 0%، مع Greeks ونقطة التعادل وأقصى خسارة للمشتري.
- سيناريوهات ربح/خسارة عند الانتهاء من −20% إلى +20% في سعر الأصل.
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

## استيراد CSV

يمكن تنزيل قالب فارغ من الواجهة. الأعمدة المتعرّف عليها:

```text
symbol,underlying,expiry,strike,type,bid,ask,markPrice,iv,delta,gamma,theta,vega,openInterest,volume,spot,unit,timestamp
```

الحد الأدنى اللازم لكل صف صالح: أصل BTC أو ETH، نوع العقد، تاريخ الانتهاء، سعر التنفيذ، سعر مرجعي موجب للأصل، وسعر واحد على الأقل من `bid` أو `ask` أو `markPrice`، إضافة إلى IV صالح أو سعر يمكن استنتاج IV منه. يمكن أن يحدد الرمز صيغاً مثل `BTC-261230-95000-C` الأصل والنوع والتنفيذ والانتهاء.

- يمكن كتابة IV كعدد عشري (`0.58`) أو نسبة (`58%`). إذا غاب IV، يحاول المختبر استنتاجه عددياً من سعر السوق بنموذج Black–Scholes، ويعلّمه كتقدير.
- إذا غاب Bid أو Ask، لا يخترع المختبر الطرف الناقص؛ يظهر الفارق السعري كغير متاح. وإذا غاب Mark والطرفان غير متوفرين، قد يستخدم سعراً نموذجياً موسوماً بوضوح.
- تُحسب Greeks الناقصة تقريبياً. إذا غابت وحدة العقد، تستخدم النسخة قيمة افتراضية 1 مع تحذير؛ تحقّق من المضاعف ووحدات الأسعار قبل تفسير P&L.
- يقرأ التطبيق `timestamp` أو حقول وقت شائعة لعرض عمر أحدث صف. إذا لم تتضمن البيانات وقت المصدر، يوضح التطبيق أن حداثتها غير معلومة؛ وقت الاستيراد ليس وقت السوق.
- يلزم أن تكون `spot` والأسعار ووحدة العقد متسقة في العملة والمقياس. استيراد CSV يتم محلياً ولا يُرفع إلى خادم.
- حد الاستيراد 5000 صف. الصفوف غير الصالحة تُرفض مع تحذيرات.

## حدود النموذج والبيانات

- بيانات Demo اصطناعية لا تستخدمها لاتخاذ قرارات تداول.
- في وضع CSV، لا تُستعار بيانات التقلب المحقّق من Demo؛ RV وفرق IV−RV يظلان غير متاحين ما لم تتوفر سلسلة تاريخية مناسبة.
- Black–Scholes هنا نموذج توضيحي وليس نموذج تسعير موثوقاً لكل ظروف أسواق الكريبتو. العائد، والقفزات، والتمويل، والابتسامة، والسيولة، والتسوية قد تختلف عن افتراضاته.
- زر Binance يجلب لقطة REST عامة مباشرة من المتصفح؛ لا يوجد تكامل حساب/محفظة أو تداول، ولا تُطلب مفاتيح API. يتطلب جلب البيانات اتصالاً خارجياً وقد يفشل بسبب الشبكة أو قيود المنطقة أو سياسة CORS؛ لا تُستبدل بيانات فشل الاتصال ببيانات Demo بصمت.
- لقطة Binance ليست تدفق WebSocket ولا أرشيفاً تاريخياً. السعر والمؤشر وبيانات OI قد تتحدث بمعدلات مختلفة، وتُعرض تحذيرات عند النقص. يستعمل التطبيق Delta من Binance إن توفر، بينما Gamma وTheta وVega محسوبة بنموذج Black–Scholes، مع وسم القيم المقدّرة.
- يتطلب تفسير عقد Binance التحقق من `unit` و`minQty` و`maxQty` والدقة والرسوم ووحدات Greeks. رسوم العقد المنشورة لا تُضاف تلقائياً إلى المحاكاة.
- اختبار تاريخي جاد يتطلب أرشيفاً زمنياً لعروض وطلبات الخيارات والتقلبات والسيولة والرسوم، مع تجنب تسرب المستقبل والملاءمة الزائدة.

## مراجع للتطوير

- [Binance Options — Exchange Information](https://developers.binance.com/docs/derivatives/options-trading/market-data/Exchange-Information)
- [Binance Options — Option Mark Price](https://developers.binance.com/docs/derivatives/options-trading/market-data/Option-Mark-Price)
- [Binance Options — 24hr Ticker](https://developers.binance.com/docs/derivatives/option/market-data/24hr-Ticker-Price-Change-Statistics)
- [Binance Options — Open Interest](https://developers.binance.com/docs/derivatives/option/market-data/Open-Interest)
- [Binance Options — Market Data API catalog](https://developers.binance.com/en/docs/catalog/core-trading-derivatives-trading-options/api/rest-api/market-data)
- [FCA — Cryptoasset regulatory regime](https://www.fca.org.uk/firms/new-regime-cryptoasset-regulation)
- [HMRC — derivatives over cryptoassets](https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto10150)

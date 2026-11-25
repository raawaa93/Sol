# تشغيل جامع بيانات الخيارات على Android عبر Termux

**الحالة:** مسار محلي اختياري ومجهّز؛ لم يُشغّل على جهاز المستخدم ولم تُثبت أهلية Binance أو إمكانية الوصول من شبكته.

## لماذا هذا المسار؟

لا يوجد حالياً خادم أرشيف سحابي معتمد أو تخزين off-device مهيأ للمشروع. تشغيل الجامع على جهاز Android يبقي الاتصال ضمن شبكة الجهاز نفسها، ويتجنب نقل الطلبات إلى GitHub runners أو خادم في منطقة أخرى. لكنه ليس بديلاً مكافئاً لخادم 24/7: Android قد يوقف العمليات الخلفية، ولذلك ابدأ بجلسة أمامية قصيرة.

## حدود الأمان

- يلزم التأكد بنفسك من أهلية الحساب والمنطقة وشروط Binance الحالية وحق جمع/الاحتفاظ ببيانات السوق قبل التشغيل.
- لا يستخدم السكربت API keys أو بيانات حساب أو أوامر تداول أو private streams.
- لا يستخدم VPN أو proxy أو host بديل أو توجيهاً إقليمياً آخر. يرفض متغيرات proxy ويرفض مفاتيح Binance الموجودة في البيئة.
- يوقف التشغيل عند رفض الوصول؛ إذا ظهر HTTP 403/451 أو فشل WebSocket upgrade، لا تحاول تجاوز الحظر.
- تحديث Exchange Info عبر REST معطل قسرياً في هذا المشغّل.
- الحد الافتراضي ساعة واحدة و128 MiB؛ الحد الأعلى 6 ساعات و512 MiB.
- البيانات تحفظ محلياً داخل Termux فقط. لا توجد مزامنة سحابية أو نسخة off-device تلقائية.

## 1. تثبيت Termux

استخدم إصداراً حديثاً من مصدر Termux الرسمي فقط:
- [Termux على F-Droid](https://f-droid.org/packages/com.termux/)
- [إصدارات Termux الرسمية على GitHub](https://github.com/termux/termux-app/releases)

لا تستخدم إصدار Google Play القديم. لا تخلط تطبيق Termux وإضافاته من مصادر مختلفة لأن مفاتيح التوقيع تختلف. أوقف تحسين البطارية لتطبيق Termux أثناء جلسة الجمع.

## 2. تجهيز بيئة Node

داخل Termux:

```sh
pkg update -y
pkg install -y git nodejs-lts tmux
node --version
```

المطلوب Node.js 22.6.0 أو أحدث. حزمة Node LTS في Termux توفر إصداراً حديثاً؛ سكربت التشغيل يتحقق من الحد الأدنى. لا حاجة إلى `npm install` أو مفاتيح API لهذا العامل؛ يعتمد على واجهات Node المدمجة.

## 3. تنزيل المشروع

```sh
git clone https://github.com/raawaa93/Sol.git "$HOME/Sol"
cd "$HOME/Sol"
```

إذا كان المستودع موجوداً مسبقاً، حدّثه فقط بعد التأكد من عدم وجود تغييرات محلية:

```sh
git pull --ff-only
```

## 4. تشغيل جلسة اختبار محدودة

بعد مراجعة أهلية الحساب والمنطقة والشروط، اختر stream عاماً مسموحاً. المثال التالي يوضح الصيغة فقط ولا يضمن أن الوصول متاح:

```sh
export OPTIONS_ARCHIVE_ELIGIBILITY_ACK=CONFIRMED
export OPTIONS_PUBLIC_STREAMS="btcusdt@bookTicker"
bash scripts/options-archive-termux-start.sh
```

لا يختار السكربت streams تلقائياً. يمكنك تحديد عدة streams مفصولة بفواصل، لكن لا تتجاوز 200 stream فريد.

الإعدادات الاختيارية:

```sh
export OPTIONS_ARCHIVE_DIR="$HOME/.sol/options-archive"
export OPTIONS_ARCHIVE_MAX_BYTES=134217728
export OPTIONS_ARCHIVE_MAX_RUNTIME_MS=3600000
export OPTIONS_ARCHIVE_HEARTBEAT_MS=30000
```

لا تضبط `OPTIONS_ARCHIVE_REFRESH_EXCHANGE_INFO=true`; السكربت يعطله دائماً. لا تضف proxy أو مفاتيح API.

## 5. تشغيل الجلسة داخل tmux

لجلسة يمكن الرجوع إليها أثناء بقاء Termux حياً:

```sh
tmux new -s sol-options-archive
```

نفّذ أوامر التشغيل داخل الجلسة. للفصل دون إيقافها: `Ctrl+B` ثم `D`. للعودة:

```sh
tmux attach -t sol-options-archive
```

أوقف العامل بـ `Ctrl+C` أو SIGTERM. سيحاول الإغلاق والتحقق من الأرشيف. عند إعادة التشغيل استخدم المجلد نفسه؛ الفهرس يعاد بناؤه والسجلات المكررة تُهمل وفق هوية الحدث.

## 6. الاستمرارية والنسخ الاحتياطي

- Termux على Android 12+ قد يتعرض لقتل العمليات الخلفية/phantom processes. لذلك tmux لا يضمن 24/7، ولا يُعد هذا الإعداد خدمة سحابية دائمة.
- يمكن لاحقاً إعداد Termux:Boot من **المصدر نفسه** لبدء الجلسة بعد إعادة التشغيل، لكن لا تفعّله قبل نجاح جلسة أمامية وفحص الأرشيف. حتى مع Boot وقيود البطارية المخففة لا يوجد ضمان ضد إيقاف Android للعملية.
- بعد إيقاف العامل، تحقق من الأرشيف باستخدام `ResumableOptionsArchive.verify()`، ثم انسخ مجلد الأرشيف إلى وسيط آخر معتمد. نسخة على الجهاز نفسه ليست disaster recovery.
- لا ترفع الأرشيف إلى مستودع Git؛ قد يكبر ويحتوي سجلاً زمنياً كثيفاً. لا تستخدم Supabase المشترك.

## مصادر Termux الرسمية

- [Termux app installation and source/signature guidance](https://github.com/termux/termux-app#installation)
- [Termux package management](https://github.com/termux/termux-packages/wiki/package-management)
- [Termux:Boot instructions](https://github.com/termux/termux-boot)

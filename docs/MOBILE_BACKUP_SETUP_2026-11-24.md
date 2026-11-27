# إعداد النسخة الاحتياطية المشفّرة من الهاتف أو المتصفح

**المشروع:** Sol / Volterra  
**Supabase project ref:** `oyoyozdugicmnkfhjovo`  
**المستودع:** [raawaa93/Sol](https://github.com/raawaa93/Sol)  
**لا يلزم تثبيت أي تطبيق على iPhone أو Lenovo tablet.** كل خطوات GitHub وSupabase تتم من المتصفح. إنشاء مفتاح age يمكن أن يتم في Codespaces من المتصفح إذا كان الاستخدام ضمن الحصة المجانية المتاحة؛ لا توافق على تفعيل فوترة أو خطة مدفوعة.

## روابط مباشرة

1. [إعداد أسرار ومتغيرات GitHub Actions](https://github.com/raawaa93/Sol/settings/secrets/actions)
2. [تشغيل سير النسخ الاحتياطي يدوياً](https://github.com/raawaa93/Sol/actions/workflows/supabase-backup.yml)
3. [إصدارات النسخ المشفّرة](https://github.com/raawaa93/Sol/releases)
4. [فتح Codespaces للمستودع](https://github.com/codespaces/new?repo=raawaa93%2FSol&ref=main)
5. [لوحة مشروع Supabase](https://supabase.com/dashboard/project/oyoyozdugicmnkfhjovo)
6. [إعدادات قاعدة البيانات في Supabase](https://supabase.com/dashboard/project/oyoyozdugicmnkfhjovo/settings/database)
7. [Issue متابعة النسخة الاحتياطية](https://github.com/raawaa93/Sol/issues/106)

## قبل البدء: حدود الأمان

- لا ترسل كلمة مرور قاعدة البيانات أو رابط الاتصال أو مفتاح age الخاص في المحادثة أو Copilot أو Issue أو سجل Actions.
- `SUPABASE_DB_URL` سرّ خاص، بينما `AGE_RECIPIENT` عنوان تشفير عام فقط.
- لا تحفظ المفتاح الخاص في المستودع، ولا في GitHub Actions، ولا في Artifact أو Release.
- المستودع عام؛ ملف النسخة الاحتياطية المنشور يجب أن يكون ملف `.age` مشفّراً فقط.
- لا تبدأ تشغيل النسخ قبل إكمال السر والمتغير. إذا ظهرت مطالبة دفع أو تفعيل فوترة في Codespaces، أوقف الخطوة ولا توافق.
- النسخة التي ينتجها السكربت هي نسخة منطقية لقاعدة PostgreSQL وليست نسخة كاملة من مشروع Supabase.

## الخطوة 1 — إنشاء مفتاح التشفير من المتصفح

هذه الخطوة لا تحتاج إلى كمبيوتر محلي، لكنها تحتاج إلى بيئة طرفية موثوقة. يمكن استخدام Codespaces من Safari أو Chrome:

1. افتح [رابط Codespaces](https://github.com/codespaces/new?repo=raawaa93%2FSol&ref=main) وسجّل الدخول إلى GitHub.
2. اختر المستودع `raawaa93/Sol` والفرع `main`.
3. إذا عرض GitHub تكلفة أو طلب تفعيل فوترة أو لم تكن لديك حصة مجانية متاحة، لا تنشئ البيئة؛ لا تتجاوز حد الإنفاق.
4. بعد فتح الطرفية في المتصفح، نفّذ الأمر التالي لتثبيت أداة age داخل البيئة السحابية المؤقتة فقط (لا يثبت شيئاً على الهاتف):

```bash
sudo apt-get update && sudo apt-get install -y age
```

5. أنشئ زوج المفاتيح:

```bash
age-keygen -o "$HOME/sol-age-identity.txt"
```

6. استخرج عنوان التشفير العام الذي سيُحفظ في GitHub:

```bash
age-keygen -y "$HOME/sol-age-identity.txt"
```

انسخ النص الناتج الذي يبدأ بـ `age1...`؛ هذا هو `AGE_RECIPIENT` العام.

7. اعرض المفتاح الخاص مرة واحدة وانقله مباشرة إلى مدير كلمات مرور موثوق أو تخزين مشفّر منفصل عن GitHub:

```bash
cat "$HOME/sol-age-identity.txt"
```

المفتاح الخاص يبدأ بـ `AGE-SECRET-KEY-...`. لا تضعه في GitHub أو Copilot أو المحادثة. لا تلتقط له صورة ولا تحفظه في ملاحظات غير محمية.

8. بعد التأكد من حفظ المفتاح الخاص بأمان خارج Codespaces، احذف النسخة المؤقتة من البيئة:

```bash
rm -f "$HOME/sol-age-identity.txt"
```

9. احذف Codespace من [قائمة Codespaces](https://github.com/codespaces) بعد الانتهاء. احتفظ بالمفتاح الخاص منفصلاً؛ فقدانه يعني تعذّر فك تشفير النسخ.

> إذا تعذّر نسخ المفتاح الخاص بأمان من الطرفية على الهاتف، توقف هنا ولا تكمل. لا تطلب من Copilot إظهار المفتاح ولا تنشئ نسخة ثانية في مستودع عام.

## الخطوة 2 — إضافة AGE_RECIPIENT كمتغير عام

1. افتح [GitHub Actions secrets and variables](https://github.com/raawaa93/Sol/settings/secrets/actions).
2. في قسم **Repository variables** اضغط **New repository variable**.
3. الاسم: `AGE_RECIPIENT`.
4. القيمة: عنوان `age1...` العام الذي استخرجته في الخطوة السابقة.
5. احفظ المتغير.

لا تضع المفتاح الخاص هنا. هذا الحقل يقبل العنوان العام فقط.

## الخطوة 3 — إضافة رابط قاعدة البيانات كسرّ

1. افتح [لوحة Supabase](https://supabase.com/dashboard/project/oyoyozdugicmnkfhjovo).
2. افتح **Connect** أو إعدادات قاعدة البيانات ثم **Session pooler**.
3. انسخ **Session Pooler** connection string الخاص بمشروع `oyoyozdugicmnkfhjovo` فقط، على المنفذ `5432` وباسم المستخدم `postgres.oyoyozdugicmnkfhjovo`. لا تستخدم Direct connection؛ مشغلات GitHub-hosted المستخدمة للنسخ تعمل عبر IPv4، بينما Direct endpoint في الخطة المجانية قد يكون IPv6 فقط. احتفظ بمعامل TLS الذي يقدمه Supabase مثل `sslmode=require`. استبدل العنصر النائب بكلمة مرور قاعدة البيانات الفعلية عند الحاجة.
4. لا ترسل الرابط إلى أي شخص ولا تضعه في Copilot.
5. افتح [GitHub Actions secrets and variables](https://github.com/raawaa93/Sol/settings/secrets/actions).
6. في قسم **Repository secrets** اضغط **New repository secret**.
7. الاسم حرفياً: `SUPABASE_DB_URL`.
8. القيمة: رابط الاتصال الكامل لمشروع Sol فقط.
9. احفظ السر.

لا تغيّر كلمة مرور قاعدة البيانات لمجرد إعداد النسخة، ولا تستخدم رابط مشروع آخر. سير العمل يرفض الرابط الذي لا يحتوي على مرجع مشروع Sol.

## الخطوة 4 — تشغيل النسخة الاحتياطية

1. افتح [Encrypted Supabase backup](https://github.com/raawaa93/Sol/actions/workflows/supabase-backup.yml).
2. اضغط **Run workflow**.
3. اختر الفرع `main`.
4. اضغط **Run workflow** مرة أخرى.
5. افتح التنفيذ الجديد وانتظر انتهاءه.
6. افتح ملخص التنفيذ وتأكد أن مرحلة التهيئة قالت إن الإعداد جاهز، وأن خطوات تثبيت Supabase CLI وage والتصدير والتشفير والنشر نُفذت.
7. افتح [Releases](https://github.com/raawaa93/Sol/releases) وابحث عن إصدار اسمه يبدأ بـ `sol-db-backup-`.
8. تأكد أن الإصدار يحتوي على ملف مشفّر بامتداد `.age` فقط.

**تنبيه مهم:** النسخة السابقة من سير العمل كانت قد تنتهي بحالة Success رغم تخطي النسخ عند نقص الإعدادات. تم تشديده الآن: إذا غاب `SUPABASE_DB_URL` أو `AGE_RECIPIENT` فسيفشل التنفيذ بوضوح، مع تأكيد عدم الاتصال بقاعدة البيانات وعدم إنشاء نسخة. لا تعتبر أي تنفيذ نسخة ناجحة إلا إذا اكتمل التصدير والاستعادة التجريبية والتشفير ونُشر ملف `.age` فعلياً في Release. التنفيذ التاريخي في 24 نوفمبر 2026 تخطّى العمل ولم يُنشئ نسخة.

## الخطوة 5 — إثبات الاستعادة

إنشاء ملف مشفّر لا يثبت إمكانية استعادته. بعد ظهور أول Release مشفّر:

1. نزّل ملف `.age` من Release إلى جهاز موثوق.
2. استخدم المفتاح الخاص المحفوظ خارج GitHub لفك التشفير.
3. تحقق من SHA-256 للملفات الداخلية وفق `SHA256SUMS`.
4. استعد الأدوار ثم المخطط ثم البيانات إلى قاعدة PostgreSQL مؤقتة ومعزولة فقط؛ لا تستخدم مشروع الإنتاج كوجهة استعادة.
5. تحقق من جدول `public.volterra_rate_limit_windows)، وRLS، والفهرس، ودالة `public.volterra_check_rate_limit` وصلاحياتها.
6. وثّق نتيجة الاستعادة والوقت وحجم الملف والبصمة.

لا تنشئ مشروع Supabase جديداً مدفوعاً لهذا الاختبار. إذا لم تتوفر بيئة محلية/مؤقتة مجانية ومعزولة، أبقِ بند الاستعادة مفتوحاً ولا تختبر على الإنتاج.

## ما الذي لا تحتويه هذه النسخة؟

السكربت الحالي يصدّر أدوار PostgreSQL ومخطط البيانات غير المُدار والبيانات غير المُدارة. لا يتضمن:

- مستخدمي Auth أو الجلسات.
- ملفات Storage الثنائية.
- أسرار Edge Functions.
- إعدادات المشروع وإعدادات Auth.
- مخططات Supabase المُدارة التي يستثنيها CLI.

لذلك يجب وصفها بأنها **نسخة منطقية مشفّرة لقاعدة البيانات**، لا نسخة كاملة من Supabase. سجل التدقيق السابق وثّق مستخدم Auth واحداً وصفر كائنات Storage؛ يجب التعامل مع مستخدم Auth كعنصر منفصل يحتاج قرار حفظ/استعادة.

## الحالة الحالية

- [x] سكربت التصدير والتشفير موجود.
- [x] Workflow أسبوعي ويدعم التشغيل اليدوي.
- [x] اختبار تشفير وفك تشفير آلي باستخدام قاعدة بيانات وهمية.
- [x] التحقق من أن اتصال النسخ هو Session Pooler الخاص بالمشروع على المنفذ 5432.
- [x] سير النسخ يفشل بوضوح عند غياب الإعدادات بدلاً من إظهار نجاح زائف.
- [x] إضافة فحص استعادة PostgreSQL محلي معزول قبل نشر النسخة.
- [ ] إضافة `AGE_RECIPIENT` في GitHub.
- [ ] إضافة `SUPABASE_DB_URL` في GitHub.
- [ ] تشغيل فعلي ونشر Release مشفّر.
- [ ] فك التشفير والتحقق من البصمات.
- [ ] اختبار استعادة معزول ناجح.

**لا يوجد حتى الآن دليل على نسخة إنتاجية مشفّرة أو استعادة ناجحة.**

# تقرير التحقق التشغيلي لمشروع Sol — 27 نوفمبر 2026

## الحالة العامة

**نشر الواجهة ناجح ومختبر.** تم نشر commit `eb0106f60dcdd1c7ae6cd05119f2fe371211eab3` إلى GitHub Pages بعد نجاح CI على `main`.

- PR #254: https://github.com/raawaa93/Sol/pull/254 — مدمج.
- Main CI: run [45973145932](https://github.com/raawaa93/Sol/actions/runs/45973145932) — success.
- Main Lighthouse baseline: run [45973145984](https://github.com/raawaa93/Sol/actions/runs/45973145984) — success.
- Project Context Guard: run [45973145928](https://github.com/raawaa93/Sol/actions/runs/45973145928) — success.
- GitHub Pages deploy + production audit: run [45973291349](https://github.com/raawaa93/Sol/actions/runs/45973291349) — success.
- الموقع المنشور: https://raawaa93.github.io/Sol/

## تحقق الموقع المنشور

اختبار الإنتاج أعاد:
- App shell: HTTP 200، 114 ms.
- JavaScript bundle: HTTP 200.
- CSS bundle: HTTP 200.
- `.well-known/ard.json`: HTTP 200، manifest صالح ويحوي 0 entries.
- `llms.txt`: HTTP 200.
- Lighthouse على الموقع المنشور، median من 3 تشغيلات:
  - Performance 97/100
  - Accessibility 100/100
  - Best Practices 100/100
  - SEO 100/100
  - FCP 902 ms، LCP 1645 ms، TBT 187 ms، CLS 0.000

**حدّ الاختبار:** فحص الإنتاج لم يرسل أي طلب إلى Binance. السكربت يتعمد تخطي upstream probes من GitHub-hosted runners لأن تصنيف خروجها الجغرافي قد يختلف عن مسار المستخدم السوري. لذلك نجاح هذا الاختبار يثبت سلامة نشر الواجهة والأصول، ولا يثبت توفر بيانات Binance الحية أو أهلية الحساب.

## مسار النشر الذي تم إصلاحه

- PR #254 استبدل النشر المباشر عند push بحدث `workflow_run` بعد اكتمال CI على `main`.
- لا يبدأ النشر إلا إذا كانت نتيجة CI ناجحة وعلى فرع `main`.
- يتم checkout لنفس `head_sha` الذي اختبره CI.
- التشغيل اليدوي متاح من `main` فقط.
- أزيل فرع Arena من مسار الإنتاج.
- تم إثبات التسلسل عملياً: CI main نجح، ثم workflow_run #45973291349 بنى ونشر artifact جديداً بنجاح، ثم اجتاز smoke وLighthouse المنشورين.

المصدر الرسمي: https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow

## تدقيق Supabase

المشروع المتصل:
- Project ref: `oyoyozdugicmnkfhjovo`
- Status: `ACTIVE_HEALTHY`
- Region: `eu-west-1`
- PostgreSQL 17

### Volterra market-data proxy

- Edge Function `volterra-binance-market-data`: ACTIVE، version 12.
- مصدر الدالة المنشور يطابق ملف `supabase/functions/volterra-binance-market-data/index.ts` في `main` حرفياً.
- `verify_jwt=false` مقصود للواجهة الثابتة؛ الدالة تقبل قائمة محددة من public read-only endpoints فقط ولا توفر account أو order routes.
- `public.volterra_rate_limit_windows` هي جدول التطبيق الوحيد؛ RLS مفعّل ولا توجد صلاحيات جدول لـanon أو authenticated أو service_role.
- `public.volterra_check_rate_limit(text, integer, integer)` هي SECURITY DEFINER مع `search_path=pg_catalog`، وEXECUTE متاح لـservice_role فقط.
- لم تُنفذ أي migration أو كتابة قاعدة بيانات أو إعادة نشر للدالة في هذه الدورة.

### الوظائف القديمة

أعيد فحص الوظائف الست التالية. كلها ما زالت مسجلة ACTIVE، لكن مصادرها الحالية تعيد HTTP 410 مع `ENDPOINT_RETIRED` وتتطلب JWT:
`commerce-api`, `rawaa-outbox`, `rawaa-telegram-test`, `rawaa-telegram-pair`, `rawaa-retention`, `rawaa-owner-orders`.

لم تحذف؛ لا توجد أداة حذف مدعومة في التكامل، كما أن حذفها يتطلب التأكد من عدم وجود مستهلكين خارجيين أو متطلبات تدقيق.

## ما بقي غير مكتمل — لا يُخفى

1. **التحقق الحي من Binance من مسار المستخدم:** لم ينفذ هذا الفحص أي طلب Binance. لا يُسمح باستخدام GitHub runners أو مسار أجنبي للتحقق من Binance. يجب أن يظل التحقق الفعلي من واجهة المستخدم على المسار السوري المصرح به؛ لا يوجد fallback مباشر في الواجهة.
2. **النسخ الاحتياطي الإنتاجي:** لا يوجد run حديث للنسخ الاحتياطي ولا ciphertext release أو restore drill مثبت. سير العمل يتطلب GitHub Actions secret باسم `SUPABASE_DB_URL` وvariable عامة باسم `AGE_RECIPIENT`، مع حفظ age private identity خارج GitHub. لم تُقرأ أو تُكتب أي أسرار. Supabase Free لا يوفر automatic backups؛ راجع https://supabase.com/docs/guides/platform/backups
3. **حماية main:** لا توجد Rulesets، وفرع main غير محمي. تكامل GitHub الحالي لا يوفر عملية كتابة إعدادات branch protection؛ لم يتم الادعاء بأن الحماية فُعّلت.
4. **Leaked password protection:** غير متاحة على Supabase Free؛ الوثائق الحالية تحصرها في Pro وما فوق. لم يتم الترقية أو الإنفاق. https://supabase.com/docs/guides/auth/password-security
5. **أرشفة الخيارات المستمرة:** لا يوجد collector سحابي مجدول أو أرشيف تاريخي موثوق أو restore end-to-end. يظل worker المحلي opt-in ومعطلاً افتراضياً، ولا يجوز تشغيله عبر مسار غير معتمد.
6. **الاستدلال على ربحية الاستراتيجيات:** لا توجد قاعدة BBO تاريخية مكتملة أو نتيجة edge إحصائية موثقة؛ لا يجوز عرض أي استراتيجية كأن ربحيتها مثبتة.

## قيود التنفيذ التي تم الحفاظ عليها

- لا تداول آلي؛ Sol يظل read-only / research / PAPER.
- لا private API keys أو account endpoints أو orders أو تحويل أموال.
- لا تجاوز HTTP 403/451 أو تغيير egress أو تدوير proxy.
- لا اشتراك مدفوع أو موارد سحابية جديدة أو ترقية خطة.
- لا secrets في المستودع أو سجلات CI.
- لا database writes أو migrations في هذا التنفيذ.

## الخطوة التالية الآمنة

الواجهة منشورة وتنجح اختبارات البناء والمتصفح وLighthouse. الأولوية التشغيلية التالية هي إكمال النسخ الاحتياطي المشفر واختبار استعادة معزول، ثم إعداد حماية `main`، دون ترقية مدفوعة. أما تحقق Binance الحي فيبقى منفصلاً عن CI ويجب ألا يُجرى إلا من مسار المستخدم السوري المصرح به.


## التحقق النهائي بعد توضيح نطاق smoke test — 27 نوفمبر 2026، 09:30 UTC

هذا التحديث يحل محل أرقام Lighthouse السابقة أعلاه بوصفه أحدث تحقق منشور.

- PR #255: https://github.com/raawaa93/Sol/pull/255 — مدمج؛ أضاف هذا التقرير وصحح تسمية خطوة smoke test.
- Main CI: run [45973864341](https://github.com/raawaa93/Sol/actions/runs/45973864341) — success.
- Main Lighthouse: run [45973864167](https://github.com/raawaa93/Sol/actions/runs/45973864167) — success.
- Project Context Guard: run [45973864124](https://github.com/raawaa93/Sol/actions/runs/45973864124) — success.
- آخر نشر بعد PR #255: run [45974040797](https://github.com/raawaa93/Sol/actions/runs/45974040797) — success، commit `d2acc21cfcd070d737037937bd7822d98f908bd0`.
- تسمية خطوة الفحص الآن صريحة: `Verify published app, static assets and manifest (Binance upstream skipped)`.

النتائج:
- App shell HTTP 200، 212 ms.
- JavaScript وCSS: HTTP 200.
- ARD manifest: HTTP 200، 0 entries.
- `llms.txt`: HTTP 200.
- Lighthouse median من 3 تشغيلات على الموقع المنشور:
  - Performance 100/100
  - Accessibility 100/100
  - Best Practices 100/100
  - SEO 100/100
  - FCP 905 ms، LCP 905 ms، TBT 49 ms، CLS 0.000

لم يتغير كود التطبيق بين النشرين؛ التغيير الأخير وثائقي وتصحيح لتسمية خطوة الاختبار. وما زال فحص Binance upstream متخطياً عمداً، ولا يثبت هذا النشر وحده توافر البيانات الحية من شبكة المستخدم.

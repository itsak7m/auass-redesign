# auass-redesign

نموذج مقترح لإعادة تصميم موقع **الاتحاد العربي لعلوم الفضاء والفلك** ([auass.com](https://auass.com/)). إعداد: Ameer Hamam.

A redesign concept for the Arab Union for Astronomy and Space Sciences website. Arabic (RTL) first, with a full English version.

- **العرض المباشر:** https://itsak7m.github.io/auass-redesign/
- **المقترح والقرارات:** [BRIEF.md](BRIEF.md)
- **تدقيق الموقع الحالي:** [AUDIT.md](AUDIT.md)

> نموذج للعرض: الصفحات عليها `noindex`، والفورمات ما بتبعث أي بيانات.

## البنية

| المسار | المحتوى |
|---|---|
| `content/*.json` | كل المحتوى باللغتين: الأخبار، والفعاليات، وسماء الشهر، وعن الاتحاد، والمكتبة، والانتساب، والإعدادات العامة |
| `src/build.js` | مولّد صفحات static بدون أي مكتبات خارجية، بيطلّع الصفحات لمجلد `docs/` |
| `src/lib/icons.js` | الأيقونات ورسوم السماء ونقوش الإسطرلاب (SVG) |
| `src/assets/` | الـ CSS والـ JS والصور |
| `docs/` | الموقع الجاهز، وهو اللي بيعرضه GitHub Pages |
| `tools/check.js` | فحص كل الصفحات على 390px و1440px |

المحتوى منفصل عن القوالب، فبنقدر لاحقاً نركّب عليه لوحة تحكم (مثل Decap CMS أو Sveltia CMS) تعدّل ملفات `content/` مباشرة.

## الأوامر

```bash
npm run build                    # يبني docs/ من content/ و src/
node tools/check.js [shots-dir]  # يفحص: scroll أفقي، روابط داخلية، صور، أخطاء JS، noindex، سطر التذييل
node tools/before-after-shots.js && npm run build   # يحدّث لقطات صفحة "قبل وبعد"
```

ما في أي مكتبة لازمة للبناء، بس Node 18 أو أحدث. الفحص بيحتاج Playwright.

## تحديث "سماء الشهر"

بنعدّل `content/sky.json` (الشهر، والأحداث، وأطوار القمر) من جدول الاتحاد الشهري، وبعدين بنشغّل `npm run build`. الحدث الجاي بيتحدد ويتميّز تلقائياً حسب تاريخ اليوم.

## مصادر الصور

- صورة الواجهة: سديم القاعدة بعدسة تلسكوب جيمس ويب (NASA, ESA, CSA, STScI).
- الشعار وصور الأخبار والقيادة من موقع الاتحاد.

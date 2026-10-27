#!/usr/bin/env node
// Static site generator for the AUASS redesign concept.
// Reads content/*.json, renders every page in Arabic (/) and English (/en/),
// and writes plain HTML/CSS/JS to docs/ for GitHub Pages. No dependencies.

const fs = require('fs');
const path = require('path');
const { icon, skyGlyph, rete } = require('./lib/icons');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs');
const load = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'content', n + '.json'), 'utf8'));
const site = load('site'), news = load('news'), events = load('events'), sky = load('sky');
const about = load('about'), library = load('library'), join = load('join');
const LANGS = ['ar', 'en'];
const BUILD_VERSION = Date.now().toString(36);

// ---------- helpers ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// In Arabic text, isolate embedded Latin runs such as "(ASI Hack)" so brackets
// don't flip when a line wraps.
const bidi = (s, lang) => (lang === 'ar' ? esc(s).replace(/\(?[A-Za-z][A-Za-z0-9 .\-]*[A-Za-z0-9]\)?/g, (m) => `<bdi dir="ltr">${m}</bdi>`) : esc(s));
const t = (o, lang) => (o == null ? '' : typeof o === 'string' ? o : o[lang] != null ? o[lang] : o.ar);
const ui = (ar, en) => ({ ar, en });
const MONTHS = {
  ar: ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
};
const DAYS = { ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'], en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] };
const parse = (d) => { const [y, m, dd] = d.split('-').map(Number); return { y, m, d: dd, wd: new Date(Date.UTC(y, m - 1, dd)).getUTCDay() }; };
function fmtDate(d, lang) { const p = parse(d); return lang === 'ar' ? `${p.d} ${MONTHS.ar[p.m - 1]} ${p.y}` : `${p.d} ${MONTHS.en[p.m - 1]} ${p.y}`; }
function fmtRange(a, b, lang) {
  if (!b) return fmtDate(a, lang);
  const p = parse(a), q = parse(b);
  if (p.y === q.y && p.m === q.m) return lang === 'ar' ? `${p.d}–${q.d} ${MONTHS.ar[p.m - 1]} ${p.y}` : `${p.d}–${q.d} ${MONTHS.en[p.m - 1]} ${p.y}`;
  return `${fmtDate(a, lang)} – ${fmtDate(b, lang)}`;
}
const weekday = (d, lang) => DAYS[lang][parse(d).wd];
function fmtTime(hm, lang) {
  if (!hm) return '';
  let [h, m] = hm.split(':').map(Number);
  const pm = h >= 12, h12 = ((h + 11) % 12) + 1;
  const suf = lang === 'ar' ? (h < 5 ? 'فجراً' : pm ? 'مساءً' : 'صباحاً') : pm ? 'pm' : 'am';
  return `${h12}:${String(m).padStart(2, '0')} ${suf}`;
}

// Page paths are written without a leading slash ("about/"). Each page links
// with paths relative to its own depth so the site works under /auass-redesign/.
const prefix = (lang) => (lang === 'en' ? 'en/' : '');
function rel(fromPage, to) { const depth = fromPage.split('/').filter(Boolean).length; return ('../'.repeat(depth) || './') + to; }

// ---------- shared chrome ----------
function head(ctx, { title, description }) {
  const { lang } = ctx;
  const full = title ? `${title} | ${t(site.name, lang)}` : t(site.name, lang);
  return `<!doctype html>
<html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description || t(site.description, lang))}">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(description || t(site.description, lang))}">
<meta name="theme-color" content="#0B1530">
<link rel="icon" href="${ctx.r('assets/img/auass-seal.png')}">
<link rel="alternate" hreflang="${ctx.altLang}" href="${ctx.altHref}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=Marcellus&family=Reem+Kufi:wght@500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${ctx.r('assets/css/style.css')}?v=${BUILD_VERSION}">
</head>`;
}

function header(ctx) {
  const { lang, page } = ctx;
  const links = site.nav.map((n) => {
    const on = ctx.section === n.id;
    return `<li><a href="${ctx.r(prefix(lang) + n.path)}"${on ? ' aria-current="page"' : ''}>${esc(t(n.label, lang))}</a></li>`;
  }).join('');
  return `<a class="skip" href="#main">${lang === 'ar' ? 'تخطَّ إلى المحتوى' : 'Skip to content'}</a>
<header class="site-header" data-header>
  <div class="wrap bar">
    <a class="brand" href="${ctx.r(prefix(lang))}">
      <img src="${ctx.r('assets/img/auass-seal.png')}" alt="${lang === 'ar' ? 'شعار الاتحاد العربي لعلوم الفضاء والفلك' : 'AUASS emblem'}" width="44" height="48">
      <span class="brand-names"><span class="bn-main" lang="${lang}">${esc(site.name[lang])}</span><span class="bn-sub" lang="${ctx.altLang}" dir="${ctx.altLang === 'ar' ? 'rtl' : 'ltr'}">${esc(site.name[ctx.altLang])}</span></span>
    </a>
    <nav class="nav" id="site-nav" aria-label="${lang === 'ar' ? 'القائمة الرئيسية' : 'Main menu'}">
      <ul>${links}</ul>
      <a class="btn btn-brass nav-join" href="${ctx.r(prefix(lang) + site.join.path)}"${ctx.section === 'join' ? ' aria-current="page"' : ''}>${esc(t(site.join.label, lang))}</a>
      <a class="lang-switch" href="${ctx.altHref}" hreflang="${ctx.altLang}" lang="${ctx.altLang}">${lang === 'ar' ? 'English' : 'العربية'}</a>
    </nav>
    <a class="btn btn-brass bar-join" href="${ctx.r(prefix(lang) + site.join.path)}"><span class="lbl-long">${esc(t(site.join.label, lang))}</span><span class="lbl-short" aria-hidden="true">${lang === 'ar' ? 'انضم' : 'Join'}</span></a>
    <button class="menu-btn" type="button" aria-expanded="false" aria-controls="site-nav" data-menu-btn>
      <span class="sr">${lang === 'ar' ? 'القائمة' : 'Menu'}</span>${icon('menu', 'ico i-open')}${icon('close', 'ico i-close')}
    </button>
  </div>
</header>`;
}

function footer(ctx) {
  const { lang } = ctx;
  const nav = [...site.nav, site.join].map((n) => `<li><a href="${ctx.r(prefix(lang) + n.path)}">${esc(t(n.label, lang))}</a></li>`).join('');
  const social = site.social.map((s) => `<a href="${s.url}" rel="noopener" target="_blank" aria-label="${s.label}">${icon(s.id)}</a>`).join('');
  const related = site.related.map((r) => `<li><a href="${r.url}" rel="noopener" target="_blank">${esc(t(r.label, lang))}</a></li>`).join('');
  return `<footer class="site-footer">
  <div class="wrap footer-grid">
    <div class="f-brand">
      <img src="${ctx.r('assets/img/auass-seal.png')}" alt="" width="56" height="62" loading="lazy">
      <p class="f-name">${esc(t(site.name, lang))}</p>
      <p class="f-desc">${esc(t(site.description, lang))}</p>
      <div class="social">${social}</div>
    </div>
    <div><h2 class="f-h">${lang === 'ar' ? 'الموقع' : 'Site'}</h2><ul class="f-list">${nav}</ul></div>
    <div><h2 class="f-h">${lang === 'ar' ? 'تواصل' : 'Contact'}</h2>
      <ul class="f-list f-contact">
        <li>${icon('pin')}<span>${esc(t(site.address, lang))}</span></li>
        <li>${icon('mail')}<a href="mailto:${site.email}" dir="ltr">${site.email}</a></li>
      </ul>
    </div>
    <div><h2 class="f-h">${lang === 'ar' ? 'مواقع ذات صلة' : 'Related sites'}</h2><ul class="f-list f-related">${related}</ul></div>
  </div>
  <div class="wrap f-bottom">
    <p class="proto-note" lang="ar" dir="rtl">${esc(site.prototypeNote.ar)}</p>
    ${lang === 'en' ? `<p class="proto-note">${esc(site.prototypeNote.en)}</p>` : ''}
    <p class="f-credit">${lang === 'ar' ? 'صورة الواجهة: سديم القاعدة بعدسة تلسكوب جيمس ويب' : 'Hero image: Carina Nebula by the James Webb Space Telescope'} · <span dir="ltr">${site.heroCredit}</span></p>
  </div>
</footer>
<script src="${ctx.r('assets/js/main.js')}?v=${BUILD_VERSION}" defer></script>
</body>
</html>`;
}

function page(ctx, meta, main) {
  return `${head(ctx, meta)}
<body class="page-${ctx.section}${ctx.dark ? ' has-dark-top' : ''}">
${header(ctx)}
<main id="main">
${main}
</main>
${footer(ctx)}`;
}

const sectionHead = (eyebrow, title, more) => `<div class="sec-head">
  <div>${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}<h2 class="sec-title">${title}</h2></div>
  ${more || ''}
</div>`;
const moreLink = (href, label) => `<a class="more" href="${href}">${label}${icon('arrow', 'ico flip')}</a>`;

function pageHero(ctx, { eyebrow, title, lead, crumbs }) {
  const c = crumbs ? `<nav class="crumbs" aria-label="${ctx.lang === 'ar' ? 'مسار التنقل' : 'Breadcrumb'}"><a href="${ctx.r(prefix(ctx.lang))}">${ctx.lang === 'ar' ? 'الرئيسية' : 'Home'}</a>${crumbs.map((x) => `<span aria-hidden="true">/</span>${x.href ? `<a href="${x.href}">${esc(x.label)}</a>` : `<span>${esc(x.label)}</span>`}`).join('')}</nav>` : '';
  return `<section class="page-hero dark">
  ${rete('rete page-rete')}
  <div class="wrap">
    ${c}
    ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ''}
    <h1 class="page-title">${esc(title)}</h1>
    ${lead ? `<p class="page-lead">${esc(lead)}</p>` : ''}
  </div>
</section>`;
}

// ---------- components ----------
const postsSorted = [...news.posts].sort((a, b) => (a.date < b.date ? 1 : -1));
const eventsSorted = [...events.items].sort((a, b) => (a.start < b.start ? 1 : -1));
const postBySlug = Object.fromEntries(news.posts.map((p) => [p.slug, p]));
const CAT_GLYPH = { union: 'seal', lecture: 'telescope', announcement: 'calendar' };
const newsHref = (ctx, slug) => ctx.r(prefix(ctx.lang) + `news/${slug}/`);

function newsCard(ctx, p, { headingLevel = 3 } = {}) {
  const { lang } = ctx;
  const media = p.image
    ? `<div class="frame"><img src="${ctx.r('assets/img/' + p.image)}" alt="" loading="lazy"${p.imageFit === 'contain' ? ' class="fit-contain"' : ''}></div>`
    : `<div class="frame frame-fallback">${rete('rete')}${icon(CAT_GLYPH[p.category], 'ico big')}<span>${esc(t(news.categories[p.category], lang))}</span></div>`;
  return `<article class="news-card" data-cat="${p.category}" data-text="${esc((t(p.title, lang) + ' ' + t(p.excerpt, lang)).toLowerCase())}">
  <a class="card-link" href="${newsHref(ctx, p.slug)}">
    ${media}
    <div class="nc-body">
      <p class="kicker">${esc(t(news.categories[p.category], lang))}</p>
      <h${headingLevel} class="nc-title">${bidi(t(p.title, lang), lang)}</h${headingLevel}>
      <p class="nc-date"><time datetime="${p.date}">${fmtDate(p.date, lang)}</time></p>
    </div>
  </a>
</article>`;
}

function eventRow(ctx, e) {
  const { lang } = ctx;
  const p = parse(e.start);
  const link = e.news ? `<a class="more" href="${newsHref(ctx, e.news)}">${lang === 'ar' ? 'التفاصيل' : 'Details'}${icon('arrow', 'ico flip')}</a>` : '';
  return `<article class="event" data-type="${e.type}">
  <div class="ev-date" aria-hidden="true"><span class="ev-d">${p.d}</span><span class="ev-m">${MONTHS[lang][p.m - 1]}</span><span class="ev-y">${p.y}</span></div>
  <div class="ev-main">
    <p class="kicker">${esc(t(events.types[e.type], lang))}</p>
    <h3 class="ev-title">${bidi(t(e.title, lang), lang)}</h3>
    <ul class="ev-meta">
      <li>${icon('calendar')}<time datetime="${e.start}">${fmtRange(e.start, e.end, lang)}</time></li>
      <li>${icon(e.mode === 'online' ? 'globe' : 'pin')}${esc(t(e.place, lang))}</li>
    </ul>
    <p class="ev-sum">${esc(t(e.summary, lang))}</p>
    ${link}
  </div>
</article>`;
}

function skyCard(ctx, e) {
  const { lang } = ctx;
  const when = e.end ? fmtRange(e.date, e.end, lang) : `${weekday(e.date, lang)} ${fmtDate(e.date, lang)}`;
  const time = e.time ? `${fmtTime(e.time, lang)}${e.conjunction ? (lang === 'ar' ? ' (لحظة الاقتران)' : ' (conjunction)') : ''}` : t(e.time_note, lang);
  const visIcon = e.vis === 'visible' ? 'eye' : e.vis === 'limited' ? 'half' : 'eyeoff';
  return `<li class="sky-card vis-${e.vis}" data-date="${e.date}" data-end="${e.end || e.date}">
  <p class="sky-when"><time datetime="${e.date}">${when}</time></p>
  ${skyGlyph(e.glyph)}
  <h3 class="sky-title">${bidi(t(e.title, lang), lang)}</h3>
  ${time ? `<p class="sky-time">${icon('clock')}<span>${esc(time)}</span></p>` : ''}
  <p class="sky-vis">${icon(visIcon)}<span>${esc(t(sky.visibility[e.vis], lang))}</span></p>
  <p class="sky-note">${esc(t(e.note, lang))}</p>
  <span class="sky-badge" data-next-label>${lang === 'ar' ? 'الحدث القادم' : 'Up next'}</span>
</li>`;
}

function skySection(ctx, { standalone = false } = {}) {
  const { lang } = ctx;
  const phases = sky.phases.map((p) => `<li>${skyGlyph(p.glyph)}<span class="ph-label">${esc(t(p.label, lang))}</span><time datetime="${p.date}">${fmtDate(p.date, lang)}</time></li>`).join('');
  return `<section class="sky dark" id="sky" aria-labelledby="sky-title">
  ${rete('rete sky-rete')}
  <div class="wrap">
    <div class="sec-head">
      <div><p class="eyebrow">${esc(t(sky.region, lang))} · ${esc(t(sky.timezone, lang))}</p><h2 class="sec-title" id="sky-title">${lang === 'ar' ? 'سماء الشهر' : "This month's sky"}: <span class="brass">${esc(t(sky.month, lang))}</span></h2></div>
      <div class="sky-ctrl">
        <button type="button" class="round-btn" data-sky-prev aria-label="${lang === 'ar' ? 'السابق' : 'Previous'}">${icon('arrow', 'ico back')}</button>
        <button type="button" class="round-btn" data-sky-next aria-label="${lang === 'ar' ? 'التالي' : 'Next'}">${icon('arrow', 'ico flip')}</button>
      </div>
    </div>
    <p class="sky-status" data-sky-status hidden></p>
    <ol class="sky-strip" data-sky-strip tabindex="0" aria-label="${lang === 'ar' ? 'أحداث الشهر الفلكية' : 'Astronomical events this month'}">${sky.events.map((e) => skyCard(ctx, e)).join('')}</ol>
    <div class="sky-foot">
      <ul class="phases" aria-label="${lang === 'ar' ? 'أطوار القمر' : 'Moon phases'}">${phases}</ul>
      <p class="sky-credit">${esc(t(sky.credit, lang))}. ${standalone ? '' : `<a href="${newsHref(ctx, sky.source)}">${lang === 'ar' ? 'المصدر' : 'Source'}</a>`}</p>
    </div>
  </div>
</section>`;
}

// ---------- pages ----------
function homePage(ctx) {
  const { lang } = ctx;
  const latest = eventsSorted[0];
  const hero = `<section class="hero dark" aria-labelledby="hero-title">
  <div class="hero-photo" role="img" aria-label="${lang === 'ar' ? 'سديم القاعدة كما صوّره تلسكوب جيمس ويب الفضائي' : 'The Carina Nebula imaged by the James Webb Space Telescope'}"></div>
  ${rete('rete hero-rete', 2)}
  <div class="wrap hero-grid">
    <div class="hero-copy reveal">
      <p class="eyebrow">${lang === 'ar' ? 'منذ 1998 · عمّان' : 'Since 1998 · Amman'}</p>
      <h1 class="hero-title" id="hero-title">${lang === 'ar' ? 'نرفع شأن علوم <em>الفلك والفضاء</em> في الوطن العربي' : 'Advancing <em>astronomy and space science</em> across the Arab world'}</h1>
      <p class="hero-sub">${lang === 'ar' ? 'هيئة فلكية فضائية مقرها عمّان، تابعة لمجلس الوحدة الاقتصادية العربية في جامعة الدول العربية، وعضو في الاتحاد الفلكي الدولي.' : 'An astronomy and space body headquartered in Amman, affiliated with the Council of Arab Economic Unity of the League of Arab States, and a member of the International Astronomical Union.'}</p>
      <div class="ctas">
        <a class="btn btn-brass" href="${ctx.r(prefix(lang) + 'join/')}">${lang === 'ar' ? 'طلب الانتساب' : 'Apply for membership'}</a>
        <a class="btn btn-ghost" href="${ctx.r(prefix(lang) + 'events/')}">${lang === 'ar' ? 'الفعاليات والمحاضرات' : 'Events and lectures'}</a>
      </div>
    </div>
    <a class="hero-event reveal" href="${newsHref(ctx, latest.news)}">
      <p class="kicker">${lang === 'ar' ? 'أحدث الفعاليات' : 'Latest event'} · ${esc(t(events.types[latest.type], lang))}</p>
      <h2 class="he-title">${bidi(t(latest.title, lang), lang)}</h2>
      <ul class="ev-meta">
        <li>${icon('calendar')}<time datetime="${latest.start}">${fmtRange(latest.start, latest.end, lang)}</time></li>
        <li>${icon(latest.mode === 'online' ? 'globe' : 'pin')}${esc(t(latest.place, lang))}</li>
      </ul>
      <span class="more">${lang === 'ar' ? 'التفاصيل' : 'Details'}${icon('arrow', 'ico flip')}</span>
    </a>
  </div>
  <div class="cred">
    <div class="wrap cred-grid">
      <div><b>1998</b><span>${lang === 'ar' ? 'سنة التأسيس في عمّان' : 'Founded in Amman'}</span></div>
      <div><b dir="ltr">IAU</b><span>${lang === 'ar' ? 'عضو في الاتحاد الفلكي الدولي' : 'Member of the International Astronomical Union'}</span></div>
      <div><b>2001</b><span>${lang === 'ar' ? 'اتحاد نوعي تابع لجامعة الدول العربية' : 'Specialised union of the League of Arab States'}</span></div>
    </div>
    <p class="wrap cred-note">${lang === 'ar' ? 'الرئيس الفخري للاتحاد: سمو الشيخ سلطان بن محمد القاسمي، حاكم الشارقة' : 'Honorary President: H.H. Sheikh Sultan bin Mohammed Al Qasimi, Ruler of Sharjah'}</p>
  </div>
</section>`;

  const evs = `<section class="section paper" aria-labelledby="ev-title">
  <div class="wrap">
    ${sectionHead(lang === 'ar' ? 'نشاط مستمر' : 'Ongoing activity', `<span id="ev-title">${lang === 'ar' ? 'الفعاليات والمحاضرات' : 'Events and lectures'}</span>`, moreLink(ctx.r(prefix(lang) + 'events/'), lang === 'ar' ? 'كل الفعاليات' : 'All events'))}
    <div class="events-list compact">${eventsSorted.slice(0, 3).map((e) => eventRow(ctx, e)).join('')}</div>
  </div>
</section>`;

  const joinBand = `<section class="join-band" aria-labelledby="join-title">
  <div class="wrap jb-grid">
    <div>
      <h2 class="sec-title" id="join-title">${lang === 'ar' ? 'انضم إلى الاتحاد' : 'Join AUASS'}</h2>
      <p>${lang === 'ar' ? 'مؤسسات وجمعيات فلكية وفضائية، وجامعات ومعاهد، ومختصون من مختلف الدول العربية. أربعة مستويات للعضوية.' : 'Astronomy and space institutions and societies, universities and institutes, and specialists from across the Arab world. Four levels of membership.'}</p>
    </div>
    <ul class="jb-levels">${join.levels.map((l) => `<li>${icon(l.glyph)}<span>${esc(t(l.title, lang))}</span></li>`).join('')}</ul>
    <a class="btn btn-navy" href="${ctx.r(prefix(lang) + 'join/')}">${lang === 'ar' ? 'شروط العضوية وطلب الانتساب' : 'Membership terms and application'}</a>
  </div>
</section>`;

  const counts = Object.fromEntries(library.collections.map((c) => [c.id, library.items.filter((i) => i.c === c.id).length]));
  const heritageCards = [
    { id: 'constellations', glyph: 'constellation', n: counts.constellations, unit: ui('مجموعة نجمية', 'constellations') },
    { id: 'craters', glyph: 'crater', n: counts.craters, unit: ui('فوهة قمرية', 'lunar craters') },
    { id: 'books', glyph: 'book', n: counts.books, unit: ui('كتاباً عربياً في الفلك', 'Arabic astronomy books') }
  ].map((h) => {
    const c = library.collections.find((x) => x.id === h.id);
    return `<a class="heritage-card reveal" href="${ctx.r(prefix(lang) + 'library/')}?c=${h.id}">
  ${icon(h.glyph, 'ico big')}
  <p class="hc-n"><b>${h.n}</b> ${esc(t(h.unit, lang))}</p>
  <h3 class="hc-title">${esc(t(c.title, lang))}</h3>
  <p class="hc-desc">${esc(t(c.desc, lang))}</p>
  <span class="more">${lang === 'ar' ? 'تصفّح في المكتبة' : 'Browse in the library'}${icon('arrow', 'ico flip')}</span>
</a>`;
  }).join('');
  const heritage = `<section class="section paper heritage" aria-labelledby="her-title">
  <div class="wrap">
    ${sectionHead(lang === 'ar' ? 'من أهداف الاتحاد: الحفاظ على التراث الفلكي' : 'Preserving our astronomical heritage', `<span id="her-title">${lang === 'ar' ? 'التراث الفلكي العربي' : 'Arab astronomical heritage'}</span>`, moreLink(ctx.r(prefix(lang) + 'library/'), lang === 'ar' ? 'المكتبة' : 'Library'))}
    <div class="heritage-grid">${heritageCards}</div>
  </div>
</section>`;

  const newsSec = `<section class="section paper2" aria-labelledby="news-title">
  <div class="wrap">
    ${sectionHead(lang === 'ar' ? 'آخر ما نشره الاتحاد' : 'Latest from AUASS', `<span id="news-title">${lang === 'ar' ? 'الأخبار' : 'News'}</span>`, moreLink(ctx.r(prefix(lang) + 'news/'), lang === 'ar' ? 'كل الأخبار' : 'All news'))}
    <div class="news-grid">${postsSorted.slice(0, 4).map((p) => newsCard(ctx, p)).join('')}</div>
  </div>
</section>`;

  return page(ctx, { title: '', description: t(site.description, lang) }, hero + skySection(ctx) + evs + joinBand + heritage + newsSec);
}

function aboutPage(ctx) {
  const { lang } = ctx;
  const goals = Object.fromEntries(about.goals.map((g) => [g.n, g]));
  const leaders = Object.fromEntries(about.leaders.map((l) => [l.id, l]));
  const themes = about.goalThemes.map((th) => `<article class="theme reveal">
  <header>${icon(th.glyph, 'ico big')}<h3>${esc(t(th.title, lang))}</h3></header>
  <ol>${th.goals.map((n) => `<li value="${n}">${esc(t(goals[n], lang))}</li>`).join('')}</ol>
</article>`).join('');
  const leaderCards = about.leaders.map((l) => `<article class="leader">
  <img src="${ctx.r('assets/img/' + l.photo)}" alt="${esc(t(l.name, lang))}" loading="lazy"${l.photoPos ? ` style="object-position:${l.photoPos}"` : ''}>
  <div><p class="kicker">${esc(t(l.role, lang))}</p><h3>${esc(t(l.name, lang))}</h3><p>${esc(t(l.detail, lang))}</p></div>
</article>`).join('');
  const words = about.words.map((w) => {
    const who = leaders[w.who];
    const body = t(w.body, lang);
    return `<article class="word">
  <header><img src="${ctx.r('assets/img/' + who.photo)}" alt="" loading="lazy"${who.photoPos ? ` style="object-position:${who.photoPos}"` : ''}><div><h3>${esc(t(w.title, lang))}</h3><p>${esc(t(who.name, lang))}</p></div></header>
  <blockquote><p>${esc(t(w.lead, lang))}</p></blockquote>
  <details><summary>${lang === 'ar' ? 'اقرأ الكلمة' : 'Read the message'}</summary>
    <div class="prose">${body.map((p) => `<p>${esc(p)}</p>`).join('')}${w.abridged ? `<p class="note">${lang === 'ar' ? 'مقتطفات من الكلمة المنشورة على موقع الاتحاد.' : 'Excerpts from the message published on the AUASS website.'}</p>` : ''}</div>
  </details>
</article>`;
  }).join('');
  const timeline = about.timeline.map((x) => `<li class="tl-item reveal">
  <span class="tl-year">${x.year}</span>
  <div class="tl-body">${x.image ? `<img class="tl-img" src="${ctx.r('assets/img/' + x.image)}" alt="${lang === 'ar' ? 'شعار اليوبيل الفضي للاتحاد' : 'AUASS silver jubilee emblem'}" loading="lazy">` : ''}<h3>${esc(t(x.title, lang))}</h3><p>${esc(t(x.text, lang))}</p></div>
</li>`).join('');
  const main = `${pageHero(ctx, { eyebrow: lang === 'ar' ? 'منذ 1998' : 'Since 1998', title: lang === 'ar' ? 'عن الاتحاد' : 'About AUASS', lead: t(about.intro, lang), crumbs: [{ label: lang === 'ar' ? 'عن الاتحاد' : 'About' }] })}
<section class="section paper">
  <div class="wrap about-intro">
    <div class="prose">
      <p class="lead-p">${esc(t(about.leadershipLine, lang))}</p>
      <h2 class="sec-title">${lang === 'ar' ? 'قصة التأسيس' : 'How it began'}</h2>
      <p>${esc(t(about.founding, lang))}</p>
    </div>
    <div class="vm">
      <article class="vm-card">${icon('telescope', 'ico big')}<h3>${lang === 'ar' ? 'الرؤية' : 'Vision'}</h3><p>${esc(t(about.vision, lang))}</p></article>
      <article class="vm-card">${icon('orbit', 'ico big')}<h3>${lang === 'ar' ? 'الرسالة' : 'Mission'}</h3><p>${esc(t(about.mission, lang))}</p></article>
    </div>
  </div>
</section>
<section class="section paper2" aria-labelledby="goals-title">
  <div class="wrap">
    ${sectionHead(lang === 'ar' ? 'خمسة عشر هدفاً في أربعة محاور' : 'Fifteen goals in four themes', `<span id="goals-title">${lang === 'ar' ? 'أهداف الاتحاد' : 'Our goals'}</span>`)}
    <div class="themes">${themes}</div>
  </div>
</section>
<section class="section paper" aria-labelledby="lead-title">
  <div class="wrap">
    ${sectionHead('', `<span id="lead-title">${lang === 'ar' ? 'القيادة' : 'Leadership'}</span>`)}
    <div class="leaders">${leaderCards}</div>
    <div class="words">${words}</div>
  </div>
</section>
<section class="section dark timeline-sec" aria-labelledby="tl-title">
  ${rete('rete tl-rete')}
  <div class="wrap">
    ${sectionHead(lang === 'ar' ? 'محطات موثّقة' : 'Documented milestones', `<span id="tl-title">${lang === 'ar' ? 'مسيرة الاتحاد' : 'Our journey'}</span>`)}
    <ol class="timeline">${timeline}</ol>
  </div>
</section>`;
  return page(ctx, { title: lang === 'ar' ? 'عن الاتحاد' : 'About', description: t(about.intro, lang) }, main);
}

function chips(ctx, name, opts, all) {
  return `<div class="chips" role="group" aria-label="${esc(all.aria)}" data-chips="${name}">
  <button type="button" class="chip" aria-pressed="true" data-value="">${esc(all.label)}</button>
  ${opts.map(([v, label]) => `<button type="button" class="chip" aria-pressed="false" data-value="${v}">${esc(label)}</button>`).join('')}
</div>`;
}

function eventsPage(ctx) {
  const { lang } = ctx;
  const byYear = {};
  eventsSorted.forEach((e) => { (byYear[e.start.slice(0, 4)] = byYear[e.start.slice(0, 4)] || []).push(e); });
  const years = Object.keys(byYear).sort().reverse().map((y) => `<section class="year-group" data-group>
  <h2 class="year">${y}</h2>
  <div class="events-list">${byYear[y].map((e) => eventRow(ctx, e)).join('')}</div>
</section>`).join('');
  const main = `${pageHero(ctx, { eyebrow: lang === 'ar' ? 'محاضرات أسبوعية · مؤتمرات · ورش · رصد' : 'Weekly lectures · conferences · workshops · observing', title: lang === 'ar' ? 'الفعاليات' : 'Events', lead: lang === 'ar' ? 'محاضرات أسبوعية حضورياً وعبر الإنترنت، ومؤتمرات عربية ودولية، وورش ودورات، وأمسيات رصد للجمهور.' : 'Weekly lectures in person and online, Arab and international conferences, workshops and courses, and public observing evenings.', crumbs: [{ label: lang === 'ar' ? 'الفعاليات' : 'Events' }] })}
<section class="section paper">
  <div class="wrap">
    <div class="upcoming-note">${icon('info')}<p>${lang === 'ar' ? 'لا توجد فعاليات قادمة معلنة حالياً. تُعرض هنا أحدث فعاليات الاتحاد، وتظهر الفعاليات القادمة في أعلى الصفحة فور الإعلان عنها.' : 'No upcoming events have been announced yet. Below are the latest AUASS events; upcoming ones will appear at the top as soon as they are announced.'}</p></div>
    <div class="filter-bar">${chips(ctx, 'type', Object.entries(events.types).map(([k, v]) => [k, t(v, lang)]), { label: lang === 'ar' ? 'الكل' : 'All', aria: lang === 'ar' ? 'تصفية حسب النوع' : 'Filter by type' })}</div>
    <div data-filter-scope="type" data-attr="type">${years}</div>
    <p class="empty" data-empty hidden>${lang === 'ar' ? 'لا توجد فعاليات من هذا النوع.' : 'No events of this type.'}</p>
  </div>
</section>
${skySection(ctx)}`;
  return page(ctx, { title: lang === 'ar' ? 'الفعاليات' : 'Events' }, main);
}

function libraryPage(ctx) {
  const { lang } = ctx;
  const cols = library.collections.map((c) => {
    const n = library.items.filter((i) => i.c === c.id).length;
    return `<button type="button" class="col-card" data-col="${c.id}">${icon(c.glyph, 'ico big')}<span class="cc-title">${esc(t(c.title, lang))}</span><span class="cc-n">${n} ${lang === 'ar' ? 'عنصر' : n === 1 ? 'item' : 'items'}</span></button>`;
  }).join('');
  const groups = library.collections.map((c) => {
    const items = library.items.filter((i) => i.c === c.id);
    const rows = items.map((i) => {
      const title = t(i.title, lang), alt = i.alt ? t(i.alt, lang) : '';
      const text = [title, alt, t(i.meta, lang), i.sub ? t(i.sub, lang) : ''].join(' ').toLowerCase();
      const link = i.url ? `<a class="li-link" href="${i.url}" target="_blank" rel="noopener">${icon(i.kind === 'pdf' ? 'download' : 'external')}<span>${i.kind === 'pdf' ? (lang === 'ar' ? 'تحميل PDF' : 'Download PDF') : (lang === 'ar' ? 'زيارة الموقع' : 'Visit site')}</span></a>` : '';
      return `<li class="lib-item${i.featured ? ' featured' : ''}" data-text="${esc(text)}">
  ${i.n ? `<span class="li-n">${i.n}</span>` : ''}
  <div class="li-main">
    ${i.sub ? `<p class="kicker">${esc(t(i.sub, lang))}</p>` : ''}
    <h3 class="li-title"${i.lang === 'en' ? ' lang="en" dir="ltr"' : ''}>${esc(title)}${alt ? ` <span class="li-alt" ${lang === 'ar' ? 'lang="en" dir="ltr"' : 'lang="ar" dir="rtl"'}>${esc(alt)}</span>` : ''}</h3>
    ${i.meta && t(i.meta, lang) !== 'PDF' ? `<p class="li-meta">${esc(t(i.meta, lang))}</p>` : ''}
  </div>
  ${link}
</li>`;
    }).join('');
    return `<section class="lib-group" data-group="${c.id}" id="c-${c.id}">
  <header class="lg-head">${icon(c.glyph, 'ico big')}<div><h2>${esc(t(c.title, lang))}</h2><p>${esc(t(c.desc, lang))}</p></div></header>
  <ul class="lib-list${c.id === 'constellations' || c.id === 'craters' ? ' cols' : ''}">${rows}</ul>
  <button type="button" class="lib-more" data-more hidden>${lang === 'ar' ? `عرض الكل (${items.length})` : `Show all (${items.length})`}</button>
</section>`;
  }).join('');
  const main = `${pageHero(ctx, { eyebrow: lang === 'ar' ? 'مجلات · كتب · أبحاث · معارف فلكية' : 'Magazines · books · research · astronomy knowledge', title: lang === 'ar' ? 'المكتبة' : 'Library', lead: lang === 'ar' ? 'محتوى الاتحاد العلمي في مكان واحد، مع بحث فوري.' : "AUASS's scientific content in one place, with instant search.", crumbs: [{ label: lang === 'ar' ? 'المكتبة' : 'Library' }] })}
<section class="section paper library" data-library>
  <div class="wrap">
    <div class="search-box">
      ${icon('search')}
      <label class="sr" for="lib-q">${lang === 'ar' ? 'ابحث في المكتبة' : 'Search the library'}</label>
      <input id="lib-q" type="search" data-search placeholder="${lang === 'ar' ? 'ابحث: العقاب، البيروني، الهلال، Gaia…' : 'Search: Aquila, Al-Biruni, crescent, Gaia…'}" autocomplete="off">
    </div>
    <div class="col-grid" data-cols>${cols}</div>
    <p class="lib-status" data-status aria-live="polite"></p>
    <div class="lib-groups">${groups}</div>
    <p class="empty" data-empty hidden>${lang === 'ar' ? 'لا توجد نتائج مطابقة.' : 'No matching results.'}</p>
  </div>
</section>`;
  return page(ctx, { title: lang === 'ar' ? 'المكتبة' : 'Library' }, main);
}

function newsPage(ctx) {
  const { lang } = ctx;
  const main = `${pageHero(ctx, { eyebrow: '', title: lang === 'ar' ? 'الأخبار' : 'News', lead: lang === 'ar' ? 'أخبار الاتحاد ومحاضراته وإعلاناته.' : 'AUASS news, lectures and announcements.', crumbs: [{ label: lang === 'ar' ? 'الأخبار' : 'News' }] })}
<section class="section paper">
  <div class="wrap">
    <div class="filter-bar">
      <div class="search-box small">${icon('search')}<label class="sr" for="news-q">${lang === 'ar' ? 'ابحث في الأخبار' : 'Search news'}</label><input id="news-q" type="search" data-search placeholder="${lang === 'ar' ? 'ابحث في الأخبار' : 'Search news'}" autocomplete="off"></div>
      ${chips(ctx, 'cat', Object.entries(news.categories).map(([k, v]) => [k, t(v, lang)]), { label: lang === 'ar' ? 'الكل' : 'All', aria: lang === 'ar' ? 'تصفية حسب التصنيف' : 'Filter by category' })}
    </div>
    <div class="news-grid" data-filter-scope="cat" data-attr="cat">${postsSorted.map((p) => newsCard(ctx, p, { headingLevel: 2 })).join('')}</div>
    <p class="empty" data-empty hidden>${lang === 'ar' ? 'لا توجد أخبار مطابقة.' : 'No matching news.'}</p>
  </div>
</section>`;
  return page(ctx, { title: lang === 'ar' ? 'الأخبار' : 'News' }, main);
}

function articlePage(ctx, p) {
  const { lang } = ctx;
  const url = `https://itsak7m.github.io/auass-redesign/${prefix(lang)}news/${p.slug}/`;
  const share = [
    ['facebook', `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, 'Facebook'],
    ['whatsapp', `https://wa.me/?text=${encodeURIComponent(t(p.title, lang) + ' ' + url)}`, 'WhatsApp'],
    ['x', `https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(t(p.title, lang))}`, 'X']
  ].map(([i, h, l]) => `<a class="round-btn" href="${h}" target="_blank" rel="noopener" aria-label="${lang === 'ar' ? 'مشاركة عبر' : 'Share on'} ${l}">${icon(i)}</a>`).join('');
  const related = postsSorted.filter((x) => x.slug !== p.slug).slice(0, 3);
  const facts = p.facts ? `<dl class="facts">${p.facts.map((f) => `<div><dt>${esc(t(f.k, lang))}</dt><dd>${esc(t(f.v, lang))}</dd></div>`).join('')}</dl>` : '';
  const cta = p.cta ? `<p><a class="btn btn-brass" href="${ctx.r(prefix(lang))}${p.cta.href}">${esc(t(p.cta.label, lang))}</a></p>` : '';
  const main = `<article class="article">
  <header class="article-head dark">
    ${rete('rete page-rete')}
    <div class="wrap">
      <nav class="crumbs" aria-label="${lang === 'ar' ? 'مسار التنقل' : 'Breadcrumb'}"><a href="${ctx.r(prefix(lang))}">${lang === 'ar' ? 'الرئيسية' : 'Home'}</a><span aria-hidden="true">/</span><a href="${ctx.r(prefix(lang) + 'news/')}">${lang === 'ar' ? 'الأخبار' : 'News'}</a></nav>
      <p class="kicker">${esc(t(news.categories[p.category], lang))} · <time datetime="${p.date}">${fmtDate(p.date, lang)}</time></p>
      <h1 class="page-title">${bidi(t(p.title, lang), lang)}</h1>
      <p class="page-lead">${esc(t(p.excerpt, lang))}</p>
    </div>
  </header>
  <div class="section paper">
    <div class="wrap article-grid${p.image ? '' : ' no-image'}">
      ${p.image ? `<figure class="article-figure"><div class="frame${p.imageFit === 'contain' ? ' tall' : ''}"><img src="${ctx.r('assets/img/' + p.image)}" alt="${esc(t(p.title, lang))}"${p.imageFit === 'contain' ? ' class="fit-contain"' : ''}></div></figure>` : ''}
      <div class="article-body">
        ${facts}
        <div class="prose">${t(p.body, lang).map((x) => `<p>${esc(x)}</p>`).join('')}</div>
        ${cta}
        ${p.tags ? `<p class="tags" dir="ltr">${p.tags.map((x) => `<span>${esc(x)}</span>`).join('')}</p>` : ''}
        <div class="share"><span>${lang === 'ar' ? 'شارك الخبر' : 'Share'}</span>${share}<button type="button" class="round-btn" data-copy="${url}" aria-label="${lang === 'ar' ? 'نسخ الرابط' : 'Copy link'}">${icon('link')}</button><span class="copied" data-copied hidden>${lang === 'ar' ? 'تم نسخ الرابط' : 'Link copied'}</span></div>
      </div>
    </div>
  </div>
  <section class="section paper2" aria-labelledby="rel-title">
    <div class="wrap">
      ${sectionHead('', `<span id="rel-title">${lang === 'ar' ? 'أخبار أخرى' : 'More news'}</span>`, moreLink(ctx.r(prefix(lang) + 'news/'), lang === 'ar' ? 'كل الأخبار' : 'All news'))}
      <div class="news-grid three">${related.map((x) => newsCard(ctx, x)).join('')}</div>
    </div>
  </section>
</article>`;
  return page(ctx, { title: t(p.title, lang), description: t(p.excerpt, lang) }, main);
}

function demoForm(ctx, fields, submit) {
  const { lang } = ctx;
  const f = fields.map((x) => {
    const id = `f-${x.name}`;
    const req = x.required ? ' required' : '';
    const control = x.type === 'select'
      ? `<select id="${id}" name="${x.name}"${req}><option value="">${lang === 'ar' ? 'اختر' : 'Choose'}</option>${x.options.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`
      : x.type === 'textarea'
        ? `<textarea id="${id}" name="${x.name}" rows="4"${req}></textarea>`
        : `<input id="${id}" name="${x.name}" type="${x.type || 'text'}"${x.autocomplete ? ` autocomplete="${x.autocomplete}"` : ''}${x.type === 'email' ? ' dir="ltr"' : ''}${req}>`;
    return `<div class="field${x.wide ? ' wide' : ''}"><label for="${id}">${esc(x.label)}${x.required ? ' <span aria-hidden="true">*</span>' : ''}</label>${control}</div>`;
  }).join('');
  return `<form class="demo-form" data-demo-form novalidate>
  <div class="form-grid">${f}</div>
  <button type="submit" class="btn btn-brass">${esc(submit)}</button>
  <div class="demo-msg" role="status" data-demo-msg hidden>${icon('info')}<p>${lang === 'ar' ? 'هذا نموذج عرض ضمن التصميم المقترح، ولم يتم إرسال أي بيانات. في الموقع الفعلي يصل الطلب إلى أمانة الاتحاد.' : 'This is a demo form in the proposed design; no data has been sent. On the live site, the request would reach the AUASS secretariat.'}</p></div>
</form>`;
}

function joinPage(ctx) {
  const { lang } = ctx;
  const levels = join.levels.map((l) => `<article class="level reveal">
  ${icon(l.glyph, 'ico big')}
  <h3>${esc(t(l.title, lang))}</h3>
  <ul>${t(l.who, lang).map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
</article>`).join('');
  const steps = join.steps.map((s, i) => `<li><span class="step-n">${i + 1}</span><p>${esc(t(s, lang))}</p></li>`).join('');
  const form = demoForm(ctx, [
    { name: 'name', label: lang === 'ar' ? 'الاسم الكامل أو اسم الجهة' : 'Full name or organisation', required: true, autocomplete: 'name' },
    { name: 'org', label: lang === 'ar' ? 'المؤسسة أو الجمعية (إن وجدت)' : 'Institution or society (if any)', autocomplete: 'organization' },
    { name: 'country', label: lang === 'ar' ? 'الدولة' : 'Country', required: true, autocomplete: 'country-name' },
    { name: 'level', label: lang === 'ar' ? 'مستوى العضوية المطلوب' : 'Membership level', type: 'select', required: true, options: join.levels.filter((l) => l.id !== 'honorary').map((l) => t(l.title, lang)) },
    { name: 'email', label: lang === 'ar' ? 'البريد الإلكتروني' : 'Email', type: 'email', required: true, autocomplete: 'email' },
    { name: 'phone', label: lang === 'ar' ? 'رقم الهاتف' : 'Phone', type: 'tel', autocomplete: 'tel' },
    { name: 'msg', label: lang === 'ar' ? 'نبذة عن الجهة أو الاختصاص' : 'About your organisation or speciality', type: 'textarea', wide: true }
  ], lang === 'ar' ? 'إرسال طلب الانتساب' : 'Send application');
  const main = `${pageHero(ctx, { eyebrow: lang === 'ar' ? 'أربعة مستويات للعضوية' : 'Four membership levels', title: lang === 'ar' ? 'انضم للاتحاد' : 'Join AUASS', lead: t(join.intro, lang), crumbs: [{ label: lang === 'ar' ? 'انضم للاتحاد' : 'Join' }] })}
<section class="section paper">
  <div class="wrap">
    ${sectionHead('', lang === 'ar' ? 'مستويات العضوية' : 'Membership levels')}
    <div class="levels">${levels}</div>
  </div>
</section>
<section class="section paper2">
  <div class="wrap join-grid">
    <div>
      <h2 class="sec-title">${lang === 'ar' ? 'كيف تنضم؟' : 'How to join'}</h2>
      <ol class="steps">${steps}</ol>
      <details class="endings"><summary>${esc(t(join.endings.title, lang))}</summary><ul>${t(join.endings.items, lang).map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>
    </div>
    <div class="form-card">
      <h2 class="sec-title">${lang === 'ar' ? 'طلب الانتساب' : 'Application'}</h2>
      ${form}
    </div>
  </div>
</section>`;
  return page(ctx, { title: lang === 'ar' ? 'انضم للاتحاد' : 'Join AUASS', description: t(join.intro, lang) }, main);
}

function contactPage(ctx) {
  const { lang } = ctx;
  const form = demoForm(ctx, [
    { name: 'name', label: lang === 'ar' ? 'الاسم' : 'Name', required: true, autocomplete: 'name' },
    { name: 'email', label: lang === 'ar' ? 'البريد الإلكتروني' : 'Email', type: 'email', required: true, autocomplete: 'email' },
    { name: 'topic', label: lang === 'ar' ? 'الموضوع' : 'Topic', type: 'select', options: lang === 'ar' ? ['استفسار عام', 'الفعاليات والمحاضرات', 'العضوية', 'التعاون والشراكات', 'الإعلام'] : ['General enquiry', 'Events and lectures', 'Membership', 'Cooperation and partnerships', 'Media'], wide: true },
    { name: 'msg', label: lang === 'ar' ? 'الرسالة' : 'Message', type: 'textarea', required: true, wide: true }
  ], lang === 'ar' ? 'إرسال' : 'Send');
  const main = `${pageHero(ctx, { eyebrow: '', title: lang === 'ar' ? 'اتصل بنا' : 'Contact us', lead: lang === 'ar' ? 'مقر الاتحاد في عمّان، الأردن.' : 'AUASS headquarters, Amman, Jordan.', crumbs: [{ label: lang === 'ar' ? 'اتصل بنا' : 'Contact' }] })}
<section class="section paper">
  <div class="wrap contact-grid">
    <div class="contact-info">
      <div class="ci">${icon('pin', 'ico big')}<div><h2>${lang === 'ar' ? 'العنوان' : 'Address'}</h2><p>${esc(t(site.address, lang))}</p><a class="more" href="${site.mapUrl}" target="_blank" rel="noopener">${lang === 'ar' ? 'افتح على الخريطة' : 'Open in Maps'}${icon('external')}</a></div></div>
      <div class="ci">${icon('mail', 'ico big')}<div><h2>${lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}</h2><p><a href="mailto:${site.email}" dir="ltr">${site.email}</a></p></div></div>
      <div class="ci">${icon('globe', 'ico big')}<div><h2>${lang === 'ar' ? 'تابعونا' : 'Follow us'}</h2><div class="social dark-ink">${site.social.map((s) => `<a href="${s.url}" target="_blank" rel="noopener" aria-label="${s.label}">${icon(s.id)}</a>`).join('')}</div></div></div>
    </div>
    <div class="form-card">
      <h2 class="sec-title">${lang === 'ar' ? 'أرسل رسالة' : 'Send a message'}</h2>
      ${form}
    </div>
  </div>
</section>`;
  return page(ctx, { title: lang === 'ar' ? 'اتصل بنا' : 'Contact' }, main);
}

function beforeAfterPage(ctx) {
  // Measured from the Arabic home page this build just wrote.
  const home = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
  const stats = { new: {
    scripts: (home.match(/<script[^>]*\ssrc=/g) || []).length,
    styles: (home.match(/rel="stylesheet"/g) || []).length,
    htmlKB: Math.round(Buffer.byteLength(home) / 1024)
  } };
  const row = (label, a, b) => `<tr><th scope="row">${label}</th><td class="old">${a}</td><td class="new">${b}</td></tr>`;
  const shot = (img, cap, cls = '') => `<figure class="ba-shot ${cls}"><img src="${ctx.r('assets/img/before-after/' + img)}" alt="${esc(cap)}" loading="lazy"><figcaption>${esc(cap)}</figcaption></figure>`;
  const main = `${pageHero(ctx, { eyebrow: 'للعرض فقط · ليست جزءاً من الموقع', title: 'قبل وبعد', lead: 'مقارنة بين الموقع الحالي والتصميم المقترح، من حيث المنيو والصفحة الرئيسية والموبايل والأداء.', crumbs: [{ label: 'قبل وبعد' }] })}
<section class="section paper">
  <div class="wrap">
    ${sectionHead('سطح المكتب، 1440 بكسل', 'الشاشة الأولى')}
    <div class="ba-pair">${shot('old-1440.png', 'الحالي: بانر منتهٍ لجهة أخرى، وتحته فيديو غير متاح')}${shot('new-1440.png', 'المقترح: تعريف بالاتحاد ومصداقيته، وأحدث فعالية')}</div>
  </div>
</section>
<section class="section paper2">
  <div class="wrap">
    ${sectionHead('الموبايل، 390 بكسل', 'على الهاتف')}
    <div class="ba-pair phones">${shot('old-390.png', 'الحالي', 'phone')}${shot('new-390.png', 'المقترح', 'phone')}</div>
  </div>
</section>
<section class="section paper">
  <div class="wrap">
    ${sectionHead('بالأرقام', 'المنيو والأداء')}
    <div class="table-wrap"><table class="ba-table">
      <thead><tr><th scope="col"></th><th scope="col">الموقع الحالي</th><th scope="col">المقترح</th></tr></thead>
      <tbody>
        ${row('عناوين المنيو', '6 عناوين، و4 مستويات، وحوالي 45 رابطاً', '5 عناوين وزر انضمام، ومستوى واحد')}
        ${row('"عن الاتحاد" في المنيو', 'غير موجود (في التذييل فقط)', 'ثاني عنوان في المنيو')}
        ${row('ملفات JavaScript في الرئيسية', '41', String(stats.new.scripts))}
        ${row('ملفات CSS في الرئيسية', '58', String(stats.new.styles))}
        ${row('حجم HTML للرئيسية', '≈ 380 كيلوبايت', `≈ ${stats.new.htmlKB} كيلوبايت`)}
        ${row('عنوان h1 في الرئيسية', 'غير موجود', 'موجود')}
        ${row('النسخة الإنجليزية', 'آخر خبر: 5 تموز 2025', 'كل الصفحات مترجمة، والزر ينقلك للصفحة نفسها')}
        ${row('أخبار بلا صورة', 'مربع رمادي فارغ', 'بطاقة بنقوش الإسطرلاب')}
        ${row('طلب الانتساب', 'نص طويل بلا نموذج', 'أربعة مستويات، وخطوات، ونموذج طلب')}
      </tbody>
    </table></div>
    <p class="note">أرقام الموقع الحالي من فحص 26 تشرين الأول 2026. أرقام المقترح تُقاس تلقائياً عند بناء النموذج.</p>
  </div>
</section>`;
  return page(ctx, { title: 'قبل وبعد' }, main);
}

function notFoundPage(ctx) {
  return page(ctx, { title: '404' }, `${pageHero(ctx, { title: 'الصفحة غير موجودة · Page not found', lead: '' })}<section class="section paper"><div class="wrap"><p><a class="btn btn-brass" href="${ctx.r('')}">الرئيسية</a> <a class="btn btn-ghost-dark" href="${ctx.r('en/')}">Home (English)</a></p></div></section>`);
}

// ---------- write ----------
function ctxFor(lang, pagePath, section, altPath) {
  const r = (to) => rel(prefix(lang) + pagePath, to);
  const altLang = lang === 'ar' ? 'en' : 'ar';
  return { lang, section, page: pagePath, r, altLang, altHref: r(prefix(altLang) + (altPath != null ? altPath : pagePath)) };
}
function write(rel, html) {
  const file = path.join(OUT, rel, 'index.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
}
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, f.name), d = path.join(dst, f.name);
    f.isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
copyDir(path.join(__dirname, 'assets'), path.join(OUT, 'assets'));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

const pages = [
  ['', 'home', homePage], ['about/', 'about', aboutPage], ['events/', 'events', eventsPage], ['library/', 'library', libraryPage],
  ['news/', 'news', newsPage], ['join/', 'join', joinPage], ['contact/', 'contact', contactPage]
];
for (const lang of LANGS) {
  for (const [p, section, fn] of pages) write(prefix(lang) + p, fn(ctxFor(lang, p, section)));
  for (const post of news.posts) {
    const p = `news/${post.slug}/`;
    write(prefix(lang) + p, articlePage(ctxFor(lang, p, 'news'), post));
  }
}
write('before-after/', beforeAfterPage(ctxFor('ar', 'before-after/', 'before-after', '')));
const nf = ctxFor('ar', '', 'notfound');
fs.writeFileSync(path.join(OUT, '404.html'), notFoundPage({ ...nf, r: (to) => '/auass-redesign/' + to }));
console.log('built', LANGS.length * (pages.length + news.posts.length) + 2, 'pages into docs/');

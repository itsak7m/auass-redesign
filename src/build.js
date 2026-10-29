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
const about = load('about'), library = load('library'), join = load('join'), moon = load('moon');
const LANGS = ['ar', 'en'];
// Posts migrated from the old WordPress site, one JSON file each (see README).
const POSTS_DIR = path.join(ROOT, 'content', 'posts');
const archive = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(POSTS_DIR, f), 'utf8')));
const archiveById = Object.fromEntries(archive.map((a) => [a.id, a]));
// Pages migrated from the old site (conferences, AW-ROAD, knowledge pages...).
const PAGES_DIR = path.join(ROOT, 'content', 'pages');
const infoPages = fs.readdirSync(PAGES_DIR).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(PAGES_DIR, f), 'utf8')))
  .sort((a, b) => a.order - b.order);
const council = load('council');
const ui0 = (ar, en) => ({ ar, en });
const PAGE_GROUPS = {
  series: ui0('سلاسل المؤتمرات والأنشطة', 'Conference series and activities'),
  arab: ui0('المؤتمرات العربية لعلوم الفضاء والفلك', 'The Arab Conferences for Astronomy and Space Sciences'),
  other: ui0('مؤتمرات وندوات وملتقيات أخرى', 'Other conferences, meetings and workshops'),
  awroad: ui0('المكتب الإقليمي لتنمية الفلك', 'AW-ROAD'),
  more: ui0('الهيئات الفلكية العربية', 'Arab astronomy bodies'),
  legal: ui0('السياسات', 'Policies'),
  knowledge: ui0('معارف فلكية', 'Astronomy knowledge')
};
const pagePath = (pg) => `${pg.section}/${pg.slug}/`;
// Cache-busting token: changes only when the stylesheet or scripts change, so
// rebuilding unchanged content gives byte-identical pages.
const BUILD_VERSION = require('crypto').createHash('sha1')
  .update(['css/style.css', 'js/main.js', 'js/moon.js'].map((f) => fs.readFileSync(path.join(__dirname, 'assets', f))).join('')).digest('hex').slice(0, 8);

// ---------- helpers ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// In Arabic text, isolate embedded Latin runs such as "(ASI Hack)" so brackets
// don't flip when a line wraps.
// Short runs are kept on one line; long ones may wrap so they never overflow.
const bidi = (s, lang) => (lang === 'ar' ? esc(s).replace(/\(?[A-Za-z][A-Za-z0-9 .\-]*[A-Za-z0-9]\)?/g, (m) => `<bdi dir="ltr"${m.length <= 24 ? ' class="nw"' : ''}>${m}</bdi>`) : esc(s));
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
    <p class="f-legal">${infoPages.filter((x) => x.group === 'legal').map((pg) => `<a href="${ctx.r(prefix(lang) + pagePath(pg))}">${esc(pageTitle(pg, lang))}</a>`).join(' · ')}</p>
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
const eventsSorted = [...events.items].sort((a, b) => (a.start < b.start ? 1 : -1));
const TYPE_GLYPH = { auass: 'seal', event: 'telescope', science: 'orbit', article: 'book' };
const typeLabel = (type, lang) => t(news.types[type], lang);
const newsHref = (ctx, slug) => ctx.r(prefix(ctx.lang) + `news/${slug}/`);

// One feed per language: the hand-written posts (in both languages) plus the
// migrated archive posts written in that language. Paths are relative to the
// language root; image paths are relative to the site root.
function feedItem(p, lang) {
  if (p.slug) {
    return { key: p.slug, date: p.date, type: p.type, title: t(p.title, lang), excerpt: t(p.excerpt, lang), path: `news/${p.slug}/`,
      thumb: p.image ? curatedImg(p.image) : '', fit: p.imageFit === 'contain', curated: true };
  }
  const tr = lang === 'en' && p.lang === 'ar' && p.en ? p.en : null;
  return { key: String(p.id), date: p.date, type: p.type, title: tr ? tr.title : p.title, excerpt: tr ? tr.excerpt || '' : p.excerpt, path: `news/${p.id}/`,
    thumb: p.image ? `media/${p.image}-s.webp` : '', curated: false };
}
// Hand-written posts keep images in assets/img; uploads from the content manager land in media/.
const curatedImg = (img) => (img.startsWith('media/') ? img : 'assets/img/' + img);
const byDate = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
// An archive post appears in a language when it was written in it, or (for
// English) when it carries a translation under `en`.
const inLang = (a, lang) => a.lang === lang || (lang === 'en' && !!a.en);
const FEED = Object.fromEntries(LANGS.map((lang) => [lang, [...news.posts.map((p) => feedItem(p, lang)), ...archive.filter((a) => inLang(a, lang)).map((a) => feedItem(a, lang))].sort(byDate)]));
const postsSorted = [...news.posts].sort(byDate);

function fallbackFrame(type, lang) {
  return `<div class="frame frame-fallback">${rete('rete')}${icon(TYPE_GLYPH[type], 'ico big')}<span>${esc(typeLabel(type, lang))}</span></div>`;
}

function newsCard(ctx, it, { headingLevel = 3 } = {}) {
  const { lang } = ctx;
  const media = it.thumb
    ? `<div class="frame"><img src="${ctx.r(it.thumb)}" alt="" loading="lazy" decoding="async"${it.fit ? ' class="fit-contain"' : ''}></div>`
    : fallbackFrame(it.type, lang);
  return `<article class="news-card" data-cat="${it.type}" data-text="${esc((it.title + ' ' + it.excerpt).toLowerCase())}">
  <a class="card-link" href="${ctx.r(prefix(lang) + it.path)}">
    ${media}
    <div class="nc-body">
      <p class="kicker">${esc(typeLabel(it.type, lang))}</p>
      <h${headingLevel} class="nc-title">${bidi(it.title, lang)}</h${headingLevel}>
      <p class="nc-date"><time datetime="${it.date}">${fmtDate(it.date, lang)}</time></p>
    </div>
  </a>
</article>`;
}

// Compact row used by the year archive and the events archive.
function newsRow(ctx, it) {
  const { lang } = ctx;
  return `<li class="news-row" data-cat="${it.type}">
  <a href="${ctx.r(prefix(lang) + it.path)}">
    ${it.thumb ? `<img src="${ctx.r(it.thumb)}" alt="" loading="lazy" decoding="async" width="96" height="72">` : `<span class="nr-glyph">${icon(TYPE_GLYPH[it.type])}</span>`}
    <span class="nr-main"><span class="kicker">${esc(typeLabel(it.type, lang))} · <time datetime="${it.date}">${fmtDate(it.date, lang)}</time></span><span class="nr-title">${bidi(it.title, lang)}</span></span>
  </a>
</li>`;
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

// Tonight's Moon and the next total solar eclipse over the Arab world.
// Both are computed in the browser (main.js) from the current date.
function tonight(ctx) {
  const { lang } = ctx;
  return `<div class="tonight" data-tonight hidden>
  <div class="tn-card">
    <svg class="tn-moon" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="45" class="tn-dark"/><path class="tn-lit" data-moon-lit d=""/><circle cx="50" cy="50" r="45" class="tn-rim"/></svg>
    <div><p class="kicker">${lang === 'ar' ? 'القمر الليلة' : 'The Moon tonight'}</p><p class="tn-big" data-moon-name></p><p class="tn-small" data-moon-info></p></div>
  </div>
  <div class="tn-card">
    ${skyGlyph('eclipse')}
    <div><p class="kicker">${lang === 'ar' ? 'الكسوف الكلي القادم في المنطقة العربية' : 'Next total solar eclipse over the Arab world'}</p><p class="tn-big"><span data-eclipse-days></span></p><p class="tn-small">${lang === 'ar' ? '2 آب 2027: كلّي في المغرب والجزائر وتونس وليبيا ومصر والسعودية واليمن، وجزئي في الأردن وبلاد الشام.' : '2 August 2027: total across Morocco, Algeria, Tunisia, Libya, Egypt, Saudi Arabia and Yemen; partial in Jordan and the Levant.'}</p></div>
  </div>
</div>`;
}

function skySection(ctx, { standalone = false, withTonight = false } = {}) {
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
    ${withTonight ? tonight(ctx) : ''}
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
    if (h.id === 'craters') {
      return `<a class="heritage-card moon-card reveal" href="${ctx.r(prefix(lang) + 'moon/')}">
  <img class="mc-img" src="${ctx.r('assets/img/moon/moon-preview.jpg')}" alt="" loading="lazy" width="320" height="320">
  <p class="hc-n"><b>${h.n}</b> ${esc(t(h.unit, lang))}</p>
  <h3 class="hc-title">${esc(t(c.title, lang))}</h3>
  <p class="hc-desc">${lang === 'ar' ? 'لفّ القمر ثلاثي الأبعاد واكتشف الفوهات وأصحابها، ومنها سبع في الجهة البعيدة.' : 'Spin a 3D Moon and discover each crater and its namesake, including seven on the far side.'}</p>
  <span class="more">${lang === 'ar' ? 'استكشف القمر' : 'Explore the Moon'}${icon('arrow', 'ico flip')}</span>
</a>`;
    }
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
    <div class="news-grid">${FEED[lang].slice(0, 4).map((it) => newsCard(ctx, it)).join('')}</div>
  </div>
</section>`;

  return page(ctx, { title: '', description: t(site.description, lang) }, hero + skySection(ctx, { withTonight: true }) + evs + joinBand + heritage + newsSec);
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
<section class="section paper2" aria-labelledby="more-title">
  <div class="wrap">
    ${sectionHead('', `<span id="more-title">${lang === 'ar' ? 'المزيد عن الاتحاد' : 'More about AUASS'}</span>`)}
    <ul class="page-links">
      <li><a href="${ctx.r(prefix(lang) + 'about/council/')}">${icon('network')}<span>${lang === 'ar' ? `المجلس الأعلى للاتحاد (${council.members.length} عضواً)` : `The AUASS High Council (${council.members.length} members)`}</span></a></li>
      <li><a href="${ctx.r(prefix(lang) + 'events/conferences/')}">${icon('seal')}<span>${lang === 'ar' ? 'مؤتمرات الاتحاد' : 'AUASS conferences'}</span></a></li>
    </ul>
    ${pageLinks(ctx, infoPages.filter((x) => x.section === 'about' && x.group !== 'legal'))}
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
<section class="section paper" aria-labelledby="conf-title">
  <div class="wrap conf-band">
    <div>${icon('seal', 'ico big')}<h2 class="sec-title" id="conf-title">${lang === 'ar' ? 'مؤتمرات الاتحاد' : 'AUASS conferences'}</h2><p>${lang === 'ar' ? `${infoPages.filter((x) => x.section === 'events').length} صفحة عن المؤتمرات العربية والمؤتمر الفلكي الإسلامي والملتقيات والندوات.` : `${infoPages.filter((x) => x.section === 'events').length} pages on the Arab conferences, the Islamic Astronomical Conference, meetings and seminars.`}</p></div>
    <a class="btn btn-navy" href="${ctx.r(prefix(lang) + 'events/conferences/')}">${lang === 'ar' ? 'تصفّح المؤتمرات' : 'Browse the conferences'}</a>
  </div>
</section>
${eventsArchive(ctx)}
${skySection(ctx)}`;
  return page(ctx, { title: lang === 'ar' ? 'الفعاليات' : 'Events' }, main);
}

// Every lecture, workshop and conference post in the archive, by year.
function eventsArchive(ctx) {
  const { lang } = ctx;
  const items = FEED[lang].filter((it) => it.type === 'event' && !it.curated);
  const byYear = {};
  items.forEach((it) => { (byYear[it.date.slice(0, 4)] = byYear[it.date.slice(0, 4)] || []).push(it); });
  const years = Object.keys(byYear).sort().reverse();
  return `<section class="section paper2" aria-labelledby="eva-title">
  <div class="wrap">
    ${sectionHead(lang === 'ar' ? `${items.length} منشوراً عن المحاضرات والورش والمؤتمرات` : `${items.length} posts about lectures, workshops and conferences`, `<span id="eva-title">${lang === 'ar' ? 'أرشيف الفعاليات' : 'Events archive'}</span>`)}
    <div class="ev-archive">${years.map((y, i) => `<details class="eva-year"${i === 0 ? ' open' : ''}><summary><span class="year">${y}</span><span class="eva-n">${byYear[y].length}</span></summary><ul class="news-rows">${byYear[y].map((it) => newsRow(ctx, it)).join('')}</ul></details>`).join('')}</div>
  </div>
</section>`;
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
      const moonLink = i.c === 'craters' ? `<a class="li-link" href="${ctx.r(prefix(lang) + 'moon/')}#${i.alt.ar.toLowerCase().replace(/[^a-z]+/g, '-')}">${icon('crater')}<span>${lang === 'ar' ? 'على القمر' : 'On the Moon'}</span></a>` : '';
      const link = moonLink || (i.url ? `<a class="li-link" href="${i.url}" target="_blank" rel="noopener">${icon(i.kind === 'pdf' ? 'download' : 'external')}<span>${i.kind === 'pdf' ? (lang === 'ar' ? 'تحميل PDF' : 'Download PDF') : (lang === 'ar' ? 'زيارة الموقع' : 'Visit site')}</span></a>` : '');
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
  <header class="lg-head">${icon(c.glyph, 'ico big')}<div><h2>${esc(t(c.title, lang))}</h2><p>${esc(t(c.desc, lang))}</p>${c.id === 'craters' ? `<a class="btn btn-navy lg-cta" href="${ctx.r(prefix(lang) + 'moon/')}">${icon('crater')}${lang === 'ar' ? 'استكشفها على القمر ثلاثي الأبعاد' : 'Explore them on the 3D Moon'}</a>` : ''}</div></header>
  <ul class="lib-list${c.id === 'constellations' || c.id === 'craters' ? ' cols' : ''}">${rows}</ul>
  <button type="button" class="lib-more" data-more hidden>${lang === 'ar' ? `عرض الكل (${items.length})` : `Show all (${items.length})`}</button>
</section>`;
  }).join('');
  const main = `${pageHero(ctx, { eyebrow: lang === 'ar' ? 'مجلات · كتب · أبحاث · معارف فلكية' : 'Magazines · books · research · astronomy knowledge', title: lang === 'ar' ? 'المكتبة' : 'Library', lead: lang === 'ar' ? 'محتوى الاتحاد العلمي في مكان واحد، مع بحث فوري.' : "AUASS's scientific content in one place, with instant search.", crumbs: [{ label: lang === 'ar' ? 'المكتبة' : 'Library' }] })}
<section class="section paper library" data-library>
  <div class="wrap">
    <p class="lib-wm"><a class="btn btn-navy" href="${ctx.r(prefix(lang) + 'worship-months/')}">${icon('calendar')}${lang === 'ar' ? 'أشهر العبادة: حسابات فلكية لرمضان والعيدين ومحرم' : 'Months of worship: astronomical dates for Ramadan, the Eids and Muharram'}</a></p>
    <div class="search-box">
      ${icon('search')}
      <label class="sr" for="lib-q">${lang === 'ar' ? 'ابحث في المكتبة' : 'Search the library'}</label>
      <input id="lib-q" type="search" data-search placeholder="${lang === 'ar' ? 'ابحث: العقاب، البيروني، الهلال، Gaia…' : 'Search: Aquila, Al-Biruni, crescent, Gaia…'}" autocomplete="off">
    </div>
    <div class="col-grid" data-cols>${cols}</div>
    <div class="knowledge"><h2 class="kn-title">${lang === 'ar' ? 'صفحات معرفية' : 'Knowledge pages'}</h2>${pageLinks(ctx, infoPages.filter((x) => x.section === 'library'))}</div>
    <p class="lib-status" data-status aria-live="polite"></p>
    <div class="lib-groups">${groups}</div>
    <p class="empty" data-empty hidden>${lang === 'ar' ? 'لا توجد نتائج مطابقة.' : 'No matching results.'}</p>
  </div>
</section>`;
  return page(ctx, { title: lang === 'ar' ? 'المكتبة' : 'Library' }, main);
}

const NEWS_FIRST = 24;
const NEWS_VERSION = require('crypto').createHash('sha1').update(JSON.stringify(FEED)).digest('hex').slice(0, 8);
const yearsOf = (lang) => [...new Set(FEED[lang].map((it) => it.date.slice(0, 4)))].sort().reverse();

function yearNav(ctx, current) {
  const { lang } = ctx;
  const counts = {};
  FEED[lang].forEach((it) => { const y = it.date.slice(0, 4); counts[y] = (counts[y] || 0) + 1; });
  return `<nav class="year-nav" aria-label="${lang === 'ar' ? 'الأرشيف حسب السنة' : 'Archive by year'}">
  <h2 class="yn-title">${lang === 'ar' ? 'الأرشيف حسب السنة' : 'Archive by year'}</h2>
  <ul>${yearsOf(lang).map((y) => `<li><a href="${ctx.r(prefix(lang) + `news/${y}/`)}"${y === current ? ' aria-current="page"' : ''}>${y} <span>${counts[y]}</span></a></li>`).join('')}</ul>
</nav>`;
}

function newsPage(ctx) {
  const { lang } = ctx;
  const feed = FEED[lang];
  const tpl = Object.keys(news.types).map((k) => `<template data-fallback="${k}">${fallbackFrame(k, lang)}</template>`).join('');
  const arCount = FEED.ar.length;
  const main = `${pageHero(ctx, { eyebrow: lang === 'ar' ? `${feed.length} منشوراً منذ ${yearsOf(lang).slice(-1)[0]}` : `${feed.length} posts since ${yearsOf(lang).slice(-1)[0]}`, title: lang === 'ar' ? 'الأخبار والمقالات' : 'News and articles', lead: lang === 'ar' ? 'أخبار الاتحاد ومحاضراته، وأخبار علمية ومقالات فلكية، ومعها أرشيف الموقع منذ سنواته الأولى.' : 'AUASS news and lectures, science news and astronomy articles, together with the archive of the old site.', crumbs: [{ label: lang === 'ar' ? 'الأخبار' : 'News' }] })}
<section class="section paper" data-news data-index="${ctx.r(prefix(lang) + 'news/index.json')}?v=${NEWS_VERSION}" data-root="${ctx.r(prefix(lang))}" data-site="${ctx.r('')}" data-first="${NEWS_FIRST}">
  <div class="wrap">
    ${lang === 'en' ? `<div class="upcoming-note">${icon('info')}<p>Most of the AUASS archive is in Arabic. News, events and articles appear here in full English translation; science news shows an English title and summary with the original Arabic text. <a href="${ctx.r('news/')}" hreflang="ar">The Arabic news page</a> has all ${arCount} Arabic posts.</p></div>` : ''}
    <div class="filter-bar">
      <div class="search-box small">${icon('search')}<label class="sr" for="news-q">${lang === 'ar' ? 'ابحث في الأخبار' : 'Search news'}</label><input id="news-q" type="search" data-search placeholder="${lang === 'ar' ? 'ابحث: المريخ، الهلال، كسوف…' : 'Search: Mars, crescent, eclipse…'}" autocomplete="off"></div>
      ${chips(ctx, 'cat', Object.entries(news.types).map(([k, v]) => [k, t(v, lang)]), { label: lang === 'ar' ? 'الكل' : 'All', aria: lang === 'ar' ? 'تصفية حسب النوع' : 'Filter by type' })}
    </div>
    <p class="lib-status" data-news-status aria-live="polite"></p>
    <div class="news-grid" data-news-list>${feed.slice(0, NEWS_FIRST).map((it) => newsCard(ctx, it, { headingLevel: 2 })).join('')}</div>
    <p class="empty" data-empty hidden>${lang === 'ar' ? 'لا توجد أخبار مطابقة.' : 'No matching news.'}</p>
    <p class="more-row"><button type="button" class="btn btn-ghost-dark" data-news-more>${lang === 'ar' ? 'عرض المزيد' : 'Show more'}</button></p>
    ${yearNav(ctx)}
    ${tpl}
  </div>
</section>`;
  return page(ctx, { title: lang === 'ar' ? 'الأخبار' : 'News' }, main);
}

function newsIndexJson(lang) {
  // Compact search index for the news page: title, date, type, path, thumb, text.
  return JSON.stringify(FEED[lang].map((it) => ({ t: it.title, d: it.date, y: it.type, u: it.path, i: it.thumb, x: it.excerpt.slice(0, 140) })));
}

function newsYearPage(ctx, year) {
  const { lang } = ctx;
  const items = FEED[lang].filter((it) => it.date.startsWith(year));
  const byMonth = {};
  items.forEach((it) => { const m = Number(it.date.slice(5, 7)); (byMonth[m] = byMonth[m] || []).push(it); });
  const months = Object.keys(byMonth).map(Number).sort((a, b) => b - a).map((m) => `<section class="year-group" data-group>
  <h2 class="year">${MONTHS[lang][m - 1]} ${year}</h2>
  <ul class="news-rows">${byMonth[m].map((it) => newsRow(ctx, it)).join('')}</ul>
</section>`).join('');
  const main = `${pageHero(ctx, { eyebrow: lang === 'ar' ? `${items.length} منشوراً` : `${items.length} posts`, title: lang === 'ar' ? `أرشيف ${year}` : `${year} archive`, crumbs: [{ label: lang === 'ar' ? 'الأخبار' : 'News', href: ctx.r(prefix(lang) + 'news/') }, { label: year }] })}
<section class="section paper">
  <div class="wrap">
    <div class="filter-bar">${chips(ctx, 'cat', Object.entries(news.types).map(([k, v]) => [k, t(v, lang)]), { label: lang === 'ar' ? 'الكل' : 'All', aria: lang === 'ar' ? 'تصفية حسب النوع' : 'Filter by type' })}</div>
    <div data-filter-scope="cat" data-attr="cat">${months}</div>
    <p class="empty" data-empty hidden>${lang === 'ar' ? 'لا توجد منشورات من هذا النوع في هذه السنة.' : 'No posts of this type in this year.'}</p>
    ${yearNav(ctx, year)}
  </div>
</section>`;
  return page(ctx, { title: lang === 'ar' ? `أرشيف الأخبار ${year}` : `News archive ${year}` }, main);
}

function shareBar(ctx, url, title) {
  const { lang } = ctx;
  const share = [
    ['facebook', `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, 'Facebook'],
    ['whatsapp', `https://wa.me/?text=${encodeURIComponent(title + ' ' + url)}`, 'WhatsApp'],
    ['x', `https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`, 'X']
  ].map(([i, h, l]) => `<a class="round-btn" href="${h}" target="_blank" rel="noopener" aria-label="${lang === 'ar' ? 'مشاركة عبر' : 'Share on'} ${l}">${icon(i)}</a>`).join('');
  return `<div class="share"><span>${lang === 'ar' ? 'شارك' : 'Share'}</span>${share}<button type="button" class="round-btn" data-copy="${url}" aria-label="${lang === 'ar' ? 'نسخ الرابط' : 'Copy link'}">${icon('link')}</button><span class="copied" data-copied hidden>${lang === 'ar' ? 'تم نسخ الرابط' : 'Link copied'}</span></div>`;
}

function relatedSection(ctx, items) {
  const { lang } = ctx;
  return `<section class="section paper2" aria-labelledby="rel-title">
    <div class="wrap">
      ${sectionHead('', `<span id="rel-title">${lang === 'ar' ? 'منشورات أخرى' : 'More posts'}</span>`, moreLink(ctx.r(prefix(lang) + 'news/'), lang === 'ar' ? 'كل الأخبار' : 'All news'))}
      <div class="news-grid three">${items.map((x) => newsCard(ctx, x)).join('')}</div>
    </div>
  </section>`;
}

function articlePage(ctx, p) {
  const { lang } = ctx;
  const url = `https://itsak7m.github.io/auass-redesign/${prefix(lang)}news/${p.slug}/`;
  const related = FEED[lang].filter((x) => x.key !== p.slug).slice(0, 3);
  const facts = p.facts ? `<dl class="facts">${p.facts.map((f) => `<div><dt>${esc(t(f.k, lang))}</dt><dd>${esc(t(f.v, lang))}</dd></div>`).join('')}</dl>` : '';
  const cta = p.cta ? `<p><a class="btn btn-brass" href="${ctx.r(prefix(lang))}${p.cta.href}">${esc(t(p.cta.label, lang))}</a></p>` : '';
  const main = `<article class="article">
  <header class="article-head dark">
    ${rete('rete page-rete')}
    <div class="wrap">
      <nav class="crumbs" aria-label="${lang === 'ar' ? 'مسار التنقل' : 'Breadcrumb'}"><a href="${ctx.r(prefix(lang))}">${lang === 'ar' ? 'الرئيسية' : 'Home'}</a><span aria-hidden="true">/</span><a href="${ctx.r(prefix(lang) + 'news/')}">${lang === 'ar' ? 'الأخبار' : 'News'}</a></nav>
      <p class="kicker">${esc(typeLabel(p.type, lang))} · <time datetime="${p.date}">${fmtDate(p.date, lang)}</time></p>
      <h1 class="page-title">${bidi(t(p.title, lang), lang)}</h1>
      <p class="page-lead">${esc(t(p.excerpt, lang))}</p>
    </div>
  </header>
  <div class="section paper">
    <div class="wrap article-grid${p.image ? '' : ' no-image'}">
      ${p.image ? `<figure class="article-figure"><div class="frame${p.imageFit === 'contain' ? ' tall' : ''}"><img src="${ctx.r(curatedImg(p.image))}" alt="${esc(t(p.title, lang))}"${p.imageFit === 'contain' ? ' class="fit-contain"' : ''}></div></figure>` : ''}
      <div class="article-body">
        ${facts}
        <div class="prose">${t(p.body, lang).map((x) => `<p>${esc(x)}</p>`).join('')}</div>
        ${cta}
        ${p.tags ? `<p class="tags" dir="ltr">${p.tags.map((x) => `<span>${esc(x)}</span>`).join('')}</p>` : ''}
        ${shareBar(ctx, url, t(p.title, lang))}
      </div>
    </div>
  </div>
  ${relatedSection(ctx, related)}
</article>`;
  return page(ctx, { title: t(p.title, lang), description: t(p.excerpt, lang) }, main);
}

// Body HTML of a migrated post: resolve media and post links, lazy-load
// images, open external links in a new tab and turn embeds into light links.
function archiveBody(ctx, html) {
  const { lang } = ctx;
  return html
    .replace(/@media\//g, ctx.r('media/'))
    .replace(/href="@site:([^"]*)"/g, (m, path) => `href="${ctx.r(prefix(lang) + path)}"`)
    .replace(/href="@post:(\d+)"/g, (m, id) => { const a = archiveById[id]; return `href="${ctx.r(prefix(a && inLang(a, lang) ? lang : a ? a.lang : 'ar') + `news/${id}/`)}"`; })
    .replace(/<img /g, '<img loading="lazy" decoding="async" ')
    .replace(/<t([dh])(?=[ >])/g, '<t$1 dir="auto"')
    .replace(/<a href="(https?:[^"]*)"/g, (m, h) => `<a href="${h}" target="_blank" rel="noopener"`)
    .replace(/<p class="yt" data-yt="([\w-]{11})"><\/p>/g, (m, id) => `<p class="yt"><a href="https://www.youtube.com/watch?v=${id}" target="_blank" rel="noopener" data-yt="${id}"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" width="480" height="360" onerror="this.remove()"><span class="yt-play">${icon('play')}<span>${lang === 'ar' ? 'تشغيل الفيديو' : 'Play video'}</span></span></a></p>`)
    .replace(/<p class="media-file" (?:data-kind="(video|audio)" data-href="([^"]*)"|data-href="([^"]*)" data-kind="(video|audio)")><\/p>/g, (m, k1, h1, h2, k2) => { const k = k1 || k2, h = h1 || h2; return `<p class="media-file"><${k} controls preload="none" src="${h}"></${k}></p>`; })
    .replace(/<p class="ext-embed" (?:data-kind="(\w+)" data-href="([^"]*)"|data-href="([^"]*)" data-kind="(\w+)")><\/p>/g, (m, k1, h1, h2, k2) => { const k = k1 || k2, h = h1 || h2; return `<p class="ext-embed"><a class="btn btn-ghost-dark" href="${h}" target="_blank" rel="noopener">${icon('external')}${k === 'facebook' ? (lang === 'ar' ? 'المشاهدة على فيسبوك' : 'View on Facebook') : k === 'drive' ? (lang === 'ar' ? 'فتح الملف' : 'Open the file') : (lang === 'ar' ? 'فتح المحتوى المضمّن' : 'Open embedded content')}</a></p>`; });
}

function archivePostPage(ctx, a) {
  const { lang } = ctx;
  const url = `https://itsak7m.github.io/auass-redesign/${prefix(lang)}news/${a.id}/`;
  const related = FEED[lang].filter((x) => x.type === a.type && x.key !== String(a.id));
  const i = related.findIndex((x) => x.date <= a.date);
  const near = related.slice(Math.max(0, i - 1), Math.max(0, i - 1) + 3);
  // English pages of Arabic posts use the translation under `en`: the full
  // text when there is one, otherwise the English summary above the Arabic text.
  const tr = lang === 'en' && a.lang === 'ar' ? a.en : null;
  const title = tr ? tr.title : a.title;
  const excerpt = tr ? tr.excerpt || '' : a.excerpt;
  const body = tr && tr.body ? tr.body : a.body;
  const bodyLang = tr && !tr.body ? 'ar' : lang;
  const empty = !body.replace(/<[^>]+>/g, '').trim() && !/<img |data-yt|media-file|ext-embed|<a /.test(body);
  // The card image usually repeats an image in the body; show it only when the body has none.
  const showImage = a.image && !body.includes('<img ');
  const arHref = ctx.r(`news/${a.id}/`);
  const note = !tr ? '' : tr.body
    ? `<p class="tr-note">${icon('globe')}<span>Translated from the Arabic original. <a href="${arHref}" hreflang="ar" lang="ar">اقرأ النص الأصلي بالعربية</a></span></p>`
    : `${excerpt ? `<p class="tr-lead">${esc(excerpt)}</p>` : ''}<p class="tr-note">${icon('globe')}<span>This post is in Arabic; the title and summary above are translated. The original text follows.</span></p>`;
  const main = `<article class="article">
  <header class="article-head dark">
    ${rete('rete page-rete')}
    <div class="wrap">
      <nav class="crumbs" aria-label="${lang === 'ar' ? 'مسار التنقل' : 'Breadcrumb'}"><a href="${ctx.r(prefix(lang))}">${lang === 'ar' ? 'الرئيسية' : 'Home'}</a><span aria-hidden="true">/</span><a href="${ctx.r(prefix(lang) + 'news/')}">${lang === 'ar' ? 'الأخبار' : 'News'}</a><span aria-hidden="true">/</span><a href="${ctx.r(prefix(lang) + `news/${a.date.slice(0, 4)}/`)}">${a.date.slice(0, 4)}</a></nav>
      <p class="kicker">${esc(typeLabel(a.type, lang))} · <time datetime="${a.date}">${fmtDate(a.date, lang)}</time></p>
      <h1 class="page-title">${bidi(title, lang)}</h1>
    </div>
  </header>
  <div class="section paper">
    <div class="wrap narrow archive-post">
      ${note}
      ${showImage ? `<figure class="ap-figure"><img src="${ctx.r(`media/${a.image}.webp`)}" alt="${esc(a.imageAlt || '')}"></figure>` : ''}
      ${empty ? `<p class="empty-post">${lang === 'ar' ? 'محتوى هذا المنشور (صورة أو ملف أو فيديو) لم يعد متاحاً على موقع الاتحاد الأصلي.' : 'The content of this post (an image, file or video) is no longer available on the original AUASS website.'}</p>` : `<div class="prose rich"${bodyLang !== lang ? ' lang="ar" dir="rtl"' : ''}>${archiveBody(ctx, body)}</div>`}
      ${shareBar(ctx, url, title)}
    </div>
  </div>
  ${relatedSection(ctx, near.length ? near : FEED[lang].slice(0, 3))}
</article>`;
  return page(ctx, { title, description: excerpt || title }, main);
}

// ---------- migrated pages ----------
const SECTION_HUB = {
  events: { path: 'events/conferences/', label: ui('المؤتمرات', 'Conferences') },
  about: { path: 'about/', label: ui('عن الاتحاد', 'About') },
  library: { path: 'library/', label: ui('المكتبة', 'Library') }
};
const GROUP_GLYPH = { series: 'calendar', arab: 'seal', other: 'globe', awroad: 'network', more: 'network', legal: 'paper', knowledge: 'book' };
const pageTitle = (pg, lang) => pg.title[lang] || pg.title.ar || pg.title.en;

function pageLinks(ctx, list) {
  const { lang } = ctx;
  return `<ul class="page-links">${list.map((pg) => `<li><a href="${ctx.r(prefix(lang) + pagePath(pg))}">${icon(GROUP_GLYPH[pg.group])}<span${pg.title[lang] ? '' : ` lang="${pg.title.ar ? 'ar' : 'en'}"`}>${bidi(pageTitle(pg, lang), lang)}</span></a></li>`).join('')}</ul>`;
}

function infoPage(ctx, pg) {
  const { lang } = ctx;
  const has = !!pg.body[lang];
  const bodyLang = has ? lang : pg.body.ar ? 'ar' : 'en';
  const summary = pg.summary && pg.summary[lang];
  const hub = SECTION_HUB[pg.section];
  const crumbs = pg.section === 'events'
    ? [{ label: lang === 'ar' ? 'الفعاليات' : 'Events', href: ctx.r(prefix(lang) + 'events/') }, { label: t(hub.label, lang), href: ctx.r(prefix(lang) + hub.path) }]
    : [{ label: t(hub.label, lang), href: ctx.r(prefix(lang) + hub.path) }];
  const siblings = infoPages.filter((x) => x.group === pg.group && x.slug !== pg.slug);
  const main = `${pageHero(ctx, { eyebrow: t(PAGE_GROUPS[pg.group], lang), title: pageTitle(pg, lang), crumbs })}
<section class="section paper">
  <div class="wrap narrow archive-post">
    ${has ? '' : summary
    ? `<div class="tr-lead prose rich">${archiveBody(ctx, summary)}</div><p class="tr-note">${icon('globe')}<span>This page is in Arabic; the summary above is in English. The original text follows.</span></p>`
    : `<div class="upcoming-note">${icon('info')}<p>${lang === 'ar' ? 'هذه الصفحة منشورة باللغة الإنجليزية فقط على موقع الاتحاد، وتظهر هنا كما نُشرت.' : 'This page is available in Arabic only on the AUASS website; it is shown here as published.'}</p></div>`}
    <div class="prose rich"${bodyLang !== lang ? ` lang="${bodyLang}" dir="${bodyLang === 'ar' ? 'rtl' : 'ltr'}"` : ''}>${archiveBody(ctx, pg.body[bodyLang])}</div>
  </div>
</section>
${siblings.length ? `<section class="section paper2"><div class="wrap">${sectionHead('', esc(t(PAGE_GROUPS[pg.group], lang)))}${pageLinks(ctx, siblings)}</div></section>` : ''}`;
  return page(ctx, { title: pageTitle(pg, lang) }, main);
}

function conferencesPage(ctx) {
  const { lang } = ctx;
  const groups = ['series', 'arab', 'other'].map((g) => `<section class="conf-group">
  <h2 class="sec-title">${esc(t(PAGE_GROUPS[g], lang))}</h2>
  ${pageLinks(ctx, infoPages.filter((x) => x.group === g))}
</section>`).join('');
  const main = `${pageHero(ctx, { eyebrow: lang === 'ar' ? 'منذ مؤتمر التأسيس عام 1998' : 'Since the founding conference in 1998', title: lang === 'ar' ? 'المؤتمرات' : 'Conferences', lead: lang === 'ar' ? 'المؤتمرات العربية لعلوم الفضاء والفلك، والمؤتمر الفلكي الإسلامي، والملتقيات والندوات والمهرجانات التي نظّمها الاتحاد أو شارك فيها.' : 'The Arab Conferences for Astronomy and Space Sciences, the Islamic Astronomical Conference, and the meetings, seminars and festivals AUASS has organised or joined.', crumbs: [{ label: lang === 'ar' ? 'الفعاليات' : 'Events', href: ctx.r(prefix(lang) + 'events/') }, { label: lang === 'ar' ? 'المؤتمرات' : 'Conferences' }] })}
<section class="section paper"><div class="wrap conf-groups">${groups}</div></section>`;
  return page(ctx, { title: lang === 'ar' ? 'المؤتمرات' : 'Conferences' }, main);
}

function councilPage(ctx) {
  const { lang } = ctx;
  const cards = council.members.map((m) => `<article class="member">
  ${m.photo ? `<img src="${ctx.r(m.photo)}" alt="" loading="lazy" width="120" height="120">` : `<span class="m-glyph">${icon('seal', 'ico big')}</span>`}
  <div>
    <h2 class="m-name">${esc(t(m.name, lang))}</h2>
    ${t(m.country, lang) ? `<p class="kicker">${esc(t(m.country, lang))}</p>` : ''}
    <ul class="m-roles">${t(m.roles, lang).map((r) => `<li>${bidi(r, lang)}</li>`).join('')}</ul>
  </div>
</article>`).join('');
  const main = `${pageHero(ctx, { eyebrow: lang === 'ar' ? `${council.members.length} عضواً من الدول العربية` : `${council.members.length} members from across the Arab world`, title: lang === 'ar' ? 'المجلس الأعلى للاتحاد' : 'AUASS High Council', crumbs: [{ label: lang === 'ar' ? 'عن الاتحاد' : 'About', href: ctx.r(prefix(lang) + 'about/') }, { label: lang === 'ar' ? 'المجلس الأعلى' : 'High Council' }] })}
<section class="section paper">
  <div class="wrap">
    <div class="members">${cards}</div>
  </div>
</section>`;
  return page(ctx, { title: lang === 'ar' ? 'المجلس الأعلى' : 'High Council' }, main);
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

// ---------- months of worship: astronomical calendar ----------
let HIJRI = null;
const H_MONTHS = {
  ar: ['محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر', 'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة'],
  en: ['Muharram', 'Safar', "Rabi' al-Awwal", "Rabi' al-Thani", 'Jumada al-Ula', 'Jumada al-Akhirah', 'Rajab', "Sha'ban", 'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah']
};
const WEEKDAYS = {
  ar: ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
};
const VIS = {
  A: { ar: 'تُرى بالعين المجرّدة', en: 'Naked eye', short: { ar: 'بالعين', en: 'Eye' } },
  B: { ar: 'تُرى بالعين في ظروف جيدة، وقد تحتاج منظاراً لتحديدها', en: 'Naked eye in good conditions; binoculars may help to find it', short: { ar: 'بالعين*', en: 'Eye*' } },
  C: { ar: 'بالمنظار أو التلسكوب فقط', en: 'Binoculars or telescope only', short: { ar: 'منظار', en: 'Optical' } },
  D: { ar: 'لا يمكن رؤيتها حتى بالمنظار', en: 'Not visible even with optical aid', short: { ar: 'لا تُرى', en: 'Not visible' } }
};

function worshipPage(ctx) {
  const { lang } = ctx;
  const ar = lang === 'ar';
  if (!HIJRI) {
    const H = require('./lib/hijri');
    const now = Date.now();
    let months = H.build(1452);
    const cur = months.filter((m) => m.first <= now).pop();
    const y0 = cur ? cur.y : months[0].y;
    HIJRI = { H, months: months.filter((m) => m.y >= y0 && m.y <= y0 + 2), y0 };
  }
  const { H, months, y0 } = HIJRI;
  const fmtDay = (ms) => { const d = new Date(ms); return `${WEEKDAYS[lang][d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[lang][d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const fmtConj = (ms) => {
    const d = new Date(ms + 3 * 3600e3), pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCDate()} ${MONTHS[lang][d.getUTCMonth()]} ${d.getUTCFullYear()} · <bdi dir="ltr">${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}</bdi>`;
  };
  const dayShort = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MONTHS[lang][m - 1]}`; };
  const badge = (v, makkahEve) => {
    const c = v.cls === 'X' ? 'D' : v.cls;
    const info = t(VIS[c], lang);
    const shift = v.evening !== makkahEve ? ` <span class="wm-shift">${ar ? (v.evening > makkahEve ? '+١ يوم' : '−١ يوم') : (v.evening > makkahEve ? '+1 d' : '−1 d')}</span>` : '';
    const detail = v.V != null ? `${ar ? 'عمر الهلال' : 'Age'} ${v.ageH.toFixed(1)} ${ar ? 'ساعة' : 'h'} · ${ar ? 'المكث' : 'lag'} ${Math.max(0, Math.round(v.lag))} ${ar ? 'د' : 'min'} · V=${v.V.toFixed(1)}` : (ar ? 'الهلال لم يولد بعد' : 'Moon not yet born');
    return `<span class="wm-pill wm-${c.toLowerCase()}" title="${esc(info + ' — ' + detail)}">${esc(VIS[c].short[lang])}</span>${shift}`;
  };
  const key = (y, m) => months.find((x) => x.y === y && x.m === m);
  const years = [...new Set(months.map((m) => m.y))];
  const yearBlocks = years.map((y) => {
    const first = key(y, 1), ram = key(y, 9), shaw = key(y, 10), dhh = key(y, 12);
    const keys = [
      [ar ? 'رأس السنة الهجرية' : 'Islamic New Year', first.first],
      [ar ? 'يوم عاشوراء' : 'Day of Ashura', first.first + 9 * H.DAY],
      [ar ? 'أول رمضان' : '1 Ramadan', ram.first],
      [ar ? 'عيد الفطر' : 'Eid al-Fitr', shaw.first],
      [ar ? 'يوم عرفة' : 'Day of Arafah', dhh.first + 8 * H.DAY],
      [ar ? 'عيد الأضحى' : 'Eid al-Adha', dhh.first + 9 * H.DAY]
    ].map(([n, ms]) => `<li><span class="wm-k-name">${esc(n)}</span><span class="wm-k-date">${esc(fmtDay(ms))}</span></li>`).join('');
    const rows = months.filter((m) => m.y === y).map((m) => {
      const mk = m.vis.makkah.evening;
      const worship = [1, 9, 10, 12].includes(m.m);
      return `<tr${worship ? ' class="is-worship"' : ''}>
  <th scope="row">${esc(H_MONTHS[lang][m.m - 1])}</th>
  <td>${esc(fmtDay(m.first))}${m.len ? `<span class="wm-len">${m.len} ${ar ? 'يوماً' : 'days'}</span>` : ''}</td>
  <td class="wm-conj">${fmtConj(m.conj)}</td>
  <td class="wm-ev">${esc(dayShort(mk))}</td>
  ${H.CITIES.map((c) => `<td>${badge(m.vis[c.id], mk)}</td>`).join('')}
</tr>`;
    }).join('');
    const lo = months.find((m) => m.y === y), hi = months.filter((m) => m.y === y).pop();
    return `<section class="wm-year reveal" id="y${y}" aria-labelledby="h${y}">
  <h2 id="h${y}" class="wm-h">${ar ? `السنة الهجرية ${y} هـ` : `Hijri year ${y} AH`} <span class="wm-span">${esc(MONTHS[lang][new Date(lo.first).getUTCMonth()])} ${new Date(lo.first).getUTCFullYear()} – ${esc(MONTHS[lang][new Date(hi.first).getUTCMonth()])} ${new Date(hi.first).getUTCFullYear()}</span></h2>
  <ul class="wm-keys">${keys}</ul>
  <div class="table-wrap"><table class="ba-table wm-table">
    <caption class="sr">${ar ? `بدايات أشهر السنة الهجرية ${y} وإمكانية رؤية الهلال` : `Month starts of Hijri year ${y} and crescent visibility`}</caption>
    <thead><tr>
      <th scope="col">${ar ? 'الشهر' : 'Month'}</th>
      <th scope="col">${ar ? 'أول الشهر (أم القرى)' : '1st of month (Umm al-Qura)'}</th>
      <th scope="col">${ar ? 'الاقتران (توقيت مكة)' : 'Conjunction (Makkah time)'}</th>
      <th scope="col">${ar ? 'مساء الرصد' : 'Observing evening'}</th>
      ${H.CITIES.map((c) => `<th scope="col">${esc(t(c, lang))}</th>`).join('')}
    </tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
</section>`;
  }).join('');
  const legend = ['A', 'B', 'C', 'D'].map((c) => `<li><span class="wm-pill wm-${c.toLowerCase()}">${esc(VIS[c].short[lang])}</span> ${esc(t(VIS[c], lang))}</li>`).join('');
  const intro = ar
    ? 'مواعيد بدايات الأشهر الهجرية، وفي مقدمتها رمضان وشوال وذو الحجة ومحرم، محسوبة فلكياً، مع إمكانية رؤية هلال كل شهر في عمّان ومكة المكرمة والقاهرة والدار البيضاء.'
    : 'Start dates of the Hijri months, above all Ramadan, Shawwal, Dhu al-Hijjah and Muharram, computed astronomically, with the chance of seeing each crescent from Amman, Makkah, Cairo and Casablanca.';
  const method = ar
    ? `<h2>كيف حُسبت؟</h2>
<p><strong>أول الشهر:</strong> بقاعدة تقويم أم القرى: إذا وقع الاقتران قبل غروب الشمس في مكة المكرمة يوم التاسع والعشرين، وغاب القمر بعد غروب الشمس، فالغد أول الشهر، وإلا يُتمّ الشهر ثلاثين يوماً. وهي حسابات فلكية لا تُغني عن الإعلان الرسمي في كل بلد.</p>
<p><strong>إمكانية الرؤية:</strong> بمعيار عودة (Odeh 2004) الذي يعتمد على ارتفاع القمر وعرض الهلال عند أفضل وقت للرصد بعد الغروب، ويعطي القيمة V: الهلال يُرى بالعين المجردة إذا بلغت V ‏5.65 فأكثر، وبالعين في ظروف جيدة بين 2 و5.65، وبالمنظار فقط بين ‎−0.96 و2، ولا يُرى إن قلّت عن ذلك. إشارة +١ يوم تعني أن الهلال لم يولد في مساء الرصد في تلك المدينة، فحُسبت إمكانية رؤيته في المساء التالي.</p>
<p><strong>الأدوات:</strong> مكتبة astronomy-engine المفتوحة المصدر (ترخيص MIT) لحساب مواضع الشمس والقمر. الاقتران بتوقيت مكة (UTC+3).</p>
<p class="wm-note">الحكم الشرعي ببدء الشهر يكون برؤية الهلال أو بما تعتمده الجهة الرسمية في كل بلد (دار الإفتاء أو المحكمة الشرعية أو لجنة الأهلة). هذه الصفحة معلومات فلكية تعليمية من الاتحاد العربي لعلوم الفضاء والفلك.</p>`
    : `<h2>How it is computed</h2>
<p><strong>Start of the month:</strong> by the Umm al-Qura rule: if the conjunction falls before sunset in Makkah on the 29th and the Moon sets after the Sun, the next day is the 1st of the month; otherwise the month completes thirty days. These are astronomical calculations and do not replace the official announcement in each country.</p>
<p><strong>Crescent visibility:</strong> by the Odeh (2004) criterion, which uses the Moon's altitude and the crescent's width at the best time after sunset, giving a value V: the crescent is visible to the naked eye if V is 5.65 or more, with the naked eye in good conditions between 2 and 5.65, with binoculars or a telescope only between −0.96 and 2, and not visible below that. A +1 d mark means the Moon was not yet born on the observing evening in that city, so visibility was computed for the following evening.</p>
<p><strong>Tools:</strong> the open-source astronomy-engine library (MIT licence) for the positions of the Sun and Moon. Conjunction times are in Makkah time (UTC+3).</p>
<p class="wm-note">The religious ruling on the start of a month rests on sighting the crescent or on what the official authority in each country adopts (Iftaa department, Shari'a court or moon-sighting committee). This page is astronomical information for education, from the Arab Union for Space Sciences and Astronomy.</p>`;
  const title = ar ? 'أشهر العبادة: حسابات فلكية' : 'Months of worship: astronomical calculations';
  const main = `${pageHero(ctx, { eyebrow: ar ? 'تقويم هجري فلكي' : 'Astronomical Hijri calendar', title: ar ? 'أشهر العبادة' : 'Months of worship', lead: intro, crumbs: [{ label: ar ? 'المكتبة' : 'Library', href: ctx.r(prefix(lang) + 'library/') }, { label: ar ? 'أشهر العبادة' : 'Months of worship' }] })}
<section class="section paper wm">
  <div class="wrap">
    <nav class="wm-tabs" aria-label="${ar ? 'السنوات الهجرية' : 'Hijri years'}">${years.map((y) => `<a class="btn btn-ghost-dark" href="#y${y}">${y} ${ar ? 'هـ' : 'AH'}</a>`).join('')}</nav>
    ${yearBlocks}
    <section class="wm-legend"><h2>${ar ? 'دليل الألوان' : 'Key'}</h2><ul>${legend}</ul></section>
    <section class="wm-method prose">${method}</section>
  </div>
</section>`;
  return page(ctx, { title, description: intro }, main);
}


function moonPage(ctx) {
  const { lang } = ctx;
  const sideName = (s) => t(moon.sides[s], lang);
  const fmtLat = (v) => `${Math.abs(v).toFixed(2)}° ${lang === 'ar' ? (v >= 0 ? 'شمالاً' : 'جنوباً') : v >= 0 ? 'N' : 'S'}`;
  const fmtLon = (v) => `${Math.abs(v).toFixed(2)}° ${lang === 'ar' ? (v >= 0 ? 'شرقاً' : 'غرباً') : v >= 0 ? 'E' : 'W'}`;
  const cname = (c) => (lang === 'ar' ? c.ar : c.la);
  const list = moon.craters.map((c) => `<li><a class="crater-btn" href="#${c.id}" data-crater="${c.id}" data-side="${c.side}" data-text="${esc([c.ar, c.la, c.scholar.ar, c.scholar.en].join(' ').toLowerCase())}">
  <span class="cb-name">${esc(cname(c))}${lang === 'ar' ? ` <span class="cb-la" lang="en" dir="ltr">${esc(c.la)}</span>` : ''}</span>
  <span class="cb-sch">${esc(t(c.scholar, lang))}</span>
  <span class="cb-side side-${c.side}">${esc(sideName(c.side))}</span>
</a></li>`).join('');
  const details = moon.craters.map((c) => `<article class="crater-detail" id="${c.id}" data-detail="${c.id}">
  <p class="kicker">${lang === 'ar' ? 'فوهة' : 'Crater'} · ${esc(sideName(c.side))}</p>
  <h2 class="cd-title">${esc(cname(c))} <span class="cd-alt" ${lang === 'ar' ? 'lang="en" dir="ltr"' : 'lang="ar" dir="rtl"'}>${esc(lang === 'ar' ? c.la : c.ar)}</span></h2>
  <p class="cd-official"><span>${lang === 'ar' ? 'الاسم الرسمي على القمر' : 'Official name on the Moon'}:</span> ${bidi(t(c.official, lang), lang)}</p>
  <dl class="cd-facts">
    <div><dt>${lang === 'ar' ? 'خط العرض' : 'Latitude'}</dt><dd dir="ltr">${fmtLat(c.lat)}</dd></div>
    <div><dt>${lang === 'ar' ? 'خط الطول' : 'Longitude'}</dt><dd dir="ltr">${fmtLon(c.lon)}</dd></div>
    <div><dt>${lang === 'ar' ? 'القطر' : 'Diameter'}</dt><dd>${c.diam} ${lang === 'ar' ? 'كم' : 'km'}</dd></div>
  </dl>
  <h3 class="cd-h">${lang === 'ar' ? 'سبب التسمية' : 'Named after'}</h3>
  <p class="cd-origin">${esc(t(c.origin, lang))}</p>
  ${lang === 'ar' ? `<p class="cd-origin-en" lang="en" dir="ltr">IAU: ${esc(c.origin.en)}</p>` : ''}
  <h3 class="cd-h">${lang === 'ar' ? 'نبذة' : 'About'}</h3>
  <p class="cd-bio">${esc(t(c.bio, lang))}</p>
  <p class="cd-note">${esc(t(moon.bioNote, lang))}</p>
  ${c.auassNote ? `<p class="cd-note">${icon('info')} ${esc(t(c.auassNote, lang))}</p>` : ''}
  <a class="more" href="https://planetarynames.wr.usgs.gov/Feature/${c.iauId}" target="_blank" rel="noopener">${lang === 'ar' ? 'السجل الرسمي في الاتحاد الفلكي الدولي' : 'Official IAU gazetteer entry'}${icon('external')}</a>
</article>`).join('');
  const pins = moon.craters.map((c) => `<a class="map-pin" href="#${c.id}" data-crater="${c.id}" style="left:${(((c.lon + 180) / 360) * 100).toFixed(2)}%;top:${(((90 - c.lat) / 180) * 100).toFixed(2)}%" aria-label="${esc(cname(c))}"></a>`).join('');
  const data = moon.craters.map((c) => ({ id: c.id, lat: c.lat, lon: c.lon, diam: c.diam, name: cname(c) }));
  const main = `${pageHero(ctx, { eyebrow: lang === 'ar' ? 'التراث الفلكي العربي' : 'Arab astronomical heritage', title: t(moon.title, lang), lead: t(moon.lead, lang), crumbs: [{ label: lang === 'ar' ? 'المكتبة' : 'Library', href: ctx.r(prefix(lang) + 'library/') }, { label: lang === 'ar' ? 'القمر' : 'The Moon' }] })}
<section class="moon dark" aria-label="${esc(t(moon.title, lang))}" data-moon>
  <div class="wrap moon-grid">
    <div class="moon-stage" data-stage>
      ${rete('rete moon-rete', 2)}
      <div class="moon-map" data-map dir="ltr">
        <img src="${ctx.r('assets/img/moon/moon-2k.jpg')}" alt="${lang === 'ar' ? 'خريطة مسطحة لسطح القمر عليها مواقع الفوهات' : 'Flat map of the lunar surface with crater locations'}" width="2048" height="1024" loading="lazy">
        ${pins}
      </div>
      <canvas class="moon-canvas" data-canvas role="img" aria-label="${lang === 'ar' ? 'نموذج ثلاثي الأبعاد للقمر يمكن تدويره، عليه مواقع الفوهات' : 'Rotatable 3D model of the Moon showing the craters'}" hidden></canvas>
      <div class="moon-label" data-label hidden></div>
      <div class="moon-ctrl" data-ctrl hidden>
        <button type="button" class="round-btn" data-act="in" aria-label="${lang === 'ar' ? 'تكبير' : 'Zoom in'}">+</button>
        <button type="button" class="round-btn" data-act="out" aria-label="${lang === 'ar' ? 'تصغير' : 'Zoom out'}">−</button>
        <button type="button" class="pill-btn" data-act="flip">${lang === 'ar' ? 'الجهة الأخرى' : 'Other side'}</button>
        <button type="button" class="pill-btn" data-act="reset">${lang === 'ar' ? 'الوجه المقابل للأرض' : 'Earth-facing side'}</button>
      </div>
      <p class="moon-hint" data-hint hidden>${lang === 'ar' ? 'اسحب لتدوير القمر، واضغط على علامة لعرض الفوهة' : 'Drag to spin the Moon; tap a marker to open a crater'}</p>
    </div>
    <aside class="moon-panel">
      <div class="moon-details" data-details aria-live="polite">
        <div class="crater-intro" data-intro>
          ${icon('crater', 'ico big')}
          <p>${lang === 'ar' ? 'اختر فوهة من القائمة أو من القمر لعرض موقعها وصاحبها وسبب تسميتها.' : 'Pick a crater from the list or on the Moon to see where it is, who it honours and why.'}</p>
        </div>
        ${details}
      </div>
      <div class="crater-tools">
        <div class="search-box small">${icon('search')}<label class="sr" for="cr-q">${lang === 'ar' ? 'ابحث عن فوهة أو عالِم' : 'Search craters or scholars'}</label><input id="cr-q" type="search" data-q placeholder="${lang === 'ar' ? 'ابحث: البيروني، ابن الهيثم…' : 'Search: Al-Biruni, Alhazen…'}" autocomplete="off"></div>
        <div class="chips" role="group" aria-label="${lang === 'ar' ? 'تصفية حسب الموقع' : 'Filter by location'}" data-sides>
          <button type="button" class="chip" aria-pressed="true" data-value="">${lang === 'ar' ? 'الكل' : 'All'} (${moon.craters.length})</button>
          <button type="button" class="chip" aria-pressed="false" data-value="near">${esc(sideName('near'))}</button>
          <button type="button" class="chip" aria-pressed="false" data-value="far">${esc(sideName('far'))} (${moon.craters.filter((c) => c.side === 'far').length})</button>
        </div>
      </div>
      <ol class="crater-list" data-list>${list}</ol>
    </aside>
  </div>
  <p class="wrap moon-credits">${esc(t(moon.credits, lang))}</p>
  <script type="application/json" id="moon-data">${JSON.stringify({ craters: data, tex2k: ctx.r('assets/img/moon/moon-2k.jpg'), tex4k: ctx.r('assets/img/moon/moon-4k.jpg'), relief: ctx.r('assets/img/moon/moon-relief.jpg') })}</script>
</section>
<script type="module" src="${ctx.r('assets/js/moon.js')}?v=${BUILD_VERSION}"></script>`;
  return page(ctx, { title: t(moon.title, lang), description: t(moon.lead, lang) }, main);
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

// docs/media holds the migrated images and is kept between builds.
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (f !== 'media') fs.rmSync(path.join(OUT, f), { recursive: true, force: true });
copyDir(path.join(__dirname, 'assets'), path.join(OUT, 'assets'));
copyDir(path.join(__dirname, 'admin'), path.join(OUT, 'admin'));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

const pages = [
  ['', 'home', homePage], ['about/', 'about', aboutPage], ['events/', 'events', eventsPage], ['library/', 'library', libraryPage],
  ['news/', 'news', newsPage], ['join/', 'join', joinPage], ['contact/', 'contact', contactPage], ['moon/', 'library', moonPage], ['worship-months/', 'library', worshipPage],
  ['events/conferences/', 'events', conferencesPage], ['about/council/', 'about', councilPage]
];
for (const lang of LANGS) {
  for (const [p, section, fn] of pages) write(prefix(lang) + p, fn(ctxFor(lang, p, section)));
  for (const post of news.posts) {
    const p = `news/${post.slug}/`;
    write(prefix(lang) + p, articlePage(ctxFor(lang, p, 'news'), post));
  }
  for (const pg of infoPages) write(prefix(lang) + pagePath(pg), infoPage(ctxFor(lang, pagePath(pg), pg.section), pg));
  for (const a of archive.filter((x) => inLang(x, lang))) {
    const p = `news/${a.id}/`;
    const both = a.lang === 'ar' && a.en;
    write(prefix(lang) + p, archivePostPage(ctxFor(lang, p, 'news', both ? p : 'news/'), a));
  }
  for (const y of yearsOf(lang)) {
    const p = `news/${y}/`;
    write(prefix(lang) + p, newsYearPage(ctxFor(lang, p, 'news', yearsOf(lang === 'ar' ? 'en' : 'ar').includes(y) ? p : 'news/'), y));
  }
  fs.writeFileSync(path.join(OUT, prefix(lang), 'news', 'index.json'), newsIndexJson(lang));
}
write('before-after/', beforeAfterPage(ctxFor('ar', 'before-after/', 'before-after', '')));
const nf = ctxFor('ar', '', 'notfound');
fs.writeFileSync(path.join(OUT, '404.html'), notFoundPage({ ...nf, r: (to) => '/auass-redesign/' + to }));
console.log('built', LANGS.length * (pages.length + news.posts.length + infoPages.length) + archive.length + archive.filter((a) => a.lang === 'ar' && a.en).length + yearsOf('ar').length + yearsOf('en').length + 2, 'pages into docs/');

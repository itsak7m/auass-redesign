// Serves docs/ under /auass-redesign/ (like GitHub Pages) and checks every page
// at 390px and 1440px: horizontal overflow, console errors, broken internal
// links, missing images, required noindex/footer line. Optionally saves screenshots.
// Archived posts (news/<id>/) are sampled in the browser pass unless --all is
// given; every page's internal links and images are still checked on disk.
//   node tools/check.js [--all] [screenshotDir]
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DOCS = path.join(__dirname, '..', 'docs');
const BASE = '/auass-redesign/';
const ALL = process.argv.includes('--all');
const shotDir = process.argv.slice(2).find((a) => !a.startsWith('--'));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json' };

function resolve(urlPath) {
  if (!urlPath.startsWith(BASE)) return null;
  let p = decodeURIComponent(urlPath.slice(BASE.length).split('?')[0].split('#')[0]);
  let f = path.join(DOCS, p);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  return fs.existsSync(f) ? f : null;
}
const server = http.createServer((req, res) => {
  const f = resolve(req.url);
  if (!f) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

const allPages = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && !['assets', 'media', 'admin'].includes(e.name)) walk(full);
    else if (e.name === 'index.html') allPages.push(path.relative(DOCS, path.dirname(full)).split(path.sep).join('/'));
  }
})(DOCS);
const isArchivePost = (p) => /^(en\/)?news\/\d+$/.test(p);
const pages = ALL ? allPages : allPages.filter((p, i) => !isArchivePost(p) || i % 30 === 0);

// Static pass over every page: relative links and image sources must exist.
function staticCheck(problems) {
  for (const p of allPages) {
    const html = fs.readFileSync(path.join(DOCS, p, 'index.html'), 'utf8');
    for (const m of html.matchAll(/\s(?:href|src)="([^"#?][^"]*)"/g)) {
      const u = m[1];
      if (/^(https?:|mailto:|data:|\/\/)/.test(u)) continue;
      const target = path.posix.normalize(path.posix.join(BASE, p ? p + '/' : '', u.split('#')[0].split('?')[0]));
      if (!resolve(target)) problems.push(`${p || '(home)'}: missing ${u}`);
    }
  }
}

(async () => {
  await new Promise((r) => server.listen(0, r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const problems = [];
  staticCheck(problems);
  const linkSet = new Set();
  for (const width of [390, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 500 ? 844 : 900 }, isMobile: width < 500, hasTouch: width < 500 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(origin)) errors.push(`${r.status()} ${r.url()}`); });
    for (const p of pages) {
      errors.length = 0;
      const url = origin + BASE + (p ? p + '/' : '');
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      const info = await page.evaluate(() => {
        const de = document.documentElement;
        const wide = [...document.querySelectorAll('body *')].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1) && !el.closest('.sky-strip, .table-wrap, .rete, .hero-photo, .skip');
        }).slice(0, 3).map((el) => el.tagName + '.' + [...el.classList].join('.'));
        return {
          overflow: de.scrollWidth - de.clientWidth,
          wide,
          noindex: !!document.querySelector('meta[name=robots][content*=noindex]'),
          note: document.body.innerText.includes('نموذج مقترح لإعادة تصميم الموقع — إعداد: Ameer Hamam'),
          h1: document.querySelectorAll('h1').length,
          brokenImgs: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.src),
          links: [...document.querySelectorAll('a[href]')].map((a) => a.href)
        };
      });
      const tag = `${p || '(home)'} @${width}`;
      if (width < 500 && (p === '' || p === 'en')) {
        // The mobile menu must open as a full-screen panel.
        await page.click('[data-menu-btn]');
        await page.waitForTimeout(350);
        const h = await page.evaluate(() => document.querySelector('#site-nav').getBoundingClientRect().height);
        if (h < 300) problems.push(`${tag}: mobile menu did not open (height ${Math.round(h)}px)`);
        await page.click('[data-menu-btn]');
      }
      if (info.overflow > 0) problems.push(`${tag}: horizontal overflow ${info.overflow}px ${info.wide.join(', ')}`);
      if (!info.noindex) problems.push(`${tag}: missing noindex`);
      if (!info.note) problems.push(`${tag}: missing prototype footer line`);
      if (info.h1 !== 1) problems.push(`${tag}: ${info.h1} h1 elements`);
      info.brokenImgs.forEach((s) => problems.push(`${tag}: broken image ${s}`));
      errors.forEach((e) => problems.push(`${tag}: ${e}`));
      info.links.forEach((l) => linkSet.add(l));
      if (shotDir) {
        fs.mkdirSync(shotDir, { recursive: true });
        const name = (p || 'home').replace(/\//g, '_');
        // Scroll through the page so scroll-triggered reveals run before the capture.
        await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo({ top: y, behavior: 'instant' }); await new Promise((r) => setTimeout(r, 60)); } window.scrollTo({ top: 0, behavior: 'instant' }); });
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(shotDir, `${name}-${width}.png`), fullPage: true });
      }
    }
    await ctx.close();
  }
  for (const l of linkSet) {
    if (!l.startsWith(origin)) continue;
    const u = new URL(l);
    if (!resolve(u.pathname)) problems.push(`broken internal link: ${u.pathname}`);
  }
  const external = [...linkSet].filter((l) => !l.startsWith(origin) && /^https?:/.test(l));
  console.log(`statically checked ${allPages.length} pages; browser-checked ${pages.length} pages × 2 widths; ${linkSet.size} unique links (${external.length} external)`);
  if (problems.length) { console.log(problems.join('\n')); process.exitCode = 1; } else console.log('no problems found');
  fs.writeFileSync(path.join(__dirname, '..', 'tools', '.external-links.txt'), external.sort().join('\n') + '\n');
  await browser.close();
  server.close();
})();

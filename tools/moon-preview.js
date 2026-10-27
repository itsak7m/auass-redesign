// Renders the 3D Moon once (Earth-facing side) and saves it as the home-page
// preview image. Run after a build, then build again.
const { chromium } = require('playwright');
const path = require('path');
const { start } = require('./serve');
(async () => {
  const { server, origin, base } = await start();
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1200, height: 1400 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(origin + base + 'moon/', { waitUntil: 'networkidle' });
  await p.waitForSelector('[data-stage].is-3d', { timeout: 30000 });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { document.querySelector('[data-hint]').hidden = true; document.querySelector('[data-ctrl]').hidden = true; });
  const out = path.join(__dirname, '..', 'src', 'assets', 'img', 'moon', 'moon-preview.png');
  await p.locator('[data-canvas]').screenshot({ path: out });
  console.log('saved', out, errors.length ? errors : 'no errors');
  await b.close();
  server.close();
})();

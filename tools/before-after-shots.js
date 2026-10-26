// Captures the first screen of the new home page (1440 and 390 wide) for the
// before/after comparison page. Run after a build, then build again.
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, '..', 'src', 'assets', 'img', 'before-after');
(async () => {
  const b = await chromium.launch();
  for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, isMobile: mobile, deviceScaleFactor: 1 });
    await p.goto('file://' + path.join(__dirname, '..', 'docs', 'index.html'), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(1200);
    await p.screenshot({ path: path.join(OUT, `new-${w}.png`) });
    await p.close();
  }
  await b.close();
})();

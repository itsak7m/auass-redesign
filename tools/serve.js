// Minimal static server for docs/ under /auass-redesign/ (mirrors GitHub Pages).
const http = require('http');
const fs = require('fs');
const path = require('path');
const DOCS = path.join(__dirname, '..', 'docs');
const BASE = '/auass-redesign/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.json': 'application/json' };
function resolve(urlPath) {
  if (!urlPath.startsWith(BASE)) return null;
  let f = path.join(DOCS, decodeURIComponent(urlPath.slice(BASE.length).split('?')[0].split('#')[0]));
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  return fs.existsSync(f) ? f : null;
}
function start() {
  const server = http.createServer((req, res) => {
    const f = resolve(req.url);
    if (!f) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => server.listen(0, () => r({ server, origin: `http://127.0.0.1:${server.address().port}`, base: BASE })));
}
module.exports = { start, resolve };

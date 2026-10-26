// Line icons (24×24 grid, stroke = currentColor). Drawn for this project in the
// thin "astrolabe" line style: 1.4px strokes, round caps and joins.
const P = {
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M7.5 14h3M13.5 14h3M7.5 17.5h3"/>',
  userplus: '<circle cx="10" cy="8.5" r="3.5"/><path d="M3.5 20c.6-4 3.2-6.5 6.5-6.5s5.9 2.5 6.5 6.5M18.5 7v6M15.5 10h6"/>',
  book: '<path d="M12 6.5C9.5 4.6 6 4.6 3.5 5.6v13c2.5-1 6-1 8.5.9 2.5-1.9 6-1.9 8.5-.9v-13C18 4.6 14.5 4.6 12 6.5zM12 6.5v13"/>',
  telescope: '<path d="M4 11.5l11-4.6 1.6 3.8-11 4.6zM15 6.9l2.2-.9 1.6 3.8-2.2.9M9 14.6L6 21M11.5 13.6l3 7.4M10.3 14.2V18"/>',
  orbit: '<circle cx="12" cy="12" r="2.6"/><ellipse cx="12" cy="12" rx="9.5" ry="4.2" transform="rotate(-25 12 12)"/><circle cx="19.6" cy="8.2" r="1.1" fill="currentColor"/>',
  astrolabe: '<circle cx="12" cy="13.5" r="7.5"/><circle cx="12" cy="13.5" r="4.6"/><path d="M12 6V3.6M10.6 3.6h2.8M12 13.5l4-3.3M4.5 13.5h2M17.5 13.5h2"/><circle cx="12" cy="13.5" r=".9" fill="currentColor"/>',
  network: '<circle cx="12" cy="5.5" r="2.2"/><circle cx="5" cy="17.5" r="2.2"/><circle cx="19" cy="17.5" r="2.2"/><path d="M10.8 7.4l-4.6 8.2M13.2 7.4l4.6 8.2M7.2 17.5h9.6"/>',
  magazine: '<rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M8.5 7.5h7M8.5 10.5h7M8.5 13.5h4.5M8.5 16.5h7"/>',
  paper: '<path d="M6 3.5h8.5L19 8v12.5H6z"/><path d="M14.5 3.5V8H19M9 12h7M9 15h7M9 18h4"/>',
  constellation: '<path d="M4 18l5-6 5 2.5 6-9"/><circle cx="4" cy="18" r="1.3" fill="currentColor"/><circle cx="9" cy="12" r="1.3" fill="currentColor"/><circle cx="14" cy="14.5" r="1.3" fill="currentColor"/><circle cx="20" cy="5.5" r="1.6" fill="currentColor"/>',
  crater: '<circle cx="12" cy="12" r="8.5"/><circle cx="9" cy="9.5" r="2.2"/><circle cx="15" cy="14.5" r="1.6"/><circle cx="9.5" cy="15.5" r="1"/>',
  seal: '<circle cx="12" cy="13" r="7.5"/><circle cx="12" cy="13" r="5"/><path d="M12 5.5V3M10.8 3h2.4"/><path d="M9.6 13.3l1.6 1.6 3.3-3.4"/>',
  star: '<path d="M12 3.8l2.4 5.1 5.5.7-4 3.8 1 5.5L12 16.2 7.1 18.9l1-5.5-4-3.8 5.5-.7z"/>',
  pin: '<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.6 3.7 5.4 3.7 8.5s-1.1 5.9-3.7 8.5c-2.6-2.6-3.7-5.4-3.7-8.5S9.4 6.1 12 3.5z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.8"/><path d="M4 7l8 6 8-6"/>',
  arrow: '<path d="M5 12h14M13.5 6.5L19 12l-5.5 5.5"/>',
  external: '<path d="M14 4.5h5.5V10M19.5 4.5L11 13M17 14v5.5H4.5V7H10"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.4"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeoff: '<path d="M4 4l16 16M9.9 6c.7-.3 1.4-.5 2.1-.5 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.6M14.1 18c-.7.3-1.4.5-2.1.5-6 0-9.5-6.5-9.5-6.5a17 17 0 0 1 3-3.6"/>',
  half: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17"/>',
  facebook: '<path d="M14 8.5h2.5V5H14a3.5 3.5 0 0 0-3.5 3.5V11H8v3.5h2.5V21H14v-6.5h2.5L17 11h-3V9a.5.5 0 0 1 .5-.5z"/>',
  instagram: '<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.8"/><circle cx="17" cy="7" r=".8" fill="currentColor"/>',
  youtube: '<rect x="2.8" y="6" width="18.4" height="12" rx="3.5"/><path d="M10.2 9.4v5.2l4.6-2.6z"/>',
  whatsapp: '<path d="M4.5 19.5l1.1-3.9A8 8 0 1 1 8.6 18.6z"/><path d="M9.2 8.8c.3 2.6 2.8 5.3 5.6 5.8l1-1.2-1.7-.9-.9.8c-1-.4-2-1.5-2.4-2.4l.8-.9-.9-1.7z"/>',
  x: '<path d="M5 4.5l14 15M19 4.5l-14 15"/>'
};

function icon(name, cls = 'ico') {
  const d = P[name];
  if (!d) throw new Error('unknown icon: ' + name);
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

// Sky-event glyphs (48×48), drawn as brass line illustrations.
const SKY = {
  'moon-full': '<circle cx="24" cy="24" r="14"/><circle cx="19" cy="20" r="2.4"/><circle cx="28" cy="28" r="3"/><circle cx="27" cy="17" r="1.4"/>',
  'moon-new': '<circle cx="24" cy="24" r="14" stroke-dasharray="2 3"/>',
  'moon-first': '<circle cx="24" cy="24" r="14"/><path d="M24 10a14 14 0 0 1 0 28z" fill="currentColor" fill-opacity=".85" stroke="none"/>',
  'moon-last': '<circle cx="24" cy="24" r="14"/><path d="M24 10a14 14 0 0 0 0 28z" fill="currentColor" fill-opacity=".85" stroke="none"/>',
  saturn: '<circle cx="24" cy="24" r="9"/><ellipse cx="24" cy="24" rx="19" ry="5.5" transform="rotate(-18 24 24)"/>',
  conj: '<path d="M17 9a13 13 0 1 0 0 26a10.5 10.5 0 1 1 0-26z"/><circle cx="35" cy="17" r="4.5"/>',
  meteor: '<path d="M8 10l14 14M14 7l18 18M21 6l14 14"/><circle cx="23" cy="25" r="1.4" fill="currentColor"/><circle cx="33" cy="26" r="1.6" fill="currentColor"/><circle cx="36" cy="21" r="1.4" fill="currentColor"/>',
  mercury: '<path d="M6 34h36"/><circle cx="30" cy="27" r="3.5"/><path d="M12 34a12 12 0 0 1 24 0" stroke-dasharray="2 3"/>',
  venus: '<circle cx="24" cy="24" r="7" fill="currentColor" fill-opacity=".25"/><circle cx="24" cy="24" r="12" stroke-dasharray="2 3"/><circle cx="33" cy="16" r="3"/>',
  pleiades: '<path d="M14 9a12 12 0 1 0 0 24a9.5 9.5 0 1 1 0-24z"/><circle cx="29" cy="12" r="1.5" fill="currentColor"/><circle cx="34" cy="15" r="1.2" fill="currentColor"/><circle cx="31" cy="19" r="1.7" fill="currentColor"/><circle cx="37" cy="20" r="1.1" fill="currentColor"/><circle cx="35" cy="24" r="1.4" fill="currentColor"/><circle cx="40" cy="15" r="1" fill="currentColor"/>'
};

function skyGlyph(name) {
  const d = SKY[name];
  if (!d) throw new Error('unknown sky glyph: ' + name);
  return `<svg class="sky-glyph" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
}

// The astrolabe "rete": concentric rings, a graduated limb and an offset ecliptic
// circle. Generated once and reused as a decorative background.
function rete(cls = 'rete', ticks = 2) {
  const f = (n) => Math.round(n * 10) / 10;
  let s = '';
  [280, 262, 200, 140, 70].forEach((r, i) => { s += `<circle r="${r}" stroke-opacity="${i < 2 ? 0.7 : 0.35}"/>`; });
  for (let a = 0; a < 360; a += ticks) {
    const rad = (a * Math.PI) / 180, major = a % 10 === 0, r2 = major ? 244 : 254;
    s += `<line x1="${f(262 * Math.cos(rad))}" y1="${f(262 * Math.sin(rad))}" x2="${f(r2 * Math.cos(rad))}" y2="${f(r2 * Math.sin(rad))}" stroke-opacity="${major ? 0.8 : 0.4}"/>`;
  }
  s += '<circle cx="40" cy="-30" r="170" stroke-opacity=".45"/><circle cx="-20" cy="60" r="120" stroke-opacity=".3"/>';
  s += '<line x1="-280" y1="0" x2="280" y2="0" stroke-opacity=".3"/><line x1="0" y1="-280" x2="0" y2="280" stroke-opacity=".3"/>';
  [[-90, -150], [120, 40], [30, 180], [-160, 90], [180, -120]].forEach(([x, y]) => { s += `<circle cx="${x}" cy="${y}" r="3" fill="currentColor" stroke="none"/>`; });
  return `<svg class="${cls}" viewBox="-300 -300 600 600" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><g class="rete-spin">${s}</g></svg>`;
}

module.exports = { icon, skyGlyph, rete };

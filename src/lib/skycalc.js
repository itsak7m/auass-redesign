// "This month's sky" for Jordan, computed at build time with astronomy-engine
// (MIT, vendored as astronomy.min.js). Output has the same shape as content/sky.json.
const A = require('./astronomy.min.js');

const AMMAN = { lat: 31.95, lon: 35.93, h: 780, tz: 'Asia/Amman' };
const OBS = new A.Observer(AMMAN.lat, AMMAN.lon, AMMAN.h);
const HOUR = 3600e3, DAY = 86400e3, RAD = Math.PI / 180;

const MONTH_NAMES = {
  ar: ['كانون الثاني / يناير', 'شباط / فبراير', 'آذار / مارس', 'نيسان / أبريل', 'أيار / مايو', 'حزيران / يونيو', 'تموز / يوليو', 'آب / أغسطس', 'أيلول / سبتمبر', 'تشرين الأول / أكتوبر', 'تشرين الثاني / نوفمبر', 'كانون الأول / ديسمبر'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
};
const PLANETS = {
  Mercury: { ar: 'عطارد', en: 'Mercury', glyph: 'mercury' },
  Venus: { ar: 'الزهرة', en: 'Venus', glyph: 'venus' },
  Mars: { ar: 'المريخ', en: 'Mars', glyph: 'planet' },
  Jupiter: { ar: 'المشتري', en: 'Jupiter', glyph: 'planet' },
  Saturn: { ar: 'زحل', en: 'Saturn', glyph: 'saturn' },
  Uranus: { ar: 'أورانوس', en: 'Uranus', glyph: 'planet' },
  Neptune: { ar: 'نبتون', en: 'Neptune', glyph: 'planet' }
};
// Bright stars near the ecliptic that the Moon passes (J2000).
const STARS = {
  Aldebaran: { ar: 'الدبران', en: 'Aldebaran', ra: 4.598667, dec: 16.5093 },
  Pleiades: { ar: 'الثريا (M45)', en: 'the Pleiades (M45)', ra: 3.7916, dec: 24.1167, glyph: 'pleiades' },
  Regulus: { ar: 'قلب الأسد (الملكي)', en: 'Regulus', ra: 10.139528, dec: 11.9672 },
  Spica: { ar: 'السماك الأعزل', en: 'Spica', ra: 13.419883, dec: -11.1613 },
  Antares: { ar: 'قلب العقرب', en: 'Antares', ra: 16.490125, dec: -26.4320 }
};
// Main annual meteor showers: peak date (approximate, ±1 day), zenithal hourly rate.
const SHOWERS = [
  { m: 1, d: 3, ar: 'الرباعيات', en: 'Quadrantid', zhr: 110, late: true },
  { m: 4, d: 22, ar: 'القيثاريات', en: 'Lyrid', zhr: 18, late: true },
  { m: 5, d: 6, ar: 'الدلويات الإيتا', en: 'Eta Aquariid', zhr: 50, late: true },
  { m: 8, d: 12, ar: 'البرشاويات', en: 'Perseid', zhr: 100, late: true },
  { m: 10, d: 8, ar: 'التنينيات', en: 'Draconid', zhr: 10, late: false },
  { m: 10, d: 21, ar: 'الجباريات', en: 'Orionid', zhr: 20, late: true },
  { m: 11, d: 17, ar: 'الأسديات', en: 'Leonid', zhr: 15, late: true },
  { m: 12, d: 14, ar: 'التوأميات', en: 'Geminid', zhr: 150, late: true },
  { m: 12, d: 22, ar: 'الدبيات', en: 'Ursid', zhr: 10, late: true }
];

// ---------- time helpers ----------
const fmt = (opts) => new Intl.DateTimeFormat('en-CA', { timeZone: AMMAN.tz, hourCycle: 'h23', ...opts });
const fDate = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });
const fTime = fmt({ hour: '2-digit', minute: '2-digit' });
const localDate = (ms) => fDate.format(new Date(ms));
const localTime = (ms) => fTime.format(new Date(ms));
const localHour = (ms) => Number(localTime(ms).slice(0, 2));
function localMidnight(dateStr) { // UTC ms of 00:00 Amman on YYYY-MM-DD
  let t = Date.parse(dateStr + 'T00:00:00Z') - 14 * HOUR;
  while (localDate(t) !== dateStr) t += HOUR;
  while (localDate(t - 60000) === dateStr) t -= 60000;
  return t;
}
const dt = (ms) => new Date(ms);
const astroMs = (t) => t.date.getTime();
const norm180 = (x) => { x = ((x + 180) % 360 + 360) % 360 - 180; return x; };

// ---------- geometry ----------
const ECL = A.Rotation_EQJ_ECL();
function starVec(s) {
  const ra = s.ra * 15 * RAD, dec = s.dec * RAD;
  return new A.Vector(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec), null);
}
function eqjVec(key, ms) {
  if (key === 'Moon') return A.GeoMoon(dt(ms));
  if (key === 'Sun') return A.GeoVector(A.Body.Sun, dt(ms), true);
  if (STARS[key]) return starVec(STARS[key]);
  return A.GeoVector(A.Body[key], dt(ms), true);
}
function eclLonLat(key, ms) {
  const s = A.SphereFromVector(A.RotateVector(ECL, eqjVec(key, ms)));
  return { lon: s.lon, lat: s.lat };
}
function altitude(key, ms) {
  const t = dt(ms);
  let ra, dec;
  if (STARS[key]) {
    const v = A.RotateVector(A.Rotation_EQJ_EQD(t), starVec(STARS[key]));
    const s = A.SphereFromVector(v); ra = s.lon / 15; dec = s.lat;
  } else {
    const b = key === 'Moon' ? A.Body.Moon : A.Body[key];
    const eq = A.Equator(b, t, OBS, true, true); ra = eq.ra; dec = eq.dec;
  }
  return A.Horizon(t, OBS, ra, dec, 'normal').altitude;
}
const sunAlt = (ms) => altitude('Sun', ms);
function separation(a, b, ms) {
  const va = eqjVec(a, ms), vb = eqjVec(b, ms);
  const c = (va.x * vb.x + va.y * vb.y + va.z * vb.z) / (Math.hypot(va.x, va.y, va.z) * Math.hypot(vb.x, vb.y, vb.z));
  return Math.acos(Math.max(-1, Math.min(1, c))) / RAD;
}

// Times in [from, to] when ecliptic longitudes of a and b are equal (a overtakes b, or b overtakes a).
function longitudeMeets(a, b, from, to, step) {
  const out = [];
  const f = (ms) => norm180(eclLonLat(a, ms).lon - eclLonLat(b, ms).lon);
  let t0 = from, f0 = f(t0);
  for (let t1 = from + step; t1 <= to + step; t1 += step) {
    const f1 = f(t1);
    if (Math.abs(f0) < 40 && Math.abs(f1) < 40 && ((f0 < 0 && f1 >= 0) || (f0 > 0 && f1 <= 0))) {
      let lo = t0, hi = t1, flo = f0;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2, fm = f(mid);
        if ((flo < 0) === (fm < 0)) { lo = mid; flo = fm; } else hi = mid;
      }
      out.push((lo + hi) / 2);
    }
    t0 = t1; f0 = f1;
  }
  return out;
}

// Can it be seen from Jordan around time `ms`? Looks at the nearest dark sky within 18 hours.
function visibility(keys, ms) {
  let best = null;
  for (let d = -18 * 4; d <= 18 * 4; d++) {
    const t = ms + d * 15 * 60000;
    const sa = sunAlt(t);
    if (sa > -2) continue;
    const alts = keys.map((k) => altitude(k, t));
    const min = Math.min(...alts);
    let grade = null;
    if (sa < -6 && min > 6) grade = 'visible';
    else if (min > 3) grade = 'limited';
    if (!grade) continue;
    const better = !best || (grade === 'visible' && best.grade !== 'visible') || (grade === best.grade && Math.abs(t - ms) < Math.abs(best.t - ms));
    if (better) best = { grade, t };
  }
  if (!best) return { vis: 'none' };
  const h = localHour(best.t);
  const where = h >= 16 && h <= 23 ? 'evening' : h >= 2 && h <= 8 ? 'dawn' : 'night';
  return { vis: best.grade, where, t: best.t };
}
const WHERE = {
  evening: { ar: 'أفضل مشاهدة في سماء المساء بعد الغروب.', en: 'Best seen in the evening sky after sunset.' },
  dawn: { ar: 'أفضل مشاهدة في سماء الفجر قبل شروق الشمس.', en: 'Best seen in the dawn sky before sunrise.' },
  night: { ar: 'يُرى في ساعات الليل.', en: 'Visible during the night.' }
};
const dirWord = (v, lang) => (lang === 'ar' ? (v >= 0 ? 'شمال' : 'جنوب') : v >= 0 ? 'north' : 'south');

// ---------- event builders ----------
function ev(ms, glyph, vis, title, note, extra = {}) {
  return { date: localDate(ms), time: localTime(ms), glyph, vis, title, note, ...extra, _ms: ms };
}

function moonPhases(from, to) {
  const out = [];
  const meta = [
    { glyph: 'moon-new', vis: 'none', title: { ar: 'المحاق', en: 'New Moon' }, label: { ar: 'المحاق', en: 'New Moon' }, note: { ar: 'القمر غير مرئي، لكن السماء تكون مظلمة ومناسبة لرصد الأجرام الخافتة.', en: 'The Moon is not visible, but the dark sky is ideal for faint objects.' } },
    { glyph: 'moon-first', vis: 'visible', title: { ar: 'التربيع الأول للقمر', en: 'First quarter Moon' }, label: { ar: 'التربيع الأول', en: 'First quarter' }, note: { ar: 'يُرصد القمر في النصف الأول من الليل.', en: 'The Moon is visible in the first half of the night.' } },
    { glyph: 'moon-full', vis: 'visible', title: { ar: 'البدر', en: 'Full Moon' }, label: { ar: 'البدر', en: 'Full Moon' }, note: { ar: 'يُرى القمر مكتملاً طوال الليل، وهو وقت مناسب لتصويره.', en: 'The Moon is full all night: a good time to photograph it.' } },
    { glyph: 'moon-last', vis: 'visible', title: { ar: 'التربيع الأخير للقمر', en: 'Last quarter Moon' }, label: { ar: 'التربيع الأخير', en: 'Last quarter' }, note: { ar: 'يُرصد القمر بعد منتصف الليل وحتى الصباح.', en: 'The Moon is visible from midnight until morning.' } }
  ];
  let q = A.SearchMoonQuarter(dt(from - 2 * DAY));
  for (let i = 0; i < 8; i++) {
    const ms = astroMs(q.time);
    if (ms >= to) break;
    if (ms >= from) out.push({ ms, m: meta[q.quarter] });
    q = A.NextMoonQuarter(q);
  }
  return out;
}

function moonConjunctions(from, to) {
  const out = [];
  const targets = [...Object.keys(PLANETS).filter((k) => k !== 'Uranus' && k !== 'Neptune'), ...Object.keys(STARS)];
  for (const k of targets) {
    const body = PLANETS[k] || STARS[k];
    for (const ms of longitudeMeets('Moon', k, from - 6 * HOUR, to + 6 * HOUR, 3 * HOUR)) {
      if (ms < from || ms >= to) continue;
      const lat = eclLonLat('Moon', ms).lat - eclLonLat(k, ms).lat;
      if (Math.abs(lat) > 6.5) continue;
      const v = visibility(['Moon', k], ms);
      const sep = separation('Moon', k, ms).toFixed(1);
      const near = { ar: `القمر على بعد ${sep}° ${dirWord(lat, 'ar')} ${body.ar}.`, en: `The Moon passes ${sep}° ${dirWord(lat, 'en')} of ${body.en}.` };
      let note;
      if (v.vis === 'none') note = { ar: `${near.ar} غير مرئي من الأردن لأن أحدهما تحت الأفق أو في ضوء النهار.`, en: `${near.en} Not visible from Jordan: one of them is below the horizon or in daylight.` };
      else note = { ar: `${near.ar} ${WHERE[v.where].ar}`, en: `${near.en} ${WHERE[v.where].en}` };
      out.push(ev(ms, body.glyph || 'conj', v.vis === 'none' ? 'none' : v.vis, { ar: `القمر و${body.ar}`, en: `The Moon and ${body.en}` }, note, { conjunction: true }));
    }
  }
  return out;
}

function planetPairs(from, to) {
  const out = [];
  const keys = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    for (const ms of longitudeMeets(keys[i], keys[j], from - DAY, to + DAY, 6 * HOUR)) {
      if (ms < from || ms >= to) continue;
      const sep = separation(keys[i], keys[j], ms);
      if (sep > 4) continue;
      const v = visibility([keys[i], keys[j]], ms);
      if (v.vis === 'none') continue;
      const a = PLANETS[keys[i]], b = PLANETS[keys[j]];
      out.push(ev(ms, 'conj', v.vis, { ar: `اقتران ${a.ar} و${b.ar}`, en: `${a.en} and ${b.en} in conjunction` }, { ar: `يقترب الكوكبان إلى ${sep.toFixed(1)}° في السماء. ${WHERE[v.where].ar}`, en: `The two planets come within ${sep.toFixed(1)}° of each other. ${WHERE[v.where].en}` }, { conjunction: true }));
    }
  }
  return out;
}

function planetEvents(from, to) {
  const out = [];
  const start = dt(from);
  const inRange = (t) => { const ms = astroMs(t); return ms >= from && ms < to ? ms : null; };
  // SearchRelativeLongitude is measured from the Sun: 0 = same heliocentric longitude as
  // the Earth (opposition for outer planets, inferior conjunction for inner ones).
  for (const [k, p] of Object.entries(PLANETS)) {
    const inner = ['Mercury', 'Venus'].includes(k);
    const t0 = inRange(A.SearchRelativeLongitude(A.Body[k], 0, start));
    const t180 = inRange(A.SearchRelativeLongitude(A.Body[k], 180, start));
    if (t0 && !inner) {
      const bright = ['Mars', 'Jupiter', 'Saturn'].includes(k);
      out.push(ev(t0, p.glyph, 'visible', { ar: `${p.ar} في التقابل`, en: `${p.en} at opposition` }, bright
        ? { ar: `يكون ${p.ar} في أقرب نقطة من الأرض وأسطع ما يمكن، ويُرى طوال الليل.`, en: `${p.en} is at its closest and brightest, visible all night.` }
        : { ar: `يكون ${p.ar} مرئياً طوال الليل لكنه يحتاج إلى منظار أو تلسكوب لرصده.`, en: `${p.en} is up all night but needs binoculars or a telescope.` }));
    }
    const cj = inner ? [[t0, true], [t180, false]] : [[t180, null]];
    for (const [ms, inferior] of cj) {
      if (!ms) continue;
      const title = inner
        ? { ar: `${p.ar} في الاقتران ${inferior ? 'الأدنى' : 'الأعلى'} مع الشمس`, en: `${p.en} at ${inferior ? 'inferior' : 'superior'} conjunction` }
        : { ar: `${p.ar} في الاقتران مع الشمس`, en: `${p.en} in conjunction with the Sun` };
      out.push(ev(ms, p.glyph, 'none', title, { ar: 'يقع الكوكب قرب الشمس في السماء فلا يمكن رؤيته.', en: 'The planet lies close to the Sun in the sky and cannot be seen.' }));
    }
  }
  for (const k of ['Mercury', 'Venus']) {
    const e = A.SearchMaxElongation(A.Body[k], start);
    const ms = inRange(e.time);
    if (!ms) continue;
    const p = PLANETS[k], evening = e.visibility === 'evening' || e.visibility === 1;
    const eastern = evening;
    out.push(ev(ms, p.glyph, 'visible', { ar: `${p.ar} في الاستطالة ${eastern ? 'الشرقية' : 'الغربية'} العظمى`, en: `${p.en} at greatest ${eastern ? 'eastern' : 'western'} elongation` },
      { ar: `يبعد ${e.elongation.toFixed(0)}° عن الشمس، وهي أفضل فرصة لرصده في ${eastern ? 'سماء المساء بعد الغروب' : 'سماء الفجر قبل الشروق'}.`, en: `${e.elongation.toFixed(0)}° from the Sun: the best chance to see it in the ${eastern ? 'evening sky after sunset' : 'dawn sky before sunrise'}.` }));
  }
  return out;
}

function eclipses(from, to) {
  const out = [];
  const kindAr = { total: 'كلي', partial: 'جزئي', annular: 'حلقي', hybrid: 'هجين', penumbral: 'شبه ظل' };
  const kindEn = { total: 'Total', partial: 'Partial', annular: 'Annular', hybrid: 'Hybrid', penumbral: 'Penumbral' };
  const kname = (k) => String(k).toLowerCase();
  let le = A.SearchLunarEclipse(dt(from - DAY));
  for (let i = 0; i < 3 && astroMs(le.peak) < to; i++) {
    const ms = astroMs(le.peak), k = kname(le.kind);
    if (ms >= from) {
      const up = altitude('Moon', ms) > 0;
      out.push(ev(ms, 'eclipse', up ? 'visible' : 'none', { ar: `خسوف ${kindAr[k]} للقمر`, en: `${kindEn[k]} lunar eclipse` },
        up ? { ar: 'يُرى القمر مخسوفاً من الأردن. الرصد آمن بالعين المجردة.', en: 'The Moon is seen eclipsed from Jordan. Safe to watch with the naked eye.' }
          : { ar: 'لا يُرى من الأردن لأن القمر تحت الأفق وقت الذروة.', en: 'Not visible from Jordan: the Moon is below the horizon at maximum.' }));
    }
    le = A.NextLunarEclipse(le.peak);
  }
  let ge = A.SearchGlobalSolarEclipse(dt(from - DAY));
  for (let i = 0; i < 3 && astroMs(ge.peak) < to; i++) {
    const ms = astroMs(ge.peak), k = kname(ge.kind);
    if (ms >= from) {
      const loc = A.SearchLocalSolarEclipse(dt(ms - 2 * DAY), OBS);
      const here = Math.abs(astroMs(loc.peak.time) - ms) < DAY && loc.peak.altitude > 0;
      const pct = Math.round((loc.obscuration || 0) * 100);
      out.push(ev(ms, 'eclipse', here ? 'visible' : 'none', { ar: `كسوف ${kindAr[k]} للشمس`, en: `${kindEn[k]} solar eclipse` },
        here ? { ar: `يُرى كسوفاً ${kindAr[kname(loc.kind)] || 'جزئياً'} من عمّان، ويغطي نحو ${pct}% من قرص الشمس. لا تنظر إلى الشمس دون نظارات الكسوف.`, en: `Seen from Amman as a ${(kindEn[kname(loc.kind)] || 'partial').toLowerCase()} eclipse covering about ${pct}% of the Sun's disc. Never look at the Sun without eclipse glasses.` }
          : { ar: 'لا يُرى من الأردن، ويُشاهد من مناطق أخرى في العالم.', en: 'Not visible from Jordan; seen from other parts of the world.' }));
    }
    ge = A.NextGlobalSolarEclipse(ge.peak);
  }
  return out;
}

function seasons(from, to) {
  const y = Number(localDate(from).slice(0, 4));
  const s = A.Seasons(y);
  const list = [
    [s.mar_equinox, { ar: 'الاعتدال الربيعي', en: 'March equinox' }, { ar: 'يتساوى الليل والنهار تقريباً، وتبدأ الربيع في النصف الشمالي.', en: 'Day and night are nearly equal; spring begins in the northern hemisphere.' }],
    [s.jun_solstice, { ar: 'الانقلاب الصيفي', en: 'June solstice' }, { ar: 'أطول نهار في السنة في النصف الشمالي، ويبدأ الصيف فلكياً.', en: 'The longest day of the year in the north; astronomical summer begins.' }],
    [s.sep_equinox, { ar: 'الاعتدال الخريفي', en: 'September equinox' }, { ar: 'يتساوى الليل والنهار تقريباً، ويبدأ الخريف في النصف الشمالي.', en: 'Day and night are nearly equal; autumn begins in the northern hemisphere.' }],
    [s.dec_solstice, { ar: 'الانقلاب الشتوي', en: 'December solstice' }, { ar: 'أقصر نهار في السنة في النصف الشمالي، ويبدأ الشتاء فلكياً.', en: 'The shortest day of the year in the north; astronomical winter begins.' }]
  ];
  return list.filter(([t]) => astroMs(t) >= from && astroMs(t) < to).map(([t, title, note]) => ev(astroMs(t), 'sun', 'visible', title, note));
}

function showers(from, to) {
  const out = [];
  const startKey = localDate(from), endKey = localDate(to - 1);
  const year = Number(startKey.slice(0, 4));
  for (const y of [year, year + 1]) for (const s of SHOWERS) {
    const key = `${y}-${String(s.m).padStart(2, '0')}-${String(s.d).padStart(2, '0')}`;
    if (key < startKey || key > endKey) continue;
    const night = localMidnight(key) + 2 * HOUR; // 02:00 local on the peak date
    const lit = A.Illumination(A.Body.Moon, dt(night)).phase_fraction;
    const moonUp = altitude('Moon', night) > 0;
    const bad = moonUp && lit > 0.5;
    out.push({ date: key, glyph: 'meteor', vis: bad ? 'limited' : 'visible', time_note: s.late ? { ar: 'أفضل وقت: بعد منتصف الليل', en: 'Best after midnight' } : { ar: 'أفضل وقت: بعد الغروب', en: 'Best after dusk' },
      title: { ar: `ذروة شهب ${s.ar}`, en: `${s.en} meteor shower peak` },
      note: { ar: `نحو ${s.zhr} شهاباً في الساعة في أفضل الظروف. ${bad ? 'ضوء القمر الساطع يخفي الشهب الخافتة.' : 'القمر لا يزعج الرصد كثيراً هذا العام.'} الموعد تقريبي (±يوم).`, en: `Up to about ${s.zhr} meteors per hour in ideal conditions. ${bad ? 'Bright moonlight will hide the fainter meteors.' : 'The Moon does little harm this year.'} Date is approximate (±1 day).` },
      _ms: night });
  }
  return out;
}

// ---------- public ----------
function monthOf(nowMs) {
  const [y, m] = localDate(nowMs).split('-').map(Number);
  const key = `${y}-${String(m).padStart(2, '0')}`;
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  return { y, m, key, from: localMidnight(key + '-01'), to: localMidnight(next + '-01') };
}

function generate(base, nowMs = Date.now()) {
  const mo = monthOf(nowMs);
  const { from, to } = mo;
  const phases = moonPhases(from, to);
  const events = [
    ...phases.map(({ ms, m }) => ev(ms, m.glyph, m.vis, m.title, m.note)),
    ...moonConjunctions(from, to), ...planetPairs(from, to), ...planetEvents(from, to), ...eclipses(from, to), ...seasons(from, to), ...showers(from, to)
  ];
  events.sort((a, b) => (a.date + (a.time || '12:00')).localeCompare(b.date + (b.time || '12:00')));
  events.forEach((e) => delete e._ms);
  return {
    ...base,
    monthKey: mo.key,
    month: { ar: `${MONTH_NAMES.ar[mo.m - 1]} ${mo.y}`, en: `${MONTH_NAMES.en[mo.m - 1]} ${mo.y}` },
    credit: { ar: 'حسابات فلكية آلية لسماء الأردن', en: "Automatic astronomical calculations for Jordan's sky" },
    source: undefined,
    auto: true,
    events,
    phases: phases.map(({ ms, m }) => ({ date: localDate(ms), glyph: m.glyph, label: m.label }))
  };
}

// The next solar eclipse that can be seen from Amman, for the home-page countdown.
function nextSolarEclipse(nowMs = Date.now()) {
  let from = new Date(nowMs);
  for (let i = 0; i < 12; i++) {
    const e = A.SearchLocalSolarEclipse(from, OBS);
    if (e.peak.altitude > 0 && e.obscuration > 0.01) {
      const ms = astroMs(e.peak.time);
      return { ms, kind: String(e.kind).toLowerCase(), pct: Math.round(e.obscuration * 100), date: localDate(ms) };
    }
    from = new Date(astroMs(e.peak.time) + DAY);
  }
  return null;
}

// New Moon instants (UTC ms) around `nowMs`, so the home-page Moon widget uses real lunations.
function newMoons(nowMs = Date.now(), count = 40) {
  const out = [];
  let t = A.SearchMoonPhase(0, dt(nowMs - 40 * DAY), 40);
  for (let i = 0; i < count && t; i++) { out.push(astroMs(t)); t = A.SearchMoonPhase(0, dt(astroMs(t) + 20 * DAY), 40); }
  return out;
}

module.exports = { generate, nextSolarEclipse, newMoons, monthOf, AMMAN };

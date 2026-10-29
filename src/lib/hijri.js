// Astronomical calendar of the months of worship, computed at build time with
// astronomy-engine (MIT, vendored as astronomy.min.js). Month starts follow the
// Umm al-Qura rule (conjunction before sunset and moonset after sunset at Makkah
// on the 29th); crescent visibility uses the Odeh (2004) criterion.
const A = require('./astronomy.min.js');

const CITIES = [
  { id: 'amman', ar: 'عمّان', en: 'Amman', lat: 31.95, lon: 35.93, h: 780, tz: 'Asia/Amman' },
  { id: 'makkah', ar: 'مكة المكرمة', en: 'Makkah', lat: 21.4225, lon: 39.8262, h: 277, tz: 'Asia/Riyadh' },
  { id: 'cairo', ar: 'القاهرة', en: 'Cairo', lat: 30.0444, lon: 31.2357, h: 23, tz: 'Africa/Cairo' },
  { id: 'casablanca', ar: 'الدار البيضاء', en: 'Casablanca', lat: 33.5731, lon: -7.5898, h: 50, tz: 'Africa/Casablanca' }
];
const MAKKAH = CITIES[1];
const DAY = 86400000;
const obs = (c) => new A.Observer(c.lat, c.lon, c.h);
const dayKey = (ms, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const rad = Math.PI / 180;

// Local noon (UTC ms) of the civil day that contains `ms` in the zone `tz`.
function localDayStart(ms, tz) {
  const k = dayKey(ms, tz);
  let t = Date.parse(k + 'T00:00:00Z') - 14 * 3600e3;
  while (dayKey(t, tz) !== k) t += 3600e3;
  return t;
}

function altAz(body, t, o) {
  const eq = A.Equator(body, t, o, true, true);
  const hor = A.Horizon(t, o, eq.ra, eq.dec, null);
  return { alt: hor.altitude, ra: eq.ra * 15 * rad, dec: eq.dec * rad, dist: eq.dist };
}

// Crescent visibility on the given civil evening (the 29th), Odeh criterion.
function crescent(city, conjMs, evening, again) {
  const o = obs(city);
  const ss = A.SearchRiseSet(A.Body.Sun, o, -1, new Date(Date.parse(evening + 'T12:00:00Z') - 14 * 3600e3 - 3600e3), 1.5);
  let sunset = ss.date.getTime();
  if (dayKey(sunset, city.tz) !== evening) sunset = A.SearchRiseSet(A.Body.Sun, o, -1, new Date(sunset + 3600e3), 1.5).date.getTime();
  if (conjMs >= sunset) return again ? { evening, ageH: (sunset - conjMs) / 3600e3, cls: 'X' } : crescent(city, conjMs, new Date(Date.parse(evening + 'T12:00:00Z') + DAY).toISOString().slice(0, 10), true);
  const ms = A.SearchRiseSet(A.Body.Moon, o, -1, new Date(sunset), 1);
  const lag = ms ? (ms.date.getTime() - sunset) / 60000 : -999;
  const best = new Date(sunset + Math.max(lag, 0) * 4 / 9 * 60000);
  const m = altAz(A.Body.Moon, best, o), s = altAz(A.Body.Sun, best, o);
  const cosL = Math.sin(m.dec) * Math.sin(s.dec) + Math.cos(m.dec) * Math.cos(s.dec) * Math.cos(m.ra - s.ra);
  const arcl = Math.acos(Math.min(1, Math.max(-1, cosL))) / rad;
  const sd = Math.asin(1737.4 / (m.dist * 149597870.7)) / rad * 60; // arc-minutes
  const W = sd * (1 - Math.cos(arcl * rad));
  const arcv = m.alt - s.alt;
  const V = arcv - (-0.1018 * W ** 3 + 0.7319 * W ** 2 - 6.3226 * W + 7.1651);
  const cls = lag <= 0 ? 'D' : V >= 5.65 ? 'A' : V >= 2 ? 'B' : V >= -0.96 ? 'C' : 'D';
  return { evening, ageH: (sunset - conjMs) / 3600e3, lag, alt: m.alt, arcv, V, cls };
}

// First evening on which Makkah meets the Umm al-Qura condition → next day is the 1st.
function umAlQura(conjMs) {
  const o = obs(MAKKAH);
  let d = localDayStart(conjMs, MAKKAH.tz) - DAY;
  for (let i = 0; i < 4; i++) {
    const ss = A.SearchRiseSet(A.Body.Sun, o, -1, new Date(d), 1.5).date.getTime();
    const ms = A.SearchRiseSet(A.Body.Moon, o, -1, new Date(ss - 3600e3), 1);
    if (conjMs < ss && ms && ms.date.getTime() > ss && dayKey(ss, MAKKAH.tz) >= dayKey(conjMs, MAKKAH.tz)) return Date.parse(dayKey(ss, MAKKAH.tz) + 'T12:00:00Z') + DAY;
    d += DAY;
  }
  return null;
}

// months: Dhu al-Hijjah 1445 (only to find the first evening) up to `lastYear`.
function build(lastYear) {
  const all = [];
  let t = A.SearchMoonPhase(0, new Date('2024-05-25T00:00:00Z'), 40);
  let y = 1445, m = 12;
  while (y <= lastYear) {
    all.push({ y, m, conj: t.date.getTime(), first: umAlQura(t.date.getTime()) });
    m++; if (m > 12) { m = 1; y++; }
    t = A.SearchMoonPhase(0, new Date(all[all.length - 1].conj + 20 * DAY), 40);
  }
  const months = [];
  for (let i = 1; i < all.length; i++) {
    const x = all[i], prev = all[i - 1];
    const evening = new Date(prev.first + 28 * DAY).toISOString().slice(0, 10);
    x.evening = evening;
    x.vis = Object.fromEntries(CITIES.map((c) => [c.id, crescent(c, x.conj, evening)]));
    x.len = i + 1 < all.length ? Math.round((all[i + 1].first - x.first) / DAY) : null;
    if (![1, 2].includes(Math.round((x.first - Date.parse(evening + 'T12:00:00Z')) / DAY))) throw new Error('evening mismatch ' + x.y + '/' + x.m);
    months.push(x);
  }
  return months;
}

module.exports = { CITIES, MAKKAH, build, DAY };

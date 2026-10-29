// Scarica lo storico orario della stazione da Weather Underground e rigenera data/daily.json.
// Uso: WU_API_KEY=... node scripts/sync.mjs [--max-calls=1200] [--from=2022-12-01]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const HOURLY = join(DATA, 'hourly');
const STATION = 'IPONDE1';
const TZ = 'Europe/Rome';
const KEY = process.env.WU_API_KEY;
if (!KEY) { console.error('WU_API_KEY mancante'); process.exit(1); }

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const MAX_CALLS = Number(args['max-calls'] ?? 1200);
const FROM = args.from ?? '2022-12-01';
const REFETCH_DAYS = 2; // oggi e i giorni recenti vengono sempre riscaricati

mkdirSync(HOURLY, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
const today = fmt.format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const monthFile = m => join(HOURLY, `${m}.json`);
const loadMonth = m => existsSync(monthFile(m)) ? JSON.parse(readFileSync(monthFile(m), 'utf8')) : {};
const saveMonth = (m, obj) => writeFileSync(monthFile(m), JSON.stringify(obj));

const r1 = v => (v == null ? null : Math.round(v * 100) / 100);
const compact = o => {
  const m = o.metric;
  return {
    t: o.epoch, ta: m.tempAvg, th: m.tempHigh, tl: m.tempLow,
    h: o.humidityAvg, hh: o.humidityHigh, hl: o.humidityLow,
    dp: m.dewptAvg, w: m.windspeedAvg, wh: m.windspeedHigh, g: m.windgustHigh, wd: o.winddirAvg,
    pa: m.pressureMax != null && m.pressureMin != null ? r1((m.pressureMax + m.pressureMin) / 2) : null,
    px: m.pressureMax, pn: m.pressureMin, r: m.precipTotal, rr: m.precipRate,
    s: o.solarRadiationHigh, uv: o.uvHigh,
  };
};

let calls = 0;
async function fetchDay(date) {
  const url = `https://api.weather.com/v2/pws/history/hourly?stationId=${STATION}&format=json&units=m&numericPrecision=decimal&date=${date.replaceAll('-', '')}&apiKey=${KEY}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    calls++;
    const res = await fetch(url);
    if (res.status === 204) return [];
    if (res.status === 429) { if (attempt >= 1) throw new Error('limite chiamate API raggiunto (429)'); console.log('rate limit, attendo 65s'); await sleep(65000); continue; }
    if (!res.ok) { console.log(`HTTP ${res.status} per ${date}, ritento`); await sleep(5000); continue; }
    const j = await res.json();
    return (j.observations ?? []).map(compact);
  }
  throw new Error('troppi errori per ' + date);
}

async function main() {
  const cache = new Map();
  const getMonth = m => { if (!cache.has(m)) cache.set(m, loadMonth(m)); return cache.get(m); };
  const dirty = new Set();
  let stop = false;

  for (let d = FROM; d <= today && !stop; d = addDays(d, 1)) {
    const m = d.slice(0, 7);
    const month = getMonth(m);
    const recent = d >= addDays(today, -REFETCH_DAYS);
    if (month[d] && !recent) continue;
    if (calls >= MAX_CALLS) { console.log('budget chiamate esaurito, riprendi al prossimo run'); stop = true; break; }
    try { month[d] = await fetchDay(d); }
    catch (e) { console.log(`stop anticipato a ${d}: ${e.message} (i dati scaricati finora vengono salvati)`); stop = true; break; }
    dirty.add(m);
    if (calls % 25 === 0) { console.log(`${d} (${calls} chiamate)`); for (const k of dirty) saveMonth(k, cache.get(k)); }
    await sleep(2200); // limite WU: 30 chiamate/minuto
  }
  for (const k of dirty) saveMonth(k, cache.get(k));
  console.log(`chiamate effettuate: ${calls}`);
  buildDaily();
}

const max = a => a.length ? Math.max(...a) : null;
const min = a => a.length ? Math.min(...a) : null;
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const nn = a => a.filter(v => v != null);
const hourOf = t => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date(t * 1000)));

function buildDaily() {
  const months = requireList();
  const rows = [];
  for (const m of months.sort()) {
    const month = loadMonth(m);
    for (const date of Object.keys(month).sort()) {
      const obs = month[date];
      if (!obs.length) continue;
      const peak = (key, fn) => {
        const vals = obs.filter(o => o[key] != null);
        if (!vals.length) return [null, null];
        const best = vals.reduce((a, b) => (fn(b[key], a[key]) ? b : a));
        return [best[key], hourOf(best.t)];
      };
      const [tmax, tmaxH] = peak('th', (a, b) => a > b);
      const [tmin, tminH] = peak('tl', (a, b) => a < b);
      const [gust, gustH] = peak('g', (a, b) => a > b);
      const [wmax] = peak('wh', (a, b) => a > b);
      const [pmax] = peak('px', (a, b) => a > b);
      const [pmin] = peak('pn', (a, b) => a < b);
      rows.push({
        d: date, n: obs.length,
        tmax, tmaxH, tmin, tminH, tavg: r1(avg(nn(obs.map(o => o.ta)))),
        hmax: max(nn(obs.map(o => o.hh))), hmin: min(nn(obs.map(o => o.hl))), havg: r1(avg(nn(obs.map(o => o.h)))),
        dpmax: max(nn(obs.map(o => o.dp))), dpmin: min(nn(obs.map(o => o.dp))),
        wmax, wavg: r1(avg(nn(obs.map(o => o.w)))), gust, gustH,
        pmax, pmin,
        rain: r1(rainOfDay(obs)), rainRate: max(nn(obs.map(o => o.rr))),
        wdom: dominantDir(obs),
      });
    }
  }
  writeFileSync(join(DATA, 'daily.json'), JSON.stringify({ station: STATION, updated: new Date().toISOString(), days: rows }));
  console.log(`daily.json: ${rows.length} giorni`);
}

import { readdirSync } from 'node:fs';
function requireList() { return readdirSync(HOURLY).filter(f => f.endsWith('.json')).map(f => f.replace('.json', '')); }

// precipTotal orario: da verificare sui dati reali (cumulato giornaliero vs. per-ora) -> vedi RAIN_MODE
const RAIN_MODE = process.env.RAIN_MODE ?? 'cumulative';
function rainOfDay(obs) {
  const v = nn(obs.map(o => o.r));
  if (!v.length) return null;
  return RAIN_MODE === 'cumulative' ? max(v) : v.reduce((a, b) => a + b, 0);
}
function dominantDir(obs) {
  const bins = new Array(16).fill(0);
  for (const o of obs) if (o.wd != null && (o.w ?? 0) > 0.5) bins[Math.round(o.wd / 22.5) % 16] += o.w;
  const i = bins.indexOf(Math.max(...bins));
  return bins[i] > 0 ? Math.round(i * 22.5) : null;
}

main().catch(e => { console.error(e); process.exit(1); });

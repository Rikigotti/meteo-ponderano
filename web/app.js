'use strict';
/* Meteo Ponderano – web app statica per la stazione IPONDE1.
   Dati: data/daily.json, data/hourly/YYYY-MM.json, live/current.json, live/last24h.json */

const $ = (s, r = document) => r.querySelector(s);
const view = $('#view');
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const MIN_HOURS = 20; // un giorno con meno ore di dati non entra nelle medie

/* ---------- formattazione ---------- */
const nf = (v, d = 1) => v == null || Number.isNaN(v) ? '–' : v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
const dFmt = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
const dFmtLong = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const monthName = new Intl.DateTimeFormat('it-IT', { month: 'long' });
const toDate = iso => new Date(iso + 'T12:00:00Z');
const fDate = iso => dFmt.format(toDate(iso));
const ts = iso => Math.floor(toDate(iso).getTime() / 1000);
const MESI = Array.from({ length: 12 }, (_, i) => monthName.format(new Date(2021, i, 15)));
const cap = s => s[0].toUpperCase() + s.slice(1);
const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
const dirName = d => d == null ? '–' : DIRS[Math.round(d / 22.5) % 16];
const pad2 = n => String(n).padStart(2, '0');
const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
const addDays = (iso, n) => { const d = toDate(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const timeFmt = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });

/* ---------- dati ---------- */
const getJson = async url => { const r = await fetch(url, { cache: 'no-cache' }); if (!r.ok) throw new Error(url + ' ' + r.status); return r.json(); };
const store = { days: null, byDate: new Map() };
const hourlyCache = new Map();
async function loadDaily() {
  if (store.days) return store.days;
  const j = await getJson('data/daily.json');
  store.days = j.days; store.updated = j.updated;
  j.days.forEach(d => store.byDate.set(d.d, d));
  $('#dataSince').textContent = j.days.length ? `storico dal ${fDate(j.days[0].d)} (${j.days.length} giorni)` : '';
  return store.days;
}
async function loadHourly(date) {
  const m = date.slice(0, 7);
  if (!hourlyCache.has(m)) hourlyCache.set(m, getJson(`data/hourly/${m}.json`).catch(() => ({})));
  return (await hourlyCache.get(m))[date] ?? [];
}
const optJson = url => getJson(url).catch(() => null);

/* ---------- previsioni (Open-Meteo, senza chiave) ---------- */
const WMO = { 0: ['Sereno', '☀️'], 1: ['Prevalentemente sereno', '🌤️'], 2: ['Parzialmente nuvoloso', '⛅'], 3: ['Coperto', '☁️'], 45: ['Nebbia', '🌫️'], 48: ['Nebbia con brina', '🌫️'],
  51: ['Pioviggine debole', '🌦️'], 53: ['Pioviggine', '🌦️'], 55: ['Pioviggine intensa', '🌦️'], 56: ['Pioviggine gelata', '🌧️'], 57: ['Pioviggine gelata', '🌧️'],
  61: ['Pioggia debole', '🌧️'], 63: ['Pioggia moderata', '🌧️'], 65: ['Pioggia forte', '🌧️'], 66: ['Pioggia gelata', '🌧️'], 67: ['Pioggia gelata forte', '🌧️'],
  71: ['Neve debole', '🌨️'], 73: ['Neve moderata', '🌨️'], 75: ['Neve forte', '❄️'], 77: ['Granelli di neve', '🌨️'],
  80: ['Rovesci deboli', '🌦️'], 81: ['Rovesci', '🌧️'], 82: ['Rovesci violenti', '⛈️'], 85: ['Rovesci di neve', '🌨️'], 86: ['Rovesci di neve forti', '❄️'],
  95: ['Temporale', '⛈️'], 96: ['Temporale con grandine', '⛈️'], 99: ['Temporale con grandine forte', '⛈️'] };
const wmo = c => WMO[c] ?? ['–', '❔'];
let forecastP = null;
function loadForecast() {
  if (!forecastP) {
    const q = 'latitude=45.531&longitude=8.052&elevation=352&timezone=Europe%2FRome&forecast_days=5&wind_speed_unit=kmh'
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunrise,sunset'
      + '&hourly=temperature_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,relative_humidity_2m,pressure_msl';
    forecastP = fetch('https://api.open-meteo.com/v1/forecast?' + q).then(r => { if (!r.ok) throw new Error('Open-Meteo ' + r.status); return r.json(); })
      .catch(e => { forecastP = null; throw e; });
  }
  return forecastP;
}
const dayLabel = (iso, i) => i === 0 ? 'Oggi' : i === 1 ? 'Domani' : cap(new Intl.DateTimeFormat('it-IT', { weekday: 'long' }).format(toDate(iso)));
function forecastCards(f, compact) {
  const d = f.daily;
  return `<div class="days">${d.time.map((t, i) => {
    const [label, icon] = wmo(d.weather_code[i]);
    const prob = d.precipitation_probability_max[i];
    return `<div class="card day" title="${label}">
      <div class="lab"><b>${dayLabel(t, i)}</b><span>${toDate(t).getUTCDate()}/${pad2(toDate(t).getUTCMonth() + 1)}</span></div>
      <div class="ico" aria-hidden="true">${icon}</div>
      <div class="temps"><span class="up">${nf(d.temperature_2m_max[i], 0)}°</span><span class="down">${nf(d.temperature_2m_min[i], 0)}°</span></div>
      <div class="sub">${label}</div>
      <div class="sub">💧 ${nf(d.precipitation_sum[i])} mm${prob != null ? ` · ${prob}%` : ''}</div>
      ${compact ? '' : `<div class="sub">💨 ${nf(d.wind_speed_10m_max[i], 0)} km/h, raff. ${nf(d.wind_gusts_10m_max[i], 0)} · da ${dirName(d.wind_direction_10m_dominant[i])}</div>
      <div class="sub">🌅 ${d.sunrise[i].slice(11)} · 🌇 ${d.sunset[i].slice(11)}</div>`}
    </div>`;
  }).join('')}</div>`;
}

/* ---------- tema ---------- */
$('#themeBtn').onclick = () => {
  const cur = document.documentElement.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('theme', next); } catch {}
  route();
};
try { const t = localStorage.getItem('theme'); if (t) document.documentElement.dataset.theme = t; } catch {}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => route());

/* ---------- grafici (uPlot) ---------- */
const tip = $('#tip');
let live = []; // grafici da distruggere ad ogni cambio vista
function mkChart(el, o) {
  // o: {x, series:[{label,color,values,fill,width,step,bars}], unit, dec, height, fmtX, onClick, yRange}
  const grid = css('--grid'), ink = css('--ink2');
  const data = [o.x, ...o.series.map(s => s.values)];
  const u = new uPlot({
    width: el.clientWidth || 600, height: o.height ?? 240,
    padding: [10, 8, 0, 0],
    cursor: { points: { size: 8, width: 2 }, drag: { x: true, y: false, setScale: true } },
    legend: { show: false },
    scales: { x: { time: !!o.time }, y: o.yRange ? { range: o.yRange } : {} },
    axes: [
      { stroke: ink, grid: { stroke: grid, width: 1 }, ticks: { show: false }, values: o.xValues },
      { stroke: ink, grid: { stroke: grid, width: 1 }, ticks: { show: false }, size: 52, values: (u, v) => v.map(x => nf(x, o.axisDec ?? (Math.abs(x) < 10 && o.dec ? 1 : 0))) },
    ],
    series: [{}, ...o.series.map(s => ({
      label: s.label, stroke: s.color, width: s.width ?? 2, spanGaps: false, points: { show: false },
      fill: s.fill ? s.color + '22' : undefined,
      paths: s.bars ? uPlot.paths.bars({ size: [0.7, 24], radius: 0.2 }) : (s.step ? uPlot.paths.stepped({ align: 1 }) : undefined),
    }))],
    hooks: {
      setCursor: [u => {
        const i = u.cursor.idx;
        if (i == null || u.cursor.left < 0) { tip.hidden = true; return; }
        const rows = o.series.map((s, k) => `<div><i style="background:${s.color}"></i>${s.label}: <b style="display:inline">${s.values[i] == null ? '–' : nf(s.values[i], o.dec ?? 1) + (o.unit ? ' ' + o.unit : '')}</b></div>`).join('');
        tip.innerHTML = `<b>${o.fmtX ? o.fmtX(o.x[i]) : o.x[i]}</b>${rows}`;
        tip.hidden = false;
        const r = u.over.getBoundingClientRect();
        const left = r.left + u.cursor.left, top = r.top + (u.cursor.top ?? 0);
        tip.style.left = Math.min(left + 14, innerWidth - 250) + 'px';
        tip.style.top = Math.max(top - 20, 8) + 'px';
      }],
      ready: [u => {
        u.over.addEventListener('mouseleave', () => tip.hidden = true);
        u.over.addEventListener('dblclick', () => u.setScale('x', { min: o.x[0], max: o.x[o.x.length - 1] }));
        if (o.onClick) u.over.addEventListener('click', () => { if (u.cursor.idx != null && u.select.width < 4) o.onClick(u.cursor.idx); });
      }],
    },
  }, data, el);
  const ro = new ResizeObserver(() => u.setSize({ width: el.clientWidth, height: o.height ?? 240 }));
  ro.observe(el);
  live.push({ destroy() { ro.disconnect(); u.destroy(); } });
  return u;
}
/* tabella responsive: su schermi stretti ogni riga diventa una scheda con le etichette (vedi .stack in styles.css) */
const tbl = (heads, rows, cols = 4) => `<table class="stack" style="--cols:${cols}"><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${
  rows.map(r => `<tr${r.day ? ` class="link" data-day="${r.day}"` : ''}>${r.cells.map((c, i) => `<td${i ? ` data-label="${heads[i]}"` : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const legend = items => `<div class="legend">${items.map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('')}</div>`;
const chartBox = (id, title, leg) => `<div class="card"><h3>${title}</h3>${leg ? legend(leg) : ''}<div class="chart" id="${id}"></div></div>`;

/* ---------- vista: ORA ---------- */
async function viewOra() {
  // su Vercel il dato arriva dalle funzioni /api (sempre fresco); altrimenti dagli snapshot pubblicati col sito
  const liveJson = async name => (await optJson(`api/${name}`)) ?? optJson(`live/${name}.json`);
  const [cur, h24, days] = await Promise.all([liveJson('current'), liveJson('last24h'), loadDaily()]);
  const o = cur?.observations?.[0];
  if (!o) { view.innerHTML = '<p class="muted pad">Dato live non disponibile. Riprova tra qualche minuto.</p>'; return; }
  const m = o.metric;
  const ageMin = Math.round((Date.now() / 1000 - o.epoch) / 60);
  const feels = m.temp >= 27 ? m.heatIndex : m.temp <= 10 ? m.windChill : m.temp;
  const obs = h24?.observations ?? [];
  const today = todayIso();
  const todayObs = obs.filter(x => x.obsTimeLocal.startsWith(today));
  const tMax = todayObs.length ? Math.max(...todayObs.map(x => x.metric.tempHigh)) : null;
  const tMin = todayObs.length ? Math.min(...todayObs.map(x => x.metric.tempLow)) : null;
  const gMax = todayObs.length ? Math.max(...todayObs.map(x => x.metric.windgustHigh)) : null;
  // tendenza pressione sulle ultime 3 ore
  let trend = null;
  const ref = obs.find(x => x.epoch >= o.epoch - 3 * 3600);
  if (ref) trend = m.pressure - ref.metric.pressureMax;
  const tTxt = trend == null ? '' : Math.abs(trend) < 0.6 ? 'stabile' : trend > 0 ? '↗ in aumento' : '↘ in calo';
  const stale = ageMin > 90;
  const rec = recordsFor(days);

  view.innerHTML = `
  <div class="hero">
    <div class="card">
      <div class="lab"><span>Temperatura</span><span class="pill ${stale ? 'warn' : ''}">${stale ? 'dato non aggiornato · ' : ''}${timeFmt.format(new Date(o.epoch * 1000))}${ageMin > 0 ? ` · ${ageMin < 90 ? ageMin + ' min fa' : Math.round(ageMin / 60) + ' h fa'}` : ''}</span></div>
      <div class="big">${nf(m.temp)}<small>°C</small></div>
      <div class="sub">Percepita ${nf(feels)}° · Rugiada ${nf(m.dewpt)}°</div>
      <div class="sub">Oggi: <span class="down">min ${nf(tMin)}°</span> · <span class="up">max ${nf(tMax)}°</span></div>
    </div>
    <div class="grid cards">
      <div class="card"><div class="lab">Vento</div><div class="compass">
        ${compass(o.winddir)}<div><div class="val">${nf(m.windSpeed, 0)}<small>km/h</small></div><div class="sub">da ${dirName(o.winddir)} · raffica ${nf(m.windGust, 0)}</div></div></div>
        <div class="sub">Raffica max oggi ${nf(gMax, 0)} km/h</div></div>
      <div class="card"><div class="lab">Umidità</div><div class="val">${nf(o.humidity, 0)}<small>%</small></div><div class="sub">Rugiada ${nf(m.dewpt)} °C</div></div>
      <div class="card"><div class="lab">Pressione</div><div class="val">${nf(m.pressure, 0)}<small>hPa</small></div><div class="sub">${tTxt}${trend != null ? ` (${trend > 0 ? '+' : ''}${nf(trend)} in 3 h)` : ''}</div></div>
      <div class="card"><div class="lab">Pioggia oggi</div><div class="val">${nf(m.precipTotal)}<small>mm</small></div><div class="sub">Intensità ${nf(m.precipRate)} mm/h</div></div>
    </div>
  </div>

  <h2>Prossimi giorni <a href="#previsioni" class="more">dettaglio →</a></h2>
  <div id="fcStrip"><p class="note">Caricamento previsioni…</p></div>

  <h2>Ultime 24 ore</h2>
  <div class="grid two">
    ${chartBox('c-t', 'Temperatura', [[css('--c-orange'), 'Temperatura'], [css('--c-aqua'), 'Punto di rugiada']])}
    ${chartBox('c-w', 'Vento', [[css('--c-blue'), 'Medio'], [css('--c-orange'), 'Raffica']])}
    ${chartBox('c-p', 'Pressione', null)}
    ${chartBox('c-h', 'Umidità', null)}
  </div>

  <h2>In questo giorno (${fDate(today).replace(/ \d{4}$/, '')})</h2>
  ${sameDayTable(days, today)}

  <h2>Record assoluti dall'inizio dei dati</h2>
  <div class="grid cards">
    ${recCard('Temperatura max', rec.tmax, '°C')}${recCard('Temperatura min', rec.tmin, '°C')}
    ${recCard('Raffica max', rec.gust, 'km/h', 0)}${recCard('Pioggia in un giorno', rec.rain, 'mm')}
  </div>
  <p class="note"><a href="#record">Tutti i record →</a></p>`;

  loadForecast().then(f => { const el = $('#fcStrip'); if (el) el.innerHTML = forecastCards(f, true); }).catch(() => { const el = $('#fcStrip'); if (el) el.innerHTML = '<p class="note">Previsioni non disponibili al momento.</p>'; });
  if (obs.length) {
    const x = obs.map(r => r.epoch);
    const fx = t => timeFmt.format(new Date(t * 1000));
    const xv = (u, v) => v.map(t => timeFmt.format(new Date(t * 1000)));
    const base = { x, time: true, fmtX: t => new Intl.DateTimeFormat('it-IT', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(new Date(t * 1000)), height: 210, xValues: xv };
    mkChart($('#c-t'), { ...base, unit: '°C', series: [{ label: 'Temperatura', color: css('--c-orange'), values: obs.map(r => r.metric.tempAvg) }, { label: 'Rugiada', color: css('--c-aqua'), values: obs.map(r => r.metric.dewptAvg), width: 1.5 }] });
    mkChart($('#c-w'), { ...base, unit: 'km/h', series: [{ label: 'Medio', color: css('--c-blue'), values: obs.map(r => r.metric.windspeedAvg) }, { label: 'Raffica', color: css('--c-orange'), values: obs.map(r => r.metric.windgustHigh), width: 1.2 }] });
    mkChart($('#c-p'), { ...base, unit: 'hPa', series: [{ label: 'Pressione', color: css('--c-violet'), values: obs.map(r => r.metric.pressureMax) }] });
    mkChart($('#c-h'), { ...base, unit: '%', dec: 0, yRange: [0, 100], series: [{ label: 'Umidità', color: css('--c-aqua'), values: obs.map(r => r.humidityAvg) }] });
  }
}

function compass(deg) {
  const r = deg == null ? 0 : (deg + 180) % 360; // la freccia indica dove va il vento
  return `<svg width="64" height="64" viewBox="-32 -32 64 64" role="img" aria-label="Direzione vento da ${dirName(deg)}">
    <circle r="29" fill="none" stroke="var(--line)" stroke-width="2"/>
    <g fill="var(--muted)" font-size="8" text-anchor="middle"><text y="-20">N</text><text x="22" y="3">E</text><text y="26">S</text><text x="-22" y="3">O</text></g>
    <g transform="rotate(${r})"><path d="M0 -17 L6 8 L0 4 L-6 8Z" fill="var(--c-blue)"/></g></svg>`;
}

function sameDayTable(days, today) {
  const md = today.slice(5);
  const rows = days.filter(d => d.d.slice(5) === md && d.d < today).sort((a, b) => b.d.localeCompare(a.d));
  if (!rows.length) return '<p class="note">Nessun anno precedente disponibile.</p>';
  return `<div class="tablewrap stack">${tbl(['Anno', 'Min', 'Max', 'Media', 'Raffica', 'Pioggia'],
    rows.map(d => ({ day: d.d, cells: [d.d.slice(0, 4), nf(d.tmin) + '°', nf(d.tmax) + '°', nf(d.tavg) + '°', nf(d.gust, 0) + ' km/h', nf(d.rain) + ' mm'] })), 5)}</div>`;
}

/* ---------- record ---------- */
const okDay = d => d.n >= MIN_HOURS;
function pick(days, key, dir) {
  let best = null;
  for (const d of days) { const v = d[key]; if (v == null) continue; if (!best || (dir > 0 ? v > best[key] : v < best[key])) best = d; }
  return best && { v: best[key], d: best.d, h: best[key + 'H'] };
}
function recordsFor(days) {
  return {
    tmax: pick(days, 'tmax', 1), tmin: pick(days, 'tmin', -1),
    gust: pick(days, 'gust', 1), wmax: pick(days, 'wmax', 1),
    rain: pick(days.filter(okDay), 'rain', 1), rainRate: pick(days, 'rainRate', 1),
    pmax: pick(days, 'pmax', 1), pmin: pick(days, 'pmin', -1),
    hmin: pick(days, 'hmin', -1), dpmax: pick(days, 'dpmax', 1),
    tmaxLow: pick(days.filter(okDay), 'tmax', -1), tminHigh: pick(days.filter(okDay), 'tmin', 1),
  };
}
function recCard(label, r, unit, dec = 1) {
  if (!r) return `<div class="card rec"><div class="lab">${label}</div><div class="val">–</div></div>`;
  return `<div class="card rec link" data-day="${r.d}" style="cursor:pointer"><div class="lab">${label}</div><div class="val">${nf(r.v, dec)}<small>${unit}</small></div><div class="when">${fDate(r.d)}${r.h != null ? ` · ore ${pad2(r.h)}` : ''}</div></div>`;
}
function topList(days, key, dir, unit, dec = 1, n = 10, filter = okDay) {
  const rows = days.filter(d => d[key] != null && (key === 'rain' ? okDay(d) : filter(d))).sort((a, b) => dir * (b[key] - a[key])).slice(0, n);
  return rows.map((d, i) => `<div class="rank link" data-day="${d.d}" style="cursor:pointer"><span>${i + 1}</span><span>${fDate(d.d)}</span><b>${nf(d[key], dec)} ${unit}</b></div>`).join('');
}
function streak(days, pred) {
  let best = { len: 0 }, cur = null, prev = null;
  for (const d of days) {
    const contiguous = prev && addDays(prev, 1) === d.d;
    if (pred(d)) { cur = contiguous && cur ? { ...cur, len: cur.len + 1, end: d.d } : { len: 1, start: d.d, end: d.d }; if (cur.len > best.len) best = cur; }
    else cur = null;
    prev = d.d;
  }
  return best.len ? `${best.len} ${best.len === 1 ? 'giorno' : 'giorni'} <span class="muted">(${fDate(best.start)} → ${fDate(best.end)})</span>` : '–';
}

async function viewRecord() {
  const days = await loadDaily();
  const r = recordsFor(days);
  const monthly = Array.from({ length: 12 }, (_, i) => {
    const ds = days.filter(d => +d.d.slice(5, 7) === i + 1);
    return { m: i, hi: pick(ds, 'tmax', 1), lo: pick(ds, 'tmin', -1), g: pick(ds, 'gust', 1), rain: pick(ds.filter(okDay), 'rain', 1) };
  });
  const monthTotals = rainMonthly(days);
  const topMonth = [...monthTotals].filter(m => m.full).sort((a, b) => b.rain - a.rain)[0];
  view.innerHTML = `
  <p class="note">I record valgono dall'inizio dell'archivio (${fDate(days[0].d)}). Clic su un record per aprire il dettaglio del giorno. I valori orari sono massimi/minimi registrati dentro ogni ora.</p>
  <h2>Temperatura</h2>
  <div class="grid cards">${recCard('Massima assoluta', r.tmax, '°C')}${recCard('Minima assoluta', r.tmin, '°C')}${recCard('Giorno più freddo (max più bassa)', r.tmaxLow, '°C')}${recCard('Notte più calda (min più alta)', r.tminHigh, '°C')}</div>
  <h2>Vento, pioggia, pressione</h2>
  <div class="grid cards">${recCard('Raffica massima', r.gust, 'km/h', 0)}${recCard('Vento medio orario max', r.wmax, 'km/h', 0)}${recCard('Pioggia in un giorno', r.rain, 'mm')}${recCard('Intensità pioggia max', r.rainRate, 'mm/h')}${recCard('Pressione massima', r.pmax, 'hPa')}${recCard('Pressione minima', r.pmin, 'hPa')}${recCard('Umidità minima', r.hmin, '%', 0)}
    <div class="card rec"><div class="lab">Mese più piovoso</div><div class="val">${topMonth ? nf(topMonth.rain, 0) : '–'}<small>mm</small></div><div class="when">${topMonth ? cap(MESI[+topMonth.k.slice(5) - 1]) + ' ' + topMonth.k.slice(0, 4) : ''}</div></div></div>

  <h2>Classifiche</h2>
  <div class="grid two">
    <div class="card"><h3>10 giorni più caldi (max)</h3>${topList(days, 'tmax', 1, '°C')}</div>
    <div class="card"><h3>10 giorni più freddi (min)</h3>${topList(days, 'tmin', -1, '°C')}</div>
    <div class="card"><h3>10 raffiche più forti</h3>${topList(days, 'gust', 1, 'km/h', 0)}</div>
    <div class="card"><h3>10 giorni più piovosi</h3>${topList(days, 'rain', 1, 'mm')}</div>
  </div>

  <h2>Serie consecutive</h2>
  <div class="grid two"><div class="card"><table><tbody>
    <tr><td>Giorni con max ≥ 30 °C</td><td>${streak(days, d => d.tmax >= 30)}</td></tr>
    <tr><td>Giorni con max ≥ 25 °C (estivi)</td><td>${streak(days, d => d.tmax >= 25)}</td></tr>
    <tr><td>Giorni con min &lt; 0 °C (gelo)</td><td>${streak(days, d => d.tmin < 0)}</td></tr>
    <tr><td>Giorni con max &lt; 0 °C (ghiaccio)</td><td>${streak(days, d => d.tmax < 0)}</td></tr>
    <tr><td>Giorni senza pioggia (&lt; 0,2 mm)</td><td>${streak(days.filter(okDay), d => (d.rain ?? 0) < 0.2)}</td></tr>
    <tr><td>Giorni con pioggia (≥ 1 mm)</td><td>${streak(days.filter(okDay), d => (d.rain ?? 0) >= 1)}</td></tr>
  </tbody></table></div>
  <div class="card"><h3>Conteggi (tutto l'archivio)</h3><table><tbody>
    <tr><td>Giorni con gelo (min &lt; 0)</td><td>${days.filter(d => d.tmin < 0).length}</td></tr>
    <tr><td>Giorni estivi (max ≥ 25)</td><td>${days.filter(d => d.tmax >= 25).length}</td></tr>
    <tr><td>Giorni tropicali (max ≥ 30)</td><td>${days.filter(d => d.tmax >= 30).length}</td></tr>
    <tr><td>Giorni con raffica ≥ 50 km/h</td><td>${days.filter(d => d.gust >= 50).length}</td></tr>
    <tr><td>Giorni di pioggia (≥ 1 mm)</td><td>${days.filter(d => d.rain >= 1).length}</td></tr>
  </tbody></table></div></div>

  <h2>Record per mese</h2>
  <div class="tablewrap stack">${tbl(['Mese', 'Max', 'Min', 'Raffica', 'Pioggia/giorno'],
    monthly.map(m => ({ cells: [cap(MESI[m.m]), ...[['hi', '°C', 1], ['lo', '°C', 1], ['g', 'km/h', 0], ['rain', 'mm', 1]].map(([k, u, dc]) => {
      const x = m[k]; return x ? `<span class="rec-cell" data-day="${x.d}">${nf(x.v, dc)} ${u}<small class="muted">${x.d.slice(8)}/${x.d.slice(5, 7)}/${x.d.slice(2, 4)}</small></span>` : '–';
    })] })), 2)}</div>`;
}

/* ---------- aggregazioni mensili ---------- */
function rainMonthly(days) {
  const map = new Map();
  for (const d of days) {
    const k = d.d.slice(0, 7);
    if (!map.has(k)) map.set(k, { k, ds: [] });
    map.get(k).ds.push(d);
  }
  return [...map.values()].map(({ k, ds }) => {
    const [y, mo] = k.split('-').map(Number);
    const dim = new Date(y, mo, 0).getDate();
    const good = ds.filter(okDay);
    const avg = a => { const v = a.filter(x => x != null); return v.length ? v.reduce((p, c) => p + c, 0) / v.length : null; };
    return {
      k, y, mo, dim, n: good.length, full: good.length === dim,
      tavg: avg(good.map(d => d.tavg)), tmax: Math.max(...ds.map(d => d.tmax ?? -99)), tmin: Math.min(...ds.map(d => d.tmin ?? 99)),
      rain: good.reduce((s, d) => s + (d.rain ?? 0), 0), rainDays: good.filter(d => d.rain >= 1).length,
      gust: Math.max(...ds.map(d => d.gust ?? 0)),
    };
  });
}

/* ---------- vista: MESI E ANNI ---------- */
async function viewAnni() {
  const days = await loadDaily();
  const months = rainMonthly(days);
  const years = [...new Set(months.map(m => m.y))].filter(y => days.filter(d => d.d.startsWith(y)).length >= 60); // niente anni con pochi giorni
  const palette = [css('--c-blue'), css('--c-orange'), css('--c-aqua'), css('--c-yellow'), css('--c-magenta'), css('--c-violet')];
  const colorOf = y => palette[years.indexOf(y) % palette.length];
  view.innerHTML = `
  <p class="note">Confronto tra anni. Gli anni incompleti (inizio archivio e anno in corso) hanno linee più corte.</p>
  <div class="grid two">
    ${chartBox('a-t', 'Temperatura media mensile', years.map(y => [colorOf(y), y]))}
    ${chartBox('a-r', 'Pioggia cumulata nell\'anno', years.map(y => [colorOf(y), y]))}
  </div>
  <h2>Riepilogo mensile</h2>
  <div class="bar"><label>Anno <select id="yearSel"><option value="all">Tutti</option>${[...new Set(months.map(m => m.y))].map(y => `<option>${y}</option>`).join('')}</select></label>
  <button class="btn" id="csvM">Scarica CSV</button></div>
  <div class="tablewrap stack" id="mtab"></div>
  <p class="note">* mese incompleto (mancano dati): pioggia e medie sono parziali.</p>`;

  mkChart($('#a-t'), {
    x: Array.from({ length: 12 }, (_, i) => i + 1), height: 260, unit: '°C', fmtX: m => cap(MESI[Math.round(m) - 1] ?? ''), xValues: (u, v) => v.map(m => Number.isInteger(m) && MESI[m - 1] ? cap(MESI[m - 1]).slice(0, 3) : ''),
    series: years.map(y => ({ label: String(y), color: colorOf(y), values: Array.from({ length: 12 }, (_, i) => { const m = months.find(x => x.y === y && x.mo === i + 1); return m && m.n >= 15 ? m.tavg : null; }) })),
  });
  const doy = iso => Math.floor((Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8)) - Date.UTC(+iso.slice(0, 4), 0, 0)) / 864e5);
  const x = Array.from({ length: 366 }, (_, i) => i + 1);
  mkChart($('#a-r'), {
    x, height: 260, unit: 'mm', fmtX: n => { const d = new Date(Date.UTC(2024, 0, n)); return `${d.getUTCDate()} ${MESI[d.getUTCMonth()]}`; },
    xValues: (u, v) => v.map(n => { const d = new Date(Date.UTC(2024, 0, n)); return MESI[d.getUTCMonth()].slice(0, 3) + (d.getUTCDate() === 1 ? '' : ''); }),
    series: years.map(y => {
      const vals = new Array(366).fill(null); let acc = 0; const ds = days.filter(d => d.d.startsWith(y));
      let last = 0;
      for (const d of ds) { const i = doy(d.d); acc += d.rain ?? 0; vals[i - 1] = acc; last = i; }
      // riempie i buchi con il valore precedente (giorni mancanti) senza estendere oltre l'ultimo dato
      let prev = null; for (let i = 0; i < last; i++) { if (vals[i] == null) vals[i] = prev; else prev = vals[i]; }
      return { label: String(y), color: colorOf(y), values: vals };
    }),
  });

  const draw = () => {
    const y = $('#yearSel').value;
    const rows = months.filter(m => y === 'all' || String(m.y) === y).reverse();
    $('#mtab').innerHTML = tbl(['Mese', 'T media', 'T max', 'T min', 'Pioggia', 'Giorni pioggia', 'Raffica max'],
      rows.map(m => ({ cells: [`${cap(MESI[m.mo - 1])} ${m.y}${m.full ? '' : ' *'}`, nf(m.tavg) + '°', nf(m.tmax) + '°', nf(m.tmin) + '°', nf(m.rain) + ' mm', m.rainDays, nf(m.gust, 0) + ' km/h'] })), 3);
  };
  $('#yearSel').onchange = draw; draw();
  $('#csvM').onclick = () => download('riepilogo-mensile.csv', toCsv(['mese', 'tmedia', 'tmax', 'tmin', 'pioggia_mm', 'giorni_pioggia', 'raffica_max', 'completo'],
    months.map(m => [m.k, m.tavg?.toFixed(1), m.tmax, m.tmin, m.rain.toFixed(1), m.rainDays, m.gust, m.full])));
}

/* ---------- vista: PREVISIONI ---------- */
async function viewPrevisioni() {
  view.innerHTML = '<p class="muted pad">Caricamento previsioni…</p>';
  let f;
  try { f = await loadForecast(); } catch { view.innerHTML = '<p class="pad">Previsioni non disponibili al momento. Riprova tra qualche minuto.</p>'; return; }
  view.innerHTML = `
  <h2 style="margin-top:0">Prossimi 5 giorni a Ponderano</h2>
  ${forecastCards(f, false)}
  <div class="grid two" style="margin-top:12px">
    ${chartBox('f-t', 'Temperatura', [[css('--c-orange'), 'Temperatura'], [css('--c-violet'), 'Percepita']])}
    ${chartBox('f-r', 'Precipitazioni (mm/ora)', null)}
    ${chartBox('f-w', 'Vento', [[css('--c-blue'), 'Medio'], [css('--c-orange'), 'Raffica']])}
    ${chartBox('f-p', 'Pressione al livello del mare', null)}
  </div>
  <p class="note">Modello meteorologico per le coordinate della stazione (45,531 N, 8,052 E, 352 m). Previsioni: <a href="https://open-meteo.com/">Open-Meteo.com</a> (CC BY 4.0). Sono stime di un modello, non misure della tua stazione.</p>`;
  const h = f.hourly, off = f.utc_offset_seconds ?? 0;
  const x = h.time.map(t => Date.parse(t + ':00Z') / 1000 - off);
  const fmtX = t => new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' }).format(new Date(t * 1000));
  const xValues = (u, v) => v.map(t => new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', timeZone: 'Europe/Rome' }).format(new Date(t * 1000)));
  const base = { x, time: true, fmtX, xValues, height: 210 };
  mkChart($('#f-t'), { ...base, unit: '°C', series: [{ label: 'Temperatura', color: css('--c-orange'), values: h.temperature_2m }, { label: 'Percepita', color: css('--c-violet'), values: h.apparent_temperature, width: 1.2 }] });
  mkChart($('#f-r'), { ...base, unit: 'mm', dec: 1, axisDec: 1, yRange: (u, mn, mx) => [0, Math.max(1, mx)], series: [{ label: 'Precipitazioni', color: css('--c-blue'), values: h.precipitation, bars: true, width: 1 }] });
  mkChart($('#f-w'), { ...base, unit: 'km/h', dec: 0, series: [{ label: 'Medio', color: css('--c-blue'), values: h.wind_speed_10m }, { label: 'Raffica', color: css('--c-orange'), values: h.wind_gusts_10m, width: 1.2 }] });
  mkChart($('#f-p'), { ...base, unit: 'hPa', dec: 0, series: [{ label: 'Pressione', color: css('--c-violet'), values: h.pressure_msl }] });
}

/* ---------- vista: STORICO ---------- */
const METRICS = {
  temp: { label: 'Temperatura', unit: '°C', dec: 1, series: [['tmax', 'Max', '--c-orange'], ['tavg', 'Media', '--ink2'], ['tmin', 'Min', '--c-blue']] },
  vento: { label: 'Vento', unit: 'km/h', dec: 0, series: [['gust', 'Raffica max', '--c-orange'], ['wmax', 'Vento medio orario max', '--c-blue'], ['wavg', 'Media', '--ink2']] },
  press: { label: 'Pressione', unit: 'hPa', dec: 0, series: [['pmax', 'Max', '--c-violet'], ['pmin', 'Min', '--c-blue']] },
  um: { label: 'Umidità', unit: '%', dec: 0, series: [['hmax', 'Max', '--c-aqua'], ['havg', 'Media', '--ink2'], ['hmin', 'Min', '--c-yellow']], yRange: [0, 100] },
  pioggia: { label: 'Pioggia', unit: 'mm', dec: 1, series: [['rain', 'Pioggia giornaliera', '--c-blue']], bars: true },
};
const hist = { metric: 'temp', range: '90', from: null, to: null, day: null, sortKey: 'd', sortAsc: false, limit: 100 };
const SORTS = [['d', 'Data'], ['tmin', 'Min'], ['tmax', 'Max'], ['tavg', 'Media'], ['wmax', 'Vento max'], ['gust', 'Raffica'], ['rain', 'Pioggia'], ['pmax', 'Pressione max'], ['pmin', 'Pressione min'], ['havg', 'Umidità']];

async function viewStorico() {
  const days = await loadDaily();
  const last = days[days.length - 1].d;
  view.innerHTML = `
  <div class="bar">
    <div class="seg" id="mSeg">${Object.entries(METRICS).map(([k, v]) => `<button data-k="${k}" class="${hist.metric === k ? 'on' : ''}">${v.label}</button>`).join('')}</div>
    <div class="seg" id="rSeg">${[['30', '30 g'], ['90', '90 g'], ['365', '1 anno'], ['all', 'Tutto']].map(([k, t]) => `<button data-k="${k}" class="${hist.range === k ? 'on' : ''}">${t}</button>`).join('')}</div>
    <label class="muted">dal <input type="date" id="dFrom"></label><label class="muted">al <input type="date" id="dTo"></label>
    <button class="btn" id="csvD">CSV</button>
  </div>
  <div class="card"><div id="hLeg"></div><div class="chart" id="hChart"></div>
    <p class="note">Trascina per zoomare, doppio clic per tornare all'intero periodo, clic su un punto per aprire il dettaglio orario di quel giorno.</p></div>
  <div class="daypanel" id="dayPanel"></div>
  <h2>Dati giornalieri</h2>
  <div class="bar"><label class="muted">Ordina per <select id="sortSel">${SORTS.map(([k, l]) => `<option value="${k}"${hist.sortKey === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <button class="btn" id="sortDir" title="Inverti ordine"></button><span class="muted" id="rowCount"></span></div>
  <div class="tablewrap stack" id="hTab"></div>
  <div class="bar" style="justify-content:center;margin-top:12px"><button class="btn" id="moreRows" hidden>Mostra altri giorni</button></div>`;

  const first = days[0].d;
  const dFrom = $('#dFrom'), dTo = $('#dTo');
  dFrom.min = dTo.min = first; dFrom.max = dTo.max = last;
  let rows = [];
  const drawTable = () => {
    const k = hist.sortKey, dir = hist.sortAsc ? 1 : -1;
    const sorted = [...rows].sort((a, b) => k === 'd' ? dir * a.d.localeCompare(b.d) : (a[k] == null) - (b[k] == null) || dir * (a[k] - b[k]));
    const shown = sorted.slice(0, hist.limit);
    $('#hTab').innerHTML = tbl(['Data', 'Min', 'Max', 'Media', 'Vento max', 'Raffica', 'Pioggia', 'Pressione', 'Umidità'],
      shown.map(d => ({ day: d.d, cells: [fDate(d.d) + (okDay(d) ? '' : ' *'), nf(d.tmin) + '°', nf(d.tmax) + '°', nf(d.tavg) + '°', nf(d.wmax, 0) + ' km/h', nf(d.gust, 0) + ' km/h', nf(d.rain) + ' mm', `${nf(d.pmin, 0)}–${nf(d.pmax, 0)}`, nf(d.havg, 0) + '%'] })), 4);
    $('#rowCount').textContent = `${shown.length} di ${sorted.length} giorni`;
    $('#sortDir').textContent = hist.sortAsc ? '↑ Crescente' : '↓ Decrescente';
    $('#moreRows').hidden = shown.length >= sorted.length;
  };
  $('#sortSel').onchange = e => { hist.sortKey = e.target.value; hist.limit = 100; drawTable(); };
  $('#sortDir').onclick = () => { hist.sortAsc = !hist.sortAsc; hist.limit = 100; drawTable(); };
  $('#moreRows').onclick = () => { hist.limit += 200; drawTable(); };
  const apply = () => {
    let from, to = last;
    if (hist.from || hist.to) { from = hist.from ?? first; to = hist.to ?? last; }
    else from = hist.range === 'all' ? first : addDays(last, -(+hist.range - 1));
    dFrom.value = from; dTo.value = to;
    rows = days.filter(d => d.d >= from && d.d <= to);
    hist.limit = 100;
    draw();
  };
  const draw = () => {
    live.forEach(c => c.destroy()); live = [];
    const m = METRICS[hist.metric];
    $('#hLeg').innerHTML = legend(m.series.map(([, l, c]) => [css(c), l]));
    $('#hChart').innerHTML = '';
    if (!rows.length) { $('#hChart').innerHTML = '<p class="muted pad">Nessun dato nel periodo.</p>'; return; }
    mkChart($('#hChart'), {
      x: rows.map(d => ts(d.d)), time: true, height: 330, unit: m.unit, dec: m.dec, yRange: m.yRange,
      fmtX: t => dFmtLong.format(new Date(t * 1000)), xValues: (u, v) => { const long = (v.at(-1) - v[0]) > 400 * 86400; return v.map(t => new Intl.DateTimeFormat('it-IT', long ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' }).format(new Date(t * 1000))); },
      onClick: i => openDay(rows[i].d),
      series: m.series.map(([k, l, c]) => ({ label: l, color: css(c), values: rows.map(d => d[k]), width: m.bars ? 1 : (k === 'tavg' || k === 'wavg' || k === 'havg' ? 1.5 : 2), bars: m.bars })),
    });
    drawTable();
  };
  $('#mSeg').onclick = e => { const k = e.target.dataset.k; if (!k) return; hist.metric = k; [...$('#mSeg').children].forEach(b => b.classList.toggle('on', b.dataset.k === k)); draw(); };
  $('#rSeg').onclick = e => { const k = e.target.dataset.k; if (!k) return; hist.range = k; hist.from = hist.to = null; [...$('#rSeg').children].forEach(b => b.classList.toggle('on', b.dataset.k === k)); apply(); };
  dFrom.onchange = dTo.onchange = () => { hist.from = dFrom.value || null; hist.to = dTo.value || null; [...$('#rSeg').children].forEach(b => b.classList.remove('on')); apply(); };
  $('#csvD').onclick = () => download(`meteo-${rows[0]?.d}_${rows.at(-1)?.d}.csv`, toCsv(Object.keys(rows[0] ?? {}), rows.map(d => Object.values(d))));
  apply();
  if (hist.day) openDay(hist.day, false);
}

async function openDay(date, scroll = true) {
  hist.day = date;
  if (location.hash !== '#storico') { location.hash = '#storico'; return; }
  const panel = $('#dayPanel');
  if (!panel) return;
  const obs = await loadHourly(date);
  const d = store.byDate.get(date);
  panel.innerHTML = `<div class="card"><div class="bar"><h3 style="margin:0;margin-right:auto">${cap(dFmtLong.format(toDate(date)))}</h3>
    <button class="btn" id="dPrev">←</button><input type="date" id="dPick" value="${date}" min="${store.days[0].d}" max="${store.days.at(-1).d}"><button class="btn" id="dNext">→</button><button class="btn" id="dClose">Chiudi</button></div>
    ${d ? `<div class="legend"><span>Min <b>${nf(d.tmin)}°</b>${d.tminH != null ? ' ore ' + pad2(d.tminH) : ''}</span><span>Max <b>${nf(d.tmax)}°</b>${d.tmaxH != null ? ' ore ' + pad2(d.tmaxH) : ''}</span><span>Raffica <b>${nf(d.gust, 0)} km/h</b>${d.gustH != null ? ' ore ' + pad2(d.gustH) : ''}</span><span>Pioggia <b>${nf(d.rain)} mm</b></span><span>Pressione <b>${nf(d.pmin, 0)}–${nf(d.pmax, 0)} hPa</b></span><span>Vento prevalente da <b>${dirName(d.wdom)}</b></span></div>` : ''}
    ${obs.length ? `<div class="grid two" style="margin-top:8px">${['dt', 'dw', 'dp', 'dr'].map(id => `<div><div class="chart" id="${id}"></div></div>`).join('')}</div>` : '<p class="muted">Nessun dato orario per questo giorno.</p>'}</div>`;
  $('#dClose').onclick = () => { hist.day = null; panel.innerHTML = ''; };
  const go = n => openDay(addDays(date, n));
  $('#dPrev').onclick = () => go(-1); $('#dNext').onclick = () => go(1);
  $('#dPick').onchange = e => e.target.value && openDay(e.target.value);
  if (obs.length) {
    const x = obs.map(o => o.t);
    const base = { x, time: true, height: 190, fmtX: t => timeFmt.format(new Date(t * 1000)), xValues: (u, v) => v.map(t => timeFmt.format(new Date(t * 1000))) };
    mkChart($('#dt'), { ...base, unit: '°C', series: [{ label: 'Max', color: css('--c-orange'), values: obs.map(o => o.th) }, { label: 'Media', color: css('--ink2'), values: obs.map(o => o.ta), width: 1.2 }, { label: 'Min', color: css('--c-blue'), values: obs.map(o => o.tl) }] });
    mkChart($('#dw'), { ...base, unit: 'km/h', dec: 0, series: [{ label: 'Raffica', color: css('--c-orange'), values: obs.map(o => o.g) }, { label: 'Vento medio', color: css('--c-blue'), values: obs.map(o => o.w) }] });
    mkChart($('#dp'), { ...base, unit: 'hPa', series: [{ label: 'Pressione', color: css('--c-violet'), values: obs.map(o => o.pa) }] });
    mkChart($('#dr'), { ...base, unit: 'mm', series: [{ label: 'Pioggia cumulata', color: css('--c-blue'), values: obs.map(o => o.r), fill: true }] });
  }
  if (scroll) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- utilità CSV ---------- */
const toCsv = (head, rows) => [head, ...rows].map(r => r.map(v => v == null ? '' : String(v)).join(';')).join('\n');
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- router ---------- */
const VIEWS = { ora: viewOra, previsioni: viewPrevisioni, storico: viewStorico, record: viewRecord, anni: viewAnni };
async function route() {
  const tab = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'ora';
  document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
  live.forEach(c => c.destroy()); live = []; tip.hidden = true;
  try { await VIEWS[tab](); }
  catch (e) { console.error(e); view.innerHTML = `<p class="pad">Errore nel caricamento dei dati: ${e.message}</p>`; }
}
addEventListener('hashchange', route);
document.addEventListener('click', e => {
  const t = e.target.closest('[data-day]');
  if (t) openDay(t.dataset.day);
});
if (!location.hash) history.replaceState(null, '', '#ora');
route();
setInterval(() => { if (location.hash === '#ora' || !location.hash) route(); }, 5 * 60 * 1000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

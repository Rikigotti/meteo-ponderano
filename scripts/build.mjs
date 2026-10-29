// Assembla _site/: app statica + dati + snapshot live (current, ultime 24h).
// Uso: [WU_API_KEY=...] node scripts/build.mjs
import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'live'), { recursive: true });
cpSync(join(ROOT, 'web'), OUT, { recursive: true });
if (existsSync(join(ROOT, 'data'))) cpSync(join(ROOT, 'data'), join(OUT, 'data'), { recursive: true });

const KEY = process.env.WU_API_KEY;
if (KEY) {
  const q = `stationId=IPONDE1&format=json&units=m&numericPrecision=decimal&apiKey=${KEY}`;
  for (const [file, path] of [['current', 'observations/current'], ['last24h', 'observations/all/1day']]) {
    try {
      const r = await fetch(`https://api.weather.com/v2/pws/${path}?${q}`);
      if (r.ok) writeFileSync(join(OUT, 'live', `${file}.json`), await r.text());
      else console.warn(file, 'HTTP', r.status);
    } catch (e) { console.warn(file, e.message); }
  }
} else console.warn('WU_API_KEY assente: nessun dato live');
console.log('build ok ->', OUT);

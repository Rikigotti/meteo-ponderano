// Proxy minimale verso l'API PWS di Weather Underground: la chiave resta lato server.
const STATION = 'IPONDE1';

export async function proxy(res, path) {
  const key = process.env.WU_API_KEY;
  if (!key) return res.status(500).json({ error: 'WU_API_KEY non configurata' });
  try {
    const url = `https://api.weather.com/v2/pws/${path}?stationId=${STATION}&format=json&units=m&numericPrecision=decimal&apiKey=${key}`;
    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: `Weather Underground ha risposto ${r.status}` });
    // cache di bordo: al massimo una chiamata a WU ogni 5 minuti, qualunque sia il traffico
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).send(await r.text());
  } catch (e) {
    return res.status(502).json({ error: 'Weather Underground non raggiungibile' });
  }
}

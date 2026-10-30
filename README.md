# Meteo Ponderano

Web app per la stazione meteo **IPONDE1** (Ponderano, BI): dati live, storico completo, record.

## Come funziona
- `scripts/sync.mjs` scarica da Weather Underground lo storico orario (1 chiamata al giorno) in `data/hourly/YYYY-MM.json` e rigenera `data/daily.json`.
- `scripts/build.mjs` assembla `_site/` (app + dati + snapshot live).
- `.github/workflows/update.yml` gira ogni 15 minuti: sincronizza, committa i nuovi dati e pubblica su GitHub Pages.
- La chiave API **non** è nel codice: sta nel secret `WU_API_KEY` del repository.

## Setup
1. Repo → Settings → Secrets and variables → Actions → New secret: `WU_API_KEY`.
2. Settings → Pages → Source: **GitHub Actions**.
3. Actions → "Aggiorna e pubblica" → Run workflow.

## Sviluppo locale
```
WU_API_KEY=... node scripts/sync.mjs     # backfill/aggiornamento storico
WU_API_KEY=... node scripts/build.mjs    # genera _site/
npx serve _site
```

## Vercel (dato live)
Il sito si può pubblicare anche su Vercel: `vercel.json` esegue `node scripts/build.mjs` e serve `_site/`.
Le funzioni `api/current` e `api/last24h` leggono Weather Underground con la variabile d'ambiente `WU_API_KEY`
(impostala in Vercel → Settings → Environment Variables) con cache di 5 minuti. Su GitHub Pages, dove `/api` non esiste,
la scheda Ora ripiega sugli snapshot `live/*.json`.

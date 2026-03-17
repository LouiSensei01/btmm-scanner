const ALL_SYMBOLS = [
  'EUR/USD','GBP/USD','AUD/USD','NZD/USD','USD/JPY','USD/CAD','USD/CHF',
  'EUR/JPY','GBP/JPY','AUD/JPY','NZD/JPY','CAD/JPY','CHF/JPY',
  'EUR/GBP','EUR/AUD','EUR/NZD','EUR/CAD','EUR/CHF',
  'GBP/AUD','GBP/NZD','GBP/CAD','GBP/CHF',
  'AUD/NZD','AUD/CAD','AUD/CHF','NZD/CAD','NZD/CHF','CAD/CHF',
  'XAU/USD','XAG/USD'
];

const toKey = (s) => s.replace('/','');

let cache = null;
let cacheTime = 0;
const CACHE_MS = 15 * 60 * 1000;

async function batchFetch(symbols, interval, outputsize, apiKey) {
  const sym = symbols.join(',');
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(sym)}&interval=${interval}&outputsize=${outputsize}&apikey=${apiKey}&format=JSON`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`TwelveData HTTP ${r.status}`);
  const json = await r.json();
  if (json.code) throw new Error(`TwelveData: ${json.message}`);
  return json;
}

function getValues(data, sym) {
  if (data[sym]) return data[sym].values || [];
  if (data.values) return data.values;
  return [];
}

function fv(v) { return v !== undefined && v !== null ? parseFloat(v) : null; }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate');

  if (cache && Date.now() - cacheTime < CACHE_MS) {
    return res.json({ ok: true, data: cache, cached: true, updatedAt: new Date(cacheTime).toISOString() });
  }

  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ ok: false, error: 'TWELVE_DATA_API_KEY not set in Vercel Environment Variables.' });
  }

  try {
    const [daily, weekly, monthly] = await Promise.all([
      batchFetch(ALL_SYMBOLS, '1day',   5, apiKey),
      batchFetch(ALL_SYMBOLS, '1week',  3, apiKey),
      batchFetch(ALL_SYMBOLS, '1month', 3, apiKey),
    ]);

    const result = {};
    for (const sym of ALL_SYMBOLS) {
      const key = toKey(sym);
      const d = getValues(daily, sym);
      const w = getValues(weekly, sym);
      const m = getValues(monthly, sym);
      result[key] = {
        price: fv(d[0]?.close),
        yh:    fv(d[1]?.high),
        yl:    fv(d[1]?.low),
        pdh:   fv(d[2]?.high),
        pdl:   fv(d[2]?.low),
        wh:    fv(w[1]?.high),
        wl:    fv(w[1]?.low),
        mh:    fv(m[1]?.high),
        ml:    fv(m[1]?.low),
      };
    }

    cache = result;
    cacheTime = Date.now();
    return res.json({ ok: true, data: result, cached: false, updatedAt: new Date().toISOString() });

  } catch (err) {
    if (cache) return res.json({ ok: true, data: cache, cached: true, stale: true, error: err.message, updatedAt: new Date(cacheTime).toISOString() });
    return res.status(500).json({ ok: false, error: err.message });
  }
      }

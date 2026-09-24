function getTDKeys() {
  const keys = [];
  for (let i = 1; i <= 10; i++) {
    const k = process.env[`TD_API_KEY_${i}`];
    if (k) keys.push(k);
  }
  if (!keys.length) throw new Error('Tidak ada TD_API_KEY_x di environment variables');
  return keys;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms)),
  ]);
}

// Coba semua key secara paralel, pakai response valid pertama yang datang.
async function fetchTDRace(path, params) {
  const keys = getTDKeys();
  const qs = new URLSearchParams({ ...params });
  const attempts = keys.map(async (key, idx) => {
    const url = `https://api.twelvedata.com/${path}?${qs.toString()}&apikey=${key}`;
    const res = await withTimeout(fetch(url), 9000, `TD key#${idx + 1} ${path}`);
    const json = await res.json();
    if (json.status === 'error' || json.code >= 400) {
      throw new Error(`TD key#${idx + 1} error: ${json.message || json.code}`);
    }
    return json;
  });
  return Promise.any(attempts);
}

// interval: 1min,5min,15min,30min,1h,4h,1day dst
async function getTimeSeries(symbol, interval, outputsize = 300) {
  const json = await fetchTDRace('time_series', { symbol, interval, outputsize, timezone: 'UTC' });
  if (!json.values) throw new Error(`TD kosong untuk ${symbol} ${interval}`);
  const candles = json.values
    .map(v => ({
      time: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
      volume: parseFloat(v.volume || 0),
    }))
    .reverse(); // TD returns newest first
  return candles;
}

async function getQuote(symbol) {
  return fetchTDRace('quote', { symbol });
}

module.exports = { getTimeSeries, getQuote, getTDKeys };

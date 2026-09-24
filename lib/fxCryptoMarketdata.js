function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms)),
  ]);
}

const TF_MAP = {
  binance: { '1min': '1m', '5min': '5m', '15min': '15m', '30min': '30m', '1h': '1h', '4h': '4h', '1day': '1d' },
  bybit: { '1min': '1', '5min': '5', '15min': '15', '30min': '30', '1h': '60', '4h': '240', '1day': 'D' },
  okx: { '1min': '1m', '5min': '5m', '15min': '15m', '30min': '30m', '1h': '1H', '4h': '4H', '1day': '1D' },
};

function toBinanceSymbol(sym) { return sym.replace('/', '').toUpperCase(); }
function toBybitSymbol(sym) { return sym.replace('/', '').toUpperCase(); }
function toOkxSymbol(sym) { return sym.replace('/', '-').toUpperCase() + (sym.includes('-') ? '' : ''); }

async function getBinanceCandles(symbol, interval, limit = 300) {
  const sym = toBinanceSymbol(symbol);
  const tf = TF_MAP.binance[interval] || '15m';
  const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${tf}&limit=${limit}`;
  const res = await withTimeout(fetch(url), 9000, 'binance klines');
  const raw = await res.json();
  if (!Array.isArray(raw)) throw new Error('Binance klines gagal: ' + JSON.stringify(raw));
  return raw.map(k => ({
    time: new Date(k[0]).toISOString(),
    open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

async function getBybitCandles(symbol, interval, limit = 300) {
  const sym = toBybitSymbol(symbol);
  const tf = TF_MAP.bybit[interval] || '15';
  const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${sym}&interval=${tf}&limit=${limit}`;
  const res = await withTimeout(fetch(url), 9000, 'bybit kline');
  const json = await res.json();
  const list = json?.result?.list;
  if (!Array.isArray(list)) throw new Error('Bybit kline gagal: ' + JSON.stringify(json));
  return list
    .map(k => ({
      time: new Date(parseInt(k[0])).toISOString(),
      open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }))
    .reverse();
}

async function getOkxCandles(symbol, interval, limit = 300) {
  const sym = symbol.includes('-') ? symbol.toUpperCase() : symbol.replace('/', '-').toUpperCase() + '-SWAP';
  const tf = TF_MAP.okx[interval] || '15m';
  const url = `https://www.okx.com/api/v5/market/candles?instId=${sym}&bar=${tf}&limit=${limit}`;
  const res = await withTimeout(fetch(url), 9000, 'okx candles');
  const json = await res.json();
  const list = json?.data;
  if (!Array.isArray(list)) throw new Error('OKX candles gagal: ' + JSON.stringify(json));
  return list
    .map(k => ({
      time: new Date(parseInt(k[0])).toISOString(),
      open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
    }))
    .reverse();
}

// Ambil candle dari Binance sebagai basis, Bybit + OKX untuk cross-check harga/funding (dealer flow style).
async function getCryptoComposite(symbol, interval) {
  const results = await Promise.allSettled([
    getBinanceCandles(symbol, interval),
    getBybitCandles(symbol, interval),
    getOkxCandles(symbol, interval),
  ]);
  const [binance, bybit, okx] = results;
  const sources = { binance: binance.status, bybit: bybit.status, okx: okx.status };

  // pakai exchange pertama yang sukses sebagai basis candle untuk indikator
  const primary = [binance, bybit, okx].find(r => r.status === 'fulfilled');
  if (!primary) throw new Error('Semua exchange gagal ambil candle: ' + JSON.stringify(sources));
  const candles = primary.value;

  const lastClose = ex => (ex.status === 'fulfilled' && ex.value.length ? ex.value[ex.value.length - 1].close : null);
  const priceCompare = {
    binance: lastClose(binance),
    bybit: lastClose(bybit),
    okx: lastClose(okx),
  };
  // spread antar exchange sebagai sinyal likuiditas/divergensi (dealer flow context)
  const validPrices = Object.values(priceCompare).filter(p => p != null);
  const spreadPct = validPrices.length > 1
    ? ((Math.max(...validPrices) - Math.min(...validPrices)) / Math.min(...validPrices)) * 100
    : 0;

  return { candles, priceCompare, spreadPct, sources };
}

module.exports = { getBinanceCandles, getBybitCandles, getOkxCandles, getCryptoComposite };

// Semua indikator dihitung murni (tanpa library luar), settingan sesuai screenshot MT4 user.

function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ema(values, period) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue;
    if (prev == null) {
      // seed EMA dengan SMA period pertama
      if (i >= period - 1) {
        const seedSlice = values.slice(i - period + 1, i + 1);
        prev = seedSlice.reduce((a, b) => a + b, 0) / period;
        out[i] = prev;
      }
    } else {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

// RSI period 14, apply Close, level 30/70
function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    if (i <= period) {
      gains += gain;
      losses += loss;
      if (i === period) {
        let avgGain = gains / period, avgLoss = losses / period;
        out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
        out._avgGain = avgGain;
        out._avgLoss = avgLoss;
      }
    } else {
      const avgGain = (out._avgGain * (period - 1) + gain) / period;
      const avgLoss = (out._avgLoss * (period - 1) + loss) / period;
      out._avgGain = avgGain;
      out._avgLoss = avgLoss;
      out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
  }
  return out;
}

// MACD EMA cepat 12 / EMA lambat 26 / signal SMA 9, apply Close
function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
  const emaFast = ema(closes, fast);
  const emaSlow = ema(closes, slow);
  const macdLine = closes.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null
  );
  const validMacd = macdLine.map(v => (v == null ? 0 : v));
  const signalRaw = sma(validMacd, signalPeriod);
  const signalLine = macdLine.map((v, i) => (v == null ? null : signalRaw[i]));
  const hist = macdLine.map((v, i) => (v != null && signalLine[i] != null ? v - signalLine[i] : null));
  return { macdLine, signalLine, hist };
}

// Bollinger Bands period 20, deviasi 2.0, apply Close
function bollingerBands(closes, period = 20, mult = 2.0) {
  const middle = sma(closes, period);
  const upper = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = middle[i];
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  }
  return { middle, upper, lower };
}

// ADX + DI period 14
function adx(highs, lows, closes, period = 14) {
  const len = closes.length;
  const tr = new Array(len).fill(0);
  const plusDM = new Array(len).fill(0);
  const minusDM = new Array(len).fill(0);
  for (let i = 1; i < len; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
    minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
    tr[i] = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
  }
  const smoothTR = wilderSmooth(tr, period);
  const smoothPlusDM = wilderSmooth(plusDM, period);
  const smoothMinusDM = wilderSmooth(minusDM, period);
  const plusDI = smoothTR.map((v, i) => (v ? (100 * smoothPlusDM[i]) / v : null));
  const minusDI = smoothTR.map((v, i) => (v ? (100 * smoothMinusDM[i]) / v : null));
  const dx = plusDI.map((p, i) => {
    if (p == null || minusDI[i] == null) return null;
    const sum = p + minusDI[i];
    return sum ? (100 * Math.abs(p - minusDI[i])) / sum : 0;
  });
  const validDx = dx.map(v => (v == null ? 0 : v));
  const adxLine = wilderSmooth(validDx, period).map((v, i) => (dx[i] == null ? null : v));
  return { adxLine, plusDI, minusDI };
}

function wilderSmooth(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      sum += values[i];
      if (i === period - 1) out[i] = sum;
    } else {
      out[i] = out[i - 1] - out[i - 1] / period + values[i];
    }
  }
  return out.map(v => (v == null ? null : v / period));
}

// Money Flow Index period 14, level 20/80
function mfi(highs, lows, closes, volumes, period = 14) {
  const len = closes.length;
  const typicalPrice = highs.map((h, i) => (h + lows[i] + closes[i]) / 3);
  const rawMoneyFlow = typicalPrice.map((tp, i) => tp * (volumes[i] || 0));
  const out = new Array(len).fill(null);
  for (let i = period; i < len; i++) {
    let posFlow = 0, negFlow = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (typicalPrice[j] > typicalPrice[j - 1]) posFlow += rawMoneyFlow[j];
      else if (typicalPrice[j] < typicalPrice[j - 1]) negFlow += rawMoneyFlow[j];
    }
    const mfRatio = negFlow === 0 ? 100 : posFlow / negFlow;
    out[i] = negFlow === 0 ? 100 : 100 - 100 / (1 + mfRatio);
  }
  return out;
}

// Momentum period 14, apply Close
function momentum(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  for (let i = period; i < closes.length; i++) {
    out[i] = (closes[i] / closes[i - period]) * 100;
  }
  return out;
}

// Stochastic Oscillator %K 14, %D 3, slowing 3, harga Low/High, metode Simple (SMA)
// level: 10,85,90,15,50,95,5
function stochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3, slowing = 3) {
  const len = closes.length;
  const rawK = new Array(len).fill(null);
  for (let i = kPeriod - 1; i < len; i++) {
    const highSlice = highs.slice(i - kPeriod + 1, i + 1);
    const lowSlice = lows.slice(i - kPeriod + 1, i + 1);
    const hh = Math.max(...highSlice);
    const ll = Math.min(...lowSlice);
    rawK[i] = hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100;
  }
  const validRawK = rawK.map(v => (v == null ? 0 : v));
  const slowedK = sma(validRawK, slowing).map((v, i) => (rawK[i] == null ? null : v));
  const validSlowedK = slowedK.map(v => (v == null ? 0 : v));
  const dLine = sma(validSlowedK, dPeriod).map((v, i) => (slowedK[i] == null ? null : v));
  return { k: slowedK, d: dLine };
}

const STOCH_LEVELS = [5, 10, 15, 50, 85, 90, 95];
const RSI_LEVELS = [30, 70];
const MFI_LEVELS = [20, 80];

// Hitung semua indikator sesuai settingan screenshot, kembalikan nilai terbaru (last value) tiap indikator.
function computeAllIndicators(candles) {
  // candles: [{time, open, high, low, close, volume}]
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume || 0);

  const ma5 = ema(closes, 5);
  const ma9 = ema(closes, 9);
  const ma20 = ema(closes, 20);
  const ma50 = ema(closes, 50);
  const ma200 = ema(closes, 200);
  const rsi14 = rsi(closes, 14);
  const macdRes = macd(closes, 12, 26, 9);
  const bb = bollingerBands(closes, 20, 2.0);
  const adxRes = adx(highs, lows, closes, 14);
  const mfi14 = mfi(highs, lows, closes, volumes, 14);
  const mom14 = momentum(closes, 14);
  const stoch = stochastic(highs, lows, closes, 14, 3, 3);

  const last = arr => (arr && arr.length ? arr[arr.length - 1] : null);
  const price = closes[closes.length - 1];

  return {
    price,
    ema: { ma5: last(ma5), ma9: last(ma9), ma20: last(ma20), ma50: last(ma50), ma200: last(ma200) },
    rsi14: { value: last(rsi14), levels: RSI_LEVELS },
    macd: { macd: last(macdRes.macdLine), signal: last(macdRes.signalLine), hist: last(macdRes.hist) },
    bollinger: { middle: last(bb.middle), upper: last(bb.upper), lower: last(bb.lower) },
    adx: { adx: last(adxRes.adxLine), plusDI: last(adxRes.plusDI), minusDI: last(adxRes.minusDI) },
    mfi14: { value: last(mfi14), levels: MFI_LEVELS },
    momentum14: { value: last(mom14) },
    stochastic: { k: last(stoch.k), d: last(stoch.d), levels: STOCH_LEVELS },
  };
}

module.exports = {
  sma, ema, rsi, macd, bollingerBands, adx, mfi, momentum, stochastic,
  computeAllIndicators,
};

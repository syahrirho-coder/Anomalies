const { getTimeSeries } = require('../lib/twelvedata');
const { getCryptoComposite } = require('../lib/fxCryptoMarketdata');
const { computeAllIndicators } = require('../lib/indicators');
const { generateAllStyles } = require('../lib/fxGroq');
const { STYLE_TF } = require('../lib/fxPairs');

module.exports = async (req, res) => {
  try {
    const { symbol, market = 'forex' } = req.query || {};
    if (!symbol) { res.status(400).json({ error: 'Parameter "symbol" wajib diisi' }); return; }

    const uniqueIntervals = [...new Set(Object.values(STYLE_TF).flatMap(tf => [tf.bias, tf.execution]))];

    const fetchOne = async interval => {
      if (market === 'crypto') return getCryptoComposite(symbol, interval);
      const candles = await getTimeSeries(symbol, interval, 300);
      return { candles, priceCompare: null, spreadPct: 0, sources: { twelvedata: 'fulfilled' } };
    };

    const fetched = await Promise.allSettled(uniqueIntervals.map(fetchOne));
    const dataByInterval = {};
    uniqueIntervals.forEach((iv, i) => {
      dataByInterval[iv] = fetched[i].status === 'fulfilled' ? fetched[i].value : null;
    });

    const indicatorsByInterval = {};
    for (const iv of uniqueIntervals) {
      if (dataByInterval[iv]?.candles?.length) {
        indicatorsByInterval[iv] = computeAllIndicators(dataByInterval[iv].candles);
      }
    }

    const stylesWithData = {};
    const extraByStyle = {};
    for (const [style, tf] of Object.entries(STYLE_TF)) {
      const bias = indicatorsByInterval[tf.bias];
      const exec = indicatorsByInterval[tf.execution];
      if (!bias || !exec) continue;
      stylesWithData[style] = {
        [`bias_${tf.bias}`]: bias,
        [`execution_${tf.execution}`]: exec,
      };
      const execData = dataByInterval[tf.execution];
      extraByStyle[style] = market === 'crypto'
        ? { price_cross_exchange: execData.priceCompare, spread_pct: execData.spreadPct, sumber: execData.sources }
        : { sumber: execData.sources };
    }

    if (!Object.keys(stylesWithData).length) {
      res.status(502).json({ error: `Gagal ambil data candle untuk ${symbol}` });
      return;
    }

    const results = await generateAllStyles({
      symbol, market,
      stylesWithData,
      extra: extraByStyle.daytrade || Object.values(extraByStyle)[0],
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ symbol, market, timeframes: STYLE_TF, sinyal: results, generated_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

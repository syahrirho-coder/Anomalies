const { fetchPairsForChain, normalizePair } = require('../lib/dexscreenerCommon');
const { enrichLogos } = require('../lib/logoResolver');

// "Accumulation signal": buy pressure konsisten tapi harga belum meledak — beda dari Anomalies (manipulasi/ekstrem).
function scoreAccumulation(p) {
  const totalTx1h = (p.txnsH1.buys || 0) + (p.txnsH1.sells || 0);
  const totalTx24h = (p.txnsH24.buys || 0) + (p.txnsH24.sells || 0);
  if (totalTx1h < 3 || totalTx24h < 10) return null;

  const buyRatio1h = (p.txnsH1.buys || 0) / totalTx1h;
  const buyRatio24h = (p.txnsH24.buys || 0) / totalTx24h;
  const stableAccumulation = buyRatio1h >= 0.55 && buyRatio1h <= 0.9 && buyRatio24h >= 0.5;
  const notYetPumped = p.priceChange24h < 40;
  const healthyLiquidity = p.liquidityUsd > 3000;

  if (!(stableAccumulation && notYetPumped && healthyLiquidity)) return null;

  let score = 40;
  score += Math.round((buyRatio1h - 0.5) * 100);
  if (p.volume24h > 20000) score += 10;
  if (p.priceChange24h > 0 && p.priceChange24h < 15) score += 10;

  return { score: Math.min(score, 99), buyRatio1h: Math.round(buyRatio1h * 100), buyRatio24h: Math.round(buyRatio24h * 100) };
}

module.exports = async (req, res) => {
  try {
    const chain = req.query?.chain || 'robinhood';
    const raw = await fetchPairsForChain(chain);
    let pairs = raw.map(normalizePair);
    pairs = await enrichLogos(pairs, p => p.baseTokenAddress);

    const signals = pairs
      .map(p => {
        const s = scoreAccumulation(p);
        if (!s) return null;
        return {
          symbol: p.symbol, score: s.score, buyRatio1h: s.buyRatio1h, buyRatio24h: s.buyRatio24h,
          priceUsd: p.priceUsd, marketCap: p.marketCap, liquidityUsd: p.liquidityUsd,
          volume24h: p.volume24h, priceChange1h: p.priceChange1h, url: p.url, icon: p.icon, address: p.baseTokenAddress, chain: p.chain,
          category: (p.liquidityUsd > 20000 && p.marketCap > 50000) ? 'enriched' : 'degen',
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ signals, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

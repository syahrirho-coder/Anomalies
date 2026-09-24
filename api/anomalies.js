const { fetchPairsForChain, normalizePair } = require('../lib/dexscreenerCommon');
const { enrichLogos } = require('../lib/logoResolver');

// Semua deteksi pure logic (threshold), bukan AI — konsisten sama preferensi user.
function scoreAnomaly(p) {
  const reasons = [];
  let score = 0;

  const volMcapRatio = p.marketCap > 0 ? p.volume24h / p.marketCap : 0;
  if (volMcapRatio > 1.5) { score += 35; reasons.push('Extreme volume vs market cap — potensi manipulasi/pump'); }
  else if (volMcapRatio > 0.6) { score += 15; reasons.push('Volume tinggi relatif market cap'); }

  const liqVolRatio = p.volume24h > 0 ? p.liquidityUsd / p.volume24h : 999;
  if (liqVolRatio < 0.05) { score += 25; reasons.push('Liquidity sangat tipis dibanding volume — risiko slippage/rug tinggi'); }

  if (Math.abs(p.priceChange1h) > 20) { score += 20; reasons.push(`Price swing ekstrem 1h (${p.priceChange1h.toFixed(1)}%)`); }

  const totalTx = (p.txnsH1.buys || 0) + (p.txnsH1.sells || 0);
  const buyRatio = totalTx ? (p.txnsH1.buys || 0) / totalTx : 0.5;
  if (totalTx >= 5 && (buyRatio > 0.85 || buyRatio < 0.15)) {
    score += 20;
    reasons.push(buyRatio > 0.85 ? 'Buy pressure sangat dominan (order book timpang)' : 'Sell pressure sangat dominan (kemungkinan distribusi)');
  }

  const ageHours = p.pairCreatedAt ? (Date.now() - p.pairCreatedAt) / 3600000 : 999;
  if (ageHours < 6 && p.volume24h > 20000) { score += 15; reasons.push('Pool baru (<6 jam) tapi volume udah besar'); }

  return { score: Math.min(score, 100), reasons };
}

module.exports = async (req, res) => {
  try {
    const chain = req.query?.chain || 'robinhood';
    const raw = await fetchPairsForChain(chain);
    let pairs = raw.map(normalizePair).filter(p => p.liquidityUsd > 1000);
    pairs = await enrichLogos(pairs, p => p.baseTokenAddress);

    const topGainers = [...pairs].sort((a, b) => b.priceChange1h - a.priceChange1h).slice(0, 10)
      .map(p => ({ symbol: p.symbol, priceUsd: p.priceUsd, priceChange1h: p.priceChange1h, volume24h: p.volume24h, icon: p.icon }));
    const topLosers = [...pairs].sort((a, b) => a.priceChange1h - b.priceChange1h).slice(0, 10)
      .map(p => ({ symbol: p.symbol, priceUsd: p.priceUsd, priceChange1h: p.priceChange1h, volume24h: p.volume24h, icon: p.icon }));
    const topVolume = [...pairs].sort((a, b) => b.volume24h - a.volume24h).slice(0, 10)
      .map(p => ({ symbol: p.symbol, priceUsd: p.priceUsd, priceChange1h: p.priceChange1h, volume24h: p.volume24h, icon: p.icon }));

    const anomalies = pairs
      .map(p => {
        const { score, reasons } = scoreAnomaly(p);
        if (score < 40) return null;
        const direction = p.priceChange1h >= 0 ? 'LONG' : 'SHORT';
        const vol = Math.max(Math.abs(p.priceChange1h) / 100, 0.02);
        const entry = p.priceUsd;
        const target = direction === 'LONG' ? entry * (1 + vol) : entry * (1 - vol);
        return {
          symbol: p.symbol, direction, score,
          priceUsd: p.priceUsd, priceChange1h: p.priceChange1h,
          volume1h: p.volume1h, liquidityUsd: p.liquidityUsd, marketCap: p.marketCap,
          entry, target: [Math.min(entry, target), Math.max(entry, target)],
          reasons, url: p.url, icon: p.icon, address: p.baseTokenAddress, chain: p.chain,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ anomalies, topGainers, topLosers, topVolume, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

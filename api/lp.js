const { fetchPairsForChain, normalizePair } = require('../lib/dexscreenerCommon');
const { enrichLogos } = require('../lib/logoResolver');

const ASSUMED_FEE_TIER = 0.003;

module.exports = async (req, res) => {
  try {
    const chain = req.query?.chain || 'robinhood';
    const raw = await fetchPairsForChain(chain);
    let pairs = raw.map(normalizePair).filter(p => p.liquidityUsd > 500);
    pairs = await enrichLogos(pairs, p => p.baseTokenAddress);

    const pools = pairs
      .map(p => {
        const feeEst24h = p.volume24h * ASSUMED_FEE_TIER;
        const aprEst = p.liquidityUsd > 0 ? ((feeEst24h * 365) / p.liquidityUsd) * 100 : 0;
        const volTvlRatio = p.liquidityUsd > 0 ? p.volume24h / p.liquidityUsd : 0;
        return {
          symbol: p.symbol, quote: p.quote, tvl: p.liquidityUsd, volume24h: p.volume24h,
          feeEst24h, aprEst: Math.round(aprEst * 10) / 10, volTvlRatio: Math.round(volTvlRatio * 100) / 100,
          priceChange24h: p.priceChange24h, url: p.url, icon: p.icon,
        };
      })
      .sort((a, b) => b.tvl - a.tvl)
      .slice(0, 30);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({
      pools,
      note: 'feeEst24h & aprEst pakai asumsi fee tier 0.3% (bukan fee real on-chain) karena DexScreener tidak expose fee tier per pool',
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

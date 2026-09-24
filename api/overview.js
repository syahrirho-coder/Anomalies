const { fetchPairsForChain, normalizePair } = require('../lib/dexscreenerCommon');
const { enrichLogos } = require('../lib/logoResolver');
const { collectLargeTrades } = require('../lib/onchainTraders');

module.exports = async (req, res) => {
  try {
    const chain = req.query?.chain || 'robinhood';
    const raw = await fetchPairsForChain(chain);
    let pairs = raw.map(normalizePair).filter(p => p.liquidityUsd > 0);
    pairs = await enrichLogos(pairs, p => p.baseTokenAddress);

    // Liquidity Flow: urut liquidity desc, bias arah dari selisih jumlah txn buy vs sell 1 jam (data asli DexScreener; ini hitungan transaksi, bukan $ net flow)
    const topPools = [...pairs]
      .sort((a, b) => b.liquidityUsd - a.liquidityUsd)
      .slice(0, 8)
      .map(p => {
        const buys = p.txnsH1.buys || 0, sells = p.txnsH1.sells || 0;
        const totalTx = buys + sells;
        const flowBiasPct = totalTx ? Math.round(((buys - sells) / totalTx) * 100) : 0;
        return {
          symbol: p.symbol, liquidityUsd: p.liquidityUsd, volume24h: p.volume24h,
          flowBiasPct, buys, sells, url: p.url, icon: p.icon,
        };
      });

    // Best Movers: top gainer 24h yang liquidity-nya masih sehat (> $5k, anti token mati)
    const bestCalls = [...pairs]
      .filter(p => p.liquidityUsd > 5000)
      .sort((a, b) => b.priceChange24h - a.priceChange24h)
      .slice(0, 6)
      .map(p => ({
        symbol: p.symbol, priceChange24h: p.priceChange24h, priceUsd: p.priceUsd,
        volume24h: p.volume24h, url: p.url, icon: p.icon,
      }));

    // Large Txn Alerts = swap individual besar ASLI (GeckoTerminal pool trades, tanpa API key). Tanpa proxy:
    // kalau data tidak ada, list kosong + largeTxnNote menjelaskan kenapa.
    const { trades: largeTxnAlerts, note: largeTxnNote } = await collectLargeTrades(chain, pairs, 1000, 6, 8);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ topPools, bestCalls, largeTxnAlerts, largeTxnNote, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

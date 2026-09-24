// Helper DexScreener dipakai bareng oleh overview/anomalies/lp/wallets.
// Konsisten dengan pola yang udah dipakai di scan.js (Robinhood Chain via search WETH/USDG/ETH, Solana via chain id).

const CHAIN_QUERY = {
  robinhood: ['WETH', 'USDG', 'ETH'], // query search yang sama kayak scan.js existing
  solana: ['SOL'],
};

async function fetchPairsForChain(chain) {
  const queries = CHAIN_QUERY[chain] || CHAIN_QUERY.robinhood;
  const results = await Promise.allSettled(
    queries.map(q =>
      fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`).then(r => r.json())
    )
  );
  const pairs = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value?.pairs)) {
      for (const p of r.value.pairs) {
        if (chain === 'solana' && p.chainId !== 'solana') continue;
        if (chain === 'robinhood' && p.chainId !== 'robinhood') continue;
        pairs.push(p);
      }
    }
  }
  // dedupe by pairAddress
  const seen = new Set();
  return pairs.filter(p => {
    if (seen.has(p.pairAddress)) return false;
    seen.add(p.pairAddress);
    return true;
  });
}

function normalizePair(p) {
  return {
    pairAddress: p.pairAddress,
    baseTokenAddress: p.baseToken?.address || null,
    chain: p.chainId,
    symbol: p.baseToken?.symbol || '???',
    name: p.baseToken?.name || '',
    quote: p.quoteToken?.symbol || '',
    priceUsd: parseFloat(p.priceUsd || 0),
    liquidityUsd: p.liquidity?.usd || 0,
    marketCap: p.marketCap || p.fdv || 0,
    volume24h: p.volume?.h24 || 0,
    volume1h: p.volume?.h1 || 0,
    priceChange1h: p.priceChange?.h1 || 0,
    priceChange24h: p.priceChange?.h24 || 0,
    txnsH1: p.txns?.h1 || { buys: 0, sells: 0 },
    txnsH24: p.txns?.h24 || { buys: 0, sells: 0 },
    pairCreatedAt: p.pairCreatedAt || null,
    url: p.url,
    icon: p.info?.imageUrl || null,
  };
}

module.exports = { fetchPairsForChain, normalizePair };

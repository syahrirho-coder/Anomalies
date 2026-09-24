const { fetchPairsForChain, normalizePair } = require('../lib/dexscreenerCommon');
const { enrichLogos } = require('../lib/logoResolver');
const { collectWallets } = require('../lib/onchainTraders');

module.exports = async (req, res) => {
  try {
    const chain = req.query?.chain || 'robinhood';
    const raw = await fetchPairsForChain(chain);
    let pairs = raw.map(normalizePair).filter(p => p.liquidityUsd > 1000);
    pairs = await enrichLogos(pairs, p => p.baseTokenAddress);

    // Data wallet ASLI saja. Kalau key/provider tidak tersedia -> wallets kosong + note (tanpa proxy).
    const { wallets, source, note } = await collectWallets(chain, pairs, 6, 15);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ wallets, source, note, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const { getKolConfluence } = require('../lib/gmgnKol');
const { fetchPairsForChain, normalizePair } = require('../lib/dexscreenerCommon');
const { enrichLogos } = require('../lib/logoResolver');

module.exports = async (req, res) => {
  try {
    const confluence = await getKolConfluence('sol', 50);
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (!confluence) {
      res.status(200).json({
        tokens: [],
        note: 'GMGN_API_KEY belum diisi (atau gmgn-cli gagal jalan) — belum ada data KOL/smart money asli. Fitur ini cuma jalan buat chain Solana; gmgn-cli belum dukung Robinhood Chain buat command track.',
      });
      return;
    }

    const solPairs = (await fetchPairsForChain('solana')).map(normalizePair);
    const byAddr = new Map(solPairs.map(p => [p.baseTokenAddress, p]));

    let tokens = confluence.slice(0, 20).map(t => {
      const match = byAddr.get(t.address);
      return {
        ...t,
        icon: match?.icon || null,
        url: match?.url || `https://dexscreener.com/solana/${t.address}`,
      };
    });
    tokens = await enrichLogos(tokens, t => t.address);

    res.status(200).json({ tokens, note: 'Data trade KOL & smart money ASLI dari GMGN OpenAPI (chain Solana)', generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Data KOL/viral ASLI dari GMGN OpenAPI resmi (paket npm 'gmgn-cli', bukan scraping).
// gmgn-cli track kol  -> trades real-time dari wallet KOL/influencer yang di-tag GMGN
// gmgn-cli track smartmoney -> trades dari wallet "smart_degen" (rekam jejak profit terbukti secara algoritma)
// Butuh GMGN_API_KEY di env (sama seperti yang sudah dipakai lib/gmgn.js buat candle memecoin).
// Chain yang didukung command 'track' ini: sol, bsc, base, eth — BELUM ada Robinhood Chain di command ini.

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function runGmgnCli(args) {
  const key = process.env.GMGN_API_KEY;
  if (!key) return null;
  try {
    const env = { ...process.env };
    const { stdout } = await execAsync(`npx gmgn-cli ${args} --raw`, { env, timeout: 15000 });
    return JSON.parse(stdout.trim());
  } catch (err) {
    return null; // jangan pura-pura ada data kalau CLI gagal/timeout
  }
}

// Ambil trade KOL & smart money terbaru, lalu agregasi per token: berapa wallet unik yang beli barengan.
async function getKolConfluence(chain = 'sol', limit = 50) {
  const [kolTrades, smTrades] = await Promise.all([
    runGmgnCli(`track kol --chain ${chain} --limit ${limit}`),
    runGmgnCli(`track smartmoney --chain ${chain} --limit ${limit}`),
  ]);
  if (!kolTrades && !smTrades) return null;

  const byToken = new Map();
  const addTrades = (trades, tag) => {
    if (!Array.isArray(trades)) return;
    for (const t of trades) {
      const addr = t.base_token?.address || t.base_address || t.address;
      if (!addr) continue;
      const isOpen = tag === 'kol' ? (t.is_open_or_close === 0) : (t.is_open_or_close === 0);
      if (!byToken.has(addr)) {
        byToken.set(addr, {
          address: addr,
          symbol: t.base_token?.symbol || t.symbol || '???',
          kolWallets: new Set(),
          smartWallets: new Set(),
          buyVolumeUsd: 0,
          priceChangeSinceTrade: t.price_change || null,
        });
      }
      const entry = byToken.get(addr);
      const wallet = t.maker_info?.name || t.maker || t.wallet || 'unknown';
      if (tag === 'kol') entry.kolWallets.add(wallet);
      else entry.smartWallets.add(wallet);
      if (isOpen) entry.buyVolumeUsd += (t.amount_usd || t.buy_cost_usd || 0);
    }
  };
  addTrades(kolTrades, 'kol');
  addTrades(smTrades, 'smartmoney');

  return [...byToken.values()]
    .map(t => ({
      address: t.address, symbol: t.symbol,
      kolCount: t.kolWallets.size, smartMoneyCount: t.smartWallets.size,
      buyVolumeUsd: Math.round(t.buyVolumeUsd),
      priceChangeSinceTrade: t.priceChangeSinceTrade,
      // confluence score: KOL kasih sinyal sosial, smart money kasih sinyal alpha lebih kuat (bobot 2x, sesuai dokumentasi GMGN)
      confluenceScore: t.kolWallets.size + t.smartWallets.size * 2,
    }))
    .filter(t => t.kolCount + t.smartMoneyCount >= 2) // minimal 2 wallet beli barengan baru dianggap "konfluensi"
    .sort((a, b) => b.confluenceScore - a.confluenceScore);
}

module.exports = { getKolConfluence };

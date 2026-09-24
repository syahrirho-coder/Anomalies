// Data wallet/trade ASLI on-chain tanpa API key: GeckoTerminal public API
//   GET /networks/{network}/pools/{pool}/trades  → 300 trade terakhir (maks 24 jam) per pool,
//   tiap trade punya tx_from_address, kind (buy/sell), volume_in_usd. Network id: robinhood, solana.
// Rate limit keyless ±30 call/menit → hasil di-cache 2 menit per pool.
// Kalau GeckoTerminal gagal / pool tidak terindeks → hasil KOSONG + note jujur. TIDAK ada fallback proxy.

const GT_NETWORK = { robinhood: 'robinhood', solana: 'solana' };
const CACHE_TTL_MS = 120 * 1000;
const cache = new Map();

function shortAddr(a) {
  if (!a) return '???';
  return a.startsWith('0x') ? `${a.slice(0, 6)}...${a.slice(-4)}` : `${a.slice(0, 4)}...${a.slice(-4)}`;
}

// return array trade (bisa kosong = pool valid tapi belum ada trade), atau null = request gagal
async function fetchPoolTrades(chain, poolAddress) {
  const network = GT_NETWORK[chain];
  if (!network || !poolAddress) return null;
  const k = `${network}:${poolAddress}`;
  const hit = cache.get(k);
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) return hit.trades;
  try {
    const res = await fetch(`https://api.geckoterminal.com/api/v2/networks/${network}/pools/${poolAddress}/trades`, {
      headers: { Accept: 'application/json;version=20230302' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (!Array.isArray(json?.data)) return null;
    const trades = json.data
      .map(d => d.attributes)
      .filter(a => a && a.tx_from_address)
      .map(a => ({
        wallet: a.tx_from_address,
        side: String(a.kind).toLowerCase() === 'sell' ? 'SELL' : 'BUY',
        usd: Number(a.volume_in_usd) || 0,
        ts: a.block_timestamp || null,
      }));
    cache.set(k, { t: Date.now(), trades });
    return trades;
  } catch {
    return null;
  }
}

async function loadTrades(chain, pairs, maxTokens) {
  const top = [...pairs].filter(p => p.pairAddress).sort((a, b) => b.volume24h - a.volume24h).slice(0, maxTokens);
  const out = await Promise.all(top.map(async p => ({ p, trades: await fetchPoolTrades(chain, p.pairAddress) })));
  return { loaded: out.filter(o => o.trades), failed: out.filter(o => !o.trades).length, total: out.length };
}

const SRC_NOTE = 'Trade ASLI on-chain dari GeckoTerminal (maks 300 trade terakhir per pool, ≤24 jam). Wallet = pengirim transaksi, bisa berupa bot/router.';
const FAIL_NOTE = 'GeckoTerminal tidak mengembalikan data trade saat ini (rate limit atau pool belum terindeks). Tidak ada data proxy yang ditampilkan.';

// Tab Wallet: agregasi per wallet per token dari trade asli
async function collectWallets(chain, pairs, maxTokens = 6, maxRows = 15) {
  const { loaded, failed, total } = await loadTrades(chain, pairs, maxTokens);
  const agg = new Map();
  for (const { p, trades } of loaded) {
    for (const t of trades) {
      const key = `${p.pairAddress}|${t.wallet}`;
      const cur = agg.get(key) || { symbol: p.symbol, icon: p.icon, address: p.baseTokenAddress, walletFull: t.wallet, buyUsd: 0, sellUsd: 0, n: 0 };
      if (t.side === 'BUY') cur.buyUsd += t.usd; else cur.sellUsd += t.usd;
      cur.n += 1;
      agg.set(key, cur);
    }
  }
  const wallets = [...agg.values()]
    .map(w => ({ symbol: w.symbol, icon: w.icon, address: w.address, wallet: shortAddr(w.walletFull), volumeUsd: Math.round(w.buyUsd + w.sellUsd), side: w.buyUsd >= w.sellUsd ? 'BUY' : 'SELL', txCount: w.n }))
    .filter(w => w.volumeUsd > 0)
    .sort((a, b) => b.volumeUsd - a.volumeUsd)
    .slice(0, maxRows);
  const note = !loaded.length ? FAIL_NOTE : (failed ? `${SRC_NOTE} (${failed}/${total} pool gagal diambil)` : SRC_NOTE);
  return { wallets, source: loaded.length ? 'geckoterminal' : null, note };
}

// Overview "Large Txn Alerts": swap individual terbesar (>= minUsd) dari trade asli
async function collectLargeTrades(chain, pairs, minUsd = 1000, maxTokens = 6, maxRows = 8) {
  const { loaded, failed, total } = await loadTrades(chain, pairs, maxTokens);
  const rows = loaded
    .flatMap(({ p, trades }) => trades.filter(t => t.usd >= minUsd).map(t => ({ symbol: p.symbol, icon: p.icon, address: p.baseTokenAddress, wallet: shortAddr(t.wallet), volumeUsd: Math.round(t.usd), side: t.side, ts: t.ts })))
    .sort((a, b) => b.volumeUsd - a.volumeUsd)
    .slice(0, maxRows);
  let note;
  if (!loaded.length) note = FAIL_NOTE;
  else if (!rows.length) note = `Belum ada swap ≥ $${minUsd.toLocaleString('en-US')} di pool teratas dalam data GeckoTerminal saat ini.`;
  else note = failed ? `${SRC_NOTE} (${failed}/${total} pool gagal diambil)` : SRC_NOTE;
  return { trades: rows, note };
}

module.exports = { collectWallets, collectLargeTrades };

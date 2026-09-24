// Resolusi logo asli token: coba DexScreener dulu (udah kebawa di field p.info.imageUrl lewat normalizePair),
// kalau kosong fallback ke GeckoTerminal token info API. Kalau dua-duanya kosong, frontend pakai avatar huruf.

const GT_NETWORK = { robinhood: 'robinhood', solana: 'solana' };
const cache = new Map();

async function getLogoFromGeckoTerminal(chain, tokenAddress) {
  const key = `${chain}:${tokenAddress}`;
  if (cache.has(key)) return cache.get(key);
  try {
    const network = GT_NETWORK[chain] || chain;
    const url = `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${tokenAddress}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) { cache.set(key, null); return null; }
    const json = await res.json();
    const img = json?.data?.attributes?.image_url;
    const clean = img && !img.includes('missing.png') ? img : null;
    cache.set(key, clean);
    return clean;
  } catch {
    cache.set(key, null);
    return null;
  }
}

// pairs: hasil normalizePair (punya .icon dari DexScreener, .chain, dan butuh baseTokenAddress)
// tokenAddressGetter: function(pair) -> address token base, karena normalizePair standar belum nyimpen ini
async function enrichLogos(pairs, tokenAddressGetter) {
  const results = await Promise.allSettled(
    pairs.map(async p => {
      if (p.icon) return p; // udah ada dari DexScreener
      const addr = tokenAddressGetter ? tokenAddressGetter(p) : null;
      if (!addr) return p;
      const gtLogo = await getLogoFromGeckoTerminal(p.chain, addr);
      return { ...p, icon: gtLogo };
    })
  );
  return results.map((r, i) => (r.status === 'fulfilled' ? r.value : pairs[i]));
}

module.exports = { enrichLogos, getLogoFromGeckoTerminal };

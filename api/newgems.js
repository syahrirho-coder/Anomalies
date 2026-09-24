const { fetchPairsForChain, normalizePair } = require('../lib/dexscreenerCommon');
const { enrichLogos } = require('../lib/logoResolver');

// Screener token BARU yang belum "telat" — logic pure threshold, bukan prediksi/jaminan.
// Framework skor ikutin 4 poin di README: (1) timing masuk early/mcap kecil,
// (2) belum exposure mainstream (belum pumped gede), (3) liquidity sehat, (4) volume mulai bangun.
// Yang TIDAK bisa dicek dari sini (holder distribution asli, mint/freeze authority, dev wallet
// history) — itu tetap harus dicek manual, makanya selalu dikasih di redFlags/note, bukan diklaim aman.

function scoreNewGem(p) {
  const reasons = [];
  const redFlags = [];
  let score = 0;

  const ageHours = p.pairCreatedAt ? (Date.now() - p.pairCreatedAt) / 3600000 : null;
  if (ageHours === null) return null;
  if (ageHours > 72) return null;

  if (ageHours <= 6) { score += 20; reasons.push(`Pool baru banget (${ageHours.toFixed(1)}j)`); }
  else if (ageHours <= 24) { score += 12; reasons.push(`Pool <24j (${ageHours.toFixed(0)}j)`); }
  else { score += 5; reasons.push(`Pool ${ageHours.toFixed(0)}j`); }

  const mc = p.marketCap;
  if (mc <= 0) return null;
  if (mc >= 10000 && mc <= 500000) { score += 25; reasons.push(`MCap ${fmtCompact(mc)} — masih early`); }
  else if (mc > 500000 && mc <= 2000000) { score += 10; reasons.push(`MCap ${fmtCompact(mc)} — mulai naik daun`); }
  else if (mc > 2000000) { redFlags.push(`MCap udah ${fmtCompact(mc)} — exposure mulai mainstream, mungkin udah telat`); }
  else { redFlags.push('MCap di bawah $10K — sangat mentah, risiko rug ekstrem'); }

  const liqMcRatio = mc > 0 ? p.liquidityUsd / mc : 0;
  if (liqMcRatio >= 0.15) { score += 15; reasons.push('Liquidity sehat relatif mcap'); }
  else if (liqMcRatio < 0.05) { redFlags.push('Liquidity tipis banget vs mcap — risiko rug/slippage tinggi'); }

  const totalTx1h = (p.txnsH1.buys || 0) + (p.txnsH1.sells || 0);
  const buyRatio1h = totalTx1h ? (p.txnsH1.buys || 0) / totalTx1h : 0;
  if (totalTx1h >= 10 && buyRatio1h >= 0.55 && buyRatio1h <= 0.88) {
    score += 15; reasons.push(`Buy pressure sehat (${Math.round(buyRatio1h * 100)}% dari ${totalTx1h} tx/1h)`);
  } else if (totalTx1h < 5) {
    redFlags.push('Transaksi masih sangat sedikit — sample kecil, belum ada validasi pasar');
  } else if (buyRatio1h > 0.92) {
    redFlags.push('Buy ratio ekstrem >92% dengan tx dikit — pola khas wash trading/bot pump');
  }

  if (p.volume1h > 0 && p.volume1h < p.volume24h * 0.5) {
    score += 10; reasons.push('Volume masih bangun bertahap, belum meledak sekaligus');
  }

  if (p.priceChange24h > 300) {
    redFlags.push(`Udah naik ${p.priceChange24h.toFixed(0)}% dalam 24j — kemungkinan udah telat, banyak yg FOMO duluan`);
  } else if (p.priceChange24h >= 0 && p.priceChange24h <= 150) {
    score += 15; reasons.push('Belum pumped gede — belum banyak yang FOMO');
  }

  if (redFlags.length >= 2) score = Math.min(score, 35);

  return { score: Math.max(0, Math.min(score, 100)), reasons, redFlags, ageHours };
}

function fmtCompact(n) {
  n = Number(n) || 0;
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

module.exports = async (req, res) => {
  try {
    const chain = req.query?.chain || 'robinhood';
    const raw = await fetchPairsForChain(chain);
    let pairs = raw.map(normalizePair).filter(p => p.liquidityUsd > 500);
    pairs = await enrichLogos(pairs, p => p.baseTokenAddress);

    const gems = pairs
      .map(p => {
        const result = scoreNewGem(p);
        if (!result) return null;
        return {
          symbol: p.symbol, priceUsd: p.priceUsd,
          marketCap: p.marketCap, liquidityUsd: p.liquidityUsd,
          volume1h: p.volume1h, volume24h: p.volume24h,
          priceChange1h: p.priceChange1h, priceChange24h: p.priceChange24h,
          ageHours: result.ageHours, score: result.score,
          reasons: result.reasons, redFlags: result.redFlags,
          url: p.url, icon: p.icon, address: p.baseTokenAddress, chain: p.chain,
        };
      })
      .filter(Boolean)
      .filter(g => g.score >= 35)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({
      gems,
      note: 'Filter otomatis pure logic (umur pool, mcap, liquidity, volume, buy pressure) — BUKAN jaminan token bakal naik. Sebelum entry tetap cek manual: holder distribution, mint/freeze authority, riwayat jual dev. Token 1000x itu sangat jarang secara statistik.',
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

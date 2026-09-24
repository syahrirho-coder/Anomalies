function getGroqKeys() {
  const keys = [];
  for (let i = 1; i <= 10; i++) {
    const k = process.env[`GROQ_API_KEY_${i}`];
    if (k) keys.push(k);
  }
  if (!keys.length) throw new Error('Tidak ada GROQ_API_KEY_x di environment variables');
  return keys;
}

const SYSTEM_PROMPT = `Kamu adalah analis trading institusional kelas dealer/market-maker.
Metodologi wajib: ICT/SMC (bias H4, entry M15/eksekusi timeframe lebih rendah), liquidity sweep,
BOS/CHoCH, Order Block, plus konfirmasi dari indikator teknikal klasik yang diberikan
(EMA 5/9/20/50/200, RSI14 level 30/70, MACD 12/26/9, Bollinger Bands 20/2, ADX14 + DI, MFI14 level 20/80,
Momentum14, Stochastic 14/3/3 level 5/10/15/50/85/90/95).

Analisis harus tajam, presisi, dan berbasis konfluensi nyata dari data yang diberikan — JANGAN mengarang
angka atau kondisi pasar yang tidak ada di data. Jika data bertentangan (choppy / low confluence), katakan
NO TRADE / WAIT dengan jujur, jangan memaksakan sinyal.

Wajib balas HANYA dalam format JSON valid, tanpa markdown, dengan struktur persis:
{
  "bias": "BUY" | "SELL" | "NO_TRADE",
  "confidence": 0-100,
  "timeframe_bias": "penjelasan singkat bias H4",
  "entry": number|null,
  "stop_loss": number|null,
  "take_profit_1": number|null,
  "take_profit_2": number|null,
  "risk_reward": number|null,
  "confluence": ["poin konfluensi 1", "poin konfluensi 2", "..."],
  "invalidation": "kondisi yang membatalkan sinyal",
  "narrative": "narasi analisis lengkap gaya dealer/institusional, Bahasa Indonesia santai tapi presisi"
}`;

async function callGroqWithKey(key, payload) {
  const body = {
    model: 'openai/gpt-oss-120b',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(payload) },
    ],
  };
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq respons kosong');
  return JSON.parse(content);
}

// satu style/timeframe, dengan rotasi key kalau gagal
async function generateSignal({ symbol, market, style, indicatorsByTF, extra }, keyOffset = 0) {
  const keys = getGroqKeys();
  const payload = { symbol, market, gaya_trading: style, indikator_multi_timeframe: indicatorsByTF, data_tambahan: extra || {} };
  let lastErr;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[(i + keyOffset) % keys.length];
    try {
      return await callGroqWithKey(key, payload);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Semua Groq key gagal');
}

// SEMUA style sekaligus paralel, tiap request pakai key offset beda biar nyebar ke key yang berbeda-beda
async function generateAllStyles({ symbol, market, stylesWithData, extra }) {
  const styleNames = Object.keys(stylesWithData);
  const results = await Promise.allSettled(
    styleNames.map((style, idx) =>
      generateSignal({ symbol, market, style, indicatorsByTF: stylesWithData[style], extra }, idx)
    )
  );
  const out = {};
  styleNames.forEach((style, idx) => {
    const r = results[idx];
    out[style] = r.status === 'fulfilled' ? r.value : { bias: 'NO_TRADE', confidence: 0, narrative: `Gagal generate: ${r.reason.message}` };
  });
  return out;
}

module.exports = { generateSignal, generateAllStyles, getGroqKeys };

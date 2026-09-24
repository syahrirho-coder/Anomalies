# PONSI TERMINAL (merged) — DEX scanner + AI Signal Forex/Gold/Crypto

Satu dashboard Vercel, 6 tab: Overview, Anomalies (+Top G/L), Signals (Enriched/Degen/New Gems), LP (+Guide), Wallet, AI Signal.

## Env vars (Vercel > Project Settings > Environment Variables)
```
TD_API_KEY_1..10       # TwelveData, rotasi — buat Forex/Gold di tab AI Signal
GROQ_API_KEY_1..10     # Groq, rotasi — AI narasi & keputusan di tab AI Signal (semua timeframe paralel)
```
Crypto (Binance/Bybit/OKX) dan DexScreener/GeckoTerminal nggak butuh API key. Data wallet & swap besar (Robinhood Chain + Solana) juga pakai GeckoTerminal keyless — nggak perlu Bitquery/Birdeye.

## Data wallet ASLI (tanpa API key)
- Sumber: GeckoTerminal public API `/networks/{robinhood|solana}/pools/{pool}/trades` — 300 trade terakhir (maks 24 jam) per pool, lengkap dengan `tx_from_address`, buy/sell, dan volume USD.
- Rate limit keyless ±30 call/menit, jadi hasil di-cache 2 menit per pool (`lib/onchainTraders.js`).
- Wallet = pengirim transaksi (tx sender). Bisa berupa bot/router, bukan selalu wallet manusia.
- Kalau GeckoTerminal gagal / pool belum terindeks → tabel kosong + `note`. Tidak ada fallback proxy.

## Struktur proyek
- `lib/twelvedata.js`, `lib/fxCryptoMarketdata.js` (Binance+Bybit+OKX composite), `lib/indicators.js`, `lib/fxGroq.js`, `lib/fxPairs.js` — mesin sinyal Forex/Gold/Crypto, generate SEMUA 6 gaya trading (m1/m5/m30/scalping/daytrade/swing) sekaligus paralel.
- `lib/logoResolver.js` — logo asli: DexScreener dulu, fallback GeckoTerminal, baru avatar huruf.
- `lib/onchainTraders.js` — helper trade/wallet asli (GeckoTerminal, cache 2 menit) dipakai `api/wallets.js` & `api/overview.js`.
- `api/wallets.js` — top wallet per token dari trade asli, tanpa fallback proxy.
- `api/fx-pairs.js` + `fx-signal-all.js` — tab AI Signal.
- `api/anomalies.js` — + `topGainers`/`topLosers`/`topVolume` buat sub-tab "Top G/L".
- `api/signals.js` — tiap sinyal ditag `category: enriched|degen`.
- `api/newgems.js` — screener token baru, sub-tab "New Gems".
- `public/terminal.html` — 6 tab + sub-tab + LP Strategy Guide modal.
- `vercel.json` — rewrite `/` dan `/terminal.html` ke `public/terminal.html`, plus `maxDuration` lebih panjang buat `fx-signal-all` & `kol` (paling berat, manggil beberapa API sekaligus).

## Cara pasang (Vercel)
1. Push folder ini ke repo GitHub/GitLab/Bitbucket, lalu import di [vercel.com/new](https://vercel.com/new) — atau langsung `vercel` / `vercel --prod` dari CLI di dalam folder ini (install dulu: `npm i -g vercel`).
2. Framework preset biarin "Other" (nggak perlu build command, nggak ada `dist`/`build` folder).
3. Isi environment variables di atas lewat Project Settings > Environment Variables (atau `vercel env add`).
4. Deploy. File `api/*.js` otomatis jadi Serverless Function, `public/terminal.html` otomatis ke-serve di `/` dan `/terminal.html` (lewat rewrite di `vercel.json`).
5. **Catatan plan Hobby:** default timeout function di Vercel Hobby kadang lebih pendek dari `maxDuration` yang di-set di `vercel.json` (butuh plan Pro buat 30 detik penuh). Kalau tab AI Signal / KOL sering timeout di Hobby, itu penyebabnya — upgrade plan atau kecilin jumlah timeframe yang di-generate paralel.

## Kejujuran data
- Overview "Large Txn Alerts": swap individual ≥ $1K ASLI dari GeckoTerminal. Data tidak ada → kosong + note, TIDAK ada proxy.
- Overview "Liquidity Flow": bias = selisih jumlah txn buy vs sell 1 jam dari DexScreener (hitungan transaksi asli, bukan $ net flow).
- LP APR: estimasi asumsi fee 0.3%, bukan APR real kontrak.
- Anomalies/Signals: pure logic threshold, bisa diaudit.
- Wallet tab: agregasi per wallet dari trade asli GeckoTerminal; kosong + note kalau data tidak ada (tanpa proxy).

## Env var tambahan: GMGN_API_KEY (panel KOL/Smart Money Confluence)
`GMGN_API_KEY` — buat panel "KOL/Smart Money Confluence" di tab Signals: trade real-time wallet KOL & smart money (chain Solana), via `gmgn-cli` official. `gmgn-cli` dipanggil lewat `npx` saat runtime — Vercel otomatis `npm install` dependency dari `package.json` ini pas build, jadi nggak perlu setup tambahan.

## New Gems (tab Signals → sub-tab "New Gems")
Screener token BARU (pool umur ≤72 jam) yang mcap-nya masih kecil dan belum pumped gede — buat nyari sebelum "telat", bukan yang udah rame dibeli orang. Logic-nya (`api/newgems.js`) pure threshold, sama kayak Anomalies, bukan AI/prediksi:
- Umur pool (makin baru makin tinggi skor)
- Market cap masih $10K–500K (sweet spot early, sesuai poin 1 di bawah)
- Liquidity/mcap ratio sehat (>15% = plus, <5% = red flag rug risk)
- Buy pressure 1h wajar (55–88%, bukan ekstrem >92% yang biasanya bot wash trading)
- Belum naik >300% dalam 24 jam (kalau udah, ditandain red flag "kemungkinan udah telat")

Setiap kartu nampilin `reasons` (kenapa lolos) DAN `redFlags` (yang masih perlu dicek manual) — token dengan ≥2 red flag skornya otomatis ditekan tapi tetap ditampilin, jujur. Yang TIDAK bisa dicek dari DexScreener (holder distribution asli, mint/freeze authority, riwayat jual dev) sengaja nggak diklaim aman — itu tetap PR manual sebelum entry.

## KOL/Viral confluence — cara analisa token yang berpotensi naik besar
Panel ini bukan tebak-tebakan — dia agregasi trade real dari dua wallet list resmi yang di-tag GMGN:
- **KOL** (`renowned`): wallet influencer yang dikenal publik — sinyal sosial/marketing, belum tentu alpha.
- **Smart Money** (`smart_degen`): wallet dengan rekam jejak profit terbukti secara algoritma GMGN — sinyal lebih kuat.

Token yang muncul di panel ini dibeli minimal 2 wallet dari kedua list itu dalam window terbaru — itu confluence asli, bobot smart money 2x karena alpha-nya lebih kuat dari sekadar hype KOL.

**Soal realistis-nya cari 1x-1000x:** kombinasi sinyal manapun (KOL, smart money, on-chain metrics) cuma menaikkan ODDS ketemu token yang gerak duluan, tidak ada yang menjamin multiplier tertentu. Token yang benar-benar 1000x itu sangat jarang secara statistik (survivorship bias — untuk setiap 1 token yang 1000x, ada ribuan yang rug/ke nol). Empat hal yang paling menentukan secara historis:
1. Timing masuk early — mcap masih $10K-500K, sebelum exposure mainstream.
2. Katalis nyata — narasi/story yang jelas, bukan cuma logo lucu.
3. Kesehatan on-chain — liquidity terkunci, mint/freeze authority renounced, dev udah jual/nggak, distribusi holder nggak terkonsentrasi (ini yang tab Anomalies/Signals udah tangkep).
4. Konfluensi smart money — beberapa wallet profitable beli barengan dalam waktu berdekatan (ini yang panel KOL di atas coba tangkap).
Poin 1-2 tetap butuh judgment kamu sendiri — nggak ada API yang bisa mastiin token bakal 1000x.

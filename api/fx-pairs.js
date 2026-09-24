const { FOREX_GOLD_PAIRS, CRYPTO_PAIRS } = require('../lib/fxPairs');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ forex_gold: FOREX_GOLD_PAIRS, crypto: CRYPTO_PAIRS });
};

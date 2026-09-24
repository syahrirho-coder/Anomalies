const FOREX_GOLD_PAIRS = [
  'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD',
  'EUR/JPY', 'GBP/JPY', 'EUR/GBP', 'AUD/JPY', 'EUR/AUD', 'GBP/AUD', 'CHF/JPY',
  'XAU/USD', // Gold
];

const CRYPTO_PAIRS = [
  'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'DOGE/USDT',
  'ADA/USDT', 'AVAX/USDT', 'LINK/USDT', 'TON/USDT', 'SUI/USDT', 'PEPE/USDT',
];

const STYLE_TF = {
  m1: { execution: '1min', bias: '15min' },
  m5: { execution: '5min', bias: '1h' },
  m30: { execution: '30min', bias: '4h' },
  scalping: { execution: '5min', bias: '30min' },
  daytrade: { execution: '15min', bias: '4h' },
  swing: { execution: '4h', bias: '1day' },
};

module.exports = { FOREX_GOLD_PAIRS, CRYPTO_PAIRS, STYLE_TF };

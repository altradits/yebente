import { ExchangeRates } from '../types';

const STORAGE_KEY = 'altradits_rates_cache_v2';

// Baseline fallback in case device is completely offline on initial boot
const DEFAULT_RATES: ExchangeRates = {
  btcUsd: 84500,
  btcKes: 10940000,
  btcEtb: 13745000,
  usdKes: 129.5,
  usdEtb: 162.7,
  change24hUsd: 0.95,
  change24hKes: 0.92,
  change24hEtb: 0.98,
  lastUpdated: Date.now(),
  isLive: false,
};

export async function fetchLiveRates(): Promise<ExchangeRates> {
  let btcUsd: number | null = null;
  let change24hUsd: number | null = null;
  let usdKes: number | null = null;
  let usdEtb: number | null = null;

  // 1. Fetch real-time BTC/USD from Coinbase Spot API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const cbRes = await fetch('https://api.coinbase.com/v2/prices/spot?currency=USD', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (cbRes.ok) {
      const cbData = await cbRes.json();
      const price = parseFloat(cbData?.data?.amount);
      if (!isNaN(price) && price > 0) {
        btcUsd = price;
      }
    }
  } catch {
    // try fallback below
  }

  // 2. Fetch 24h change and fallback BTC price from CoinGecko
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const cgRes = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true',
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    if (cgRes.ok) {
      const cgData = await cgRes.json();
      if (cgData?.bitcoin) {
        if (!btcUsd && cgData.bitcoin.usd) {
          btcUsd = cgData.bitcoin.usd;
        }
        if (typeof cgData.bitcoin.usd_24h_change === 'number') {
          change24hUsd = cgData.bitcoin.usd_24h_change;
        }
      }
    }
  } catch {
    // continue
  }

  // 3. Fetch real live Forex rates for KES and ETB against USD
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const fxRes = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (fxRes.ok) {
      const fxData = await fxRes.json();
      if (fxData?.rates) {
        if (typeof fxData.rates.KES === 'number') {
          usdKes = fxData.rates.KES;
        }
        if (typeof fxData.rates.ETB === 'number') {
          usdEtb = fxData.rates.ETB;
        }
      }
    }
  } catch {
    // continue
  }

  // If we fetched live data, compute exact live rates
  if (btcUsd !== null && btcUsd > 0) {
    const finalUsdKes = usdKes || DEFAULT_RATES.usdKes;
    const finalUsdEtb = usdEtb || DEFAULT_RATES.usdEtb;
    const finalBtcKes = Math.round(btcUsd * finalUsdKes);
    const finalBtcEtb = Math.round(btcUsd * finalUsdEtb);
    const finalChange = change24hUsd !== null ? change24hUsd : DEFAULT_RATES.change24hUsd;

    const liveRates: ExchangeRates = {
      btcUsd: Math.round(btcUsd * 100) / 100,
      btcKes: finalBtcKes,
      btcEtb: finalBtcEtb,
      usdKes: Math.round(finalUsdKes * 100) / 100,
      usdEtb: Math.round(finalUsdEtb * 100) / 100,
      change24hUsd: Math.round(finalChange * 100) / 100,
      change24hKes: Math.round(finalChange * 100) / 100,
      change24hEtb: Math.round(finalChange * 100) / 100,
      lastUpdated: Date.now(),
      isLive: true,
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(liveRates));
    } catch {
      // ignore
    }

    return liveRates;
  }

  // Check cached verified live rates if offline
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as ExchangeRates;
      return {
        ...parsed,
        isLive: true,
      };
    }
  } catch {
    // ignore
  }

  return DEFAULT_RATES;
}

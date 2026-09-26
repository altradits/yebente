import { ExchangeRates } from '../types';

const STORAGE_KEY = 'altradits_rates_cache_v2';

/**
 * Returns previously verified live rates from persistent cache if available, or null.
 * Zero mock or synthetic fallback figures.
 */
export function getCachedRates(): ExchangeRates | null {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as ExchangeRates;
      if (parsed.btcUsd > 0 && parsed.btcKes > 0) {
        return {
          ...parsed,
          isLive: false, // marked as cached
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Fetches real-time market rates directly from Coinbase, CoinGecko, and Forex APIs.
 * Strictly throws an error if rate providers are unreachable and no cached live rates exist.
 */
export async function fetchLiveRates(): Promise<ExchangeRates> {
  let btcUsd: number | null = null;
  let change24hUsd: number | null = null;
  let usdKes: number | null = null;
  let usdEtb: number | null = null;
  const errors: string[] = [];

  // 1. Fetch real-time BTC/USD from Coinbase Spot API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
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
    } else {
      errors.push(`Coinbase HTTP ${cbRes.status}`);
    }
  } catch (err: unknown) {
    errors.push(`Coinbase: ${err instanceof Error ? err.message : 'timeout'}`);
  }

  // 2. Fetch 24h change and secondary BTC price from CoinGecko
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
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
    } else {
      errors.push(`CoinGecko HTTP ${cgRes.status}`);
    }
  } catch (err: unknown) {
    errors.push(`CoinGecko: ${err instanceof Error ? err.message : 'timeout'}`);
  }

  // 3. Fetch real live Forex rates for KES and ETB against USD
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
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
    } else {
      errors.push(`Forex API HTTP ${fxRes.status}`);
    }
  } catch (err: unknown) {
    errors.push(`Forex API: ${err instanceof Error ? err.message : 'timeout'}`);
  }

  // Check persistent cache for any missing Forex rates
  const cached = getCachedRates();
  const effectiveUsdKes = usdKes || cached?.usdKes;
  const effectiveUsdEtb = usdEtb || cached?.usdEtb;
  const effectiveChange = change24hUsd !== null ? change24hUsd : (cached?.change24hUsd ?? 0);

  if (btcUsd !== null && btcUsd > 0 && effectiveUsdKes && effectiveUsdEtb) {
    const finalBtcKes = Math.round(btcUsd * effectiveUsdKes);
    const finalBtcEtb = Math.round(btcUsd * effectiveUsdEtb);

    const liveRates: ExchangeRates = {
      btcUsd: Math.round(btcUsd * 100) / 100,
      btcKes: finalBtcKes,
      btcEtb: finalBtcEtb,
      usdKes: Math.round(effectiveUsdKes * 100) / 100,
      usdEtb: Math.round(effectiveUsdEtb * 100) / 100,
      change24hUsd: Math.round(effectiveChange * 100) / 100,
      change24hKes: Math.round(effectiveChange * 100) / 100,
      change24hEtb: Math.round(effectiveChange * 100) / 100,
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

  if (cached && cached.btcUsd > 0) {
    return cached;
  }

  throw new Error(
    `Exchange rates unavailable: Unable to retrieve live rates from Coinbase, CoinGecko, or Forex providers (${errors.join(', ')}). Connect to the internet or configure a rate feed proxy.`
  );
}

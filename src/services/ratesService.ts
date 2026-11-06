import { ExchangeRates } from '../types';

const STORAGE_KEY = 'yebente_rates_cache_v1';

/**
 * Returns previously served rates from persistent cache if available, or null.
 * Cached rates are marked not live so the UI never presents them as fresh.
 */
export function getCachedRates(): ExchangeRates | null {
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as ExchangeRates;
      if (parsed.btcUsd > 0 && parsed.btcKes > 0) {
        return {
          ...parsed,
          isLive: false,
          source: 'cache',
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Saves rates to persistent cache
 */
export function saveCachedRates(rates: ExchangeRates): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rates));
  } catch {
    // ignore
  }
}

interface RatesResponse {
  success: boolean;
  btcUsd?: number;
  btcKes?: number;
  btcEtb?: number;
  source?: string;
  at?: number;
  error?: string;
}

/**
 * Fetches rates from the operator's own backend (/api/rates), which
 * serves the owner-set rate. Falls back to the persistent cache when
 * the backend cannot be reached; fails honestly when neither exists.
 */
export async function fetchLiveRates(): Promise<ExchangeRates> {
  let backendError = '';
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const res = await fetch('/api/rates', { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = (await res.json().catch(() => ({}))) as RatesResponse;
    if (res.ok && data.success && data.btcUsd && data.btcKes && data.btcEtb) {
      const rates: ExchangeRates = {
        btcUsd: data.btcUsd,
        btcKes: Math.round(data.btcKes),
        btcEtb: Math.round(data.btcEtb),
        usdKes: Math.round((data.btcKes / data.btcUsd) * 100) / 100,
        usdEtb: Math.round((data.btcEtb / data.btcUsd) * 100) / 100,
        change24hUsd: 0,
        change24hKes: 0,
        change24hEtb: 0,
        lastUpdated: data.at || Date.now(),
        isLive: true,
        source: 'owner',
      };
      saveCachedRates(rates);
      return rates;
    }
    backendError = data.error || `HTTP ${res.status}`;
  } catch (err: unknown) {
    backendError = err instanceof Error ? err.message : 'unreachable';
  }

  const cached = getCachedRates();
  if (cached && cached.btcUsd > 0) {
    return cached;
  }

  throw new Error(
    `Exchange rates are not available yet: the operator rate feed is unreachable (${backendError}) and no cached rates exist.`
  );
}

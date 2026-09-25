import { isLightningAddress, resolveLightningAddress } from './lightningService';

export interface AddressBalanceResult {
  sats: number;
  btc: number;
  confirmedSats: number;
  unconfirmedSats: number;
  txCount: number;
  success: boolean;
  isLightning?: boolean;
  lightningProvider?: string;
  minSendableSats?: number;
  maxSendableSats?: number;
  callbackUrl?: string;
  error?: string;
}

/**
 * Validates basic Bitcoin address structure or Lightning Address (user@domain)
 */
export function isValidBitcoinAddress(address: string): boolean {
  const clean = address.trim();
  if (!clean) return false;
  if (isLightningAddress(clean)) return true;
  // Standard mainnet regex for legacy, p2sh, segwit, taproot
  const btcRegex = /^(bc1[a-z0-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/i;
  return btcRegex.test(clean);
}

/**
 * Fetches real on-chain satoshi balance from Bitcoin nodes,
 * or resolves Lightning Addresses (such as Wallet of Satoshi) via LNURL.
 */
export async function fetchBitcoinAddressBalance(
  address: string
): Promise<AddressBalanceResult> {
  const clean = address.trim();
  if (!clean) {
    return {
      sats: 0,
      btc: 0,
      confirmedSats: 0,
      unconfirmedSats: 0,
      txCount: 0,
      success: false,
      error: 'Empty address',
    };
  }

  // 1. Check if this is a Layer 2 Lightning Address (e.g. user@walletofsatoshi.com)
  if (isLightningAddress(clean)) {
    const lnDetails = await resolveLightningAddress(clean);
    if (!lnDetails.success) {
      return {
        sats: 0,
        btc: 0,
        confirmedSats: 0,
        unconfirmedSats: 0,
        txCount: 0,
        success: false,
        error: lnDetails.error || 'Failed to resolve Lightning Address.',
      };
    }
    return {
      sats: 0,
      btc: 0,
      confirmedSats: 0,
      unconfirmedSats: 0,
      txCount: 0,
      success: true,
      isLightning: true,
      lightningProvider: lnDetails.provider,
      minSendableSats: lnDetails.minSendableSats,
      maxSendableSats: lnDetails.maxSendableSats,
      callbackUrl: lnDetails.callbackUrl,
    };
  }

  // 1. Try mempool.space API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(`https://mempool.space/api/address/${clean}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const funded = Number(data.chain_stats?.funded_txo_sum) || 0;
      const spent = Number(data.chain_stats?.spent_txo_sum) || 0;
      const confirmed = Math.max(0, funded - spent);

      const mempoolFunded = Number(data.mempool_stats?.funded_txo_sum) || 0;
      const mempoolSpent = Number(data.mempool_stats?.spent_txo_sum) || 0;
      const unconfirmed = mempoolFunded - mempoolSpent;

      const totalSats = Math.max(0, confirmed + unconfirmed);
      const txCount =
        (Number(data.chain_stats?.tx_count) || 0) +
        (Number(data.mempool_stats?.tx_count) || 0);

      return {
        sats: totalSats,
        btc: totalSats / 100_000_000,
        confirmedSats: confirmed,
        unconfirmedSats: unconfirmed,
        txCount,
        success: true,
      };
    }
  } catch {
    // try fallback
  }

  // 2. Try blockstream.info API fallback
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(`https://blockstream.info/api/address/${clean}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const funded = Number(data.chain_stats?.funded_txo_sum) || 0;
      const spent = Number(data.chain_stats?.spent_txo_sum) || 0;
      const confirmed = Math.max(0, funded - spent);

      const mempoolFunded = Number(data.mempool_stats?.funded_txo_sum) || 0;
      const mempoolSpent = Number(data.mempool_stats?.spent_txo_sum) || 0;
      const unconfirmed = mempoolFunded - mempoolSpent;

      const totalSats = Math.max(0, confirmed + unconfirmed);
      const txCount =
        (Number(data.chain_stats?.tx_count) || 0) +
        (Number(data.mempool_stats?.tx_count) || 0);

      return {
        sats: totalSats,
        btc: totalSats / 100_000_000,
        confirmedSats: confirmed,
        unconfirmedSats: unconfirmed,
        txCount,
        success: true,
      };
    }
  } catch {
    // Both failed or offline
  }

  return {
    sats: 0,
    btc: 0,
    confirmedSats: 0,
    unconfirmedSats: 0,
    txCount: 0,
    success: false,
    error: 'Could not reach Bitcoin blockchain node. Check network or address.',
  };
}

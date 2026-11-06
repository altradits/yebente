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
  lightningAddress?: string;
  minSendableSats?: number;
  maxSendableSats?: number;
  callbackUrl?: string;
  error?: string;
}

export interface ChainStatusResult {
  success: boolean;
  chain?: string;
  height?: number;
  synced?: boolean;
  unavailable?: boolean;
  error?: string;
}

export interface ChainFeeResult {
  success: boolean;
  satPerVb?: number;
  unavailable?: boolean;
  error?: string;
}

/**
 * Strips URI schemes (lightning:, bitcoin:) and query parameters (?amount=...)
 */
export function sanitizeBitcoinAddress(input: string): string {
  let clean = input.trim();
  clean = clean.replace(/^(lightning|bitcoin):/i, '');
  if (clean.includes('?')) {
    clean = clean.split('?')[0];
  }
  return clean.trim();
}

const ONCHAIN_REGEX = /^(bc1[a-z0-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/i;

/**
 * Accepts on-chain Bitcoin addresses (validated against the
 * operator's own node) and Lightning Addresses (resolved over the
 * open LNURL-pay protocol).
 */
export function isValidBitcoinAddress(address: string): boolean {
  const clean = sanitizeBitcoinAddress(address);
  if (!clean) return false;
  if (ONCHAIN_REGEX.test(clean)) return true;
  return isLightningAddress(clean);
}

/**
 * Reads an on-chain balance from the operator's own node via the
 * backend, or resolves a Lightning Address over LNURL-pay.
 */
export async function fetchBitcoinAddressBalance(
  address: string
): Promise<AddressBalanceResult> {
  const clean = sanitizeBitcoinAddress(address);
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

  // Layer 2 Lightning Address (user@domain or lnurl1...)
  if (isLightningAddress(clean) && !ONCHAIN_REGEX.test(clean)) {
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
      lightningAddress: lnDetails.address,
      minSendableSats: lnDetails.minSendableSats,
      maxSendableSats: lnDetails.maxSendableSats,
      callbackUrl: lnDetails.callbackUrl,
    };
  }

  // Layer 1 on-chain address, read from the operator's own node
  if (ONCHAIN_REGEX.test(clean)) {
    try {
      const res = await fetch(`/api/chain/balance/${encodeURIComponent(clean)}`);
      const data = await res.json().catch(() => ({}));
      if (res.status === 501 || !data.success) {
        return {
          sats: 0,
          btc: 0,
          confirmedSats: 0,
          unconfirmedSats: 0,
          txCount: 0,
          success: false,
          error: data.error || 'On-chain balances are not available yet: no chain provider is configured.',
        };
      }
      const confirmedSats = Number(data.confirmedSats || 0);
      const unconfirmedSats = Number(data.unconfirmedSats || 0);
      return {
        sats: confirmedSats,
        btc: confirmedSats / 100_000_000,
        confirmedSats,
        unconfirmedSats,
        txCount: 0,
        success: true,
      };
    } catch (err: unknown) {
      return {
        sats: 0,
        btc: 0,
        confirmedSats: 0,
        unconfirmedSats: 0,
        txCount: 0,
        success: false,
        error: err instanceof Error ? err.message : 'Network error reading on-chain balance.',
      };
    }
  }

  return {
    sats: 0,
    btc: 0,
    confirmedSats: 0,
    unconfirmedSats: 0,
    txCount: 0,
    success: false,
    error: 'Invalid address. Enter an on-chain Bitcoin address or a Lightning Address (user@domain).',
  };
}

/**
 * Reads chain sync status from the operator's own node via the backend.
 */
export async function fetchChainStatus(): Promise<ChainStatusResult> {
  try {
    const res = await fetch('/api/chain/status');
    const data = await res.json().catch(() => ({}));
    if (res.status === 501 || !data.success) {
      return {
        success: false,
        unavailable: res.status === 501,
        error: data.error || 'Chain status is not available yet.',
      };
    }
    return {
      success: true,
      chain: String(data.chain || 'unknown'),
      height: Number(data.height || 0),
      synced: Boolean(data.synced),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error reading chain status.',
    };
  }
}

/**
 * Reads a fee estimate (sat/vB) from the operator's own node. Never
 * guessed: when the node cannot estimate, the call fails honestly.
 */
export async function fetchChainFeeEstimate(targetBlocks = 6): Promise<ChainFeeResult> {
  try {
    const res = await fetch(`/api/chain/fee?target=${encodeURIComponent(String(targetBlocks))}`);
    const data = await res.json().catch(() => ({}));
    if (res.status === 501 || !data.success) {
      return {
        success: false,
        unavailable: res.status === 501,
        error: data.error || 'Fee estimates are not available yet.',
      };
    }
    return { success: true, satPerVb: Number(data.satPerVb || 0) };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error reading fee estimate.',
    };
  }
}

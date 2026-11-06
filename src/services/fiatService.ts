/**
 * Generic fiat-rail client. The app never speaks a money network's
 * protocol directly; it calls the backend's generic /api/fiat/*
 * routes, which run the operator's configured rail adapter. When no
 * adapter is configured the backend answers 501 and every function
 * below surfaces that honestly as "not available yet".
 */
export type FiatDirection = 'buy' | 'sell';
export type FiatRailCurrency = 'KES' | 'ETB' | 'USD';
export type FiatTransferState = 'pending' | 'paid' | 'failed';

export interface FiatQuoteResult {
  success: boolean;
  quoteId?: string;
  currency?: FiatRailCurrency;
  fiatMinor?: number;
  feeFiatMinor?: number;
  sats?: number;
  feeSats?: number;
  rateUsed?: number;
  rateSource?: string;
  /** True when the backend has no adapter for this rail (HTTP 501). */
  unavailable?: boolean;
  error?: string;
}

export interface FiatTransferResult {
  success: boolean;
  reference?: string;
  state?: FiatTransferState;
  receipt?: string;
  paidAt?: string;
  unavailable?: boolean;
  error?: string;
}

/** Fresh idempotency key per user action; retries reuse it. */
export function newIdempotencyKey(): string {
  try {
    const webCrypto = crypto as unknown as {
      randomUUID?: () => string;
      getRandomValues?: (array: Uint8Array) => Uint8Array;
    };
    if (typeof webCrypto.randomUUID === 'function') {
      return webCrypto.randomUUID();
    }
    if (typeof webCrypto.getRandomValues === 'function') {
      const bytes = webCrypto.getRandomValues(new Uint8Array(16));
      return Array.from(bytes, (b: number) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // fall through to the Math.random fallback
  }
  return `key-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function parseSafeJson(response: Response): Promise<{ status: number; data: Record<string, unknown> }> {
  try {
    const text = await response.text();
    if (!text) return { status: response.status, data: {} };
    return { status: response.status, data: (JSON.parse(text) || {}) as Record<string, unknown> };
  } catch {
    return { status: response.status, data: {} };
  }
}

function unavailableResult(status: number, data: Record<string, unknown>, fallback: string): { unavailable: boolean; error: string } {
  const error = typeof data.error === 'string' && data.error ? data.error : fallback;
  return { unavailable: status === 501, error };
}

/**
 * Ask the backend for a quote. Buy quotes take fiat minor units and
 * answer sats; sell quotes take sats and answer fiat minor units.
 */
export async function requestFiatQuote(params: {
  direction: FiatDirection;
  currency: FiatRailCurrency;
  amount: number;
}): Promise<FiatQuoteResult> {
  try {
    const response = await fetch('/api/fiat/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        direction: params.direction,
        currency: params.currency,
        amount: params.amount,
      }),
    });
    const { status, data } = await parseSafeJson(response);
    if (status === 501 || data.success !== true) {
      return {
        success: false,
        ...unavailableResult(status, data, 'A fiat quote is not available yet.'),
      };
    }
    return {
      success: true,
      quoteId: String(data.quoteId || ''),
      currency: params.currency,
      fiatMinor: Number(data.fiatMinor || 0),
      feeFiatMinor: Number(data.feeFiatMinor || 0),
      sats: Number(data.sats || 0),
      feeSats: Number(data.feeSats || 0),
      rateUsed: Number(data.rateUsed || 0),
      rateSource: typeof data.rateSource === 'string' ? data.rateSource : 'owner',
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error requesting a quote.' };
  }
}

/**
 * Start one collection (buy) or payout (sell). Retries must reuse the
 * same idempotency key so a double tap can never charge twice.
 */
export async function startFiatTransfer(params: {
  direction: FiatDirection;
  quoteId: string;
  phone: string;
  idempotencyKey: string;
}): Promise<FiatTransferResult> {
  try {
    const path = params.direction === 'buy' ? '/api/fiat/collect' : '/api/fiat/payout';
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteId: params.quoteId,
        phone: params.phone,
        idempotencyKey: params.idempotencyKey,
      }),
    });
    const { status, data } = await parseSafeJson(response);
    if (status === 501 || data.success !== true) {
      return {
        success: false,
        ...unavailableResult(status, data, 'This fiat rail is not available yet.'),
      };
    }
    return {
      success: true,
      reference: String(data.reference || ''),
      state: (data.state as FiatTransferState) || 'pending',
      receipt: typeof data.receipt === 'string' ? data.receipt : undefined,
      paidAt: typeof data.paidAt === 'string' ? data.paidAt : undefined,
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error starting the transfer.' };
  }
}

/**
 * Ask the backend for the current state of one transfer.
 */
export async function queryFiatStatus(reference: string): Promise<FiatTransferResult> {
  try {
    const response = await fetch(`/api/fiat/status/${encodeURIComponent(reference)}`);
    const { status, data } = await parseSafeJson(response);
    if (status === 501 || data.success !== true) {
      return {
        success: false,
        ...unavailableResult(status, data, 'Transfer status is not available yet.'),
      };
    }
    return {
      success: true,
      reference,
      state: (data.state as FiatTransferState) || 'pending',
      receipt: typeof data.receipt === 'string' ? data.receipt : undefined,
      paidAt: typeof data.paidAt === 'string' ? data.paidAt : undefined,
    };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Network error checking status.' };
  }
}

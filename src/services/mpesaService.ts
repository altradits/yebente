export interface StkPushParams {
  phone: string;
  amount: number;
  accountReference?: string;
  transactionDesc?: string;
}

export interface StkPushResponse {
  success: boolean;
  merchantRequestId?: string;
  checkoutRequestId?: string;
  responseCode?: string;
  responseDescription?: string;
  customerMessage?: string;
  error?: string;
}

export interface StkQueryResponse {
  success: boolean;
  responseCode?: string;
  resultCode?: number | string;
  resultDesc?: string;
  merchantRequestId?: string;
  checkoutRequestId?: string;
  error?: string;
}

/**
 * Extracts 9 subscriber digits from any Kenyan phone input (07..., 01..., 2547..., +2547...)
 * Allows seamless typing, backspacing, editing, and copy-pasting.
 */
export function extractKenyanSubscriberDigits(phone: string): string {
  if (!phone) return '';
  let clean = phone.replace(/[^0-9]/g, '');
  // If starts with 254 (Kenya international prefix), strip it
  if (clean.startsWith('254')) {
    clean = clean.slice(3);
  }
  // Strip leading 0 (trunk prefix, e.g. 07... or 01...) so +254 0 is never created
  while (clean.startsWith('0')) {
    clean = clean.slice(1);
  }
  return clean.slice(0, 9);
}

/**
 * Validates Kenyan mobile subscriber numbers (Safaricom format: 07XX, 01XX, 2547XX, 2541XX)
 */
export function isValidKenyanPhone(phone: string): boolean {
  const clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('254') && clean.length === 12) {
    return ['7', '1'].includes(clean[3]);
  }
  if (clean.startsWith('0') && clean.length === 10) {
    return ['7', '1'].includes(clean[1]);
  }
  if (clean.length === 9) {
    return ['7', '1'].includes(clean[0]);
  }
  return false;
}

/**
 * Formats a Kenyan phone number to international E.164 without plus sign (2547XXXXXXXX)
 */
export function formatKenyanPhone(phone: string): string {
  const clean = phone.replace(/[^0-9]/g, '');
  if (clean.startsWith('254') && clean.length === 12) {
    return clean;
  }
  if (clean.startsWith('0') && clean.length === 10) {
    return `254${clean.slice(1)}`;
  }
  if (clean.length === 9) {
    return `254${clean}`;
  }
  return clean;
}

/**
 * Formats a Kenyan phone number for display with country code (+254 7XX XXX XXX)
 */
export function formatKenyanDisplayPhone(phone: string): string {
  const formatted = formatKenyanPhone(phone);
  if (formatted.length === 12 && formatted.startsWith('254')) {
    return `+254 ${formatted.slice(3, 6)} ${formatted.slice(6, 9)} ${formatted.slice(9)}`;
  }
  return phone.startsWith('+') ? phone : `+${phone}`;
}

/**
 * Safely parses response body as JSON without throwing unhandled exceptions if the server returns HTML/502
 */
async function parseSafeJson<T = any>(response: Response): Promise<{ ok: boolean; data: T }> {
  try {
    const text = await response.text();
    if (!text || text.trim() === '') {
      return {
        ok: false,
        data: {
          error:
            response.status === 502 || response.status === 504 || response.status === 503
              ? `Backend Daraja bridge is unreachable (${response.status}). Please run 'node server.js' to start the backend.`
              : `Empty response from server (Status ${response.status}).`,
        } as T,
      };
    }
    const json = JSON.parse(text);
    return { ok: response.ok, data: json };
  } catch {
    const isProxyDown = response.status === 502 || response.status === 504 || response.status === 503;
    return {
      ok: false,
      data: {
        error: isProxyDown
          ? 'Backend Daraja bridge on port 3001 is offline. Start it with `node server.js`.'
          : `Server returned non-JSON response (Status ${response.status}).`,
      } as T,
    };
  }
}

/**
 * Dispatches a real Lipa Na M-Pesa Online STK Push request to the backend bridge
 */
export async function initiateStkPush(params: StkPushParams): Promise<StkPushResponse> {
  const formattedPhone = formatKenyanPhone(params.phone);

  try {
    const response = await fetch('/api/mpesa/stkpush', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: formattedPhone,
        amount: params.amount,
        accountReference: params.accountReference || 'yebente',
        transactionDesc: params.transactionDesc || 'Bitcoin Settlement',
      }),
    });

    const { ok, data } = await parseSafeJson<any>(response);

    if (!ok || !data?.success) {
      return {
        success: false,
        error: data?.error || 'Failed to dispatch M-Pesa STK Push prompt.',
      };
    }

    return {
      success: true,
      merchantRequestId: data.merchantRequestId,
      checkoutRequestId: data.checkoutRequestId,
      responseCode: data.responseCode,
      responseDescription: data.responseDescription,
      customerMessage: data.customerMessage,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error reaching M-Pesa bridge';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Queries final settlement status for a given CheckoutRequestID from Safaricom
 */
export async function queryStkStatus(checkoutRequestId: string): Promise<StkQueryResponse> {
  try {
    const response = await fetch('/api/mpesa/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ checkoutRequestId }),
    });

    const { ok, data } = await parseSafeJson<any>(response);

    return {
      success: ok && Boolean(data?.success),
      responseCode: data?.responseCode,
      resultCode: data?.resultCode,
      resultDesc: data?.resultDesc,
      merchantRequestId: data?.merchantRequestId,
      checkoutRequestId: data?.checkoutRequestId,
      error: data?.error,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error querying M-Pesa status';
    return {
      success: false,
      error: message,
    };
  }
}

export interface VerifyRecipientResponse {
  success: boolean;
  verified: boolean;
  phone?: string;
  formattedPhone?: string;
  name?: string;
  provider?: string;
  accountStatus?: string;
  error?: string;
}

export interface VerifyC2BResponse {
  success: boolean;
  verified: boolean;
  shortCode?: string;
  name?: string;
  accountNumber?: string;
  provider?: string;
  error?: string;
}

/**
 * Verifies registered Safaricom subscriber name via Safaricom B2C Hakikisha API
 */
export async function verifyMpesaRecipient(phone: string): Promise<VerifyRecipientResponse> {
  const formatted = formatKenyanPhone(phone);

  if (!isValidKenyanPhone(formatted)) {
    return {
      success: false,
      verified: false,
      error: 'Please enter a valid Kenyan Safaricom phone number (07XX... or 01XX...).',
    };
  }

  try {
    const response = await fetch('/api/mpesa/hakikisha/b2c', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ phone: formatted }),
    });

    const { ok, data } = await parseSafeJson<any>(response);

    if (!ok || !data?.success) {
      return {
        success: false,
        verified: false,
        error: data?.error || 'Failed to verify M-Pesa recipient name via Hakikisha.',
      };
    }

    return {
      success: true,
      verified: Boolean(data.verified),
      phone: data.phone,
      formattedPhone: data.formattedPhone,
      name: data.name,
      provider: data.provider,
      accountStatus: data.accountStatus,
    };
  } catch (err: unknown) {
    return {
      success: false,
      verified: false,
      error: err instanceof Error ? err.message : 'Network error verifying recipient via Hakikisha.',
    };
  }
}

/**
 * Verifies Paybill / Till merchant name via Safaricom C2B Hakikisha API
 */
export async function verifyC2BHakikisha(
  shortCode: string,
  accountNumber?: string,
  phone?: string
): Promise<VerifyC2BResponse> {
  const cleanShortcode = shortCode.trim();
  if (!cleanShortcode) {
    return {
      success: false,
      verified: false,
      error: 'ShortCode is required.',
    };
  }

  try {
    const response = await fetch('/api/mpesa/hakikisha/c2b', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        shortCode: cleanShortcode,
        accountNumber: accountNumber?.trim() || '',
        phone: phone ? formatKenyanPhone(phone) : '',
      }),
    });

    const { ok, data } = await parseSafeJson<any>(response);

    if (!ok || !data?.success) {
      return {
        success: false,
        verified: false,
        error: data?.error || 'Failed to verify merchant via C2B Hakikisha.',
      };
    }

    return {
      success: true,
      verified: Boolean(data.verified),
      shortCode: data.shortCode,
      name: data.name,
      accountNumber: data.accountNumber,
      provider: data.provider,
    };
  } catch (err: unknown) {
    return {
      success: false,
      verified: false,
      error: err instanceof Error ? err.message : 'Network error verifying C2B merchant.',
    };
  }
}

export interface SendPayoutParams {
  phone: string;
  amount: number;
  currency?: string;
  satsAmount?: number;
  recipientName?: string;
  note?: string;
}

export interface SendPayoutResponse {
  success: boolean;
  referenceNumber?: string;
  recipientName?: string;
  phone?: string;
  amount?: number;
  currency?: string;
  satsAmount?: number;
  message?: string;
  error?: string;
}

/**
 * Dispatches an M-Pesa B2C payout / off-ramps Sats or KES to a recipient phone number
 */
export async function sendMpesaPayout(params: SendPayoutParams): Promise<SendPayoutResponse> {
  const formattedPhone = formatKenyanPhone(params.phone);

  try {
    const response = await fetch('/api/mpesa/payout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: formattedPhone,
        amount: params.amount,
        currency: params.currency || 'KES',
        satsAmount: params.satsAmount || 0,
        recipientName: params.recipientName,
        note: params.note,
      }),
    });

    const { ok, data } = await parseSafeJson<any>(response);

    if (!ok || !data?.success) {
      return {
        success: false,
        error: data?.error || 'Failed to process M-Pesa disbursement.',
      };
    }

    return {
      success: true,
      referenceNumber: data.referenceNumber,
      recipientName: data.recipientName,
      phone: data.phone,
      amount: data.amount,
      currency: data.currency,
      satsAmount: data.satsAmount,
      message: data.message,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error during M-Pesa payout.',
    };
  }
}


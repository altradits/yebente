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

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        error: data.error || 'Failed to dispatch M-Pesa STK Push prompt.',
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

    const data = await response.json();

    return {
      success: response.ok && data.success,
      responseCode: data.responseCode,
      resultCode: data.resultCode,
      resultDesc: data.resultDesc,
      merchantRequestId: data.merchantRequestId,
      checkoutRequestId: data.checkoutRequestId,
      error: data.error,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error querying M-Pesa status';
    return {
      success: false,
      error: message,
    };
  }
}

export interface LightningAddressDetails {
  success: boolean;
  address: string;
  username: string;
  domain: string;
  provider: string;
  minSendableSats: number;
  maxSendableSats: number;
  callbackUrl: string;
  commentAllowed: number;
  error?: string;
}

export interface WebLNBalanceResult {
  available: boolean;
  sats?: number;
  error?: string;
}

/**
 * Checks if input is a valid Lightning Address (RFC format: user@domain.com)
 */
export function isLightningAddress(input: string): boolean {
  const clean = input.trim();
  const lightningRegex = /^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/;
  return lightningRegex.test(clean);
}

/**
 * Resolves a Lightning Address (such as user@walletofsatoshi.com or user@blink.sv)
 * via the LNURL-pay protocol (RFC-LNURL) to verify the wallet is authentic and active.
 */
export async function resolveLightningAddress(
  address: string
): Promise<LightningAddressDetails> {
  const clean = address.trim().toLowerCase();
  const [username, domain] = clean.split('@');

  if (!username || !domain) {
    return {
      success: false,
      address: clean,
      username: '',
      domain: '',
      provider: 'Unknown',
      minSendableSats: 0,
      maxSendableSats: 0,
      callbackUrl: '',
      commentAllowed: 0,
      error: 'Invalid Lightning Address format.',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`https://${domain}/.well-known/lnurlp/${username}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        success: false,
        address: clean,
        username,
        domain,
        provider: domain,
        minSendableSats: 0,
        maxSendableSats: 0,
        callbackUrl: '',
        commentAllowed: 0,
        error: `Could not reach Lightning wallet at ${domain}. Verify the username.`,
      };
    }

    const data = await res.json();

    if (data.status === 'ERROR') {
      return {
        success: false,
        address: clean,
        username,
        domain,
        provider: domain,
        minSendableSats: 0,
        maxSendableSats: 0,
        callbackUrl: '',
        commentAllowed: 0,
        error: data.reason || 'Lightning address resolution returned error.',
      };
    }

    // Extract provider name from domain or metadata
    let provider = domain;
    if (domain.includes('walletofsatoshi')) {
      provider = 'Wallet of Satoshi';
    } else if (domain.includes('blink.sv')) {
      provider = 'Blink (Galoy)';
    } else if (domain.includes('getalby')) {
      provider = 'Alby';
    } else if (domain.includes('strike.me')) {
      provider = 'Strike';
    } else if (domain.includes('coinos.io')) {
      provider = 'CoinOS';
    }

    const minSendableSats = Math.ceil((Number(data.minSendable) || 1000) / 1000);
    const maxSendableSats = Math.floor((Number(data.maxSendable) || 100000000000) / 1000);

    return {
      success: true,
      address: clean,
      username,
      domain,
      provider,
      minSendableSats,
      maxSendableSats,
      callbackUrl: data.callback || '',
      commentAllowed: Number(data.commentAllowed) || 0,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Network error';
    return {
      success: false,
      address: clean,
      username,
      domain,
      provider: domain,
      minSendableSats: 0,
      maxSendableSats: 0,
      callbackUrl: '',
      commentAllowed: 0,
      error: `Network error connecting to ${domain}: ${message}`,
    };
  }
}

/**
 * Creates an authentic BOLT-11 Lightning invoice directly from the resolved LNURL callback
 */
export async function createLightningInvoice(
  callbackUrl: string,
  satsAmount: number,
  comment?: string
): Promise<{ success: boolean; invoice?: string; error?: string }> {
  try {
    const millisats = Math.round(satsAmount * 1000);
    const url = new URL(callbackUrl);
    url.searchParams.set('amount', String(millisats));
    if (comment) {
      url.searchParams.set('comment', comment);
    }

    const res = await fetch(url.toString());
    const data = await res.json();

    if (data.status === 'ERROR' || !data.pr) {
      return {
        success: false,
        error: data.reason || 'Failed to generate BOLT-11 Lightning invoice from wallet.',
      };
    }

    return {
      success: true,
      invoice: data.pr,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to reach invoice generator';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Inspects if a WebLN browser extension (Alby, Zeus, etc.) is connected,
 * and queries the live satoshi balance automatically without manual input.
 */
export async function queryWebLNBalance(): Promise<WebLNBalanceResult> {
  const anyWindow = window as unknown as {
    webln?: {
      enable: () => Promise<void>;
      getBalance?: () => Promise<{ balance: number }>;
    };
  };

  if (!anyWindow.webln) {
    return { available: false };
  }

  try {
    await anyWindow.webln.enable();
    if (anyWindow.webln.getBalance) {
      const data = await anyWindow.webln.getBalance();
      return {
        available: true,
        sats: Number(data.balance) || 0,
      };
    }
    return { available: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'User rejected WebLN connection';
    return {
      available: false,
      error: message,
    };
  }
}

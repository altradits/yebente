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
 * Decodes a bech32-encoded string (such as lnurl1...) to an actual HTTP/HTTPS URL
 */
export function decodeLnurl(lnurlStr: string): string | null {
  const clean = lnurlStr.trim().toLowerCase().replace(/^lightning:/i, '');
  if (!clean.startsWith('lnurl1')) {
    return null;
  }

  const ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const sep = clean.lastIndexOf('1');
  if (sep === -1) return null;

  const dataPart = clean.substring(sep + 1);
  const words: number[] = [];
  // Skip the 6-character checksum at the end
  for (let i = 0; i < dataPart.length - 6; i++) {
    const idx = ALPHABET.indexOf(dataPart[i]);
    if (idx === -1) return null;
    words.push(idx);
  }

  let acc = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const v of words) {
    acc = (acc << 5) | v;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((acc >> bits) & 0xff);
    }
  }

  try {
    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

/**
 * Checks if input is a valid Lightning Address (user@domain.com) or encoded LNURL (lnurl1...)
 */
export function isLightningAddress(input: string): boolean {
  const clean = input.trim().toLowerCase().replace(/^lightning:/i, '');
  if (clean.startsWith('lnurl1')) {
    return true;
  }
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
  const clean = address.trim().toLowerCase().replace(/^lightning:/i, '');

  let targetUrl: string;
  let defaultUsername = '';
  let defaultDomain = '';

  if (clean.startsWith('lnurl1')) {
    const decoded = decodeLnurl(clean);
    if (!decoded) {
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
        error: 'Invalid bech32 LNURL encoding.',
      };
    }
    targetUrl = decoded;
    try {
      const parsed = new URL(decoded);
      defaultDomain = parsed.hostname;
      const pathParts = parsed.pathname.split('/').filter(Boolean);
      defaultUsername = pathParts[pathParts.length - 1] || 'user';
    } catch {
      defaultDomain = 'lightning';
      defaultUsername = 'user';
    }
  } else {
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
    defaultUsername = username;
    defaultDomain = domain;
    targetUrl = `https://${domain}/.well-known/lnurlp/${username}`;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const res = await fetch(targetUrl, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return {
        success: false,
        address: clean,
        username: defaultUsername,
        domain: defaultDomain,
        provider: defaultDomain,
        minSendableSats: 0,
        maxSendableSats: 0,
        callbackUrl: '',
        commentAllowed: 0,
        error: `Could not reach Lightning wallet at ${defaultDomain}.`,
      };
    }

    const data = await res.json();

    if (data.status === 'ERROR') {
      return {
        success: false,
        address: clean,
        username: defaultUsername,
        domain: defaultDomain,
        provider: defaultDomain,
        minSendableSats: 0,
        maxSendableSats: 0,
        callbackUrl: '',
        commentAllowed: 0,
        error: data.reason || 'Lightning address resolution returned error.',
      };
    }

    // Extract provider name from domain or metadata
    let provider = defaultDomain;
    if (defaultDomain.includes('walletofsatoshi')) {
      provider = 'Wallet of Satoshi';
    } else if (defaultDomain.includes('blink.sv')) {
      provider = 'Blink (Galoy)';
    } else if (defaultDomain.includes('getalby')) {
      provider = 'Alby';
    } else if (defaultDomain.includes('strike.me')) {
      provider = 'Strike';
    } else if (defaultDomain.includes('coinos.io')) {
      provider = 'CoinOS';
    }

    // Extract human-readable address from metadata if present (LUD-06 / LUD-16 spec)
    let standardAddress = `${defaultUsername}@${defaultDomain}`;
    let parsedMetadata = data.metadata;
    if (typeof parsedMetadata === 'string') {
      try {
        parsedMetadata = JSON.parse(parsedMetadata);
      } catch {
        parsedMetadata = [];
      }
    }
    if (Array.isArray(parsedMetadata)) {
      try {
        const idEntry = parsedMetadata.find(
          (m: unknown) => Array.isArray(m) && m[0] === 'text/identifier'
        );
        if (idEntry && typeof idEntry[1] === 'string') {
          standardAddress = idEntry[1];
        }
      } catch {
        // ignore
      }
    }

    const minSendableSats = Math.ceil((Number(data.minSendable) || 1000) / 1000);
    const maxSendableSats = Math.floor((Number(data.maxSendable) || 100000000000) / 1000);

    return {
      success: true,
      address: standardAddress,
      username: defaultUsername,
      domain: defaultDomain,
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
      username: defaultUsername,
      domain: defaultDomain,
      provider: defaultDomain,
      minSendableSats: 0,
      maxSendableSats: 0,
      callbackUrl: '',
      commentAllowed: 0,
      error: `Network error connecting to ${defaultDomain}: ${message}`,
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

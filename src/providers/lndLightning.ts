/**
 * LND Lightning provider: the real Lightning side over LND REST.
 * Talks only to the operator's own node. Invoice creation and lookup
 * use an invoice-only macaroon; paying uses a separate pay macaroon;
 * the admin macaroon is never used here.
 */
import { LightningUnavailable } from './errors';
import {
  ChannelBalance,
  CreatedInvoice,
  InvoiceState,
  LightningProvider,
  PaymentResult,
  assertSafeSats,
} from './types';

export interface LndRestConfig {
  url: string;
  invoiceMacaroon: string;
  payMacaroon?: string;
  /** Injected in tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
}

function base64ToHex(b64: string): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(b64, 'base64').toString('hex');
  const bin = atob(b64);
  let hex = '';
  for (let i = 0; i < bin.length; i++) hex += bin.charCodeAt(i).toString(16).padStart(2, '0');
  return hex;
}

export class LndLightningProvider implements LightningProvider {
  private readonly config: LndRestConfig;

  constructor(config: LndRestConfig) {
    this.config = config;
  }

  private get fetchFn(): typeof fetch {
    const fn = this.config.fetchFn || fetch;
    if (typeof fn !== 'function') throw new LightningUnavailable();
    return fn;
  }

  private baseUrl(): string {
    const url = String(this.config.url || '').replace(/\/+$/, '');
    if (!url || !this.config.invoiceMacaroon) throw new LightningUnavailable();
    return url;
  }

  private async call(path: string, macaroon: string, init?: { method?: string; body?: unknown }): Promise<unknown> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl()}${path}`, {
        method: init?.method || 'GET',
        headers: {
          'Grpc-Metadata-macaroon': macaroon,
          'Content-Type': 'application/json',
        },
        body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch {
      throw new LightningUnavailable();
    }
    const text = await res.text().catch(() => '');
    // Streaming calls (routerrpc) answer one JSON object per line.
    const lastLine = text.trim().split('\n').filter(Boolean).at(-1) || '';
    let data: Record<string, unknown> = {};
    try {
      data = (lastLine ? JSON.parse(lastLine) : {}) as Record<string, unknown>;
    } catch {
      throw new LightningUnavailable(`LND answered with a non-JSON reply on ${path}.`);
    }
    if (!res.ok) {
      const message =
        (data as { message?: string }).message ||
        (data as { error?: string }).error ||
        `HTTP ${res.status}`;
      throw new LightningUnavailable(`LND error on ${path}: ${String(message).slice(0, 200)}`);
    }
    return data;
  }

  async createInvoice(sats: number, memo: string): Promise<CreatedInvoice> {
    assertSafeSats(sats, 'invoice amount');
    if (sats <= 0) throw new LightningUnavailable('A positive invoice amount is required.');
    const data = (await this.call('/v1/invoices', this.config.invoiceMacaroon, {
      method: 'POST',
      body: { value: sats, memo: memo || 'YeBente payment', expiry: 600 },
    })) as { payment_request?: string; r_hash?: string };
    if (!data.payment_request || !data.r_hash) {
      throw new LightningUnavailable('LND did not return an invoice.');
    }
    return {
      invoice: data.payment_request,
      paymentHash: base64ToHex(data.r_hash),
      expiresAt: Date.now() + 600_000,
    };
  }

  async invoiceStatus(paymentHash: string): Promise<InvoiceState> {
    const clean = String(paymentHash || '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(clean)) throw new LightningUnavailable('Invalid payment hash.');
    const data = (await this.call(
      `/v1/invoice/${clean}`,
      this.config.invoiceMacaroon,
    )) as { settled?: boolean; creation_date?: string; expiry?: string };
    if (data.settled === true) return 'settled';
    const created = Number(data.creation_date) || 0;
    const expirySeconds = Number(data.expiry) || 0;
    if (created > 0 && expirySeconds > 0 && created + expirySeconds < Date.now() / 1000) {
      return 'expired';
    }
    return 'pending';
  }

  async payInvoice(invoice: string, feeLimitSats: number): Promise<PaymentResult> {
    const payMacaroon = this.config.payMacaroon;
    if (!payMacaroon) {
      throw new LightningUnavailable('Paying is not switched on: no pay macaroon is configured.');
    }
    const pr = String(invoice || '').trim();
    if (!pr) throw new LightningUnavailable('An invoice is required.');
    const feeLimit = Math.max(0, Math.floor(Number(feeLimitSats) || 0));
    let data: Record<string, unknown>;
    try {
      data = (await this.call('/v2/router/send', payMacaroon, {
        method: 'POST',
        body: {
          payment_request: pr,
          fee_limit_sat: String(feeLimit),
          timeout_seconds: 60,
          no_inflight_updates: true,
          allow_self_payment: false,
        },
      })) as Record<string, unknown>;
    } catch (error) {
      // Only the node's own FAILED is final. Anything else (timeout,
      // dropped connection) may come while the node is still paying.
      return { state: 'unknown', error: error instanceof Error ? error.message : undefined };
    }
    const result = (data.result || data) as {
      status?: string;
      fee_sat?: string;
      payment_preimage?: string;
      failure_reason?: string;
    };
    if (result.status === 'SUCCEEDED') {
      return {
        state: 'succeeded',
        feeSats: Number(result.fee_sat || 0),
        preimage: result.payment_preimage || undefined,
      };
    }
    if (result.status === 'FAILED') {
      const reason = String(result.failure_reason || 'The payment failed.')
        .replace(/^FAILURE_REASON_/, '')
        .toLowerCase()
        .replace(/_/g, ' ');
      return { state: 'failed', error: reason };
    }
    return { state: 'unknown' };
  }

  async channelBalance(): Promise<ChannelBalance> {
    const macaroon = this.config.payMacaroon || this.config.invoiceMacaroon;
    const balance = (await this.call('/v1/balance/channels', macaroon)) as {
      balance?: string;
    };
    const outboundSats = Number(balance.balance || 0);
    // Inbound capacity is the remote balance across active channels.
    const channels = (await this.call('/v1/channels?active_only=true', macaroon)) as {
      channels?: Array<{
        active?: boolean;
        remote_balance?: string;
        local_balance?: string;
        local_chan_reserve_sat?: string;
        local_constraints?: { chan_reserve_sat?: string };
      }>;
    };
    let inboundSats = 0;
    let spendable = 0;
    for (const channel of channels.channels || []) {
      if (channel.active === false) continue;
      inboundSats += Number(channel.remote_balance || 0);
      const local = Number(channel.local_balance || 0);
      const reserve = Number(
        channel.local_constraints?.chan_reserve_sat ?? channel.local_chan_reserve_sat ?? 0,
      );
      spendable += Math.max(0, local - reserve);
    }
    return {
      outboundSats: Number.isFinite(spendable) ? spendable : Math.max(0, outboundSats),
      inboundSats: Math.max(0, inboundSats),
    };
  }
}

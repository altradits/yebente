/**
 * Provider interfaces (ports). The app core talks only to these
 * interfaces. Default implementations talk to Bitcoin Core, to LND,
 * or to YeBente's own modules (owner-set price). Fiat rails and
 * notification channels plug in behind the generic contracts from
 * docs/independence.md; nothing vendor-specific may leak into these
 * shapes.
 *
 * Money rules shared by all providers:
 * - Sats are integers, never floats.
 * - Fiat amounts cross these interfaces in MINOR units (cents), never
 *   floats, so 10.00 KES is 1000.
 * - No amount may exceed 21 million BTC (2_100_000_000_000_000 sats)
 *   or leave safe-integer range.
 */
export type FiatCurrency = 'KES' | 'ETB' | 'USD';

export const MAX_MONEY_SATS = 2_100_000_000_000_000;

export function assertSafeSats(sats: number, what: string): void {
  if (!Number.isSafeInteger(sats) || sats < 0 || sats > MAX_MONEY_SATS) {
    throw new Error(`${what} is out of range: ${String(sats)}`);
  }
}

/** A quoted BTC/fiat rate with its provenance. */
export interface PriceSnapshot {
  base: 'BTC';
  /** Major units of fiat per 1 BTC, e.g. { KES: 13500000 }. */
  quotes: Record<FiatCurrency, number>;
  /** Who set it: 'owner' for the owner-set rate, otherwise documented. */
  source: string;
  /** Unix ms when the rate took effect. */
  at: number;
}

export interface PriceProvider {
  getRates(): Promise<PriceSnapshot>;
}

/** Convert fiat minor units to sats at a snapshot rate. */
export function fiatMinorToSats(minor: number, currency: FiatCurrency, snapshot: PriceSnapshot): number {
  const perBtc = snapshot.quotes[currency];
  if (!(perBtc > 0)) throw new Error(`No ${currency} rate in snapshot`);
  const sats = Math.floor((minor / 100 / perBtc) * 100_000_000);
  assertSafeSats(sats, 'quoted sats');
  return sats;
}

/** Convert sats to fiat minor units at a snapshot rate. */
export function satsToFiatMinor(sats: number, currency: FiatCurrency, snapshot: PriceSnapshot): number {
  const perBtc = snapshot.quotes[currency];
  if (!(perBtc > 0)) throw new Error(`No ${currency} rate in snapshot`);
  assertSafeSats(sats, 'sats');
  return Math.round((sats / 100_000_000) * perBtc * 100);
}

/* ------------------------------------------------------------------ */
/* Bitcoin chain (Bitcoin Core)                                          */
/* ------------------------------------------------------------------ */

export type AddressKind = 'segwit' | 'taproot';

export interface ChainStatus {
  chain: string;
  height: number;
  synced: boolean;
  tipHash: string;
}

export interface AddressBalance {
  confirmedSats: number;
  unconfirmedSats: number;
}

export interface ChainProvider {
  getStatus(): Promise<ChainStatus>;
  newAddress(kind: AddressKind): Promise<string>;
  /** Balance of an address the node watches (watch-only is enough). */
  getBalance(address: string): Promise<AddressBalance>;
  /** Feerate in sat/vB for the confirmation target. Never guessed. */
  estimateFee(targetBlocks: number): Promise<number>;
  /** Spend from the node wallet. Server-side only. */
  send(toAddress: string, sats: number, feeRateSatVb: number): Promise<{ txid: string }>;
}

/* ------------------------------------------------------------------ */
/* Lightning (LND)                                                       */
/* ------------------------------------------------------------------ */

export type InvoiceState = 'pending' | 'settled' | 'expired';
export type PaymentState = 'succeeded' | 'failed' | 'unknown';

export interface CreatedInvoice {
  invoice: string;
  paymentHash: string;
  expiresAt: number;
}

export interface PaymentResult {
  state: PaymentState;
  feeSats?: number;
  preimage?: string;
  error?: string;
}

export interface ChannelBalance {
  /** Local balance minus the channel reserve: what can be sent. */
  outboundSats: number;
  /** Remote balance: what can be received. */
  inboundSats: number;
}

export interface LightningProvider {
  createInvoice(sats: number, memo: string): Promise<CreatedInvoice>;
  invoiceStatus(paymentHash: string): Promise<InvoiceState>;
  /**
   * Pay an invoice. 'unknown' means the node never gave a final
   * answer: check again before refunding; never retry blindly.
   */
  payInvoice(invoice: string, feeLimitSats: number): Promise<PaymentResult>;
  channelBalance(): Promise<ChannelBalance>;
}

/* ------------------------------------------------------------------ */
/* Fiat rails (generic adapter contracts)                                */
/* ------------------------------------------------------------------ */

export type FiatState = 'pending' | 'paid' | 'failed';

export interface FiatQuote {
  quoteId: string;
  currency: FiatCurrency;
  /** Fiat leg in minor units. */
  fiatMinor: number;
  /** Fee taken in fiat minor units. */
  feeFiatMinor: number;
  /** Sats leg. */
  sats: number;
  /** Fee taken in sats (off-ramp Lightning leg, else 0). */
  feeSats: number;
  rateUsed: number;
  rateSource: string;
  rateAt: number;
  expiresAt: number;
}

export interface FiatTransfer {
  reference: string;
  state: FiatState;
  receipt?: string;
  paidAt?: string;
}

export interface CollectInput {
  quoteId: string;
  /** E.164 digits without '+', e.g. 254707172370. */
  phone: string;
  /** Fresh UUID per user action, stored with the record. */
  idempotencyKey: string;
}

export interface SettlementRecord {
  reference: string;
  idempotencyKey: string;
  state: FiatState;
  fiatMinor: number;
  currency: FiatCurrency;
  receipt?: string;
  at: string;
}

/** Collect fiat from a customer (money in). */
export interface FiatOnRamp {
  readonly rail: string;
  quote(fiatMinor: number, currency: FiatCurrency): Promise<FiatQuote>;
  collect(input: CollectInput): Promise<FiatTransfer>;
  status(reference: string): Promise<FiatTransfer>;
  /** Daily reconciliation feed. */
  listSettlements?(since: string): Promise<SettlementRecord[]>;
}

/** Pay fiat to a customer (money out). */
export interface FiatOffRamp {
  readonly rail: string;
  quote(sats: number, currency: FiatCurrency): Promise<FiatQuote>;
  payout(input: CollectInput): Promise<FiatTransfer>;
  status(reference: string): Promise<FiatTransfer>;
  /** Operator disbursement float in minor units. */
  floatBalance(currency: FiatCurrency): Promise<number>;
  /** Verified account names only; a miss reports found: false. */
  resolveAccount?(account: string): Promise<{ found: boolean; name?: string }>;
  /** Daily reconciliation feed. */
  listSettlements?(since: string): Promise<SettlementRecord[]>;
}

/* ------------------------------------------------------------------ */
/* Notifications                                                         */
/* ------------------------------------------------------------------ */

export type NotifyChannel = 'email' | 'sms';
export type NotifyKind = 'receipt' | 'security' | 'recovery' | 'info';

export interface NotifyInput {
  channel: NotifyChannel;
  to: string;
  kind: NotifyKind;
  subject?: string;
  body: string;
}

export interface Notifications {
  send(input: NotifyInput): Promise<void>;
}

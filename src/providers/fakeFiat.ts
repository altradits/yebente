/**
 * Fake fiat adapters. They implement the exact generic contracts from
 * docs/independence.md (quotes, idempotent collect/payout, status,
 * float gate, reconciliation feed) against in-memory state, so tests
 * and local development never need a money network. They settle
 * instantly when autoSettle is on and stay pending otherwise; the
 * live behavior (pending until the network confirms) is the default.
 */
import { FiatRejected, FiatUnknown } from './errors';
import {
  CollectInput,
  FiatCurrency,
  FiatOffRamp,
  FiatOnRamp,
  FiatQuote,
  FiatTransfer,
  PriceProvider,
  SettlementRecord,
  assertSafeSats,
  fiatMinorToSats,
  satsToFiatMinor,
} from './types';

export interface FakeFiatOptions {
  rail?: string;
  /** Percent fee on the fiat leg, e.g. 1 for 1%. Default 0. */
  feePercent?: number;
  /** Minimum and maximum single transfer in fiat minor units. */
  minFiatMinor?: number;
  maxFiatMinor?: number;
  /** Settle transfers immediately instead of leaving them pending. */
  autoSettle?: boolean;
  /** Starting disbursement float in fiat minor units. */
  floatMinor?: number;
  /** phone -> verified name for resolveAccount. */
  accounts?: Record<string, string>;
  /** Fail the next call this way, once, then behave normally. */
  failNext?: 'rejected' | 'unknown';
}

interface StoredTransfer extends FiatTransfer {
  idempotencyKey: string;
  fiatMinor: number;
  currency: FiatCurrency;
  quoteId: string;
}

let quoteCounter = 0;
let referenceCounter = 0;

function newId(prefix: string): string {
  if (prefix === 'Q') return `Q-${Date.now().toString(36)}-${++quoteCounter}`;
  return `FAKE-${Date.now().toString(36)}-${++referenceCounter}`.toUpperCase();
}

function validPhone(phone: string): boolean {
  return /^[1-9][0-9]{7,14}$/.test(String(phone || '').trim());
}

abstract class FakeRail {
  readonly rail: string;
  protected readonly price: PriceProvider;
  protected readonly options: Required<Omit<FakeFiatOptions, 'rail' | 'accounts' | 'failNext'>> & {
    accounts: Record<string, string>;
    failNext: FakeFiatOptions['failNext'];
  };
  protected readonly transfers = new Map<string, StoredTransfer>();
  protected readonly byIdempotency = new Map<string, string>();

  constructor(price: PriceProvider, options: FakeFiatOptions = {}) {
    this.rail = options.rail || 'fake';
    this.price = price;
    this.options = {
      feePercent: options.feePercent ?? 0,
      minFiatMinor: options.minFiatMinor ?? 1,
      maxFiatMinor: options.maxFiatMinor ?? Number.MAX_SAFE_INTEGER,
      autoSettle: options.autoSettle ?? false,
      floatMinor: options.floatMinor ?? 0,
      accounts: options.accounts ?? {},
      failNext: options.failNext,
    };
  }

  protected maybeFail(): void {
    const fail = this.options.failNext;
    this.options.failNext = undefined;
    if (fail === 'rejected') throw new FiatRejected('Fake rail refused this transfer (scripted).');
    if (fail === 'unknown') throw new FiatUnknown('Fake rail answered unclearly (scripted).');
  }

  protected checkRange(fiatMinor: number): void {
    if (!Number.isSafeInteger(fiatMinor) || fiatMinor <= 0) {
      throw new FiatRejected('A positive amount is required.');
    }
    if (fiatMinor < this.options.minFiatMinor || fiatMinor > this.options.maxFiatMinor) {
      throw new FiatRejected(
        `Amount is outside this rail's range (${this.options.minFiatMinor} to ${this.options.maxFiatMinor} minor units).`,
      );
    }
  }

  protected checkPhone(phone: string): void {
    if (!validPhone(phone)) {
      throw new FiatRejected('A valid phone number in E.164 digits (no +) is required.');
    }
  }

  protected checkIdempotency(input: CollectInput): StoredTransfer | null {
    if (!input.idempotencyKey || !input.quoteId) {
      throw new FiatRejected('A quote id and an idempotency key are required.');
    }
    const existing = this.byIdempotency.get(input.idempotencyKey);
    if (existing) {
      const stored = this.transfers.get(existing);
      if (stored) return stored;
    }
    return null;
  }

  protected settleIfAuto(stored: StoredTransfer): StoredTransfer {
    if (this.options.autoSettle && stored.state === 'pending') {
      stored.state = 'paid';
      stored.paidAt = new Date().toISOString();
      stored.receipt = stored.receipt || `RCPT-${stored.reference}`;
    }
    return stored;
  }

  async status(reference: string): Promise<FiatTransfer> {
    const stored = this.transfers.get(String(reference || ''));
    if (!stored) throw new FiatRejected(`Unknown reference: ${String(reference || '').slice(0, 40)}`);
    this.settleIfAuto(stored);
    const { reference: ref, state, receipt, paidAt } = stored;
    return { reference: ref, state, receipt, paidAt };
  }

  async listSettlements(since: string): Promise<SettlementRecord[]> {
    const from = Date.parse(since || '') || 0;
    const records: SettlementRecord[] = [];
    for (const stored of this.transfers.values()) {
      const at = stored.paidAt || '';
      if (at && Date.parse(at) >= from) {
        records.push({
          reference: stored.reference,
          idempotencyKey: stored.idempotencyKey,
          state: stored.state,
          fiatMinor: stored.fiatMinor,
          currency: stored.currency,
          receipt: stored.receipt,
          at,
        });
      }
    }
    return records;
  }

  /** Test helper: drive a pending transfer to paid or failed. */
  settle(reference: string, state: 'paid' | 'failed', receipt?: string): FiatTransfer {
    const stored = this.transfers.get(String(reference || ''));
    if (!stored) throw new FiatRejected(`Unknown reference: ${String(reference || '').slice(0, 40)}`);
    stored.state = state;
    if (state === 'paid') {
      stored.paidAt = new Date().toISOString();
      stored.receipt = receipt || `RCPT-${stored.reference}`;
    }
    const { reference: ref, state: endState, receipt: endReceipt, paidAt } = stored;
    return { reference: ref, state: endState, receipt: endReceipt, paidAt };
  }
}

export class FakeOnRamp extends FakeRail implements FiatOnRamp {
  async quote(fiatMinor: number, currency: FiatCurrency): Promise<FiatQuote> {
    this.maybeFail();
    this.checkRange(fiatMinor);
    const snapshot = await this.price.getRates();
    const feeFiatMinor = Math.round((fiatMinor * this.options.feePercent) / 100);
    const sats = fiatMinorToSats(fiatMinor - feeFiatMinor, currency, snapshot);
    assertSafeSats(sats, 'quoted sats');
    return {
      quoteId: newId('Q'),
      currency,
      fiatMinor,
      feeFiatMinor,
      sats,
      feeSats: 0,
      rateUsed: snapshot.quotes[currency],
      rateSource: snapshot.source,
      rateAt: snapshot.at,
      expiresAt: Date.now() + 5 * 60_000,
    };
  }

  async collect(input: CollectInput): Promise<FiatTransfer> {
    this.maybeFail();
    const replay = this.checkIdempotency(input);
    if (replay) {
      const { reference, state, receipt, paidAt } = replay;
      return { reference, state, receipt, paidAt };
    }
    this.checkPhone(input.phone);
    const stored: StoredTransfer = {
      reference: newId('R'),
      state: 'pending',
      idempotencyKey: input.idempotencyKey,
      fiatMinor: 0,
      currency: 'KES',
      quoteId: input.quoteId,
    };
    this.transfers.set(stored.reference, stored);
    this.byIdempotency.set(input.idempotencyKey, stored.reference);
    this.settleIfAuto(stored);
    const { reference, state, receipt, paidAt } = stored;
    return { reference, state, receipt, paidAt };
  }
}

export class FakeOffRamp extends FakeRail implements FiatOffRamp {
  async quote(sats: number, currency: FiatCurrency): Promise<FiatQuote> {
    this.maybeFail();
    assertSafeSats(sats, 'quoted sats');
    if (sats <= 0) throw new FiatRejected('A positive sats amount is required.');
    const snapshot = await this.price.getRates();
    const fiatMinor = satsToFiatMinor(sats, currency, snapshot);
    const feeFiatMinor = Math.round((fiatMinor * this.options.feePercent) / 100);
    this.checkRange(fiatMinor - feeFiatMinor);
    return {
      quoteId: newId('Q'),
      currency,
      fiatMinor: fiatMinor - feeFiatMinor,
      feeFiatMinor,
      sats,
      feeSats: 0,
      rateUsed: snapshot.quotes[currency],
      rateSource: snapshot.source,
      rateAt: snapshot.at,
      expiresAt: Date.now() + 5 * 60_000,
    };
  }

  async payout(input: CollectInput): Promise<FiatTransfer> {
    this.maybeFail();
    const replay = this.checkIdempotency(input);
    if (replay) {
      const { reference, state, receipt, paidAt } = replay;
      return { reference, state, receipt, paidAt };
    }
    this.checkPhone(input.phone);
    const stored: StoredTransfer = {
      reference: newId('R'),
      state: 'pending',
      idempotencyKey: input.idempotencyKey,
      fiatMinor: 0,
      currency: 'KES',
      quoteId: input.quoteId,
    };
    this.transfers.set(stored.reference, stored);
    this.byIdempotency.set(input.idempotencyKey, stored.reference);
    this.settleIfAuto(stored);
    const { reference, state, receipt, paidAt } = stored;
    return { reference, state, receipt, paidAt };
  }

  async floatBalance(_currency: FiatCurrency): Promise<number> {
    return this.options.floatMinor;
  }

  async resolveAccount(account: string): Promise<{ found: boolean; name?: string }> {
    const clean = String(account || '').trim();
    const name = this.options.accounts[clean];
    if (name) return { found: true, name };
    return { found: false };
  }
}

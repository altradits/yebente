/**
 * Unavailable providers: the honest default when the operator has not
 * configured a capability. Every method fails with "not available
 * yet" instead of faking a result.
 */
import {
  ChainUnavailable,
  FiatNotConfigured,
  LightningUnavailable,
  NotifyUnavailable,
  PriceUnavailable,
} from './errors';
import {
  AddressBalance,
  AddressKind,
  ChainProvider,
  ChainStatus,
  ChannelBalance,
  CollectInput,
  CreatedInvoice,
  FiatCurrency,
  FiatOffRamp,
  FiatOnRamp,
  FiatQuote,
  FiatTransfer,
  InvoiceState,
  LightningProvider,
  Notifications,
  NotifyInput,
  PaymentResult,
  PriceProvider,
  PriceSnapshot,
} from './types';

export class UnavailableChainProvider implements ChainProvider {
  async getStatus(): Promise<ChainStatus> {
    throw new ChainUnavailable();
  }
  async newAddress(_kind: AddressKind): Promise<string> {
    throw new ChainUnavailable();
  }
  async getBalance(_address: string): Promise<AddressBalance> {
    throw new ChainUnavailable();
  }
  async estimateFee(_targetBlocks: number): Promise<number> {
    throw new ChainUnavailable();
  }
  async send(_toAddress: string, _sats: number, _feeRateSatVb: number): Promise<{ txid: string }> {
    throw new ChainUnavailable();
  }
}

export class UnavailableLightningProvider implements LightningProvider {
  async createInvoice(_sats: number, _memo: string): Promise<CreatedInvoice> {
    throw new LightningUnavailable();
  }
  async invoiceStatus(_paymentHash: string): Promise<InvoiceState> {
    throw new LightningUnavailable();
  }
  async payInvoice(_invoice: string, _feeLimitSats: number): Promise<PaymentResult> {
    throw new LightningUnavailable();
  }
  async channelBalance(): Promise<ChannelBalance> {
    throw new LightningUnavailable();
  }
}

export class UnavailablePriceProvider implements PriceProvider {
  async getRates(): Promise<PriceSnapshot> {
    throw new PriceUnavailable();
  }
}

export class UnavailableOnRamp implements FiatOnRamp {
  readonly rail: string;
  constructor(rail: string) {
    this.rail = rail;
  }
  async quote(_fiatMinor: number, _currency: FiatCurrency): Promise<FiatQuote> {
    throw new FiatNotConfigured(this.rail);
  }
  async collect(_input: CollectInput): Promise<FiatTransfer> {
    throw new FiatNotConfigured(this.rail);
  }
  async status(_reference: string): Promise<FiatTransfer> {
    throw new FiatNotConfigured(this.rail);
  }
}

export class UnavailableOffRamp implements FiatOffRamp {
  readonly rail: string;
  constructor(rail: string) {
    this.rail = rail;
  }
  async quote(_sats: number, _currency: FiatCurrency): Promise<FiatQuote> {
    throw new FiatNotConfigured(this.rail);
  }
  async payout(_input: CollectInput): Promise<FiatTransfer> {
    throw new FiatNotConfigured(this.rail);
  }
  async status(_reference: string): Promise<FiatTransfer> {
    throw new FiatNotConfigured(this.rail);
  }
  async floatBalance(_currency: FiatCurrency): Promise<number> {
    throw new FiatNotConfigured(this.rail);
  }
}

export class UnavailableNotifications implements Notifications {
  async send(_input: NotifyInput): Promise<void> {
    throw new NotifyUnavailable();
  }
}

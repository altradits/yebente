/**
 * Owner-set price provider: the default, dependency-free price side.
 * The operator sets the BTC/fiat rates in configuration; quotes use
 * exactly those rates. No outside price call is ever made.
 */
import { PriceUnavailable } from './errors';
import { FiatCurrency, PriceProvider, PriceSnapshot } from './types';

export interface OwnerRateConfig {
  btcKes: number;
  btcEtb: number;
  btcUsd: number;
  /** Unix ms when these rates took effect; defaults to now. */
  at?: number;
}

function validRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function isOwnerRateConfig(value: Partial<OwnerRateConfig> | null | undefined): value is OwnerRateConfig {
  if (!value) return false;
  return validRate(value.btcKes) && validRate(value.btcEtb) && validRate(value.btcUsd);
}

export class OwnerSetPriceProvider implements PriceProvider {
  private readonly config: OwnerRateConfig;

  constructor(config: OwnerRateConfig) {
    if (!isOwnerRateConfig(config)) {
      throw new PriceUnavailable('Owner-set rates are incomplete: BTC/KES, BTC/ETB and BTC/USD are all required.');
    }
    this.config = config;
  }

  async getRates(): Promise<PriceSnapshot> {
    const quotes: Record<FiatCurrency, number> = {
      KES: this.config.btcKes,
      ETB: this.config.btcEtb,
      USD: this.config.btcUsd,
    };
    return { base: 'BTC', quotes, source: 'owner', at: this.config.at || Date.now() };
  }
}

/**
 * Provider factory. Builds the provider set from operator
 * configuration. Anything the operator has not configured resolves
 * to an Unavailable provider that fails with "not available yet",
 * never to a guess or a silent no-op.
 *
 * Environment (all optional; missing means unavailable):
 * - BITCOIN_CORE_RPC_URL, BITCOIN_CORE_RPC_USER, BITCOIN_CORE_RPC_PASSWORD
 * - LND_REST_URL, LND_INVOICE_MACAROON, LND_PAY_MACAROON
 * - YEBENTE_OWNER_BTC_KES, YEBENTE_OWNER_BTC_ETB, YEBENTE_OWNER_BTC_USD
 *   (fiat per 1 BTC, major units), YEBENTE_OWNER_RATE_AT (unix ms)
 */
import { CoreChainProvider, CoreRpcConfig } from './coreChain';
import { LndLightningProvider, LndRestConfig } from './lndLightning';
import { OwnerRateConfig, OwnerSetPriceProvider, isOwnerRateConfig } from './ownerPrice';
import {
  UnavailableChainProvider,
  UnavailableLightningProvider,
  UnavailableNotifications,
  UnavailableOffRamp,
  UnavailableOnRamp,
  UnavailablePriceProvider,
} from './unavailable';
import {
  ChainProvider,
  FiatOffRamp,
  FiatOnRamp,
  LightningProvider,
  Notifications,
  PriceProvider,
} from './types';

export interface ProviderSet {
  chain: ChainProvider;
  lightning: LightningProvider;
  price: PriceProvider;
  onRamp: FiatOnRamp;
  offRamp: FiatOffRamp;
  notify: Notifications;
}

export interface ProviderConfig {
  core?: CoreRpcConfig | null;
  lnd?: LndRestConfig | null;
  ownerRates?: OwnerRateConfig | null;
  onRamp?: FiatOnRamp | null;
  offRamp?: FiatOffRamp | null;
  notify?: Notifications | null;
  /** Rail id used in "not available yet" errors. Default 'fiat'. */
  rail?: string;
}

export function createProviders(config: ProviderConfig = {}): ProviderSet {
  const rail = config.rail || 'fiat';
  return {
    chain: config.core ? new CoreChainProvider(config.core) : new UnavailableChainProvider(),
    lightning: config.lnd ? new LndLightningProvider(config.lnd) : new UnavailableLightningProvider(),
    price:
      config.ownerRates && isOwnerRateConfig(config.ownerRates)
        ? new OwnerSetPriceProvider(config.ownerRates)
        : new UnavailablePriceProvider(),
    onRamp: config.onRamp || new UnavailableOnRamp(rail),
    offRamp: config.offRamp || new UnavailableOffRamp(rail),
    notify: config.notify || new UnavailableNotifications(),
  };
}

type Env = Record<string, string | undefined>;

function clean(env: Env, key: string): string {
  return String(env[key] || '').trim();
}

function positiveNumber(env: Env, key: string): number | null {
  const raw = clean(env, key);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Build provider configuration from environment variables. */
export function configFromEnv(env: Env): ProviderConfig {
  const coreUrl = clean(env, 'BITCOIN_CORE_RPC_URL');
  const coreUser = clean(env, 'BITCOIN_CORE_RPC_USER');
  const corePassword = clean(env, 'BITCOIN_CORE_RPC_PASSWORD');
  const lndUrl = clean(env, 'LND_REST_URL');
  const lndInvoice = clean(env, 'LND_INVOICE_MACAROON');
  const lndPay = clean(env, 'LND_PAY_MACAROON');
  const btcKes = positiveNumber(env, 'YEBENTE_OWNER_BTC_KES');
  const btcEtb = positiveNumber(env, 'YEBENTE_OWNER_BTC_ETB');
  const btcUsd = positiveNumber(env, 'YEBENTE_OWNER_BTC_USD');
  const rateAt = positiveNumber(env, 'YEBENTE_OWNER_RATE_AT');

  return {
    core: coreUrl && coreUser && corePassword ? { url: coreUrl, user: coreUser, password: corePassword } : null,
    lnd:
      lndUrl && lndInvoice
        ? { url: lndUrl, invoiceMacaroon: lndInvoice, payMacaroon: lndPay || undefined }
        : null,
    ownerRates:
      btcKes && btcEtb && btcUsd
        ? { btcKes, btcEtb, btcUsd, at: rateAt || undefined }
        : null,
  };
}

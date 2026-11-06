export type WalletType = 'custodial' | 'non-custodial';

export type Currency = 'SATS' | 'BTC' | 'KES' | 'ETB' | 'USD';

/**
 * Transaction kinds. Fiat legs are generic mobile-money movements;
 * the rail (country, currency) is carried by the currency fields.
 * Stored history from older versions may still carry legacy kind
 * strings; readers must tolerate them (see storageService).
 */
export type TransactionType = 'buy_btc' | 'sell_btc' | 'send_mobile' | 'deposit_mobile' | 'receive_btc' | 'send_btc';

export type TransactionStatus = 'completed' | 'pending' | 'failed';

export interface ExchangeRates {
  btcUsd: number;
  btcKes: number;
  btcEtb: number;
  usdKes: number;
  usdEtb: number;
  change24hUsd: number;
  change24hKes: number;
  change24hEtb: number;
  lastUpdated: number;
  isLive: boolean;
  source?: 'owner' | 'cache';
}

export interface UserWallet {
  isConnected: boolean;
  type: WalletType;
  // Balances
  satsBalance: number;
  btcBalance?: number;
  // External address and labels
  nonCustodialAddress: string;
  nonCustodialLabel?: string;
  localHandle?: string;
  insertedAt?: number;
  lastSyncedAt?: number;
  onChainVerified?: boolean;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  title: string;
  timestamp: number;
  status: TransactionStatus;

  // Amounts
  fromCurrency: Currency;
  fromAmount: number;
  toCurrency?: Currency;
  toAmount?: number;

  // Details
  rateUsed?: number;
  fee: number;
  feeCurrency: Currency;

  // Real transaction cost tracking
  realFeeSats?: number;
  realFeeFiat?: number;
  realFeeCurrency?: Currency;
  feeRateSatPerVb?: number;
  feeSource?: 'node' | 'fixed';

  // Offline transaction metadata
  isOffline?: boolean;
  offlineStatus?: 'synced' | 'queued' | 'staged';
  syncedAt?: number;

  recipient?: string; // Phone number or BTC address
  referenceNumber: string; // Money-network receipt code or BTC TXID
  walletType: WalletType;
  note?: string;
  receiptUrl?: string; // Operator receipt reference, when the rail publishes one
  paymentHash?: string; // Lightning payment hash
}

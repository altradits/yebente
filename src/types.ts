export type WalletType = 'custodial' | 'non-custodial';

export type Currency = 'BTC' | 'KES' | 'ETB' | 'USD';

export type TransactionType = 'buy_btc' | 'sell_btc' | 'send_mpesa' | 'send_telebirr';

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
}

export interface UserWallet {
  type: WalletType;
  // Balances
  btcBalance: number;
  mpesaBalanceKes: number;
  telebirrBalanceEtb: number;
  // Non-custodial details
  nonCustodialAddress: string;
  nonCustodialLabel?: string;
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
  recipient?: string; // Phone number or BTC address
  referenceNumber: string; // e.g. M-Pesa code QWE892, Telebirr code TB238, or BTC TXID
  walletType: WalletType;
  note?: string;
}

import { Transaction, UserWallet, WalletType } from '../types';

const WALLET_STORAGE_KEY = 'altradits_user_wallet_v1';
const TXS_STORAGE_KEY = 'altradits_transactions_v1';

export const DEFAULT_WALLET: UserWallet = {
  type: 'custodial',
  btcBalance: 0.04825,
  mpesaBalanceKes: 48500,
  telebirrBalanceEtb: 42000,
  nonCustodialAddress: 'bc1q9x38n7c4g2lpxym56d2t8k0l09a2q8u9478f7e',
  nonCustodialLabel: 'Hardware / Coldcard Key',
};

const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'tx_001',
    type: 'buy_btc',
    title: 'Bought BTC via M-Pesa',
    timestamp: Date.now() - 1000 * 60 * 42, // 42 mins ago
    status: 'completed',
    fromCurrency: 'KES',
    fromAmount: 25000,
    toCurrency: 'BTC',
    toAmount: 0.00219,
    rateUsed: 11415500,
    fee: 150,
    feeCurrency: 'KES',
    recipient: 'In-App Custodial Vault',
    referenceNumber: 'SAF-MP-TK89234812',
    walletType: 'custodial',
    note: 'Instant M-Pesa express checkout',
  },
  {
    id: 'tx_002',
    type: 'send_mpesa',
    title: 'Sent M-Pesa Transfer',
    timestamp: Date.now() - 1000 * 60 * 180, // 3 hours ago
    status: 'completed',
    fromCurrency: 'KES',
    fromAmount: 5000,
    fee: 28,
    feeCurrency: 'KES',
    recipient: '+254 712 345 678',
    referenceNumber: 'SAF-MP-RJ77109241',
    walletType: 'custodial',
    note: 'Payment to Merchant / Till',
  },
  {
    id: 'tx_003',
    type: 'send_telebirr',
    title: 'Sent Telebirr Transfer',
    timestamp: Date.now() - 1000 * 60 * 60 * 12, // 12 hours ago
    status: 'completed',
    fromCurrency: 'ETB',
    fromAmount: 3500,
    fee: 5,
    feeCurrency: 'ETB',
    recipient: '+251 911 234 567',
    referenceNumber: 'ETHIO-TB-8941092834',
    walletType: 'custodial',
    note: 'Family remittance Addis Ababa',
  },
  {
    id: 'tx_004',
    type: 'sell_btc',
    title: 'Sold BTC to M-Pesa',
    timestamp: Date.now() - 1000 * 60 * 60 * 36, // 1.5 days ago
    status: 'completed',
    fromCurrency: 'BTC',
    fromAmount: 0.005,
    toCurrency: 'KES',
    toAmount: 56900,
    rateUsed: 11380000,
    fee: 0.00002,
    feeCurrency: 'BTC',
    recipient: '+254 722 987 654',
    referenceNumber: 'BTC-TX-98fa71d3c01',
    walletType: 'custodial',
    note: 'Cash out to Safaricom line',
  },
];

export function getStoredWallet(): UserWallet {
  try {
    const raw = localStorage.getItem(WALLET_STORAGE_KEY);
    if (raw) {
      return { ...DEFAULT_WALLET, ...JSON.parse(raw) };
    }
  } catch {
    // fallback
  }
  return DEFAULT_WALLET;
}

export function saveStoredWallet(wallet: UserWallet): void {
  try {
    localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(wallet));
  } catch {
    // ignore
  }
}

export function getStoredTransactions(): Transaction[] {
  try {
    const raw = localStorage.getItem(TXS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch {
    // fallback
  }
  return INITIAL_TRANSACTIONS;
}

export function saveStoredTransactions(txs: Transaction[]): void {
  try {
    localStorage.setItem(TXS_STORAGE_KEY, JSON.stringify(txs));
  } catch {
    // ignore
  }
}

export function addTransaction(
  newTx: Omit<Transaction, 'id' | 'timestamp'>,
  currentWallet: UserWallet
): { updatedWallet: UserWallet; updatedTransactions: Transaction[] } {
  const fullTx: Transaction = {
    ...newTx,
    id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: Date.now(),
  };

  const updatedWallet: UserWallet = { ...currentWallet };

  // Adjust wallet balances according to transaction type
  if (newTx.walletType === 'custodial') {
    switch (newTx.type) {
      case 'buy_btc':
        if (newTx.toCurrency === 'BTC' && newTx.toAmount) {
          updatedWallet.btcBalance += newTx.toAmount;
        }
        if (newTx.fromCurrency === 'KES') {
          updatedWallet.mpesaBalanceKes = Math.max(0, updatedWallet.mpesaBalanceKes - (newTx.fromAmount + newTx.fee));
        } else if (newTx.fromCurrency === 'ETB') {
          updatedWallet.telebirrBalanceEtb = Math.max(0, updatedWallet.telebirrBalanceEtb - (newTx.fromAmount + newTx.fee));
        }
        break;

      case 'sell_btc':
        if (newTx.fromCurrency === 'BTC') {
          updatedWallet.btcBalance = Math.max(0, updatedWallet.btcBalance - (newTx.fromAmount + (newTx.feeCurrency === 'BTC' ? newTx.fee : 0)));
        }
        if (newTx.toCurrency === 'KES' && newTx.toAmount) {
          updatedWallet.mpesaBalanceKes += newTx.toAmount;
        } else if (newTx.toCurrency === 'ETB' && newTx.toAmount) {
          updatedWallet.telebirrBalanceEtb += newTx.toAmount;
        }
        break;

      case 'send_mpesa':
        updatedWallet.mpesaBalanceKes = Math.max(0, updatedWallet.mpesaBalanceKes - (newTx.fromAmount + newTx.fee));
        break;

      case 'send_telebirr':
        updatedWallet.telebirrBalanceEtb = Math.max(0, updatedWallet.telebirrBalanceEtb - (newTx.fromAmount + newTx.fee));
        break;
    }
  } else {
    // Non-custodial: if selling, external address sends BTC; if buying, BTC goes straight to external address.
    // If sending M-Pesa or Telebirr fiat, it deducts from mobile balance if funded.
    if (newTx.type === 'send_mpesa') {
      updatedWallet.mpesaBalanceKes = Math.max(0, updatedWallet.mpesaBalanceKes - (newTx.fromAmount + newTx.fee));
    } else if (newTx.type === 'send_telebirr') {
      updatedWallet.telebirrBalanceEtb = Math.max(0, updatedWallet.telebirrBalanceEtb - (newTx.fromAmount + newTx.fee));
    } else if (newTx.type === 'sell_btc') {
      if (newTx.toCurrency === 'KES' && newTx.toAmount) {
        updatedWallet.mpesaBalanceKes += newTx.toAmount;
      } else if (newTx.toCurrency === 'ETB' && newTx.toAmount) {
        updatedWallet.telebirrBalanceEtb += newTx.toAmount;
      }
    }
  }

  saveStoredWallet(updatedWallet);

  const currentTxs = getStoredTransactions();
  const updatedTransactions = [fullTx, ...currentTxs];
  saveStoredTransactions(updatedTransactions);

  return { updatedWallet, updatedTransactions };
}

import { Transaction, UserWallet, WalletType } from '../types';

const WALLET_STORAGE_KEY = 'altradits_user_wallet_v1';
const TXS_STORAGE_KEY = 'altradits_transactions_v1';

export const DEFAULT_WALLET: UserWallet = {
  isConnected: false,
  type: 'custodial',
  satsBalance: 0,
  btcBalance: 0,
  mpesaBalanceKes: 0,
  telebirrBalanceEtb: 0,
  nonCustodialAddress: '',
  nonCustodialLabel: '',
  insertedAt: Date.now(),
};

export const DISCONNECTED_WALLET: UserWallet = {
  isConnected: false,
  type: 'non-custodial',
  satsBalance: 0,
  btcBalance: 0,
  mpesaBalanceKes: 0,
  telebirrBalanceEtb: 0,
  nonCustodialAddress: '',
  nonCustodialLabel: '',
};

const INITIAL_TRANSACTIONS: Transaction[] = [];

export function getStoredWallet(): UserWallet {
  try {
    const raw = localStorage.getItem(WALLET_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // If the wallet is disconnected or ejected, all balances must strictly be 0
      if (!parsed || !parsed.isConnected) {
        return { ...DISCONNECTED_WALLET };
      }

      // Clear legacy mock seed data if present in localStorage
      if (parsed.nonCustodialAddress === 'bc1q9x38n7c4g2lpxym56d2t8k0l09a2q8u9478f7e') {
        parsed.nonCustodialAddress = '';
      }
      if (parsed.satsBalance === 4825000 || parsed.mpesaBalanceKes === 48500) {
        parsed.satsBalance = 0;
        parsed.btcBalance = 0;
      }
      const sats = typeof parsed.satsBalance === 'number'
        ? parsed.satsBalance
        : (typeof parsed.btcBalance === 'number' && parsed.btcBalance > 0
          ? Math.round(parsed.btcBalance * 100_000_000)
          : 0);

      // M-Pesa and Telebirr are payment rails, not in-app fiat balances. Always enforce 0.
      return {
        ...DEFAULT_WALLET,
        ...parsed,
        isConnected: true,
        satsBalance: Math.max(0, sats),
        btcBalance: Math.max(0, sats) / 100_000_000,
        mpesaBalanceKes: 0,
        telebirrBalanceEtb: 0,
      };
    }
  } catch {
    // fallback
  }
  return { ...DISCONNECTED_WALLET };
}

export function saveStoredWallet(wallet: UserWallet): void {
  try {
    localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(wallet));
  } catch {
    // ignore
  }
}

export function ejectWallet(_currentWallet?: UserWallet): UserWallet {
  const ejected: UserWallet = {
    ...DISCONNECTED_WALLET,
  };
  saveStoredWallet(ejected);
  return ejected;
}

export function wipeWallet(): UserWallet {
  try {
    localStorage.removeItem(WALLET_STORAGE_KEY);
  } catch {
    // ignore
  }
  return { ...DISCONNECTED_WALLET };
}

export function getStoredTransactions(): Transaction[] {
  try {
    const raw = localStorage.getItem(TXS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((t: Transaction) => {
          if (!t || typeof t !== 'object') return false;
          // Filter out legacy mock seed IDs
          if (['tx_001', 'tx_002', 'tx_003', 'tx_004'].includes(t.id)) return false;
          // Require a non-empty, authentic reference code
          if (!t.referenceNumber || typeof t.referenceNumber !== 'string' || !t.referenceNumber.trim()) return false;
          // Filter out any mock or simulated references
          if (t.referenceNumber.includes('SIM-') || t.referenceNumber.includes('MOCK-') || t.referenceNumber.includes('FALLBACK')) return false;
          // Ensure only completed transactions are preserved in history
          if (t.status !== 'completed') return false;
          return true;
        });
      }
    }
  } catch {
    // fallback
  }
  return INITIAL_TRANSACTIONS;
}

export function clearStoredTransactions(): Transaction[] {
  try {
    localStorage.removeItem(TXS_STORAGE_KEY);
  } catch {
    // ignore
  }
  return [];
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
    id: `tx_${Date.now()}_${Date.now().toString(36).slice(-4)}`,
    timestamp: Date.now(),
    status: 'completed',
  };

  const updatedWallet: UserWallet = { ...currentWallet };

  // Adjust wallet balances according to transaction type
  if (newTx.type === 'buy_btc') {
    if ((newTx.toCurrency === 'SATS' || newTx.toCurrency === 'BTC') && newTx.toAmount) {
      const satsToAdd = newTx.toCurrency === 'BTC' ? Math.round(newTx.toAmount * 100_000_000) : newTx.toAmount;
      updatedWallet.satsBalance = (updatedWallet.satsBalance || 0) + satsToAdd;
      updatedWallet.btcBalance = updatedWallet.satsBalance / 100_000_000;
      updatedWallet.lastSyncedAt = Date.now();
    }
    // Fiat is debited directly from carrier SIM via STK push, not an internal ledger
    updatedWallet.mpesaBalanceKes = 0;
    updatedWallet.telebirrBalanceEtb = 0;
  } else if (newTx.walletType === 'custodial') {
    switch (newTx.type) {
      case 'sell_btc':
        if (newTx.fromCurrency === 'SATS' || newTx.fromCurrency === 'BTC') {
          const satsDeduct = newTx.fromCurrency === 'BTC' ? Math.round(newTx.fromAmount * 100_000_000) : newTx.fromAmount;
          const feeSats = newTx.feeCurrency === 'SATS' ? newTx.fee : (newTx.feeCurrency === 'BTC' ? Math.round(newTx.fee * 100_000_000) : 0);
          updatedWallet.satsBalance = Math.max(0, (updatedWallet.satsBalance || 0) - (satsDeduct + feeSats));
          updatedWallet.btcBalance = updatedWallet.satsBalance / 100_000_000;
        }
        // Fiat payout was dispatched directly to phone via B2C; no internal fiat ledger
        updatedWallet.mpesaBalanceKes = 0;
        updatedWallet.telebirrBalanceEtb = 0;
        break;

      case 'send_mpesa':
        if (newTx.fromCurrency === 'SATS') {
          const satsDeduct = newTx.fromAmount;
          const feeSats = newTx.feeCurrency === 'SATS' ? newTx.fee : 0;
          updatedWallet.satsBalance = Math.max(0, (updatedWallet.satsBalance || 0) - (satsDeduct + feeSats));
          updatedWallet.btcBalance = updatedWallet.satsBalance / 100_000_000;
        }
        updatedWallet.mpesaBalanceKes = 0;
        break;

      case 'deposit_mpesa':
        // Carrier deposit rail - not tracked as internal fiat
        updatedWallet.mpesaBalanceKes = 0;
        break;

      case 'send_telebirr':
        updatedWallet.telebirrBalanceEtb = 0;
        break;
    }
  } else {
    // Non-custodial: external address/wallet
    updatedWallet.mpesaBalanceKes = 0;
    updatedWallet.telebirrBalanceEtb = 0;
  }

  saveStoredWallet(updatedWallet);

  const currentTxs = getStoredTransactions();
  const updatedTransactions = [fullTx, ...currentTxs];
  saveStoredTransactions(updatedTransactions);

  return { updatedWallet, updatedTransactions };
}

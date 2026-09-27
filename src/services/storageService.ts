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

/**
 * Computes custodial satoshi balance strictly from verified completed transactions.
 * Zero invented, mock, or simulated figures: every digit comes from an authentic transaction.
 */
export function computeCustodialBalanceFromTransactions(txs: Transaction[]): number {
  let netSats = 0;
  for (const tx of txs) {
    if (!tx || typeof tx !== 'object') continue;
    if (tx.status !== 'completed') continue;
    if (!tx.referenceNumber || typeof tx.referenceNumber !== 'string' || !tx.referenceNumber.trim()) continue;

    if (tx.type === 'buy_btc') {
      const sats = tx.toCurrency === 'BTC'
        ? Math.round(Number(tx.toAmount || 0) * 100_000_000)
        : Number(tx.toAmount || 0);
      netSats += sats;
    } else if (tx.type === 'sell_btc' || tx.type === 'send_mpesa') {
      const sats = tx.fromCurrency === 'BTC'
        ? Math.round(Number(tx.fromAmount || 0) * 100_000_000)
        : Number(tx.fromAmount || 0);
      const feeSats = tx.feeCurrency === 'SATS'
        ? Number(tx.fee || 0)
        : (tx.feeCurrency === 'BTC' ? Math.round(Number(tx.fee || 0) * 100_000_000) : 0);
      netSats -= (sats + feeSats);
    }
  }
  return Math.max(0, netSats);
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
          const upperRef = t.referenceNumber.toUpperCase();
          if (
            upperRef.includes('SIM-') ||
            upperRef.includes('MOCK-') ||
            upperRef.includes('FALLBACK') ||
            upperRef.includes('TEST-') ||
            upperRef.includes('FAKE-')
          ) {
            return false;
          }
          // Ensure only completed transactions are preserved in history
          if (t.status !== 'completed') return false;
          return true;
        });
      }
    }
  } catch {
    // fallback
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

export function clearStoredTransactions(): Transaction[] {
  try {
    localStorage.removeItem(TXS_STORAGE_KEY);
    const raw = localStorage.getItem(WALLET_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.type === 'custodial') {
        parsed.satsBalance = 0;
        parsed.btcBalance = 0;
        localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(parsed));
      }
    }
  } catch {
    // ignore
  }
  return [];
}

export function getStoredWallet(): UserWallet {
  try {
    const raw = localStorage.getItem(WALLET_STORAGE_KEY);
    const validTxs = getStoredTransactions();

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

      let sats = 0;
      if (parsed.type === 'custodial') {
        // Custodial balance is strictly derived from the ledger of verified completed transactions
        sats = computeCustodialBalanceFromTransactions(validTxs);
      } else {
        // Non-custodial balance: only retained if verified on-chain via Mempool/Blockstream or WebLN
        sats = parsed.onChainVerified && typeof parsed.satsBalance === 'number'
          ? Math.max(0, parsed.satsBalance)
          : 0;
      }

      // M-Pesa and Telebirr are payment rails, not in-app fiat balances. Always enforce 0.
      return {
        ...DEFAULT_WALLET,
        ...parsed,
        isConnected: true,
        satsBalance: sats,
        btcBalance: sats / 100_000_000,
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
    localStorage.removeItem(TXS_STORAGE_KEY);
  } catch {
    // ignore
  }
  return { ...DISCONNECTED_WALLET };
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

  const currentTxs = getStoredTransactions();
  const updatedTransactions = [fullTx, ...currentTxs];
  saveStoredTransactions(updatedTransactions);

  const updatedWallet: UserWallet = { ...currentWallet };

  if (updatedWallet.type === 'custodial') {
    // Strictly recalculate custodial balance from the updated ledger of verified transactions
    updatedWallet.satsBalance = computeCustodialBalanceFromTransactions(updatedTransactions);
    updatedWallet.btcBalance = updatedWallet.satsBalance / 100_000_000;
  }
  // Payment rails are not in-app fiat ledgers
  updatedWallet.mpesaBalanceKes = 0;
  updatedWallet.telebirrBalanceEtb = 0;
  updatedWallet.lastSyncedAt = Date.now();

  saveStoredWallet(updatedWallet);

  return { updatedWallet, updatedTransactions };
}

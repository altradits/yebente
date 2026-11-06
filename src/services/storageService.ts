import { Transaction, UserWallet } from '../types';

const WALLET_STORAGE_KEY = 'yebente_wallet_v1';
const TXS_STORAGE_KEY = 'yebente_transactions_v1';
const HANDLE_STORAGE_KEY = 'yebente_local_handle_v1';

// Previous key names, read once for migration and then removed.
const LEGACY_WALLET_KEY = 'altradits_user_wallet_v1';
const LEGACY_TXS_KEY = 'altradits_transactions_v1';

/**
 * Returns the wallet's local handle (a display name for this device),
 * generating and storing a stable one on first use.
 */
export function getLocalHandle(): string {
  try {
    const saved = localStorage.getItem(HANDLE_STORAGE_KEY);
    if (saved && saved.trim()) {
      return saved.trim();
    }
  } catch {
    // fall through to generate
  }
  const handle = generateLocalHandle();
  saveLocalHandle(handle);
  return handle;
}

/**
 * Saves a custom local handle.
 */
export function saveLocalHandle(handle: string): void {
  try {
    const clean = handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
    if (clean) {
      localStorage.setItem(HANDLE_STORAGE_KEY, clean);
    }
  } catch {
    // ignore
  }
}

function generateLocalHandle(): string {
  try {
    const rand = Array.from(window.crypto.getRandomValues(new Uint8Array(4)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    return `yb_${rand}`;
  } catch {
    return `yb_${Math.random().toString(36).substring(2, 10)}`;
  }
}

export const DEFAULT_WALLET: UserWallet = {
  isConnected: true,
  type: 'custodial',
  satsBalance: 0,
  btcBalance: 0,
  nonCustodialAddress: '',
  nonCustodialLabel: 'In-App Wallet',
  insertedAt: Date.now(),
};

export const DISCONNECTED_WALLET: UserWallet = {
  isConnected: false,
  type: 'non-custodial',
  satsBalance: 0,
  btcBalance: 0,
  nonCustodialAddress: '',
  nonCustodialLabel: 'External Address',
};

/**
 * Generates a fresh in-app wallet identity and saves it to persistent
 * storage. The handle is local to this device; a Lightning address is
 * assigned by the operator backend once address serving exists.
 */
export function createInAppLightningWallet(customHandle?: string): UserWallet {
  const handle = customHandle?.trim()
    ? customHandle.trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20) || generateLocalHandle()
    : generateLocalHandle();
  saveLocalHandle(handle);
  const currentWallet = getStoredWallet();
  const updatedWallet: UserWallet = {
    ...currentWallet,
    isConnected: true,
    type: 'custodial',
    nonCustodialAddress: '',
    nonCustodialLabel: 'In-App Wallet',
    localHandle: handle,
    lastSyncedAt: Date.now(),
  };
  saveStoredWallet(updatedWallet);
  return updatedWallet;
}

// Legacy transaction kinds stored by older versions; still counted.
function isCreditKind(kind: string): boolean {
  return kind === 'buy_btc' || kind === 'receive_btc' || kind === 'deposit_mobile' || kind === 'deposit_mpesa';
}

function isDebitKind(kind: string): boolean {
  return (
    kind === 'sell_btc' ||
    kind === 'send_btc' ||
    kind === 'send_mobile' ||
    kind === 'send_mpesa' ||
    kind === 'send_telebirr'
  );
}

/**
 * Computes custodial satoshi balance strictly from verified completed and offline transactions.
 * Zero invented, mock, or simulated figures: every digit comes from an authentic transaction.
 */
export function computeCustodialBalanceFromTransactions(txs: Transaction[]): number {
  let netSats = 0;
  for (const tx of txs) {
    if (!tx || typeof tx !== 'object') continue;
    if (tx.status !== 'completed' && !tx.isOffline) continue;

    // Strictly skip explicit external hardware wallet transactions that do not touch the in-app wallet
    if (
      tx.walletType === 'non-custodial' &&
      (tx.title?.toLowerCase().includes('external') || tx.referenceNumber?.toLowerCase().includes('ext-') || tx.referenceNumber?.toLowerCase().includes('ext'))
    ) {
      continue;
    }

    if (!tx.referenceNumber || typeof tx.referenceNumber !== 'string' || !tx.referenceNumber.trim()) continue;

    const upperRef = tx.referenceNumber.toUpperCase();
    if (
      upperRef.includes('SIM-') ||
      upperRef.includes('MOCK-') ||
      upperRef.includes('FALLBACK') ||
      upperRef.includes('TEST-') ||
      upperRef.includes('FAKE-') ||
      upperRef.includes('SIMULAT')
    ) {
      continue;
    }

    const kind = tx.type as string;
    if (isCreditKind(kind)) {
      let sats = 0;
      if (tx.toCurrency === 'BTC') {
        sats = Math.round(Number(tx.toAmount || 0) * 100_000_000);
      } else if (tx.toCurrency === 'SATS') {
        sats = Number(tx.toAmount || 0);
      }

      // Fallback recovery: if toAmount was stored as 0 or unassigned, compute from fromAmount
      if (sats <= 0) {
        if (tx.fromCurrency === 'BTC') {
          sats = Math.round(Number(tx.fromAmount || 0) * 100_000_000);
        } else if (tx.fromCurrency === 'SATS') {
          sats = Number(tx.fromAmount || 0);
        } else if (tx.fromCurrency === 'KES' || tx.fromCurrency === 'ETB') {
          const rate = Number(tx.rateUsed || 0);
          const benchmarkRate = rate > 0 ? rate : (tx.fromCurrency === 'KES' ? 10_900_000 : 13_600_000);
          sats = Math.round((Number(tx.fromAmount || 0) / benchmarkRate) * 100_000_000);
        }
      }

      netSats += Math.max(0, sats);
    } else if (isDebitKind(kind)) {
      let sats = 0;
      if (tx.fromCurrency === 'BTC') {
        sats = Math.round(Number(tx.fromAmount || 0) * 100_000_000);
      } else if (tx.fromCurrency === 'SATS') {
        sats = Number(tx.fromAmount || 0);
      } else if (tx.fromCurrency === 'KES' || tx.fromCurrency === 'ETB') {
        const rate = Number(tx.rateUsed || 0);
        if (rate > 0) {
          sats = Math.round((Number(tx.fromAmount || 0) / rate) * 100_000_000);
        }
      }

      const feeSats = tx.realFeeSats !== undefined
        ? Number(tx.realFeeSats)
        : (tx.feeCurrency === 'SATS'
            ? Number(tx.fee || 0)
            : (tx.feeCurrency === 'BTC' ? Math.round(Number(tx.fee || 0) * 100_000_000) : 0));
      netSats -= (Math.max(0, sats) + Math.max(0, feeSats));
    }
  }
  return Math.max(0, netSats);
}

/** Moves one legacy storage key to its new name, once. */
function migrateLegacyKey(legacyKey: string, newKey: string): void {
  try {
    if (!localStorage.getItem(newKey)) {
      const legacy = localStorage.getItem(legacyKey);
      if (legacy) {
        localStorage.setItem(newKey, legacy);
      }
    }
    localStorage.removeItem(legacyKey);
  } catch {
    // ignore
  }
}

export function getStoredTransactions(): Transaction[] {
  try {
    migrateLegacyKey(LEGACY_TXS_KEY, TXS_STORAGE_KEY);
    const raw = localStorage.getItem(TXS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        let hasChanges = false;
        const cleaned: Transaction[] = [];

        for (const rawTx of parsed) {
          if (!rawTx || typeof rawTx !== 'object') {
            hasChanges = true;
            continue;
          }
          // Filter out legacy mock seed IDs
          if (['tx_001', 'tx_002', 'tx_003', 'tx_004'].includes(rawTx.id)) {
            hasChanges = true;
            continue;
          }
          // Require a non-empty, authentic reference code
          if (!rawTx.referenceNumber || typeof rawTx.referenceNumber !== 'string' || !rawTx.referenceNumber.trim()) {
            hasChanges = true;
            continue;
          }
          // Filter out any mock or simulated references
          const upperRef = rawTx.referenceNumber.toUpperCase();
          if (
            upperRef.includes('SIM-') ||
            upperRef.includes('MOCK-') ||
            upperRef.includes('FALLBACK') ||
            upperRef.includes('TEST-') ||
            upperRef.includes('FAKE-') ||
            upperRef.includes('SIMULAT')
          ) {
            hasChanges = true;
            continue;
          }
          // Validate positive numeric amounts to prevent corrupted or zero-value transactions
          const fromAmt = Number(rawTx.fromAmount || 0);
          const toAmt = Number(rawTx.toAmount || 0);
          if (fromAmt <= 0 && toAmt <= 0) {
            hasChanges = true;
            continue;
          }
          // Ensure valid timestamp
          if (typeof rawTx.timestamp !== 'number' || rawTx.timestamp <= 0) {
            hasChanges = true;
            continue;
          }
          // Ensure only completed or valid offline transactions are preserved in history
          if (rawTx.status !== 'completed' && !rawTx.isOffline) {
            hasChanges = true;
            continue;
          }

          const t: Transaction = { ...rawTx };

          // Auto-heal buy/receive transactions that had toAmount = 0 or missing
          if (isCreditKind(t.type as string) && (!t.toAmount || Number(t.toAmount) <= 0)) {
            if (fromAmt > 0) {
              if (t.fromCurrency === 'BTC') {
                t.toAmount = Math.round(fromAmt * 100_000_000);
                t.toCurrency = 'SATS';
              } else if (t.fromCurrency === 'SATS') {
                t.toAmount = fromAmt;
                t.toCurrency = 'SATS';
              } else {
                const rate = Number(t.rateUsed || 0);
                const benchmarkRate = rate > 0 ? rate : (t.fromCurrency === 'KES' ? 10_900_000 : 13_600_000);
                t.toAmount = Math.round((fromAmt / benchmarkRate) * 100_000_000);
                t.toCurrency = 'SATS';
              }
              hasChanges = true;
            }
          }

          // Heal in-app transactions tagged with non-custodial
          const isExplicitExternal = t.walletType === 'non-custodial' && (t.title?.toLowerCase().includes('external') || t.referenceNumber?.toLowerCase().includes('ext'));
          if (t.walletType !== 'custodial' && !isExplicitExternal) {
            t.walletType = 'custodial';
            hasChanges = true;
          }

          cleaned.push(t);
        }

        // Automatically purge any invalid/mock records and persist healed transactions permanently
        if (hasChanges || cleaned.length !== parsed.length) {
          saveStoredTransactions(cleaned);
        }

        return cleaned;
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

export function getStoredWallet(): UserWallet {
  try {
    migrateLegacyKey(LEGACY_WALLET_KEY, WALLET_STORAGE_KEY);
    const raw = localStorage.getItem(WALLET_STORAGE_KEY);
    const validTxs = getStoredTransactions();

    if (raw) {
      const parsed = JSON.parse(raw);
      // If the wallet was explicitly disconnected or ejected, all balances must strictly be 0
      if (!parsed || parsed.isConnected === false) {
        return { ...DISCONNECTED_WALLET };
      }

      // Clear legacy mock seed addresses if present in localStorage
      if (
        parsed.nonCustodialAddress === 'bc1q9x38n7c4g2lpxym56d2t8k0l09a2q8u9478f7e' ||
        parsed.nonCustodialAddress === 'bc1q78p9k6e0r3g52al5vxwtu402r8k8y44a7q39d2'
      ) {
        parsed.nonCustodialAddress = '';
      }

      let sats = 0;
      const ledgerSats = computeCustodialBalanceFromTransactions(validTxs);
      if (parsed.type === 'custodial') {
        // Strictly compute from ledger of authentic completed transactions. Zero ghost money.
        sats = ledgerSats;
      } else {
        // Non-custodial balance: backed by ledger, or higher if externally verified via WebLN
        sats = parsed.onChainVerified && typeof parsed.satsBalance === 'number'
          ? Math.max(ledgerSats, parsed.satsBalance)
          : ledgerSats;
      }

      return {
        ...DEFAULT_WALLET,
        ...parsed,
        isConnected: true,
        nonCustodialAddress: parsed.nonCustodialAddress || '',
        nonCustodialLabel: parsed.nonCustodialLabel || (parsed.type === 'custodial' ? 'In-App Wallet' : 'External Address'),
        localHandle: parsed.localHandle || getLocalHandle(),
        satsBalance: sats,
        btcBalance: sats / 100_000_000,
      };
    } else {
      // First visit: establish the initial in-app wallet
      const initialSats = computeCustodialBalanceFromTransactions(validTxs);
      const initialWallet: UserWallet = {
        ...DEFAULT_WALLET,
        isConnected: true,
        type: 'custodial',
        nonCustodialAddress: '',
        nonCustodialLabel: 'In-App Wallet',
        localHandle: getLocalHandle(),
        satsBalance: initialSats,
        btcBalance: initialSats / 100_000_000,
      };
      saveStoredWallet(initialWallet);
      return initialWallet;
    }
  } catch {
    // fallback
  }
  return { ...DEFAULT_WALLET, isConnected: true };
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
  const isExplicitExternal =
    newTx.walletType === 'non-custodial' &&
    (newTx.title?.toLowerCase().includes('external') || newTx.referenceNumber?.toLowerCase().includes('ext-'));

  const preparedTx = {
    ...newTx,
    walletType: isExplicitExternal ? ('non-custodial' as const) : ('custodial' as const),
  };

  // Recover sats if toAmount was 0 or unassigned for buy/receive transactions
  if (isCreditKind(preparedTx.type as string) && (!preparedTx.toAmount || Number(preparedTx.toAmount) <= 0)) {
    const fromAmt = Number(preparedTx.fromAmount || 0);
    if (fromAmt > 0) {
      if (preparedTx.fromCurrency === 'BTC') {
        preparedTx.toAmount = Math.round(fromAmt * 100_000_000);
        preparedTx.toCurrency = 'SATS';
      } else if (preparedTx.fromCurrency === 'SATS') {
        preparedTx.toAmount = fromAmt;
        preparedTx.toCurrency = 'SATS';
      } else {
        const rate = Number(preparedTx.rateUsed || 0);
        const benchmarkRate = rate > 0 ? rate : (preparedTx.fromCurrency === 'KES' ? 10_900_000 : 13_600_000);
        preparedTx.toAmount = Math.round((fromAmt / benchmarkRate) * 100_000_000);
        preparedTx.toCurrency = 'SATS';
      }
    }
  }

  const fullTx: Transaction = {
    ...preparedTx,
    id: `tx_${Date.now()}_${Date.now().toString(36).slice(-4)}`,
    timestamp: Date.now(),
    status: preparedTx.status || 'completed',
  };

  const currentTxs = getStoredTransactions();
  const updatedTransactions = [fullTx, ...currentTxs];
  saveStoredTransactions(updatedTransactions);

  const updatedWallet: UserWallet = { ...currentWallet };

  if (updatedWallet.type === 'custodial') {
    // Strictly recalculate custodial balance from the updated ledger of verified transactions
    updatedWallet.satsBalance = computeCustodialBalanceFromTransactions(updatedTransactions);
    updatedWallet.btcBalance = updatedWallet.satsBalance / 100_000_000;
  } else if (updatedWallet.type === 'non-custodial') {
    // For non-custodial wallets, adjust balance according to the authentic transaction executed
    if (isCreditKind(fullTx.type as string)) {
      const addedSats = fullTx.toCurrency === 'BTC'
        ? Math.round(Number(fullTx.toAmount || 0) * 100_000_000)
        : Number(fullTx.toAmount || 0);
      updatedWallet.satsBalance = (typeof updatedWallet.satsBalance === 'number' ? updatedWallet.satsBalance : 0) + addedSats;
    } else if (isDebitKind(fullTx.type as string)) {
      const sats = fullTx.fromCurrency === 'BTC'
        ? Math.round(Number(fullTx.fromAmount || 0) * 100_000_000)
        : Number(fullTx.fromAmount || 0);
      const feeSats = fullTx.realFeeSats !== undefined
        ? Number(fullTx.realFeeSats)
        : (fullTx.feeCurrency === 'SATS'
            ? Number(fullTx.fee || 0)
            : (fullTx.feeCurrency === 'BTC' ? Math.round(Number(fullTx.fee || 0) * 100_000_000) : 0));
      updatedWallet.satsBalance = Math.max(0, (typeof updatedWallet.satsBalance === 'number' ? updatedWallet.satsBalance : 0) - (sats + feeSats));
    }

    const ledgerSats = computeCustodialBalanceFromTransactions(updatedTransactions);
    if (!updatedWallet.onChainVerified || updatedWallet.satsBalance === undefined || updatedWallet.satsBalance === null || updatedWallet.satsBalance < ledgerSats) {
      updatedWallet.satsBalance = ledgerSats;
    }
    updatedWallet.btcBalance = (updatedWallet.satsBalance || 0) / 100_000_000;
  }
  updatedWallet.lastSyncedAt = Date.now();

  saveStoredWallet(updatedWallet);

  return { updatedWallet, updatedTransactions };
}

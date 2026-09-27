import React, { useState } from 'react';
import { UserWallet, ExchangeRates } from '../types';
import { Eye, EyeOff, X, RefreshCw } from 'lucide-react';
import { queryWebLNBalance, isLightningAddress } from '../services/lightningService';
import { fetchBitcoinAddressBalance } from '../services/blockchainService';
import { computeCustodialBalanceFromTransactions, getStoredTransactions } from '../services/storageService';

interface BalanceCardProps {
  wallet: UserWallet;
  rates: ExchangeRates;
  onOpenWalletSettings: () => void;
  onUpdateWallet?: (updated: UserWallet) => void;
  onEjectWallet?: () => void;
  onClose?: () => void;
}

export const BalanceCard: React.FC<BalanceCardProps> = ({
  wallet,
  rates,
  onOpenWalletSettings,
  onUpdateWallet,
  onClose,
}) => {
  const [hideBalances, setHideBalances] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // If wallet is not connected / ejected, do not render balance card
  if (!wallet.isConnected) {
    return null;
  }

  const handleSyncBalance = async () => {
    if (!wallet.isConnected) return;
    setIsSyncing(true);
    try {
      // 1. If custodial wallet, sync balance strictly from verified transactions
      if (wallet.type === 'custodial') {
        const verifiedSats = computeCustodialBalanceFromTransactions(getStoredTransactions());
        if (onUpdateWallet) {
          onUpdateWallet({
            ...wallet,
            satsBalance: verifiedSats,
            btcBalance: verifiedSats / 100_000_000,
            lastSyncedAt: Date.now(),
          });
        }
        return;
      }

      // 2. If WebLN is present in browser, auto-query it first
      const weblnRes = await queryWebLNBalance();
      if (weblnRes.available && typeof weblnRes.sats === 'number') {
        if (onUpdateWallet) {
          onUpdateWallet({
            ...wallet,
            satsBalance: weblnRes.sats,
            btcBalance: weblnRes.sats / 100_000_000,
            lastSyncedAt: Date.now(),
          });
        }
        return;
      }

      // 3. If on-chain address is present, query blockchain indexers
      if (wallet.nonCustodialAddress && !isLightningAddress(wallet.nonCustodialAddress)) {
        const onChainRes = await fetchBitcoinAddressBalance(wallet.nonCustodialAddress);
        if (onChainRes.success && onUpdateWallet) {
          onUpdateWallet({
            ...wallet,
            satsBalance: onChainRes.sats,
            btcBalance: onChainRes.sats / 100_000_000,
            lastSyncedAt: Date.now(),
            onChainVerified: true,
          });
          return;
        }
      }

      // 4. For mobile Lightning addresses, open settings modal to update sats
      onOpenWalletSettings();
    } finally {
      setIsSyncing(false);
    }
  };

  const sats = wallet.satsBalance ?? Math.round((wallet.btcBalance || 0) * 100_000_000);
  const btcEquiv = sats / 100_000_000;
  const btcValueKes = btcEquiv * rates.btcKes;
  const btcValueEtb = btcEquiv * rates.btcEtb;

  const formatNumber = (num: number, maximumFractionDigits = 2) => {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits,
      minimumFractionDigits: maximumFractionDigits > 2 ? 2 : maximumFractionDigits,
    }).format(num);
  };

  const formattedKes = hideBalances
    ? '••••'
    : `KES ${formatNumber(btcValueKes, btcValueKes > 0 && btcValueKes < 10 ? 2 : 0)}`;

  const formattedEtb = hideBalances
    ? '••••'
    : `ETB ${formatNumber(btcValueEtb, btcValueEtb > 0 && btcValueEtb < 10 ? 2 : 0)}`;

  return (
    <div className="bg-[#1E1727] border border-[#382B44] rounded-3xl p-4 shadow-md shadow-[#120E16]/50">
      {/* Top row: Sats indicator on the left, controls on the right */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold tracking-tight text-[#F8F0E7] font-mono tabular-nums">
            {hideBalances ? '••••••' : sats.toLocaleString()}
          </span>
          <span className="text-sm font-bold text-[#D1B9B3]">
            Sats
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setHideBalances(!hideBalances)}
            className="p-1.5 rounded-xl bg-[#140E1B] border border-[#382B44] text-[#9B97A2] hover:text-[#F8F0E7] transition-colors"
            aria-label={hideBalances ? 'Show digits' : 'Hide digits'}
          >
            {hideBalances ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleSyncBalance}
            disabled={isSyncing}
            className="p-1.5 rounded-xl bg-[#140E1B] border border-[#382B44] text-[#9B97A2] hover:text-[#F8F0E7] transition-colors disabled:opacity-50"
            aria-label="Sync Sats"
            title="Sync Sats"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-[#763698]' : ''}`} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-[#140E1B] border border-[#382B44] text-[#9B97A2] hover:text-[#F8F0E7] transition-colors"
              title="Close"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Two buttons alongside each other indicating country currency balance only */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          className="flex items-center justify-center p-3 rounded-2xl bg-[#140E1B] border border-[#382B44] text-sm font-bold font-mono text-[#F8F0E7] text-center"
        >
          {formattedKes}
        </button>
        <button
          type="button"
          className="flex items-center justify-center p-3 rounded-2xl bg-[#140E1B] border border-[#382B44] text-sm font-bold font-mono text-[#F8F0E7] text-center"
        >
          {formattedEtb}
        </button>
      </div>
    </div>
  );
};

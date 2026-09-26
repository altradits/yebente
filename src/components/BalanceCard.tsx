import React, { useState } from 'react';
import { UserWallet, ExchangeRates } from '../types';
import { Copy, Check, Eye, EyeOff, ShieldCheck, KeyRound, LogOut, X, RefreshCw } from 'lucide-react';
import { queryWebLNBalance, isLightningAddress } from '../services/lightningService';
import { fetchBitcoinAddressBalance } from '../services/blockchainService';

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
  onEjectWallet,
  onClose,
}) => {
  const [hideBalances, setHideBalances] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // If wallet is not connected / ejected, do not render balance card
  if (!wallet.isConnected) {
    return null;
  }

  const handleSyncBalance = async () => {
    if (!wallet.isConnected) return;
    setIsSyncing(true);
    try {
      // 1. If WebLN is present in browser, auto-query it first
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

      // 2. If on-chain address is present, query blockchain indexers
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

      // 3. For mobile Lightning addresses (like Wallet of Satoshi), open settings modal to update sats
      onOpenWalletSettings();
    } finally {
      setIsSyncing(false);
    }
  };

  const sats = wallet.satsBalance ?? Math.round((wallet.btcBalance || 0) * 100_000_000);
  const btcEquiv = sats / 100_000_000;
  const btcValueKes = btcEquiv * rates.btcKes;
  const btcValueUsd = btcEquiv * rates.btcUsd;
  const btcValueEtb = btcEquiv * rates.btcEtb;

  const handleCopyAddress = () => {
    if (wallet.nonCustodialAddress) {
      navigator.clipboard.writeText(wallet.nonCustodialAddress);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  const formatNumber = (num: number, maximumFractionDigits = 2) => {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits,
      minimumFractionDigits: maximumFractionDigits > 2 ? 2 : maximumFractionDigits,
    }).format(num);
  };

  return (
    <div className="bg-gradient-to-b from-[#21182A] to-[#181120] border border-[#3C2E49] rounded-3xl p-5 shadow-xl shadow-[#120E16]/80 relative overflow-hidden">
      {/* Subtle glowing ambient gradient inspired by Etail 3D lighting */}
      <div className="absolute -top-16 -right-16 w-36 h-36 bg-[#763698]/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-[#946069]/15 rounded-full blur-3xl pointer-events-none" />

      {/* Top row: Label & Visibility & Mode & Eject Button */}
      <div className="relative flex items-center justify-between text-xs text-[#9B97A2] mb-2.5">
        <div className="flex items-center gap-2">
          <span className="font-medium text-[#D1B9B3]">Sats Balance</span>
          <button
            onClick={() => setHideBalances(!hideBalances)}
            className="text-[#9B97A2] hover:text-[#F8F0E7] transition-colors p-0.5"
            aria-label={hideBalances ? 'Show balance' : 'Hide balance'}
          >
            {hideBalances ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleSyncBalance}
            disabled={isSyncing}
            className="text-[#9B97A2] hover:text-[#F8F0E7] transition-colors p-0.5 disabled:opacity-50"
            aria-label="Sync Sats Balance"
            title="Sync Sats Balance"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-[#763698]' : ''}`} />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenWalletSettings}
            className="flex items-center gap-1.5 text-[11px] font-mono text-[#D1B9B3] hover:text-[#F8F0E7] bg-[#2C1F38]/80 hover:bg-[#382748] px-2.5 py-1 rounded-lg border border-[#554653]/60 transition-colors"
          >
            {wallet.type === 'custodial' ? (
              <>
                <ShieldCheck className="w-3 h-3 text-[#D1B9B3]" />
                <span>Custodial</span>
              </>
            ) : (
              <>
                <KeyRound className="w-3 h-3 text-[#763698]" />
                <span>{wallet.nonCustodialLabel || 'Self-Custody'}</span>
              </>
            )}
          </button>

          {onEjectWallet && (
            <button
              onClick={onEjectWallet}
              className="flex items-center gap-1 text-[11px] font-mono text-[#9B97A2] hover:text-[#946069] bg-[#1A1322] hover:bg-[#281822] px-2 py-1 rounded-lg border border-[#3C2E49] hover:border-[#946069]/50 transition-colors"
              title="Eject / Remove Wallet to secure keys"
            >
              <LogOut className="w-3 h-3 text-[#946069]" />
              <span className="hidden sm:inline">Eject</span>
            </button>
          )}

          {onClose && (
            <button
              onClick={onClose}
              className="w-6 h-6 rounded-lg bg-[#281E33] border border-[#3C2E49] flex items-center justify-center text-[#9B97A2] hover:text-[#F8F0E7] transition-colors active:scale-95 ml-0.5"
              title="Hide Sats Balance"
              aria-label="Hide Sats Balance"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Primary Sats Balance */}
      <div className="relative mb-3.5">
        <div className="flex items-baseline gap-2.5">
          <span className="text-3.5xl font-extrabold tracking-tight text-[#F8F0E7] font-mono tabular-nums">
            {hideBalances ? '••••••••' : sats.toLocaleString()}
          </span>
          <span className="text-base font-bold text-[#D1B9B3] tracking-wide">Sats</span>
        </div>

        {/* Multi-currency equivalent */}
        <div className="flex items-center gap-2 text-xs text-[#9B97A2] mt-1 font-mono tabular-nums">
          <span>{hideBalances ? '••••' : `KES ${formatNumber(btcValueKes, 0)}`}</span>
          <span aria-hidden="true" className="text-[#554653]">·</span>
          <span>{hideBalances ? '••••' : `$${formatNumber(btcValueUsd, 2)}`}</span>
          <span aria-hidden="true" className="text-[#554653]">·</span>
          <span>{hideBalances ? '••••' : `ETB ${formatNumber(btcValueEtb, 0)}`}</span>
        </div>
      </div>

      {/* Non-custodial public address view if in non-custodial mode */}
      {wallet.type === 'non-custodial' && (
        <div className="relative mb-3.5 py-2.5 px-3.5 rounded-2xl bg-[#140E1B]/90 border border-[#554653] flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase font-mono text-[#9B97A2] tracking-wider">
              Connected Sats / Bitcoin Address
            </div>
            <div className="font-mono text-xs text-[#D1B9B3] truncate">
              {wallet.nonCustodialAddress}
            </div>
          </div>
          <button
            onClick={handleCopyAddress}
            className="p-1.5 rounded-xl bg-[#231A2D] border border-[#3C2E49] text-[#9B97A2] hover:text-[#F8F0E7] transition-colors shrink-0"
            title="Copy address"
          >
            {copiedAddress ? <Check className="w-3.5 h-3.5 text-[#D1B9B3]" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* Secondary Mobile Money Balances */}
      <div className="relative grid grid-cols-2 gap-2.5 pt-3.5 border-t border-[#372A42]">
        {/* M-Pesa Balance Card */}
        <div className="bg-[#150F1D]/80 rounded-2xl p-3 border border-[#3A2C46]">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-[#D1B9B3] font-semibold">
              M-Pesa
            </span>
            <span className="text-[#9B97A2] font-mono text-[10px]">KES</span>
          </div>
          <div className="font-mono text-base font-bold text-[#F8F0E7] tabular-nums">
            {hideBalances ? '••••••' : formatNumber(wallet.mpesaBalanceKes, 0)}
          </div>
        </div>

        {/* Telebirr Balance Card */}
        <div className="bg-[#150F1D]/80 rounded-2xl p-3 border border-[#3A2C46]">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-[#946069] font-semibold">
              Telebirr
            </span>
            <span className="text-[#9B97A2] font-mono text-[10px]">ETB</span>
          </div>
          <div className="font-mono text-base font-bold text-[#F8F0E7] tabular-nums">
            {hideBalances ? '••••••' : formatNumber(wallet.telebirrBalanceEtb, 0)}
          </div>
        </div>
      </div>
    </div>
  );
};

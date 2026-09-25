import React, { useState } from 'react';
import { UserWallet, ExchangeRates } from '../types';
import { Copy, Check, Eye, EyeOff, ShieldCheck, KeyRound } from 'lucide-react';

interface BalanceCardProps {
  wallet: UserWallet;
  rates: ExchangeRates;
  onOpenWalletSettings: () => void;
}

export const BalanceCard: React.FC<BalanceCardProps> = ({
  wallet,
  rates,
  onOpenWalletSettings,
}) => {
  const [hideBalances, setHideBalances] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);

  const btcValueKes = wallet.btcBalance * rates.btcKes;
  const btcValueUsd = wallet.btcBalance * rates.btcUsd;
  const btcValueEtb = wallet.btcBalance * rates.btcEtb;

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
    <div className="bg-gradient-to-b from-neutral-900 to-neutral-900/80 border border-neutral-800 rounded-2xl p-4 shadow-xl">
      {/* Top row: Label & Visibility & Mode */}
      <div className="flex items-center justify-between text-xs text-neutral-400 mb-2">
        <div className="flex items-center gap-1.5">
          <span>Bitcoin Balance</span>
          <button
            onClick={() => setHideBalances(!hideBalances)}
            className="text-neutral-500 hover:text-neutral-300 transition-colors p-0.5"
            aria-label={hideBalances ? 'Show balance' : 'Hide balance'}
          >
            {hideBalances ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>

        <button
          onClick={onOpenWalletSettings}
          className="flex items-center gap-1 text-[11px] font-mono text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          {wallet.type === 'custodial' ? (
            <>
              <ShieldCheck className="w-3 h-3 text-amber-500" />
              <span>Custodial Wallet</span>
            </>
          ) : (
            <>
              <KeyRound className="w-3 h-3 text-emerald-500" />
              <span>Self-Custody</span>
            </>
          )}
        </button>
      </div>

      {/* Primary BTC Balance */}
      <div className="mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-extrabold tracking-tight text-white font-mono tabular-nums">
            {hideBalances ? '••••••••' : wallet.btcBalance.toFixed(6)}
          </span>
          <span className="text-base font-bold text-amber-400">BTC</span>
        </div>

        {/* Multi-currency equivalent */}
        <div className="flex items-center gap-2 text-xs text-neutral-400 mt-1 font-mono tabular-nums">
          <span>{hideBalances ? '••••' : `≈ KES ${formatNumber(btcValueKes, 0)}`}</span>
          <span aria-hidden="true" className="text-neutral-600">·</span>
          <span>{hideBalances ? '••••' : `$${formatNumber(btcValueUsd, 2)}`}</span>
          <span aria-hidden="true" className="text-neutral-600">·</span>
          <span>{hideBalances ? '••••' : `ETB ${formatNumber(btcValueEtb, 0)}`}</span>
        </div>
      </div>

      {/* Non-custodial public address view if in non-custodial mode */}
      {wallet.type === 'non-custodial' && (
        <div className="mb-3 py-2 px-3 rounded-xl bg-neutral-950/80 border border-neutral-800/80 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase font-mono text-neutral-500 tracking-wider">
              Connected BTC Address
            </div>
            <div className="font-mono text-xs text-emerald-400 truncate">
              {wallet.nonCustodialAddress}
            </div>
          </div>
          <button
            onClick={handleCopyAddress}
            className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors shrink-0"
            title="Copy address"
          >
            {copiedAddress ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* Secondary Mobile Money Balances */}
      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-neutral-800/80">
        {/* M-Pesa Balance Card */}
        <div className="bg-neutral-950/60 rounded-xl p-2.5 border border-neutral-800/60">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              M-Pesa
            </span>
            <span className="text-neutral-500 font-mono text-[10px]">KES</span>
          </div>
          <div className="font-mono text-base font-bold text-white tabular-nums">
            {hideBalances ? '••••••' : formatNumber(wallet.mpesaBalanceKes, 0)}
          </div>
        </div>

        {/* Telebirr Balance Card */}
        <div className="bg-neutral-950/60 rounded-xl p-2.5 border border-neutral-800/60">
          <div className="flex items-center justify-between text-[11px] mb-1">
            <span className="text-cyan-400 font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
              Telebirr
            </span>
            <span className="text-neutral-500 font-mono text-[10px]">ETB</span>
          </div>
          <div className="font-mono text-base font-bold text-white tabular-nums">
            {hideBalances ? '••••••' : formatNumber(wallet.telebirrBalanceEtb, 0)}
          </div>
        </div>
      </div>
    </div>
  );
};

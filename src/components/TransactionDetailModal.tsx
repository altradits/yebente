import React, { useState } from 'react';
import { Transaction } from '../types';
import { X, CheckCircle2, Copy, Check, Share2, ShieldCheck, KeyRound } from 'lucide-react';

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  onClose: () => void;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  transaction,
  onClose,
}) => {
  const [copiedRef, setCopiedRef] = useState(false);
  const [shared, setShared] = useState(false);

  if (!transaction) return null;

  const handleCopyRef = () => {
    navigator.clipboard.writeText(transaction.referenceNumber);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  const handleShareReceipt = () => {
    const text = `Altradits Receipt\nRef: ${transaction.referenceNumber}\nType: ${transaction.title}\nAmount: ${transaction.fromAmount} ${transaction.fromCurrency} ${transaction.toAmount ? `-> ${transaction.toAmount} ${transaction.toCurrency}` : ''}\nDate: ${new Date(transaction.timestamp).toLocaleString()}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    }
  };

  const dateStr = new Date(transaction.timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-neutral-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">Transaction Receipt</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Status banner */}
          <div className="text-center py-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto mb-2">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="text-xs font-mono uppercase text-emerald-400 font-semibold tracking-wider">
              {transaction.status}
            </div>
            <h3 className="text-base font-bold text-white mt-0.5">{transaction.title}</h3>
            <div className="text-[11px] text-neutral-400 font-mono mt-1">{dateStr}</div>
          </div>

          {/* Reference box */}
          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-neutral-500 font-mono uppercase">
                Reference Code / TXID
              </div>
              <div className="text-xs font-mono font-semibold text-amber-400 truncate">
                {transaction.referenceNumber}
              </div>
            </div>
            <button
              onClick={handleCopyRef}
              className="p-1.5 rounded-lg bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"
              title="Copy reference"
            >
              {copiedRef ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Data List */}
          <div className="bg-neutral-950/70 border border-neutral-800/80 rounded-xl p-3.5 font-mono text-xs space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-neutral-500">Amount Sent</span>
              <span className="text-white font-bold tabular-nums">
                {transaction.fromAmount.toLocaleString()} {transaction.fromCurrency}
              </span>
            </div>

            {transaction.toAmount && transaction.toCurrency && (
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">Amount Received</span>
                <span className="text-emerald-400 font-bold tabular-nums">
                  {transaction.toAmount} {transaction.toCurrency}
                </span>
              </div>
            )}

            {transaction.rateUsed && (
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">Exchange Rate</span>
                <span className="text-neutral-300 tabular-nums">
                  1 BTC = {transaction.rateUsed.toLocaleString()} {transaction.fromCurrency === 'BTC' ? transaction.toCurrency : transaction.fromCurrency}
                </span>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-neutral-500">Network / Carrier Fee</span>
              <span className="text-neutral-300 tabular-nums">
                {transaction.fee} {transaction.feeCurrency}
              </span>
            </div>

            {transaction.recipient && (
              <div className="flex justify-between items-center">
                <span className="text-neutral-500">Recipient / Destination</span>
                <span className="text-white truncate max-w-[180px] font-mono">
                  {transaction.recipient}
                </span>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-neutral-800/80">
              <span className="text-neutral-500">Wallet Mode</span>
              <span className="flex items-center gap-1 text-[11px] text-neutral-300">
                {transaction.walletType === 'custodial' ? (
                  <>
                    <ShieldCheck className="w-3 h-3 text-amber-400" />
                    Custodial
                  </>
                ) : (
                  <>
                    <KeyRound className="w-3 h-3 text-emerald-400" />
                    Non-Custodial (Self)
                  </>
                )}
              </span>
            </div>

            {transaction.note && (
              <div className="pt-2 border-t border-neutral-800/80 text-neutral-400 text-[11px]">
                <span className="text-neutral-500">Memo: </span>
                {transaction.note}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={handleShareReceipt}
              className="h-11 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{shared ? 'Receipt Copied!' : 'Share Receipt'}</span>
            </button>
            <button
              onClick={onClose}
              className="h-11 rounded-xl bg-neutral-900 border border-neutral-800 hover:bg-neutral-800 text-white font-medium text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

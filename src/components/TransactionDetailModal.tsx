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
    const text = `yebente Receipt\nRef: ${transaction.referenceNumber}\nType: ${transaction.title}\nAmount: ${transaction.fromAmount} ${transaction.fromCurrency} ${transaction.toAmount ? `-> ${transaction.toAmount} ${transaction.toCurrency}` : ''}\nDate: ${new Date(transaction.timestamp).toLocaleString()}`;
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#120E16]/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#1D1627] border border-[#3A2D47] rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl shadow-black/80 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#382B44]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[#F8F0E7]">Transaction Receipt</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#251B30] text-[#9B97A2] hover:text-[#F8F0E7] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {/* Status banner */}
          <div className="text-center py-3">
            <div className="w-12 h-12 rounded-2xl bg-[#763698]/25 border border-[#763698]/50 flex items-center justify-center text-[#D1B9B3] mx-auto mb-2">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="text-xs font-mono uppercase text-[#D1B9B3] font-semibold tracking-wider">
              {transaction.status}
            </div>
            <h3 className="text-base font-bold text-[#F8F0E7] mt-0.5">{transaction.title}</h3>
            <div className="text-[11px] text-[#9B97A2] font-mono mt-1">{dateStr}</div>
          </div>

          {/* Reference box */}
          <div className="bg-[#140E1B] border border-[#382B44] rounded-2xl p-3 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[10px] text-[#9B97A2] font-mono uppercase">
                Reference Code / TXID
              </div>
              <div className="text-xs font-mono font-semibold text-[#D1B9B3] truncate">
                {transaction.referenceNumber}
              </div>
            </div>
            <button
              onClick={handleCopyRef}
              className="p-1.5 rounded-xl bg-[#231A2D] border border-[#3C2E49] text-[#9B97A2] hover:text-[#F8F0E7] transition-colors"
              title="Copy reference"
            >
              {copiedRef ? <Check className="w-3.5 h-3.5 text-[#D1B9B3]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Data List */}
          <div className="bg-[#140E1B]/70 border border-[#382B44] rounded-2xl p-3.5 font-mono text-xs space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-[#9B97A2]">Amount Sent</span>
              <span className="text-[#F8F0E7] font-bold tabular-nums">
                {(transaction.fromCurrency === 'BTC' ? Math.round(transaction.fromAmount * 100_000_000) : transaction.fromAmount).toLocaleString()}{' '}
                {transaction.fromCurrency === 'BTC' || transaction.fromCurrency === 'SATS' ? 'Sats' : transaction.fromCurrency}
              </span>
            </div>

            {transaction.toAmount && transaction.toCurrency && (
              <div className="flex justify-between items-center">
                <span className="text-[#9B97A2]">Amount Received</span>
                <span className="text-[#D1B9B3] font-bold tabular-nums">
                  {(transaction.toCurrency === 'BTC' ? Math.round(transaction.toAmount * 100_000_000) : transaction.toAmount).toLocaleString()}{' '}
                  {transaction.toCurrency === 'BTC' || transaction.toCurrency === 'SATS' ? 'Sats' : transaction.toCurrency}
                </span>
              </div>
            )}

            {transaction.rateUsed && (
              <div className="flex justify-between items-center">
                <span className="text-[#9B97A2]">Exchange Rate</span>
                <span className="text-[#D1B9B3] tabular-nums">
                  100,000 Sats = {Math.round(transaction.rateUsed * 0.001).toLocaleString()}{' '}
                  {transaction.fromCurrency === 'BTC' || transaction.fromCurrency === 'SATS' ? transaction.toCurrency : transaction.fromCurrency}
                </span>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-[#9B97A2]">Network / Carrier Fee</span>
              <span className="text-[#9B97A2] tabular-nums">
                {(transaction.feeCurrency === 'BTC' ? Math.round(transaction.fee * 100_000_000) : transaction.fee).toLocaleString()}{' '}
                {transaction.feeCurrency === 'BTC' || transaction.feeCurrency === 'SATS' ? 'Sats' : transaction.feeCurrency}
              </span>
            </div>

            {transaction.recipient && (
              <div className="flex justify-between items-center">
                <span className="text-[#9B97A2]">Recipient / Destination</span>
                <span className="text-[#F8F0E7] truncate max-w-[180px] font-mono">
                  {transaction.recipient}
                </span>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-[#382B44]">
              <span className="text-[#9B97A2]">Wallet Mode</span>
              <span className="flex items-center gap-1 text-[11px] text-[#D1B9B3]">
                {transaction.walletType === 'custodial' ? (
                  <>
                    <ShieldCheck className="w-3 h-3 text-[#D1B9B3]" />
                    Custodial
                  </>
                ) : (
                  <>
                    <KeyRound className="w-3 h-3 text-[#763698]" />
                    Non-Custodial (Self)
                  </>
                )}
              </span>
            </div>

            {transaction.note && (
              <div className="pt-2 border-t border-[#382B44] text-[#9B97A2] text-[11px]">
                <span className="text-[#554653]">Memo: </span>
                {transaction.note}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              onClick={handleShareReceipt}
              className="h-11 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] text-[#F8F0E7] font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
            >
              <Share2 className="w-3.5 h-3.5 text-[#F8F0E7]" />
              <span>{shared ? 'Receipt Copied!' : 'Share Receipt'}</span>
            </button>
            <button
              onClick={onClose}
              className="h-11 rounded-2xl bg-[#231A2D] border border-[#3C2E49] hover:bg-[#2C2138] text-[#F8F0E7] font-medium text-xs transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

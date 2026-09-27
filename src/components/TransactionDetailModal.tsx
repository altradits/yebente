import React, { useState } from 'react';
import { Transaction } from '../types';
import { X, Copy, Check } from 'lucide-react';

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  onClose: () => void;
}

const TYPE_TITLES: Record<string, string> = {
  buy_btc: 'Buy Sats',
  sell_btc: 'Sell Sats',
  send_mpesa: 'Send M-Pesa',
  send_telebirr: 'Send Telebirr',
  deposit_mpesa: 'Deposit M-Pesa',
};

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  transaction,
  onClose,
}) => {
  const [copiedRef, setCopiedRef] = useState(false);

  if (!transaction) return null;

  const handleCopyRef = () => {
    navigator.clipboard.writeText(transaction.referenceNumber);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

  const dateStr = new Date(transaction.timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const getAmountDisplay = () => {
    if (transaction.type === 'buy_btc') {
      const sats = transaction.toCurrency === 'BTC'
        ? Math.round(Number(transaction.toAmount || 0) * 100_000_000)
        : Number(transaction.toAmount || 0);
      return { text: `+${sats.toLocaleString()} Sats`, isPositive: true };
    }
    if (transaction.type === 'sell_btc') {
      const sats = transaction.fromCurrency === 'BTC'
        ? Math.round(Number(transaction.fromAmount || 0) * 100_000_000)
        : Number(transaction.fromAmount || 0);
      return { text: `-${sats.toLocaleString()} Sats`, isPositive: false };
    }
    if (transaction.type === 'send_mpesa') {
      return { text: `-${Number(transaction.fromAmount || 0).toLocaleString()} KES`, isPositive: false };
    }
    if (transaction.type === 'send_telebirr') {
      return { text: `-${Number(transaction.fromAmount || 0).toLocaleString()} ETB`, isPositive: false };
    }
    return { text: `${Number(transaction.fromAmount || 0).toLocaleString()} ${transaction.fromCurrency}`, isPositive: false };
  };

  const amount = getAmountDisplay();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#120E16]/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#1D1627] border border-[#3A2D47] rounded-t-3xl sm:rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl shadow-black/80 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#382B44]">
          <span className="text-sm font-bold text-[#F8F0E7]">Details</span>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#9B97A2] hover:text-[#F8F0E7] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Main Amount & Title */}
          <div className="text-center py-2">
            <div
              className={`text-2xl font-bold font-mono tabular-nums ${
                amount.isPositive ? 'text-emerald-400' : 'text-[#F8F0E7]'
              }`}
            >
              {amount.text}
            </div>
            <div className="text-sm font-semibold text-[#D1B9B3] mt-1">
              {TYPE_TITLES[transaction.type] || transaction.title}
            </div>
            <div className="text-xs text-[#9B97A2] font-mono mt-0.5">
              {dateStr}
            </div>
          </div>

          {/* Details list */}
          <div className="bg-[#140E1B] border border-[#382B44] rounded-2xl p-3.5 font-mono text-xs space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-[#9B97A2]">Reference</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[#F8F0E7] font-semibold">
                  {transaction.referenceNumber}
                </span>
                <button
                  onClick={handleCopyRef}
                  className="p-1 text-[#9B97A2] hover:text-[#F8F0E7] transition-colors"
                  title="Copy reference"
                >
                  {copiedRef ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {transaction.recipient && (
              <div className="flex justify-between items-center">
                <span className="text-[#9B97A2]">Recipient</span>
                <span className="text-[#F8F0E7] truncate max-w-[180px]">
                  {transaction.recipient}
                </span>
              </div>
            )}

            {transaction.fee > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-[#9B97A2]">Fee</span>
                <span className="text-[#9B97A2]">
                  {transaction.fee} {transaction.feeCurrency}
                </span>
              </div>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="w-full h-11 rounded-2xl bg-[#231A2D] border border-[#382B44] hover:bg-[#2C2138] text-[#F8F0E7] font-medium text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

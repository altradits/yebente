import React, { useState } from 'react';
import { UserWallet, Transaction } from '../types';
import { X, ArrowRight, Smartphone, CheckCircle2, Loader2, Info } from 'lucide-react';

interface SendTelebirrModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet;
  onSuccess: (tx: Omit<Transaction, 'id' | 'timestamp'>) => void;
}

export const SendTelebirrModal: React.FC<SendTelebirrModalProps> = ({
  isOpen,
  onClose,
  wallet,
  onSuccess,
}) => {
  const [phone, setPhone] = useState<string>('251911234567');
  const [amountStr, setAmountStr] = useState<string>('2000');
  const [note, setNote] = useState<string>('');
  const [step, setStep] = useState<'input' | 'processing' | 'success'>('input');

  if (!isOpen) return null;

  const numericAmount = parseFloat(amountStr) || 0;
  // Telebirr peer-to-peer transaction fee
  const fee = numericAmount > 0 ? (numericAmount <= 500 ? 2 : 5) : 0;
  const totalDeduction = numericAmount + fee;

  const handleConfirm = () => {
    if (numericAmount <= 0) return;
    setStep('processing');

    setTimeout(() => {
      const refCode = `ETHIO-TB-${Math.floor(1000000000 + Math.random() * 9000000000)}`;

      onSuccess({
        type: 'send_telebirr',
        title: 'Sent Telebirr Transfer',
        status: 'completed',
        fromCurrency: 'ETB',
        fromAmount: numericAmount,
        fee,
        feeCurrency: 'ETB',
        recipient: `+${phone}`,
        referenceNumber: refCode,
        walletType: wallet.type,
        note: note || 'Telebirr Mobile Remittance',
      });

      setStep('success');
    }, 1800);
  };

  const handleResetAndClose = () => {
    setStep('input');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-neutral-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <ArrowRight className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Send Telebirr</h2>
              <p className="text-[11px] text-neutral-400">Ethio Telecom instant transfer</p>
            </div>
          </div>
          <button
            onClick={handleResetAndClose}
            className="w-8 h-8 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {step === 'input' && (
            <>
              {/* Phone number */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Recipient Telebirr Phone
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="2519XXXXXXXX or 2517XXXXXXXX"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-cyan-500"
                  />
                  <Smartphone className="w-4 h-4 text-neutral-500 absolute right-3 top-3" />
                </div>
                <p className="text-[10px] text-neutral-500 mt-1">
                  Supports all Ethio telecom active 09... and 07... numbers.
                </p>
              </div>

              {/* Amount */}
              <div>
                <div className="flex justify-between items-center text-xs text-neutral-300 mb-1.5">
                  <span className="font-semibold">Amount to Transfer</span>
                  <span className="font-mono text-neutral-500">
                    Avail: {wallet.telebirrBalanceEtb.toLocaleString()} ETB
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    placeholder="0"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-lg font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                  />
                  <span className="absolute right-4 top-3.5 font-mono text-sm font-semibold text-cyan-400">
                    ETB
                  </span>
                </div>
              </div>

              {/* Note / Memo */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Purpose / Remark (Optional)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Family support, Rent, Services"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* Fee breakdown */}
              <div className="bg-neutral-950/80 rounded-xl p-3 border border-neutral-800 text-xs font-mono space-y-1">
                <div className="flex justify-between text-neutral-400">
                  <span>Telebirr Network Fee</span>
                  <span>{fee} ETB</span>
                </div>
                <div className="flex justify-between font-bold text-white pt-1 border-t border-neutral-800">
                  <span>Total Debit</span>
                  <span className="text-cyan-400">{totalDeduction.toLocaleString()} ETB</span>
                </div>
              </div>

              {/* Send Button */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={numericAmount <= 0 || totalDeduction > wallet.telebirrBalanceEtb}
                className="w-full h-12 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] text-neutral-950 font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 mt-2 shadow-lg shadow-cyan-500/10"
              >
                {totalDeduction > wallet.telebirrBalanceEtb
                  ? 'Insufficient Telebirr Balance'
                  : `Send ${numericAmount.toLocaleString()} ETB`}
              </button>
            </>
          )}

          {step === 'processing' && (
            <div className="py-8 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Transmitting Telebirr</h3>
                <p className="text-xs text-neutral-400 mt-1 max-w-xs font-mono">
                  Dispatching {numericAmount.toLocaleString()} ETB to +{phone}...
                </p>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Telebirr Sent Successfully</h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Recipient account has been credited instantly.
                </p>
              </div>

              <div className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3.5 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Amount Sent</span>
                  <span className="text-cyan-400 font-bold">{numericAmount.toLocaleString()} ETB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Recipient Phone</span>
                  <span className="text-white">+{phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Service Fee</span>
                  <span className="text-neutral-400">{fee} ETB</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetAndClose}
                className="w-full h-11 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-sm transition-all"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

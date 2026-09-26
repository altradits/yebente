import React, { useState } from 'react';
import { UserWallet, Transaction } from '../types';
import { X, ArrowRight, Smartphone, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';

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
  const [phone, setPhone] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [step, setStep] = useState<'input' | 'processing' | 'success' | 'error'>('input');
  const [errorMessage, setErrorMessage] = useState<string>('');

  if (!isOpen) return null;

  const numericAmount = parseFloat(amountStr) || 0;
  // Telebirr peer-to-peer transaction fee
  const fee = numericAmount > 0 ? (numericAmount <= 500 ? 2 : 5) : 0;
  const totalDeduction = numericAmount + fee;

  const handleConfirm = () => {
    if (numericAmount <= 0) return;
    setErrorMessage('Telebirr payment rail is not yet active. The developer must integrate Ethio Telecom Telebirr credentials (Issue #5) before live transfers can be dispatched.');
    setStep('error');
  };

  const handleResetAndClose = () => {
    setStep('input');
    setErrorMessage('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#120E16]/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#1D1627] border border-[#3A2D47] rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl shadow-black/80 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#382B44]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#946069]/25 border border-[#946069]/50 flex items-center justify-center text-[#D1B9B3]">
              <ArrowRight className="w-4 h-4 text-[#F8F0E7]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#F8F0E7]">Send Telebirr</h2>
            </div>
          </div>
          <button
            onClick={handleResetAndClose}
            className="w-8 h-8 rounded-xl bg-[#251B30] text-[#9B97A2] hover:text-[#F8F0E7] flex items-center justify-center transition-colors"
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
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1">
                  Recipient Telebirr Phone
                </label>
                <div className="flex items-center rounded-2xl bg-[#140E1B] border border-[#382B44] focus-within:border-[#946069] overflow-hidden">
                  <div className="flex items-center px-3 py-2.5 bg-[#1E1627] border-r border-[#382B44] shrink-0 select-none">
                    <span className="text-xs font-mono font-bold text-[#F8F0E7]">+251</span>
                  </div>
                  <div className="relative flex-1">
                    <input
                      type="tel"
                      value={phone.startsWith('251') ? phone.slice(3) : phone.startsWith('0') ? phone.slice(1) : phone}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, '');
                        const clean = raw.startsWith('251') ? raw.slice(3) : raw.startsWith('0') ? raw.slice(1) : raw;
                        setPhone(clean.length > 0 ? `251${clean.slice(0, 9)}` : '');
                      }}
                      placeholder="9XX XXX XXX"
                      maxLength={12}
                      className="w-full bg-transparent px-3.5 py-2.5 text-sm font-mono font-bold text-[#F8F0E7] placeholder-[#554653] focus:outline-none"
                    />
                    {phone && (
                      <button
                        type="button"
                        onClick={() => setPhone('')}
                        title="Clear phone number"
                        className="absolute right-3 top-3 w-5 h-5 rounded-full bg-[#2A1E37] text-[#9B97A2] hover:text-[#F8F0E7] flex items-center justify-center transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Amount */}
              <div>
                <div className="flex justify-between items-center text-xs text-[#D1B9B3] mb-1.5">
                  <span className="font-semibold">Amount to Transfer</span>
                  <span className="font-mono text-[#9B97A2]">
                    Avail: {wallet.telebirrBalanceEtb.toLocaleString()} ETB
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="0"
                    className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-3 text-lg font-mono font-bold text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                  />
                  <span className="absolute right-4 top-3.5 font-mono text-sm font-semibold text-[#D1B9B3]">
                    ETB
                  </span>
                </div>
              </div>

              {/* Note / Memo */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1">
                  Purpose / Remark (Optional)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional remark"
                  className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-2 text-xs text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                />
              </div>

              {/* Fee breakdown */}
              <div className="bg-[#140E1B]/90 rounded-2xl p-3 border border-[#382B44] text-xs font-mono space-y-1">
                <div className="flex justify-between text-[#9B97A2]">
                  <span>Telebirr Network Fee</span>
                  <span>{fee} ETB</span>
                </div>
                <div className="flex justify-between font-bold text-[#F8F0E7] pt-1.5 border-t border-[#382B44]">
                  <span>Total Debit</span>
                  <span className="text-[#D1B9B3]">{totalDeduction.toLocaleString()} ETB</span>
                </div>
              </div>

              {/* Send Button */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={numericAmount <= 0 || totalDeduction > wallet.telebirrBalanceEtb}
                className="w-full h-12 rounded-2xl bg-[#946069] hover:bg-[#A96E78] active:scale-[0.98] text-[#F8F0E7] font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 mt-2 shadow-lg shadow-[#946069]/25"
              >
                {totalDeduction > wallet.telebirrBalanceEtb
                  ? 'Insufficient Telebirr Balance'
                  : `Send ${numericAmount.toLocaleString()} ETB`}
              </button>
            </>
          )}

          {step === 'error' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-red-950/30 border border-red-500/40 flex items-center justify-center text-red-400">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">Telebirr Rail Inactive</h3>
                <p className="text-xs text-red-300 mt-1 max-w-xs">{errorMessage}</p>
              </div>
              <button
                type="button"
                onClick={() => setStep('input')}
                className="w-full h-11 rounded-2xl bg-[#281E33] hover:bg-[#342743] text-[#F8F0E7] font-medium text-sm transition-all"
              >
                Go Back
              </button>
            </div>
          )}

          {step === 'processing' && (
            <div className="py-8 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#946069]/20 border border-[#946069]/40 flex items-center justify-center text-[#D1B9B3]">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">Transmitting Telebirr</h3>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-[#946069]/25 border border-[#946069]/50 flex items-center justify-center text-[#D1B9B3]">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">Telebirr Sent Successfully</h3>
              </div>

              <div className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl p-3.5 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Amount Sent</span>
                  <span className="text-[#D1B9B3] font-bold">{numericAmount.toLocaleString()} ETB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Recipient Phone</span>
                  <span className="text-[#F8F0E7]">+{phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Service Fee</span>
                  <span className="text-[#9B97A2]">{fee} ETB</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetAndClose}
                className="w-full h-11 rounded-2xl bg-[#281E33] hover:bg-[#342743] text-[#F8F0E7] font-medium text-sm transition-all"
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

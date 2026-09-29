import React, { useState } from 'react';
import { UserWallet, Transaction } from '../types';
import { ArrowLeft, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';

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
  const [step, setStep] = useState<'input' | 'processing' | 'success' | 'error'>('input');
  const [errorMessage, setErrorMessage] = useState<string>('');

  if (!isOpen) return null;

  const numericAmount = parseFloat(amountStr) || 0;
  const availableEtb = wallet.telebirrBalanceEtb || 0;
  const fee = numericAmount > 0 ? (numericAmount <= 500 ? 2 : 5) : 0;
  const totalDeduction = numericAmount + fee;
  const isInsufficient = totalDeduction > availableEtb;

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

  const handleBack = () => {
    if (step === 'error') {
      setStep('input');
      setErrorMessage('');
      return;
    }
    handleResetAndClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#120E16]/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#1D1627] border border-[#3A2D47] rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl shadow-black/80 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#382B44]/60">
          <button
            type="button"
            onClick={handleBack}
            className="p-1.5 rounded-lg text-[#9B97A2] hover:text-[#F8F0E7] transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold text-[#F8F0E7]">Send Telebirr</h2>
          <div className="w-8" aria-hidden="true" />
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {step === 'input' && (
            <>
              {/* Balance Display */}
              <div className="flex justify-between items-center px-1 text-xs">
                <span className="text-[#9B97A2]">Available</span>
                <span className="font-mono font-semibold text-[#D1B9B3]">
                  {availableEtb.toLocaleString()} ETB
                </span>
              </div>

              {/* Phone number */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1">
                  Recipient Phone
                </label>
                <div className="flex items-center rounded-2xl bg-[#140E1B] border border-[#382B44] focus-within:border-[#763698] overflow-hidden">
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
                  </div>
                </div>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1.5">
                  Amount (ETB)
                </label>
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

              {/* Fee */}
              <div className="flex justify-between items-center text-xs text-[#9B97A2] px-1 font-mono">
                <span>Fee</span>
                <span>{fee} ETB</span>
              </div>

              {/* Send Button */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={numericAmount <= 0 || !phone || isInsufficient}
                className="w-full h-12 rounded-2xl bg-[#946069] hover:bg-[#A96E78] active:scale-[0.98] text-[#F8F0E7] font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 mt-2 shadow-md shadow-[#946069]/20"
              >
                {isInsufficient ? 'Insufficient Balance' : 'Send Telebirr'}
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
                Try Again
              </button>
            </div>
          )}

          {step === 'processing' && (
            <div className="py-8 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#946069]/20 border border-[#946069]/40 flex items-center justify-center text-[#D1B9B3]">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">Sending Telebirr</h3>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-[#946069]/25 border border-[#946069]/50 flex items-center justify-center text-[#D1B9B3]">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">Telebirr Sent</h3>
              </div>

              <div className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl p-3.5 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Amount Sent</span>
                  <span className="text-[#D1B9B3] font-bold">{numericAmount.toLocaleString()} ETB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Recipient</span>
                  <span className="text-[#F8F0E7]">+{phone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Fee</span>
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

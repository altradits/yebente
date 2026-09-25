import React, { useState } from 'react';
import { UserWallet, Transaction } from '../types';
import { X, Send, Smartphone, CheckCircle2, Loader2, Store, Hash } from 'lucide-react';

interface SendMpesaModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet;
  onSuccess: (tx: Omit<Transaction, 'id' | 'timestamp'>) => void;
}

export const SendMpesaModal: React.FC<SendMpesaModalProps> = ({
  isOpen,
  onClose,
  wallet,
  onSuccess,
}) => {
  const [recipientType, setRecipientType] = useState<'phone' | 'till' | 'paybill'>('phone');
  const [phone, setPhone] = useState<string>('254712345678');
  const [tillNumber, setTillNumber] = useState<string>('542109');
  const [paybillNumber, setPaybillNumber] = useState<string>('247247');
  const [accountNumber, setAccountNumber] = useState<string>('123456789');
  const [amountStr, setAmountStr] = useState<string>('1500');
  const [note, setNote] = useState<string>('');
  const [step, setStep] = useState<'input' | 'processing' | 'success'>('input');

  if (!isOpen) return null;

  const numericAmount = parseFloat(amountStr) || 0;

  // Realistic Safaricom M-Pesa tariff fee calculation
  const calculateMpesaFee = (amt: number): number => {
    if (amt <= 100) return 0;
    if (amt <= 500) return 7;
    if (amt <= 1000) return 13;
    if (amt <= 2500) return 23;
    if (amt <= 5000) return 35;
    if (amt <= 10000) return 57;
    if (amt <= 20000) return 78;
    return 108;
  };

  const fee = recipientType === 'till' ? 0 : calculateMpesaFee(numericAmount);
  const totalDeduction = numericAmount + fee;

  const getRecipientDisplay = () => {
    if (recipientType === 'phone') return `+${phone}`;
    if (recipientType === 'till') return `Till No. ${tillNumber}`;
    return `Paybill ${paybillNumber} (Acc: ${accountNumber})`;
  };

  const handleConfirm = () => {
    if (numericAmount <= 0) return;
    setStep('processing');

    setTimeout(() => {
      const refCode = `SAF-${Math.random().toString(36).substring(2, 4).toUpperCase()}${Math.floor(
        100000 + Math.random() * 900000
      )}${Math.random().toString(36).substring(2, 4).toUpperCase()}`;

      onSuccess({
        type: 'send_mpesa',
        title:
          recipientType === 'phone'
            ? 'Sent M-Pesa to Phone'
            : recipientType === 'till'
            ? 'M-Pesa Buy Goods (Till)'
            : 'M-Pesa Paybill Payment',
        status: 'completed',
        fromCurrency: 'KES',
        fromAmount: numericAmount,
        fee,
        feeCurrency: 'KES',
        recipient: getRecipientDisplay(),
        referenceNumber: refCode,
        walletType: wallet.type,
        note: note || (recipientType === 'till' ? 'Merchant Payment' : 'P2P M-Pesa Transfer'),
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
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Send M-Pesa</h2>
              <p className="text-[11px] text-neutral-400">Safaricom instant mobile transfer</p>
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
              {/* Transfer Destination Mode */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Transfer Category
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRecipientType('phone')}
                    className={`py-2 px-2 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                      recipientType === 'phone'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Send Money</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientType('till')}
                    className={`py-2 px-2 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                      recipientType === 'till'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                    }`}
                  >
                    <Store className="w-3.5 h-3.5" />
                    <span>Buy Goods</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientType('paybill')}
                    className={`py-2 px-2 rounded-xl border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                      recipientType === 'paybill'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                    }`}
                  >
                    <Hash className="w-3.5 h-3.5" />
                    <span>Paybill</span>
                  </button>
                </div>
              </div>

              {/* Recipient inputs based on category */}
              {recipientType === 'phone' && (
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Phone Number
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="2547XXXXXXXX"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
                    />
                    <Smartphone className="w-4 h-4 text-neutral-500 absolute right-3 top-3" />
                  </div>
                </div>
              )}

              {recipientType === 'till' && (
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Till Number
                  </label>
                  <input
                    type="text"
                    value={tillNumber}
                    onChange={(e) => setTillNumber(e.target.value)}
                    placeholder="Enter 5-6 digit Till Number"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              )}

              {recipientType === 'paybill' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Business No.
                    </label>
                    <input
                      type="text"
                      value={paybillNumber}
                      onChange={(e) => setPaybillNumber(e.target.value)}
                      placeholder="e.g. 247247"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Account No.
                    </label>
                    <input
                      type="text"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      placeholder="Account"
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}

              {/* Amount to send */}
              <div>
                <div className="flex justify-between items-center text-xs text-neutral-300 mb-1.5">
                  <span className="font-semibold">Amount</span>
                  <span className="font-mono text-neutral-500">
                    Avail: {wallet.mpesaBalanceKes.toLocaleString()} KES
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    placeholder="0"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-lg font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
                  />
                  <span className="absolute right-4 top-3.5 font-mono text-sm font-semibold text-emerald-400">
                    KES
                  </span>
                </div>
              </div>

              {/* Note / Purpose */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Note (Optional)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Lunch, Groceries, Invoice #12"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Tariff fee breakdown */}
              <div className="bg-neutral-950/80 rounded-xl p-3 border border-neutral-800 text-xs font-mono space-y-1">
                <div className="flex justify-between text-neutral-400">
                  <span>Transfer Fee</span>
                  <span>{fee} KES</span>
                </div>
                <div className="flex justify-between font-bold text-white pt-1 border-t border-neutral-800">
                  <span>Total Debit</span>
                  <span className="text-emerald-400">{totalDeduction.toLocaleString()} KES</span>
                </div>
              </div>

              {/* Send Button */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={numericAmount <= 0 || totalDeduction > wallet.mpesaBalanceKes}
                className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.98] text-neutral-950 font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 mt-2 shadow-lg shadow-emerald-500/10"
              >
                {totalDeduction > wallet.mpesaBalanceKes
                  ? 'Insufficient M-Pesa Balance'
                  : `Send ${numericAmount.toLocaleString()} KES`}
              </button>
            </>
          )}

          {step === 'processing' && (
            <div className="py-8 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Transmitting Safaricom M-Pesa</h3>
                <p className="text-xs text-neutral-400 mt-1 max-w-xs font-mono">
                  Dispatching {numericAmount.toLocaleString()} KES to {getRecipientDisplay()}...
                </p>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">M-Pesa Sent Successfully</h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Recipient notified via Safaricom SMS.
                </p>
              </div>

              <div className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3.5 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Amount Sent</span>
                  <span className="text-emerald-400 font-bold">{numericAmount.toLocaleString()} KES</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Recipient</span>
                  <span className="text-white">{getRecipientDisplay()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Service Fee</span>
                  <span className="text-neutral-400">{fee} KES</span>
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

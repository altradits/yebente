import React, { useState } from 'react';
import { UserWallet, Transaction } from '../types';
import { X, Send, Smartphone, CheckCircle2, Loader2, Store, Hash, AlertTriangle } from 'lucide-react';
import { initiateStkPush, isValidKenyanPhone, formatKenyanPhone } from '../services/mpesaService';

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
  const [phone, setPhone] = useState<string>('');
  const [tillNumber, setTillNumber] = useState<string>('');
  const [paybillNumber, setPaybillNumber] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [step, setStep] = useState<'input' | 'processing' | 'success' | 'error'>('input');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [realReference, setRealReference] = useState<string>('');

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
    if (recipientType === 'phone') return `+${formatKenyanPhone(phone) || phone}`;
    if (recipientType === 'till') return `Till No. ${tillNumber}`;
    return `Paybill ${paybillNumber} (Acc: ${accountNumber})`;
  };

  const handleConfirm = async () => {
    if (numericAmount <= 0) return;

    const targetPhone = recipientType === 'phone' ? phone : (wallet.nonCustodialAddress || '254700000000');
    if (recipientType === 'phone' && !isValidKenyanPhone(phone)) {
      setErrorMessage('Please enter a valid Safaricom number: 07XXXXXXXX or 01XXXXXXXX');
      setStep('error');
      return;
    }

    setStep('processing');
    setErrorMessage('');

    const res = await initiateStkPush({
      phone: targetPhone,
      amount: numericAmount,
      accountReference: recipientType === 'till' ? `Till${tillNumber}` : recipientType === 'paybill' ? `PB${paybillNumber}` : 'MpesaSend',
      transactionDesc: note || (recipientType === 'till' ? 'Merchant Payment' : 'P2P M-Pesa Transfer'),
    });

    if (!res.success) {
      setErrorMessage(res.error || 'Failed to dispatch M-Pesa STK Push prompt.');
      setStep('error');
      return;
    }

    const refCode = res.checkoutRequestId || res.merchantRequestId || 'DARAJA-STK-INIT';
    setRealReference(refCode);

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
            <div className="w-8 h-8 rounded-xl bg-[#554653]/35 border border-[#554653] flex items-center justify-center text-[#D1B9B3]">
              <Send className="w-4 h-4 text-[#F8F0E7]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#F8F0E7]">Send M-Pesa</h2>
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
              {/* Transfer Destination Mode */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1.5">
                  Transfer Category
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRecipientType('phone')}
                    className={`py-2 px-2 rounded-2xl border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                      recipientType === 'phone'
                        ? 'border-[#763698] bg-[#763698]/20 text-[#F8F0E7]'
                        : 'border-[#382B44] bg-[#140E1B] text-[#9B97A2]'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Send Money</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientType('till')}
                    className={`py-2 px-2 rounded-2xl border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                      recipientType === 'till'
                        ? 'border-[#763698] bg-[#763698]/20 text-[#F8F0E7]'
                        : 'border-[#382B44] bg-[#140E1B] text-[#9B97A2]'
                    }`}
                  >
                    <Store className="w-3.5 h-3.5" />
                    <span>Buy Goods</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientType('paybill')}
                    className={`py-2 px-2 rounded-2xl border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                      recipientType === 'paybill'
                        ? 'border-[#763698] bg-[#763698]/20 text-[#F8F0E7]'
                        : 'border-[#382B44] bg-[#140E1B] text-[#9B97A2]'
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
                  <label className="block text-xs font-semibold text-[#D1B9B3] mb-1">
                    Phone Number
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="2547XXXXXXXX"
                      className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-2.5 text-sm font-mono text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                    />
                    <Smartphone className="w-4 h-4 text-[#9B97A2] absolute right-3.5 top-3" />
                  </div>
                </div>
              )}

              {recipientType === 'till' && (
                <div>
                  <label className="block text-xs font-semibold text-[#D1B9B3] mb-1">
                    Till Number
                  </label>
                  <input
                    type="text"
                    value={tillNumber}
                    onChange={(e) => setTillNumber(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="Enter 5-6 digit Till Number"
                    className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-2.5 text-sm font-mono text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                  />
                </div>
              )}

              {recipientType === 'paybill' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-[#D1B9B3] mb-1">
                      Business No.
                    </label>
                    <input
                      type="text"
                      value={paybillNumber}
                      onChange={(e) => setPaybillNumber(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="Paybill Number"
                      className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-3 py-2 text-xs font-mono text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#D1B9B3] mb-1">
                      Account No.
                    </label>
                    <input
                      type="text"
                      value={accountNumber}
                      onChange={(e) => setAccountNumber(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="Account Number"
                      className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-3 py-2 text-xs font-mono text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                    />
                  </div>
                </div>
              )}

              {/* Amount to send */}
              <div>
                <div className="flex justify-between items-center text-xs text-[#D1B9B3] mb-1.5">
                  <span className="font-semibold">Amount</span>
                  <span className="font-mono text-[#9B97A2]">
                    Via Safaricom M-Pesa
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
                    KES
                  </span>
                </div>
              </div>

              {/* Note / Purpose */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1">
                  Note (Optional)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional memo"
                  className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-2 text-xs text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                />
              </div>

              {/* Tariff fee breakdown */}
              <div className="bg-[#140E1B]/90 rounded-2xl p-3 border border-[#382B44] text-xs font-mono space-y-1">
                <div className="flex justify-between text-[#9B97A2]">
                  <span>Transfer Fee</span>
                  <span>{fee} KES</span>
                </div>
                <div className="flex justify-between font-bold text-[#F8F0E7] pt-1.5 border-t border-[#382B44]">
                  <span>Total Debit</span>
                  <span className="text-[#D1B9B3]">{totalDeduction.toLocaleString()} KES</span>
                </div>
              </div>

              {/* Send Button */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={numericAmount <= 0}
                className="w-full h-12 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] active:scale-[0.98] text-[#F8F0E7] font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 mt-2 shadow-lg shadow-[#763698]/25"
              >
                Send {numericAmount > 0 ? `${numericAmount.toLocaleString()} KES` : 'M-Pesa'}
              </button>
            </>
          )}

          {step === 'processing' && (
            <div className="py-8 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#763698]/20 border border-[#763698]/40 flex items-center justify-center text-[#D1B9B3]">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">Transmitting Safaricom M-Pesa</h3>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-[#763698]/25 border border-[#763698]/50 flex items-center justify-center text-[#D1B9B3]">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">M-Pesa Sent Successfully</h3>
              </div>

              <div className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl p-3.5 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Amount Sent</span>
                  <span className="text-[#D1B9B3] font-bold">{numericAmount.toLocaleString()} KES</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Recipient</span>
                  <span className="text-[#F8F0E7]">{getRecipientDisplay()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Service Fee</span>
                  <span className="text-[#9B97A2]">{fee} KES</span>
                </div>
                {realReference && (
                  <div className="flex justify-between">
                    <span className="text-[#9B97A2]">Reference</span>
                    <span className="text-[#D1B9B3] font-mono text-[10px] truncate max-w-[180px]">{realReference}</span>
                  </div>
                )}
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

          {step === 'error' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-[#946069]/20 border border-[#946069]/40 flex items-center justify-center text-[#946069]">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">M-Pesa Request Failed</h3>
                <p className="text-xs text-[#9B97A2] font-mono mt-1 px-4">{errorMessage}</p>
              </div>

              <button
                type="button"
                onClick={() => setStep('input')}
                className="w-full h-11 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] text-[#F8F0E7] font-medium text-sm transition-all"
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { UserWallet, ExchangeRates, Transaction } from '../types';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import {
  sendMpesaPayout,
  formatKenyanDisplayPhone,
  isValidKenyanPhone,
  VerifyC2BResponse,
  verifyC2BHakikisha,
} from '../services/mpesaService';
import { KenyaPhoneInput } from './KenyaPhoneInput';

interface SendMpesaModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet;
  rates: ExchangeRates;
  onSuccess: (tx: Omit<Transaction, 'id' | 'timestamp'>) => void;
}

export const SendMpesaModal: React.FC<SendMpesaModalProps> = ({
  isOpen,
  onClose,
  wallet,
  rates,
  onSuccess,
}) => {
  const [recipientType, setRecipientType] = useState<'phone' | 'till' | 'paybill'>('phone');
  const [phone, setPhone] = useState<string>('');
  const [tillNumber, setTillNumber] = useState<string>('');
  const [paybillNumber, setPaybillNumber] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('500');
  const [step, setStep] = useState<'input' | 'processing' | 'success' | 'error'>('input');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [realReference, setRealReference] = useState<string>('');
  const [c2bVerified, setC2bVerified] = useState<VerifyC2BResponse | null>(null);
  const [isVerifyingC2b, setIsVerifyingC2b] = useState(false);
  const [c2bError, setC2bError] = useState<string>('');

  const handleVerifyC2b = async () => {
    const code = recipientType === 'till' ? tillNumber : paybillNumber;
    if (!code.trim()) return;
    setIsVerifyingC2b(true);
    setC2bError('');
    try {
      const res = await verifyC2BHakikisha(
        code,
        recipientType === 'paybill' ? accountNumber : undefined
      );
      if (res.success && res.verified) {
        setC2bVerified(res);
      } else {
        setC2bError(res.error || 'Could not verify merchant details via C2B Hakikisha.');
      }
    } catch {
      setC2bError('Network error verifying merchant.');
    } finally {
      setIsVerifyingC2b(false);
    }
  };

  if (!isOpen) return null;

  const numericAmount = parseFloat(amountStr) || 0;
  const availableSats = wallet.satsBalance ?? Math.round((wallet.btcBalance || 0) * 100_000_000);

  const btcKesRate = rates.btcKes;
  const satsRequired = btcKesRate > 0 ? Math.round((numericAmount / btcKesRate) * 100_000_000) : 0;
  const satsFee = 250;

  const isInsufficientSats = satsRequired + satsFee > availableSats;

  const getRecipientDisplay = () => {
    if (recipientType === 'phone') {
      return formatKenyanDisplayPhone(phone);
    }
    if (recipientType === 'till') {
      const nameTag = c2bVerified?.name ? ` (${c2bVerified.name})` : '';
      return `Till No. ${tillNumber}${nameTag}`;
    }
    const nameTag = c2bVerified?.name ? ` (${c2bVerified.name})` : '';
    return `Paybill ${paybillNumber} (Acc: ${accountNumber})${nameTag}`;
  };

  const handleConfirm = async () => {
    if (numericAmount <= 0) return;

    if (btcKesRate <= 0) {
      setErrorMessage('Live Bitcoin exchange rates are unavailable. Connect to the internet to calculate Sats conversion.');
      setStep('error');
      return;
    }

    if (recipientType === 'phone') {
      if (!phone || phone.length < 12) {
        setErrorMessage('Please enter a valid 9-digit Kenyan phone number.');
        setStep('error');
        return;
      }
    } else {
      setErrorMessage('Direct disbursement to Till and Paybill requires Safaricom B2B API credentials (MPESA_B2B_SHORTCODE). Only personal phone P2P transfers are currently supported.');
      setStep('error');
      return;
    }

    if (isInsufficientSats) {
      setErrorMessage(`Insufficient Sats balance. Required: ${(satsRequired + satsFee).toLocaleString()} Sats, Available: ${availableSats.toLocaleString()} Sats.`);
      setStep('error');
      return;
    }

    setStep('processing');
    setErrorMessage('');

    try {
      const res = await sendMpesaPayout({
        phone,
        amount: numericAmount,
        currency: 'KES',
        satsAmount: satsRequired,
        note: 'Sats to M-Pesa Transfer',
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to dispatch M-Pesa payment.');
        setStep('error');
        return;
      }

      if (!res.referenceNumber) {
        setErrorMessage('M-Pesa payout succeeded but no Safaricom transaction reference number was returned.');
        setStep('error');
        return;
      }

      const refCode = res.referenceNumber;
      setRealReference(refCode);

      onSuccess({
        type: 'send_mpesa',
        title: `Sent Sats to M-Pesa (${formatKenyanDisplayPhone(phone)})`,
        status: 'completed',
        fromCurrency: 'SATS',
        fromAmount: satsRequired,
        toCurrency: 'KES',
        toAmount: numericAmount,
        fee: satsFee,
        feeCurrency: 'SATS',
        rateUsed: btcKesRate,
        recipient: getRecipientDisplay(),
        referenceNumber: refCode,
        walletType: wallet.type,
        note: `Sats cashout directly to ${formatKenyanDisplayPhone(phone)} on M-Pesa`,
      });

      setStep('success');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error processing transfer.');
      setStep('error');
    }
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
          <h2 className="text-base font-bold text-[#F8F0E7]">Send M-Pesa</h2>
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
                  {availableSats.toLocaleString()} Sats
                </span>
              </div>

              {/* Transfer Category */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setRecipientType('phone')}
                  className={`p-2 rounded-xl border text-xs font-medium transition-all ${
                    recipientType === 'phone'
                      ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                      : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
                  }`}
                >
                  Phone
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientType('till')}
                  className={`p-2 rounded-xl border text-xs font-medium transition-all ${
                    recipientType === 'till'
                      ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                      : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
                  }`}
                >
                  Till
                </button>
                <button
                  type="button"
                  onClick={() => setRecipientType('paybill')}
                  className={`p-2 rounded-xl border text-xs font-medium transition-all ${
                    recipientType === 'paybill'
                      ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                      : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
                  }`}
                >
                  Paybill
                </button>
              </div>

              {/* Recipient Input */}
              {recipientType === 'phone' && (
                <KenyaPhoneInput
                  value={phone}
                  onChange={(full) => setPhone(full)}
                  label="Recipient Phone"
                />
              )}

              {recipientType === 'till' && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-[#D1B9B3]">
                    Till Number
                  </label>
                  <input
                    type="text"
                    value={tillNumber}
                    onChange={(e) => {
                      setTillNumber(e.target.value);
                      if (c2bVerified) setC2bVerified(null);
                    }}
                    placeholder="Till Number"
                    className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-2.5 text-sm font-mono text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                  />
                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={handleVerifyC2b}
                      disabled={isVerifyingC2b || !tillNumber.trim()}
                      className="px-2.5 py-1 rounded-xl bg-[#231A2D] border border-[#3C2E49] text-[#D1B9B3] hover:text-[#F8F0E7] text-xs font-mono transition-colors disabled:opacity-50"
                    >
                      {isVerifyingC2b ? 'Verifying...' : 'Verify'}
                    </button>
                    {c2bVerified && (
                      <span className="font-mono text-emerald-400 font-semibold truncate max-w-[200px]">
                        {c2bVerified.name}
                      </span>
                    )}
                  </div>
                  {c2bError && (
                    <div className="text-xs font-mono text-[#946069]">
                      {c2bError}
                    </div>
                  )}
                </div>
              )}

              {recipientType === 'paybill' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-[#D1B9B3] mb-1">
                        Business No.
                      </label>
                      <input
                        type="text"
                        value={paybillNumber}
                        onChange={(e) => {
                          setPaybillNumber(e.target.value);
                          if (c2bVerified) setC2bVerified(null);
                        }}
                        placeholder="Business Number"
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
                        onChange={(e) => {
                          setAccountNumber(e.target.value);
                          if (c2bVerified) setC2bVerified(null);
                        }}
                        placeholder="Account Number"
                        className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-3 py-2 text-xs font-mono text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <button
                      type="button"
                      onClick={handleVerifyC2b}
                      disabled={isVerifyingC2b || !paybillNumber.trim()}
                      className="px-2.5 py-1 rounded-xl bg-[#231A2D] border border-[#3C2E49] text-[#D1B9B3] hover:text-[#F8F0E7] text-xs font-mono transition-colors disabled:opacity-50"
                    >
                      {isVerifyingC2b ? 'Verifying...' : 'Verify'}
                    </button>
                    {c2bVerified && (
                      <span className="font-mono text-emerald-400 font-semibold truncate max-w-[200px]">
                        {c2bVerified.name}
                      </span>
                    )}
                  </div>
                  {c2bError && (
                    <div className="text-xs font-mono text-[#946069]">
                      {c2bError}
                    </div>
                  )}
                </div>
              )}

              {/* Amount to send */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1.5">
                  Amount (KES)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="0"
                    min="1"
                    className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-3 text-lg font-mono font-bold text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                  />
                  <span className="absolute right-4 top-3.5 font-mono text-sm font-semibold text-[#D1B9B3]">
                    KES
                  </span>
                </div>
              </div>

              {/* Summary */}
              <div className="space-y-1.5 px-1 font-mono text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[#9B97A2]">Total Sats</span>
                  <span className="font-bold text-[#F8F0E7]">
                    {(satsRequired + satsFee).toLocaleString()} Sats
                  </span>
                </div>
                <div className="flex justify-between items-center text-[#9B97A2]">
                  <span>Fee</span>
                  <span>{satsFee} Sats</span>
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={
                  numericAmount <= 0 ||
                  (recipientType === 'phone' && !isValidKenyanPhone(phone)) ||
                  (recipientType === 'till' && !tillNumber.trim()) ||
                  (recipientType === 'paybill' && (!paybillNumber.trim() || !accountNumber.trim())) ||
                  isInsufficientSats
                }
                className="w-full h-12 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] active:scale-[0.98] text-[#F8F0E7] font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 mt-2 shadow-md shadow-[#763698]/20"
              >
                {isInsufficientSats ? 'Insufficient Sats Balance' : 'Send M-Pesa'}
              </button>
            </>
          )}

          {step === 'processing' && (
            <div className="py-8 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#763698]/20 border border-[#763698]/40 flex items-center justify-center text-[#D1B9B3]">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">Sending M-Pesa</h3>
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-red-950/30 border border-red-500/40 flex items-center justify-center text-red-400">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">Transfer Failed</h3>
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

          {step === 'success' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-[#763698]/25 border border-[#763698]/50 flex items-center justify-center text-[#D1B9B3]">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">M-Pesa Sent</h3>
              </div>

              <div className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl p-3.5 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Amount Sent</span>
                  <span className="text-[#F8F0E7] font-bold">{numericAmount.toLocaleString()} KES</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Recipient</span>
                  <span className="text-[#D1B9B3]">{getRecipientDisplay()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Sats Deducted</span>
                  <span className="text-[#D1B9B3] font-bold">{(satsRequired + satsFee).toLocaleString()} Sats</span>
                </div>
                {realReference && (
                  <div className="flex justify-between">
                    <span className="text-[#9B97A2]">Reference</span>
                    <span className="text-[#D1B9B3] text-[11px]">{realReference}</span>
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
        </div>
      </div>
    </div>
  );
};

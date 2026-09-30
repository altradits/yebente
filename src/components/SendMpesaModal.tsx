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
} from '../services/mpesaService';
import {
  sendTelebirrPayout,
  formatEthiopianDisplayPhone,
  isValidEthiopianPhone,
} from '../services/telebirrService';
import { KenyaPhoneInput } from './KenyaPhoneInput';
import { EthiopiaPhoneInput } from './EthiopiaPhoneInput';

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
  const [rail, setRail] = useState<'mpesa' | 'telebirr'>('mpesa');
  const [amountMode, setAmountMode] = useState<'fiat' | 'sats'>('fiat');
  const [phone, setPhone] = useState<string>('');
  const [fiatAmountStr, setFiatAmountStr] = useState<string>('500');
  const [satsAmountStr, setSatsAmountStr] = useState<string>('');
  const [step, setStep] = useState<'input' | 'processing' | 'success' | 'error'>('input');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [realReference, setRealReference] = useState<string>('');

  if (!isOpen) return null;

  const currentRate = rail === 'mpesa' ? rates.btcKes : rates.btcEtb;
  const currencyCode = rail === 'mpesa' ? 'KES' : 'ETB';
  const amountValue = parseFloat(amountMode === 'fiat' ? fiatAmountStr : satsAmountStr) || 0;
  const availableSats = wallet.satsBalance ?? Math.round((wallet.btcBalance || 0) * 100_000_000);

  const numericAmount = amountMode === 'fiat'
    ? amountValue
    : currentRate > 0
      ? Math.round((amountValue / 100_000_000) * currentRate)
      : 0;

  const satsRequired = currentRate > 0
    ? amountMode === 'fiat'
      ? Math.round((numericAmount / currentRate) * 100_000_000)
      : Math.round(amountValue)
    : 0;

  const satsFee = 250;
  const isInsufficientSats = satsRequired + satsFee > availableSats;

  const getRecipientDisplay = () =>
    rail === 'mpesa' ? formatKenyanDisplayPhone(phone) : formatEthiopianDisplayPhone(phone);

  const isPhoneValid = rail === 'mpesa' ? isValidKenyanPhone(phone) : isValidEthiopianPhone(phone);

  const handleConfirm = async () => {
    if (numericAmount <= 0) return;

    if (currentRate <= 0) {
      setErrorMessage(`Live Bitcoin exchange rates are unavailable. Connect to the internet to calculate ${currencyCode} payout.`);
      setStep('error');
      return;
    }

    if (!isPhoneValid) {
      setErrorMessage(
        rail === 'mpesa'
          ? 'Enter a valid Kenyan M-Pesa phone number: 07XXXXXXXX or 01XXXXXXXX.'
          : 'Enter a valid Ethiopian Telebirr phone number: 09XXXXXXXX or 07XXXXXXXX.'
      );
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
      if (rail === 'mpesa') {
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
          title: `Send M-Pesa (${formatKenyanDisplayPhone(phone)})`,
          status: 'completed',
          fromCurrency: 'SATS',
          fromAmount: satsRequired,
          toCurrency: 'KES',
          toAmount: numericAmount,
          fee: satsFee,
          feeCurrency: 'SATS',
          rateUsed: currentRate,
          recipient: getRecipientDisplay(),
          referenceNumber: refCode,
          walletType: wallet.type,
          note: `M-Pesa payout to ${formatKenyanDisplayPhone(phone)}`,
        });

        setStep('success');
      } else {
        // Telebirr Payout
        const res = await sendTelebirrPayout({
          phone,
          amount: numericAmount,
          currency: 'ETB',
          satsAmount: satsRequired,
          note: 'Sats to Telebirr Transfer',
        });

        if (!res.success) {
          setErrorMessage(res.error || 'Failed to dispatch Telebirr payment.');
          setStep('error');
          return;
        }

        if (!res.referenceNumber) {
          setErrorMessage('Telebirr payout succeeded but no transaction reference was returned.');
          setStep('error');
          return;
        }

        const refCode = res.referenceNumber;
        setRealReference(refCode);

        onSuccess({
          type: 'send_telebirr',
          title: `Send Telebirr (${formatEthiopianDisplayPhone(phone)})`,
          status: 'completed',
          fromCurrency: 'SATS',
          fromAmount: satsRequired,
          toCurrency: 'ETB',
          toAmount: numericAmount,
          fee: satsFee,
          feeCurrency: 'SATS',
          rateUsed: currentRate,
          recipient: getRecipientDisplay(),
          referenceNumber: refCode,
          walletType: wallet.type,
          note: `Telebirr payout to ${formatEthiopianDisplayPhone(phone)}`,
        });

        setStep('success');
      }
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

  const headerTitle = rail === 'mpesa' ? 'Send M-Pesa' : 'Send Telebirr';
  const ctaLabel = currentRate <= 0
    ? 'Rates Unavailable'
    : isInsufficientSats
      ? 'Insufficient Sats Balance'
      : headerTitle;

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
          <h2 className="text-base font-bold text-[#F8F0E7]">{headerTitle}</h2>
          <div className="w-8" aria-hidden="true" />
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {step === 'input' && (
            <>
              {/* Rail Selection */}
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Select mobile network">
                <button
                  type="button"
                  onClick={() => {
                    setRail('mpesa');
                    setPhone('');
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                    rail === 'mpesa'
                      ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                      : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
                  }`}
                >
                  M-Pesa (KES)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRail('telebirr');
                    setPhone('');
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                    rail === 'telebirr'
                      ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                      : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
                  }`}
                >
                  Telebirr (ETB)
                </button>
              </div>

              {/* Balance Display */}
              <div className="flex justify-between items-center px-1 text-xs">
                <span className="text-[#9B97A2]">Available</span>
                <span className="font-mono font-semibold text-[#D1B9B3]">
                  {availableSats.toLocaleString()} Sats (~{Math.round((availableSats / 100_000_000) * currentRate).toLocaleString()} {currencyCode})
                </span>
              </div>

              {/* Phone Input */}
              {rail === 'mpesa' ? (
                <KenyaPhoneInput
                  value={phone}
                  onChange={(full) => setPhone(full)}
                  label="M-Pesa Recipient Phone"
                  ariaLabel="M-Pesa recipient phone"
                />
              ) : (
                <EthiopiaPhoneInput
                  value={phone}
                  onChange={(full) => setPhone(full)}
                  label="Telebirr Recipient Phone"
                  ariaLabel="Telebirr recipient phone"
                />
              )}

              {/* Currency vs Sats toggle */}
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Amount entry mode">
                <button
                  type="button"
                  onClick={() => setAmountMode('fiat')}
                  aria-pressed={amountMode === 'fiat'}
                  className={`h-10 rounded-xl border text-xs font-semibold transition-colors ${
                    amountMode === 'fiat'
                      ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                      : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
                  }`}
                >
                  Enter {currencyCode}
                </button>
                <button
                  type="button"
                  onClick={() => setAmountMode('sats')}
                  aria-pressed={amountMode === 'sats'}
                  className={`h-10 rounded-xl border text-xs font-semibold transition-colors ${
                    amountMode === 'sats'
                      ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                      : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
                  }`}
                >
                  Enter Sats
                </button>
              </div>

              {/* Amount to cash out */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1.5">
                  {amountMode === 'fiat' ? `${headerTitle} amount` : 'Sats to send'}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={amountMode === 'fiat' ? fiatAmountStr : satsAmountStr}
                    onChange={(e) => {
                      if (amountMode === 'fiat') {
                        setFiatAmountStr(e.target.value);
                      } else {
                        setSatsAmountStr(e.target.value);
                      }
                    }}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="0"
                    min="1"
                    className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-3 text-lg font-mono font-bold text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                  />
                  <span className="absolute right-4 top-3.5 font-mono text-sm font-semibold text-[#D1B9B3]">
                    {amountMode === 'fiat' ? currencyCode : 'Sats'}
                  </span>
                </div>
              </div>

              {/* Summary */}
              <div className="space-y-1.5 px-1 font-mono text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-[#9B97A2]">Sats deducted</span>
                  <span className="font-bold text-[#F8F0E7]">
                    {(satsRequired + satsFee).toLocaleString()} Sats
                  </span>
                </div>
                <div className="flex justify-between items-center text-[#9B97A2]">
                  <span>{rail === 'mpesa' ? 'M-Pesa payout' : 'Telebirr payout'}</span>
                  <span>{numericAmount.toLocaleString()} {currencyCode}</span>
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
                  amountValue <= 0 ||
                  !isPhoneValid ||
                  currentRate <= 0 ||
                  isInsufficientSats
                }
                className="w-full h-12 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] active:scale-[0.98] text-[#F8F0E7] font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 mt-2 shadow-md shadow-[#763698]/20"
              >
                {ctaLabel}
              </button>
            </>
          )}

          {step === 'processing' && (
            <div className="py-8 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#763698]/20 border border-[#763698]/40 flex items-center justify-center text-[#D1B9B3]">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">
                  {rail === 'mpesa' ? 'Sending M-Pesa' : 'Sending Telebirr'}
                </h3>
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
                <h3 className="text-lg font-bold text-[#F8F0E7]">
                  {rail === 'mpesa' ? 'M-Pesa Sent' : 'Telebirr Sent'}
                </h3>
              </div>

              <div className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl p-3.5 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Amount Sent</span>
                  <span className="text-[#F8F0E7] font-bold">{numericAmount.toLocaleString()} {currencyCode}</span>
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

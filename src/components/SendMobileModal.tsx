import React, { useState, useEffect, useRef } from 'react';
import { UserWallet, ExchangeRates, Transaction } from '../types';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import {
  isValidKenyanPhone,
  formatKenyanDisplayPhone,
  isValidEthiopianPhone,
  formatEthiopianDisplayPhone,
} from '../services/phone';
import {
  requestFiatQuote,
  startFiatTransfer,
  queryFiatStatus,
  newIdempotencyKey,
} from '../services/fiatService';
import { KenyaPhoneInput } from './KenyaPhoneInput';
import { EthiopiaPhoneInput } from './EthiopiaPhoneInput';

interface SendMobileModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet;
  rates: ExchangeRates;
  onSuccess: (tx: Omit<Transaction, 'id' | 'timestamp'>) => void;
}

type Rail = 'kenya' | 'ethiopia';

const RAIL_CURRENCY: Record<Rail, 'KES' | 'ETB'> = { kenya: 'KES', ethiopia: 'ETB' };

export const SendMobileModal: React.FC<SendMobileModalProps> = ({
  isOpen,
  onClose,
  wallet,
  rates,
  onSuccess,
}) => {
  const [rail, setRail] = useState<Rail>('kenya');
  const [amountMode, setAmountMode] = useState<'fiat' | 'sats'>('fiat');
  const [phone, setPhone] = useState<string>('');
  const [fiatAmountStr, setFiatAmountStr] = useState<string>('500');
  const [satsAmountStr, setSatsAmountStr] = useState<string>('');
  const [step, setStep] = useState<'input' | 'processing' | 'success' | 'error'>('input');
  const [processingStatus, setProcessingStatus] = useState<string>('Requesting quote...');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [errorUnavailable, setErrorUnavailable] = useState<boolean>(false);
  const [realReference, setRealReference] = useState<string>('');
  const [quotedFiat, setQuotedFiat] = useState<number>(0);
  const [quotedFeeFiat, setQuotedFeeFiat] = useState<number>(0);
  const [isVerifyingStatus, setIsVerifyingStatus] = useState<boolean>(false);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeReferenceRef = useRef<string>('');

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const currencyCode = RAIL_CURRENCY[rail];
  const currentRate = rail === 'kenya' ? rates.btcKes : rates.btcEtb;
  const amountValue = parseFloat(amountMode === 'fiat' ? fiatAmountStr : satsAmountStr) || 0;
  const availableSats = wallet.satsBalance ?? Math.round((wallet.btcBalance || 0) * 100_000_000);

  // Preview conversion at the owner-set rate; exact numbers come from the quote.
  const previewSats = currentRate > 0
    ? (amountMode === 'fiat'
        ? Math.round((amountValue / currentRate) * 100_000_000)
        : Math.round(amountValue))
    : 0;
  const previewFiat = currentRate > 0
    ? (amountMode === 'fiat'
        ? amountValue
        : Math.round((amountValue / 100_000_000) * currentRate * 100) / 100)
    : 0;

  const isPhoneValid = rail === 'kenya' ? isValidKenyanPhone(phone) : isValidEthiopianPhone(phone);
  const getRecipientDisplay = () =>
    rail === 'kenya' ? formatKenyanDisplayPhone(phone) : formatEthiopianDisplayPhone(phone);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  const fail = (message: string, unavailable: boolean) => {
    stopPolling();
    setErrorMessage(message);
    setErrorUnavailable(unavailable);
    setStep('error');
  };

  const succeed = (reference: string, sats: number, fiat: number, feeFiat: number, receipt?: string) => {
    stopPolling();
    setRealReference(receipt || reference);
    setQuotedFiat(fiat);
    setQuotedFeeFiat(feeFiat);
    onSuccess({
      type: 'send_mobile',
      title: `Send Mobile (${getRecipientDisplay()})`,
      status: 'completed',
      fromCurrency: 'SATS',
      fromAmount: sats,
      toCurrency: currencyCode,
      toAmount: fiat,
      fee: 0,
      feeCurrency: 'SATS',
      realFeeSats: 0,
      realFeeFiat: feeFiat,
      realFeeCurrency: currencyCode,
      feeSource: 'fixed',
      rateUsed: currentRate,
      recipient: getRecipientDisplay(),
      referenceNumber: receipt || reference,
      walletType: 'custodial',
      note: `Mobile-money payout (${currencyCode}) to ${getRecipientDisplay()}`,
    });
    setStep('success');
  };

  const pollStatus = (reference: string, sats: number, fiat: number, feeFiat: number, attemptsLeft: number) => {
    stopPolling();
    pollIntervalRef.current = setInterval(async () => {
      try {
        const statusRes = await queryFiatStatus(reference);
        if (!statusRes.success) {
          if (statusRes.unavailable) {
            fail(statusRes.error || 'This fiat rail is not available yet.', true);
            return;
          }
          return; // unclear answer: keep polling, never treat as failed
        }
        if (statusRes.state === 'paid') {
          succeed(reference, sats, fiat, feeFiat, statusRes.receipt);
          return;
        }
        if (statusRes.state === 'failed') {
          fail('The payout failed on the money network. No Sats were taken.', false);
          return;
        }
        setProcessingStatus('Waiting for the money network to confirm...');
      } catch {
        // Continue polling until attempts run out
      }
      attemptsLeft -= 1;
      if (attemptsLeft <= 0) {
        stopPolling();
        setProcessingStatus('Still waiting. Check the payout status now.');
      }
    }, 3000);
  };

  const handleManualVerify = async () => {
    const reference = activeReferenceRef.current;
    if (!reference || isVerifyingStatus) return;
    setIsVerifyingStatus(true);
    try {
      const statusRes = await queryFiatStatus(reference);
      if (!statusRes.success && statusRes.unavailable) {
        fail(statusRes.error || 'This fiat rail is not available yet.', true);
      }
    } finally {
      setIsVerifyingStatus(false);
    }
  };

  const handleConfirm = async () => {
    if (amountValue <= 0) return;

    if (!isPhoneValid) {
      fail(
        rail === 'kenya'
          ? 'Enter a valid Kenyan phone number: 07XXXXXXXX or 01XXXXXXXX.'
          : 'Enter a valid Ethiopian phone number: 09XXXXXXXX or 07XXXXXXXX.',
        false
      );
      return;
    }

    if (currentRate <= 0) {
      fail('Exchange rates are not available yet. Connect to the backend to price a payout.', true);
      return;
    }

    if (previewSats > availableSats) {
      fail(
        `Insufficient Sats balance. Required: about ${previewSats.toLocaleString()} Sats, Available: ${availableSats.toLocaleString()} Sats.`,
        false
      );
      return;
    }

    setStep('processing');
    setErrorMessage('');
    setErrorUnavailable(false);
    setProcessingStatus('Requesting quote...');

    const quote = await requestFiatQuote({ direction: 'sell', currency: currencyCode, amount: previewSats });
    if (!quote.success) {
      fail(quote.error || 'A fiat quote is not available yet.', Boolean(quote.unavailable));
      return;
    }

    const quotedSats = quote.sats || previewSats;
    const quotedFiatMinor = quote.fiatMinor || 0;
    const quotedFeeMinor = quote.feeFiatMinor || 0;
    setProcessingStatus('Starting payout on the money network...');

    const transfer = await startFiatTransfer({
      direction: 'sell',
      quoteId: quote.quoteId || '',
      phone,
      idempotencyKey: newIdempotencyKey(),
    });
    if (!transfer.success || !transfer.reference) {
      fail(transfer.error || 'This fiat rail is not available yet.', Boolean(transfer.unavailable));
      return;
    }

    setRealReference(transfer.reference);
    activeReferenceRef.current = transfer.reference;
    if (transfer.state === 'paid') {
      succeed(transfer.reference, quotedSats, quotedFiatMinor / 100, quotedFeeMinor / 100, transfer.receipt);
      return;
    }
    setProcessingStatus('Payout started. Waiting for the money network...');
    pollStatus(transfer.reference, quotedSats, quotedFiatMinor / 100, quotedFeeMinor / 100, 40);
  };

  const handleResetAndClose = () => {
    stopPolling();
    activeReferenceRef.current = '';
    setStep('input');
    setErrorMessage('');
    setErrorUnavailable(false);
    onClose();
  };

  const handleBack = () => {
    if (step === 'processing' || step === 'error' || step === 'success') {
      stopPolling();
      setStep('input');
      setErrorMessage('');
      setErrorUnavailable(false);
      return;
    }
    handleResetAndClose();
  };

  const isFormValid = amountValue > 0 && currentRate > 0 && isPhoneValid;

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
          <h2 className="text-base font-bold text-[#F8F0E7]">Send Mobile</h2>
          <div className="w-8" aria-hidden="true" />
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4">
          {step === 'input' && (
            <>
              {/* Rail selector */}
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Select mobile-money rail">
                <button
                  type="button"
                  onClick={() => {
                    setRail('kenya');
                    setPhone('');
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                    rail === 'kenya'
                      ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                      : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
                  }`}
                >
                  Kenya (KES)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRail('ethiopia');
                    setPhone('');
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                    rail === 'ethiopia'
                      ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                      : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
                  }`}
                >
                  Ethiopia (ETB)
                </button>
              </div>

              {/* Amount mode toggle */}
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Amount in fiat or sats">
                <button
                  type="button"
                  onClick={() => setAmountMode('fiat')}
                  className={`p-2 rounded-xl border text-xs font-semibold transition-all ${
                    amountMode === 'fiat'
                      ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                      : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
                  }`}
                >
                  Amount in {currencyCode}
                </button>
                <button
                  type="button"
                  onClick={() => setAmountMode('sats')}
                  className={`p-2 rounded-xl border text-xs font-semibold transition-all ${
                    amountMode === 'sats'
                      ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                      : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
                  }`}
                >
                  Amount in Sats
                </button>
              </div>

              {/* Amount input */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1.5">
                  Amount ({amountMode === 'fiat' ? currencyCode : 'Sats'})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={amountMode === 'fiat' ? fiatAmountStr : satsAmountStr}
                    onChange={(e) => (amountMode === 'fiat' ? setFiatAmountStr(e.target.value) : setSatsAmountStr(e.target.value))}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="0"
                    className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-3 text-lg font-mono font-bold text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                  />
                  <span className="absolute right-4 top-3.5 font-mono text-sm font-semibold text-[#D1B9B3]">
                    {amountMode === 'fiat' ? currencyCode : 'Sats'}
                  </span>
                </div>
              </div>

              {/* Conversion preview */}
              <div className="flex justify-between items-center px-1 text-xs">
                <span className="text-[#9B97A2]">
                  {amountMode === 'fiat' ? 'Sats Required (estimated)' : 'Recipient Gets (estimated)'}
                </span>
                <span className="font-mono font-bold text-[#F8F0E7]">
                  {amountMode === 'fiat'
                    ? `${previewSats.toLocaleString()} Sats`
                    : `${previewFiat.toLocaleString()} ${currencyCode}`}
                </span>
              </div>

              {/* Available balance */}
              <div className="flex justify-between items-center px-1 text-xs">
                <span className="text-[#9B97A2]">Available Balance</span>
                <span className="font-mono font-bold text-[#F8F0E7]">
                  {availableSats.toLocaleString()} Sats
                </span>
              </div>

              {/* Phone input component */}
              {rail === 'kenya' ? (
                <KenyaPhoneInput
                  value={phone}
                  onChange={(full) => setPhone(full)}
                  label="Recipient Kenya phone number"
                  ariaLabel="Recipient Kenya phone number"
                />
              ) : (
                <EthiopiaPhoneInput
                  value={phone}
                  onChange={(full) => setPhone(full)}
                  label="Recipient Ethiopia phone number"
                  ariaLabel="Recipient Ethiopia phone number"
                />
              )}

              {/* Action button */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!isFormValid}
                className="w-full h-12 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] active:scale-[0.98] text-[#F8F0E7] font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 mt-2 shadow-md shadow-[#763698]/20"
              >
                Send {currencyCode}
              </button>
            </>
          )}

          {step === 'processing' && (
            <div className="py-8 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#763698]/20 border border-[#763698]/40 flex items-center justify-center text-[#D1B9B3]">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">Processing Payout</h3>
                <p className="text-xs text-[#9B97A2] font-mono mt-1">{processingStatus}</p>
              </div>
              {realReference && (
                <button
                  type="button"
                  onClick={handleManualVerify}
                  disabled={isVerifyingStatus}
                  className="w-full h-11 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] active:scale-[0.98] text-[#F8F0E7] font-semibold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingStatus ? 'animate-spin' : ''}`} />
                  <span>{isVerifyingStatus ? 'Checking...' : 'Check Status Now'}</span>
                </button>
              )}
            </div>
          )}

          {step === 'success' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-[#763698]/25 border border-[#763698]/50 flex items-center justify-center text-[#D1B9B3]">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">Payout Delivered</h3>
                <p className="text-xs text-emerald-400 font-mono mt-0.5">
                  The money network confirmed the payout
                </p>
              </div>

              <div className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl p-3.5 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Fiat Delivered</span>
                  <span className="text-[#D1B9B3] font-bold">{quotedFiat.toLocaleString()} {currencyCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Fee</span>
                  <span className="text-[#D1B9B3]">{quotedFeeFiat.toLocaleString()} {currencyCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Recipient</span>
                  <span className="text-[#D1B9B3] font-mono">{getRecipientDisplay()}</span>
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
                <h3 className="text-lg font-bold text-[#F8F0E7]">
                  {errorUnavailable ? 'Not Available Yet' : 'Payout Incomplete'}
                </h3>
                <p className="text-xs text-[#9B97A2] font-mono mt-1 px-4">{errorMessage}</p>
              </div>

              <button
                type="button"
                onClick={() => setStep('input')}
                className="w-full h-11 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] text-[#F8F0E7] font-medium text-sm transition-all"
              >
                Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

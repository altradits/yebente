import React, { useState, useEffect, useRef } from 'react';
import { UserWallet, ExchangeRates, Transaction } from '../types';
import { ArrowLeft, CheckCircle2, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import {
  isValidKenyanPhone,
  formatKenyanDisplayPhone,
} from '../services/phone';
import {
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

interface BuyBtcModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet;
  rates: ExchangeRates;
  onSuccess: (tx: Omit<Transaction, 'id' | 'timestamp'>) => void;
}

type Rail = 'kenya' | 'ethiopia';

const RAIL_CURRENCY: Record<Rail, 'KES' | 'ETB'> = { kenya: 'KES', ethiopia: 'ETB' };

export const BuyBtcModal: React.FC<BuyBtcModalProps> = ({
  isOpen,
  onClose,
  wallet,
  rates,
  onSuccess,
}) => {
  const [rail, setRail] = useState<Rail>('kenya');
  const [amountFiat, setAmountFiat] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [step, setStep] = useState<'input' | 'processing' | 'success' | 'error'>('input');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [errorUnavailable, setErrorUnavailable] = useState<boolean>(false);
  const [processingStatus, setProcessingStatus] = useState<string>('Requesting quote...');
  const [realReference, setRealReference] = useState<string>('');
  const [quotedSats, setQuotedSats] = useState<number>(0);
  const [quotedFee, setQuotedFee] = useState<number>(0);
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
  const numericFiat = parseFloat(amountFiat) || 0;
  const satsPreview = currentRate > 0 ? Math.round((numericFiat / currentRate) * 100_000_000) : 0;
  const isPhoneValid = rail === 'kenya' ? isValidKenyanPhone(phone) : isValidEthiopianPhone(phone);
  const displayPhone = rail === 'kenya'
    ? formatKenyanDisplayPhone(phone)
    : formatEthiopianDisplayPhone(phone);

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

  const succeed = (reference: string, sats: number, feeFiat: number, receipt?: string) => {
    stopPolling();
    setRealReference(receipt || reference);
    setQuotedSats(sats);
    setQuotedFee(feeFiat);
    onSuccess({
      type: 'buy_btc',
      title: `Buy Sats via Mobile Money (${currencyCode})`,
      status: 'completed',
      fromCurrency: currencyCode,
      fromAmount: numericFiat,
      toCurrency: 'SATS',
      toAmount: sats,
      rateUsed: currentRate,
      fee: feeFiat,
      feeCurrency: currencyCode,
      realFeeSats: 0,
      realFeeFiat: feeFiat,
      realFeeCurrency: currencyCode,
      feeSource: 'fixed',
      recipient: wallet.type === 'custodial' ? 'In-App Wallet' : wallet.nonCustodialAddress,
      referenceNumber: receipt || reference,
      walletType: 'custodial',
      note: `Mobile-money collection (${currencyCode}) to ${wallet.type === 'custodial' ? 'in-app wallet' : wallet.nonCustodialAddress}`,
    });
    setStep('success');
  };

  const pollStatus = (reference: string, sats: number, feeFiat: number, attemptsLeft: number) => {
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
          succeed(reference, sats, feeFiat, statusRes.receipt);
          return;
        }
        if (statusRes.state === 'failed') {
          fail('The collection failed on the money network. No Sats were credited.', false);
          return;
        }
        setProcessingStatus('Waiting for the money network to confirm...');
      } catch {
        // Continue polling until attempts run out
      }
      attemptsLeft -= 1;
      if (attemptsLeft <= 0) {
        stopPolling();
        setProcessingStatus('Still waiting. If you authorized the payment, check its status now.');
        setIsVerifyingStatus(false);
      }
    }, 3000);
  };

  const handleManualVerify = async () => {
    const reference = activeReferenceRef.current;
    if (!reference || isVerifyingStatus) return;
    setIsVerifyingStatus(true);
    try {
      const statusRes = await queryFiatStatus(reference);
      if (statusRes.success && statusRes.state === 'paid') {
        succeed(reference, quotedSats, quotedFee, statusRes.receipt);
      } else if (statusRes.success && statusRes.state === 'failed') {
        fail('The collection failed on the money network. No Sats were credited.', false);
      }
    } finally {
      setIsVerifyingStatus(false);
    }
  };

  const handleConfirm = async () => {
    if (numericFiat <= 0) return;

    if (currentRate <= 0) {
      fail('Exchange rates are not available yet. Connect to the backend to calculate a Sats purchase.', true);
      return;
    }

    if (!isPhoneValid) {
      fail(
        rail === 'kenya'
          ? 'Please enter a valid Kenyan number: 07XXXXXXXX or 01XXXXXXXX.'
          : 'Please enter a valid Ethiopian number: 09XXXXXXXX or 07XXXXXXXX.',
        false
      );
      return;
    }

    setStep('processing');
    setErrorMessage('');
    setErrorUnavailable(false);
    setProcessingStatus('Requesting quote...');

    const fiatMinor = Math.round(numericFiat * 100);
    const quote = await requestFiatQuote({ direction: 'buy', currency: currencyCode, amount: fiatMinor });
    if (!quote.success) {
      fail(quote.error || 'A fiat quote is not available yet.', Boolean(quote.unavailable));
      return;
    }

    setQuotedSats(quote.sats || 0);
    setQuotedFee((quote.feeFiatMinor || 0) / 100);
    setProcessingStatus('Starting collection on the money network...');

    const transfer = await startFiatTransfer({
      direction: 'buy',
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
      succeed(transfer.reference, quote.sats || 0, (quote.feeFiatMinor || 0) / 100, transfer.receipt);
      return;
    }
    setProcessingStatus('Collection started. Confirm on your phone when prompted...');
    pollStatus(transfer.reference, quote.sats || 0, (quote.feeFiatMinor || 0) / 100, 40);
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

  const isFormValid = numericFiat > 0 && currentRate > 0 && isPhoneValid;

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
          <h2 className="text-base font-bold text-[#F8F0E7]">Buy Sats</h2>
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

              {/* Amount to spend */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1.5">
                  Amount ({currencyCode})
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={amountFiat}
                    onChange={(e) => setAmountFiat(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="0"
                    className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-3 text-lg font-mono font-bold text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                  />
                  <span className="absolute right-4 top-3.5 font-mono text-sm font-semibold text-[#D1B9B3]">
                    {currencyCode}
                  </span>
                </div>
              </div>

              {/* Sats preview */}
              <div className="flex justify-between items-center px-1 text-xs">
                <span className="text-[#9B97A2]">You Receive (estimated)</span>
                <span className="font-mono font-bold text-[#F8F0E7]">
                  +{satsPreview.toLocaleString()} Sats
                </span>
              </div>

              {/* Phone input component */}
              {rail === 'kenya' ? (
                <KenyaPhoneInput
                  value={phone}
                  onChange={(full) => setPhone(full)}
                  label="Kenya phone number"
                  ariaLabel="Kenya phone number"
                />
              ) : (
                <EthiopiaPhoneInput
                  value={phone}
                  onChange={(full) => setPhone(full)}
                  label="Ethiopia phone number"
                  ariaLabel="Ethiopia phone number"
                />
              )}

              {/* Action button */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!isFormValid}
                className="w-full h-12 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] active:scale-[0.98] text-[#F8F0E7] font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 mt-2 shadow-md shadow-[#763698]/20"
              >
                {currentRate <= 0 ? 'Rates Unavailable' : 'Buy Sats'}
              </button>
            </>
          )}

          {step === 'processing' && (
            <div className="py-8 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#763698]/20 border border-[#763698]/40 flex items-center justify-center text-[#D1B9B3]">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">Processing Collection</h3>
                <p className="text-xs text-[#9B97A2] font-mono mt-1">{processingStatus}</p>
              </div>
              {realReference && (
                <div className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl p-3.5 text-left font-mono text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-[#9B97A2]">Amount</span>
                    <span className="text-[#F8F0E7] font-bold">{numericFiat.toLocaleString()} {currencyCode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#9B97A2]">Quoted Sats</span>
                    <span className="text-[#D1B9B3] font-bold">+{quotedSats.toLocaleString()} Sats</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#9B97A2]">Reference</span>
                    <span className="text-[#9B97A2] text-[10px] truncate max-w-[170px]">{realReference}</span>
                  </div>
                </div>
              )}
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
                <h3 className="text-lg font-bold text-[#F8F0E7]">Payment Verified and Sats Credited</h3>
                <p className="text-xs text-emerald-400 font-mono mt-0.5">
                  The money network confirmed settlement
                </p>
              </div>

              <div className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl p-3.5 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Sats Acquired</span>
                  <span className="text-[#D1B9B3] font-bold">+{quotedSats.toLocaleString()} Sats</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Paid Amount</span>
                  <span className="text-[#F8F0E7]">{numericFiat.toLocaleString()} {currencyCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Fee</span>
                  <span className="text-[#D1B9B3]">{quotedFee.toLocaleString()} {currencyCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Phone Number</span>
                  <span className="text-[#D1B9B3] font-mono">{displayPhone}</span>
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
                  {errorUnavailable ? 'Not Available Yet' : 'Transaction Incomplete'}
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

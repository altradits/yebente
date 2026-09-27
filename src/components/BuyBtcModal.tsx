import React, { useState, useEffect, useRef } from 'react';
import { UserWallet, ExchangeRates, Transaction } from '../types';
import { X, ArrowDownLeft, Smartphone, CheckCircle2, Loader2, AlertTriangle, Zap, Copy, Check, RefreshCw } from 'lucide-react';
import { initiateStkPush, queryStkStatus, isValidKenyanPhone, formatKenyanDisplayPhone } from '../services/mpesaService';
import { isLightningAddress, resolveLightningAddress, createLightningInvoice } from '../services/lightningService';
import { KenyaPhoneInput } from './KenyaPhoneInput';

interface BuyBtcModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet;
  rates: ExchangeRates;
  onSuccess: (tx: Omit<Transaction, 'id' | 'timestamp'>) => void;
}

export const BuyBtcModal: React.FC<BuyBtcModalProps> = ({
  isOpen,
  onClose,
  wallet,
  rates,
  onSuccess,
}) => {
  const [source, setSource] = useState<'mpesa' | 'telebirr'>('mpesa');
  const [amountFiat, setAmountFiat] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [step, setStep] = useState<'input' | 'processing' | 'awaiting_pin' | 'success' | 'error'>('input');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [realReference, setRealReference] = useState<string>('');
  const [activeCheckoutId, setActiveCheckoutId] = useState<string>('');
  const [isVerifyingStatus, setIsVerifyingStatus] = useState<boolean>(false);
  const [pinSecondsLeft, setPinSecondsLeft] = useState<number>(45);
  const [lightningInvoice, setLightningInvoice] = useState<string>('');
  const [copiedInvoice, setCopiedInvoice] = useState(false);
  const [destMode, setDestMode] = useState<'custodial' | 'external'>(
    wallet.type === 'non-custodial' ? 'external' : 'custodial'
  );
  const [externalAddress, setExternalAddress] = useState<string>(
    wallet.nonCustodialAddress || ''
  );

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const currentRate = source === 'mpesa' ? rates.btcKes : rates.btcEtb;
  const currencyCode = source === 'mpesa' ? 'KES' : 'ETB';
  const numericFiat = parseFloat(amountFiat) || 0;
  const satsAmount = currentRate > 0 ? Math.round((numericFiat / currentRate) * 100_000_000) : 0;
  const estimatedFee = source === 'mpesa' ? 50 : 20;

  const handleSourceChange = (newSource: 'mpesa' | 'telebirr') => {
    setSource(newSource);
    setPhone('');
    setAmountFiat('');
    setErrorMessage('');
  };

  const handleCopyInvoice = () => {
    if (lightningInvoice) {
      navigator.clipboard.writeText(lightningInvoice);
      setCopiedInvoice(true);
      setTimeout(() => setCopiedInvoice(false), 2000);
    }
  };

  const handleManualVerify = async () => {
    if (!activeCheckoutId || isVerifyingStatus) return;
    setIsVerifyingStatus(true);
    try {
      const queryRes = await queryStkStatus(activeCheckoutId);
      processQueryResponse(queryRes);
    } finally {
      setIsVerifyingStatus(false);
    }
  };

  const processQueryResponse = (queryRes: any) => {
    const code = queryRes?.resultCode;

    // ResultCode 0 or '0' indicates confirmed settlement by Safaricom
    if (code === 0 || code === '0') {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      const refCode = queryRes.mpesaReceiptNumber || activeCheckoutId;
      setRealReference(refCode);

      onSuccess({
        type: 'buy_btc',
        title: 'Bought Sats via M-Pesa',
        status: 'completed',
        fromCurrency: 'KES',
        fromAmount: numericFiat,
        toCurrency: 'SATS',
        toAmount: satsAmount,
        rateUsed: currentRate,
        fee: estimatedFee,
        feeCurrency: 'KES',
        recipient: destMode === 'custodial' ? 'In-App Custodial Wallet' : externalAddress,
        referenceNumber: refCode,
        walletType: destMode === 'custodial' ? 'custodial' : 'non-custodial',
        note: `Daraja STK purchase to ${destMode === 'custodial' ? 'Custodial balance' : (externalAddress || 'Self-custody')}`,
      });

      setStep('success');
      return;
    }

    // Specific Safaricom cancellation or error codes
    if (code !== undefined && code !== null) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }

      if (code === 1032 || code === '1032') {
        setErrorMessage('M-Pesa payment prompt was cancelled on your phone (M-Pesa 1032). No Sats were credited.');
      } else if (code === 1037 || code === '1037') {
        setErrorMessage('M-Pesa PIN prompt timed out without PIN entry (M-Pesa 1037). No Sats were credited.');
      } else if (code === 2001 || code === '2001') {
        setErrorMessage('Incorrect M-Pesa PIN was entered (M-Pesa 2001). No Sats were credited.');
      } else if (code === 1 || code === '1') {
        setErrorMessage('Insufficient M-Pesa balance on your handset (M-Pesa 1). No Sats were credited.');
      } else {
        setErrorMessage(queryRes.resultDesc || 'M-Pesa payment processing failed. No Sats were credited.');
      }
      setStep('error');
    }
  };

  const handleConfirm = async () => {
    if (numericFiat <= 0) return;

    if (source === 'telebirr') {
      setErrorMessage('Telebirr live settlement rail will be activated in Issue #5. Please select M-Pesa for live settlement.');
      setStep('error');
      return;
    }

    if (!isValidKenyanPhone(phone)) {
      setErrorMessage('Please enter a valid Safaricom number: 07XXXXXXXX or 01XXXXXXXX');
      setStep('error');
      return;
    }

    if (currentRate <= 0) {
      setErrorMessage('Live Bitcoin exchange rates are unavailable. Connect to the internet to calculate Sats purchase.');
      setStep('error');
      return;
    }

    setStep('processing');
    setErrorMessage('');

    const res = await initiateStkPush({
      phone,
      amount: numericFiat,
      accountReference: 'BuySats',
      transactionDesc: 'Bitcoin Purchase',
    });

    if (!res.success || !res.checkoutRequestId) {
      setErrorMessage(res.error || 'Failed to dispatch M-Pesa STK Push prompt: No CheckoutRequestID returned.');
      setStep('error');
      return;
    }

    const refCode = res.checkoutRequestId;
    setActiveCheckoutId(refCode);
    setRealReference(refCode);
    setPinSecondsLeft(45);

    if (destMode === 'external' && externalAddress && isLightningAddress(externalAddress)) {
      try {
        const details = await resolveLightningAddress(externalAddress);
        if (details.success && details.callbackUrl) {
          const invRes = await createLightningInvoice(details.callbackUrl, satsAmount, 'Yebente Sats Purchase');
          if (invRes.success && invRes.invoice) {
            setLightningInvoice(invRes.invoice);
          }
        }
      } catch {
        // Safe fallback
      }
    }

    // Transition to awaiting_pin: await genuine Safaricom PIN entry and confirmation
    setStep('awaiting_pin');

    // Start polling Safaricom status every 2.5 seconds
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    let remaining = 45;
    pollIntervalRef.current = setInterval(async () => {
      remaining -= 2;
      setPinSecondsLeft(Math.max(0, remaining));

      try {
        const queryRes = await queryStkStatus(refCode);
        processQueryResponse(queryRes);
      } catch {
        // Continue polling until timeout
      }

      if (remaining <= 0) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      }
    }, 2500);
  };

  const handleResetAndClose = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setStep('input');
    setErrorMessage('');
    setLightningInvoice('');
    setActiveCheckoutId('');
    setCopiedInvoice(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#120E16]/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#1D1627] border border-[#3A2D47] rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl shadow-black/80 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#382B44]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#763698]/25 border border-[#763698]/50 flex items-center justify-center text-[#D1B9B3]">
              <ArrowDownLeft className="w-4 h-4 text-[#F8F0E7]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#F8F0E7]">Buy Sats</h2>
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
              {/* Payment Rail Selector */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1.5">
                  Payment Source
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSourceChange('mpesa')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-bold transition-all ${
                      source === 'mpesa'
                        ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7] shadow-md shadow-[#763698]/20'
                        : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2] hover:border-[#554653]'
                    }`}
                  >
                    <div className="w-2 h-2 rounded-full bg-emerald-400" />
                    <span>M-Pesa (Safaricom)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSourceChange('telebirr')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-bold transition-all ${
                      source === 'telebirr'
                        ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7] shadow-md shadow-[#763698]/20'
                        : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2] hover:border-[#554653]'
                    }`}
                  >
                    <div className="w-2 h-2 rounded-full bg-amber-400" />
                    <span>Telebirr (Ethio Telecom)</span>
                  </button>
                </div>
              </div>

              {/* Amount to spend */}
              <div>
                <div className="flex justify-between items-center text-xs text-[#D1B9B3] mb-1.5">
                  <span className="font-semibold">You Pay</span>
                  <span className="font-mono text-[#9B97A2] text-[11px]">
                    100,000 Sats ≈ {Math.round(currentRate * 0.001).toLocaleString()} {currencyCode}
                  </span>
                </div>
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
              <div className="p-3.5 rounded-2xl bg-[#140E1B] border border-[#382B44]">
                <div className="flex justify-between items-center text-xs text-[#9B97A2] mb-1">
                  <span>You Receive</span>
                  <span className="font-mono font-semibold text-[#D1B9B3]">
                    +{satsAmount.toLocaleString()} Sats
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-bold font-mono text-[#F8F0E7] tracking-tight">
                    {satsAmount.toLocaleString()}
                  </span>
                  <span className="text-xs font-mono text-[#9B97A2]">
                    ≈ {(satsAmount / 100_000_000).toFixed(6)} BTC
                  </span>
                </div>
              </div>

              {/* Destination Mode */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1.5">
                  Deposit Destination
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDestMode('custodial')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                      destMode === 'custodial'
                        ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                        : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
                    }`}
                  >
                    In-App Custodial
                  </button>
                  <button
                    type="button"
                    onClick={() => setDestMode('external')}
                    className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                      destMode === 'external'
                        ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                        : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
                    }`}
                  >
                    External Wallet / Address
                  </button>
                </div>
              </div>

              {destMode === 'external' && (
                <div>
                  <label className="block text-xs font-semibold text-[#D1B9B3] mb-1">
                    Lightning Address or Bitcoin Address
                  </label>
                  <input
                    type="text"
                    value={externalAddress}
                    onChange={(e) => setExternalAddress(e.target.value)}
                    placeholder="user@walletofsatoshi.com or bc1q..."
                    className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-2 text-xs font-mono text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                  />
                </div>
              )}

              {/* Phone number */}
              {source === 'mpesa' ? (
                <KenyaPhoneInput
                  value={phone}
                  onChange={(full) => setPhone(full)}
                  label="M-Pesa Phone Number (Prompt Recipient)"
                />
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-[#D1B9B3] mb-1">
                    Telebirr Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="09XXXXXXXX"
                    className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-2.5 text-sm font-mono text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                  />
                </div>
              )}

              {/* Network fee summary */}
              <div className="flex justify-between items-center text-xs text-[#9B97A2] px-1 font-mono">
                <span>Estimated Carrier Network Fee</span>
                <span>{estimatedFee} {currencyCode}</span>
              </div>

              {/* Action button */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={numericFiat <= 0 || !phone}
                className="w-full h-12 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] active:scale-[0.98] text-[#F8F0E7] font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 mt-2 shadow-lg shadow-[#763698]/25"
              >
                Pay {numericFiat > 0 ? `${numericFiat.toLocaleString()} ${currencyCode}` : currencyCode} with {source === 'mpesa' ? 'M-Pesa' : 'Telebirr'}
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
                  {source === 'mpesa' ? 'Dispatching M-Pesa STK Prompt' : 'Telebirr Request Sent'}
                </h3>
                <p className="text-xs text-[#9B97A2] font-mono mt-1">Connecting to Safaricom Daraja...</p>
              </div>
            </div>
          )}

          {step === 'awaiting_pin' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-[#763698]/25 border border-[#763698]/50 flex items-center justify-center text-[#D1B9B3]">
                  <Smartphone className="w-8 h-8 animate-pulse text-[#F8F0E7]" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#2A1E37] border border-[#763698] flex items-center justify-center">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D1B9B3]" />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">Enter M-Pesa PIN on Phone</h3>
                <p className="text-xs text-[#D1B9B3] mt-1 max-w-xs">
                  Safaricom has dispatched a payment prompt to <span className="font-mono font-bold text-[#F8F0E7]">{formatKenyanDisplayPhone(phone)}</span>.
                </p>
                <p className="text-[11px] text-[#9B97A2] mt-0.5">
                  Check your phone screen and enter your PIN to authorize payment.
                </p>
              </div>

              <div className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl p-3.5 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Amount</span>
                  <span className="text-[#F8F0E7] font-bold">{numericFiat.toLocaleString()} KES</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Sats to Receive</span>
                  <span className="text-[#D1B9B3] font-bold">+{satsAmount.toLocaleString()} Sats</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Checkout Request ID</span>
                  <span className="text-[#9B97A2] text-[10px] truncate max-w-[170px]">{activeCheckoutId}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-[#382B44]/60">
                  <span className="text-[#9B97A2]">Verification Window</span>
                  <span className="text-amber-400 font-bold">{pinSecondsLeft}s</span>
                </div>
              </div>

              <div className="w-full flex gap-2">
                <button
                  type="button"
                  onClick={handleManualVerify}
                  disabled={isVerifyingStatus}
                  className="flex-1 h-11 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] active:scale-[0.98] text-[#F8F0E7] font-semibold text-xs flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingStatus ? 'animate-spin' : ''}`} />
                  <span>{isVerifyingStatus ? 'Checking...' : 'Check Status Now'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="h-11 px-4 rounded-2xl bg-[#281E33] hover:bg-[#342743] text-[#9B97A2] hover:text-[#F8F0E7] font-medium text-xs transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-[#763698]/25 border border-[#763698]/50 flex items-center justify-center text-[#D1B9B3]">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">Payment Verified & Sats Credited</h3>
                <p className="text-xs text-emerald-400 font-mono mt-0.5">Safaricom confirmed settlement successfully</p>
              </div>

              <div className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl p-3.5 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Sats Acquired</span>
                  <span className="text-[#D1B9B3] font-bold">+{satsAmount.toLocaleString()} Sats</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Credited To</span>
                  <span className="text-emerald-400 font-semibold">Yebente Portfolio (+{satsAmount.toLocaleString()} Sats)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Paid Amount</span>
                  <span className="text-[#F8F0E7]">{numericFiat.toLocaleString()} {currencyCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Destination</span>
                  <span className="text-[#D1B9B3] truncate max-w-[180px]">
                    {destMode === 'custodial' ? 'In-App Custodial' : externalAddress}
                  </span>
                </div>
                {realReference && (
                  <div className="flex justify-between">
                    <span className="text-[#9B97A2]">Safaricom Reference</span>
                    <span className="text-[#D1B9B3] font-mono text-[10px] truncate max-w-[180px]">{realReference}</span>
                  </div>
                )}
              </div>

              {lightningInvoice ? (
                <div className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl p-3 space-y-2 text-left">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-[#D1B9B3] font-semibold">
                      <Zap className="w-3.5 h-3.5 text-[#D1B9B3]" />
                      <span>Wallet of Satoshi Invoice</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyInvoice}
                      className="px-2 py-1 rounded-lg bg-[#231A2D] border border-[#3C2E49] text-[11px] font-mono text-[#9B97A2] hover:text-[#F8F0E7] flex items-center gap-1 transition-colors"
                    >
                      {copiedInvoice ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedInvoice ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className="font-mono text-[10px] text-[#9B97A2] break-all select-all bg-[#0E0A13] p-2 rounded-xl border border-[#2B2135]">
                    {lightningInvoice}
                  </p>
                  <p className="text-[10px] text-[#9B97A2] leading-relaxed">
                    Sats have been credited to your Yebente vault balance. Automated node settlement requires configuring LNBITS_URL or LND_REST_URL in .env.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-300 text-xs w-full text-left">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{satsAmount.toLocaleString()} Sats added to your Yebente balance.</span>
                </div>
              )}

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
                <h3 className="text-lg font-bold text-[#F8F0E7]">M-Pesa Transaction Incomplete</h3>
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

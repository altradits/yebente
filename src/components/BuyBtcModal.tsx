import React, { useState } from 'react';
import { UserWallet, ExchangeRates, Transaction } from '../types';
import { X, ArrowDownLeft, Smartphone, CheckCircle2, Loader2, AlertTriangle, Zap, Copy, Check } from 'lucide-react';
import { initiateStkPush, isValidKenyanPhone } from '../services/mpesaService';
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
  const [step, setStep] = useState<'input' | 'processing' | 'success' | 'error'>('input');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [realReference, setRealReference] = useState<string>('');
  const [lightningInvoice, setLightningInvoice] = useState<string>('');
  const [copiedInvoice, setCopiedInvoice] = useState(false);
  const [destMode, setDestMode] = useState<'custodial' | 'external'>(
    wallet.type === 'non-custodial' ? 'external' : 'custodial'
  );
  const [externalAddress, setExternalAddress] = useState<string>(
    wallet.nonCustodialAddress || ''
  );

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
    setRealReference(refCode);

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
        // Safe fallback without interrupting purchase recording
      }
    }

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
  };

  const handleResetAndClose = () => {
    setStep('input');
    setErrorMessage('');
    setLightningInvoice('');
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

        {/* Content body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {step === 'input' && (
            <>
              {/* Payment Method Selector */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-2">
                  Payment Source
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSourceChange('mpesa')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-medium transition-all ${
                      source === 'mpesa'
                        ? 'border-[#763698] bg-[#763698]/20 text-[#F8F0E7] shadow-sm shadow-[#763698]/20'
                        : 'border-[#382B44] bg-[#140E1B] text-[#9B97A2] hover:border-[#554653]'
                    }`}
                  >
                    M-Pesa (Kenya KES)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSourceChange('telebirr')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-medium transition-all ${
                      source === 'telebirr'
                        ? 'border-[#946069] bg-[#946069]/20 text-[#F8F0E7] shadow-sm shadow-[#946069]/20'
                        : 'border-[#382B44] bg-[#140E1B] text-[#9B97A2] hover:border-[#554653]'
                    }`}
                  >
                    Telebirr (Ethiopia ETB)
                  </button>
                </div>
              </div>

              {/* Amount Inputs */}
              <div>
                <div className="flex justify-between items-center text-xs text-[#D1B9B3] mb-1.5">
                  <span className="font-semibold">You Pay</span>
                  <span className="font-mono text-[#9B97A2]">
                    Avail: {source === 'mpesa' ? `${wallet.mpesaBalanceKes.toLocaleString()} KES` : `${wallet.telebirrBalanceEtb.toLocaleString()} ETB`}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={amountFiat}
                    onChange={(e) => setAmountFiat(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="Enter amount"
                    className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-3 text-lg font-mono font-bold text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                  />
                  <span className="absolute right-4 top-3.5 font-mono text-sm font-semibold text-[#D1B9B3]">
                    {currencyCode}
                  </span>
                </div>
              </div>

              {/* You Receive Calculation */}
              <div className="bg-[#140E1B]/90 border border-[#382B44] rounded-2xl p-3.5">
                <div className="flex justify-between items-center text-xs text-[#9B97A2] mb-1">
                  <span>You Receive</span>
                  <span className="text-[11px] font-mono text-[#D1B9B3]">
                    100,000 Sats = {Math.round(currentRate * 0.001).toLocaleString()} {currencyCode}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-bold font-mono text-[#D1B9B3] tabular-nums">
                    {satsAmount.toLocaleString()}
                  </span>
                  <span className="text-sm font-bold text-[#F8F0E7] font-mono">Sats</span>
                </div>
              </div>

              {/* Destination Wallet Preference (Custodial or Non-Custodial) */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1.5">
                  Deposit Destination
                </label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setDestMode('custodial')}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                      destMode === 'custodial'
                        ? 'border-[#763698] bg-[#763698]/20 text-[#F8F0E7]'
                        : 'border-[#382B44] bg-[#140E1B] text-[#9B97A2]'
                    }`}
                  >
                    Custodial (In-App)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDestMode('external')}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                      destMode === 'external'
                        ? 'border-[#D1B9B3] bg-[#D1B9B3]/15 text-[#F8F0E7]'
                        : 'border-[#382B44] bg-[#140E1B] text-[#9B97A2]'
                    }`}
                  >
                    Non-Custodial (Self)
                  </button>
                </div>

                {destMode === 'external' && (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={externalAddress}
                      onChange={(e) => setExternalAddress(e.target.value)}
                      placeholder="Bitcoin address (e.g. bc1q...)"
                      className="w-full bg-[#140E1B] border border-[#382B44] rounded-xl px-3 py-2 text-xs font-mono text-[#D1B9B3] focus:outline-none focus:border-[#763698]"
                    />
                  </div>
                )}
              </div>

              {/* Mobile Phone for prompt */}
              <div>
                {source === 'mpesa' ? (
                  <KenyaPhoneInput
                    value={phone}
                    onChange={(full) => setPhone(full)}
                    label="M-Pesa Phone (Safaricom Prompt)"
                    autoVerify={false}
                  />
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-[#D1B9B3] mb-1.5">
                      Telebirr Phone Number
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="2519XXXXXXXX"
                        className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-2.5 text-sm font-mono text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                      />
                      <Smartphone className="w-4 h-4 text-[#9B97A2] absolute right-3.5 top-3" />
                    </div>
                  </div>
                )}
              </div>

              {/* Fees summary */}
              <div className="text-xs text-[#9B97A2] space-y-1 pt-1 font-mono">
                <div className="flex justify-between">
                  <span>Network / Carrier Fee</span>
                  <span>{estimatedFee} {currencyCode}</span>
                </div>
                <div className="flex justify-between font-bold text-[#F8F0E7] pt-1.5 border-t border-[#382B44]">
                  <span>Total Debit</span>
                  <span className="text-[#D1B9B3]">{(numericFiat + estimatedFee).toLocaleString()} {currencyCode}</span>
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={numericFiat <= 0}
                className="w-full h-12 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] active:scale-[0.98] text-[#F8F0E7] font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 mt-2 shadow-lg shadow-[#763698]/25"
              >
                Proceed with {source === 'mpesa' ? 'M-Pesa' : 'Telebirr'}
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
                  {source === 'mpesa' ? 'M-Pesa STK Prompt Sent' : 'Telebirr Request Sent'}
                </h3>
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-[#763698]/25 border border-[#763698]/50 flex items-center justify-center text-[#D1B9B3]">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">Sats Purchase Successful</h3>
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
                    <span className="text-[#9B97A2]">Reference</span>
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

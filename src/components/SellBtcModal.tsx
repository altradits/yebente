import React, { useState } from 'react';
import { UserWallet, ExchangeRates, Transaction } from '../types';
import { ArrowLeft, Smartphone, CheckCircle2, Loader2, QrCode, Copy, Check, AlertTriangle } from 'lucide-react';
import { KenyaPhoneInput } from './KenyaPhoneInput';
import { isValidKenyanPhone, sendMpesaPayout } from '../services/mpesaService';

interface SellBtcModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet;
  rates: ExchangeRates;
  onSuccess: (tx: Omit<Transaction, 'id' | 'timestamp'>) => void;
}

export const SellBtcModal: React.FC<SellBtcModalProps> = ({
  isOpen,
  onClose,
  wallet,
  rates,
  onSuccess,
}) => {
  const [destination, setDestination] = useState<'mpesa' | 'telebirr'>('mpesa');
  const [satsAmountStr, setSatsAmountStr] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [recipientName, setRecipientName] = useState<string>('');
  const [step, setStep] = useState<'input' | 'processing' | 'success' | 'error'>('input');
  const [errorMessage, setErrorMessage] = useState<string>('');

  if (!isOpen) return null;

  const currentRate = destination === 'mpesa' ? rates.btcKes : rates.btcEtb;
  const currencyCode = destination === 'mpesa' ? 'KES' : 'ETB';
  const availableSats = wallet.satsBalance ?? Math.round((wallet.btcBalance || 0) * 100_000_000);
  const numericSats = parseInt(satsAmountStr, 10) || 0;
  const fiatPayout = (numericSats / 100_000_000) * currentRate;
  const satsFee = 500;
  const totalDeducted = numericSats + satsFee;
  const isInsufficientSats = totalDeducted > availableSats;

  const handleDestinationChange = (newDest: 'mpesa' | 'telebirr') => {
    setDestination(newDest);
    setPhone('');
    setErrorMessage('');
  };

  const handleConfirm = async () => {
    if (numericSats <= 0) return;

    if (isInsufficientSats) {
      setErrorMessage(`Insufficient Sats balance. Required: ${totalDeducted.toLocaleString()} Sats (including ${satsFee} fee). Available: ${availableSats.toLocaleString()} Sats.`);
      return;
    }

    setStep('processing');
    setErrorMessage('');

    try {
      let refCode = '';
      if (destination === 'mpesa') {
        const res = await sendMpesaPayout({
          phone,
          amount: Math.round(fiatPayout),
          currency: 'KES',
          satsAmount: numericSats,
          note: 'Sats Cashout to M-Pesa',
        });

        if (!res.success) {
          setErrorMessage(res.error || 'Failed to dispatch M-Pesa payout.');
          setStep('error');
          return;
        }

        if (!res.referenceNumber) {
          setErrorMessage('M-Pesa payout was submitted but no transaction reference was returned by Safaricom.');
          setStep('error');
          return;
        }
        refCode = res.referenceNumber;
      } else {
        setErrorMessage('Telebirr payout integration is not yet active. The developer must configure Telebirr API credentials (Issue #5).');
        setStep('error');
        return;
      }

      onSuccess({
        type: 'sell_btc',
        title: `Sold Sats for ${destination === 'mpesa' ? 'M-Pesa KES' : 'Telebirr ETB'}`,
        status: 'completed',
        fromCurrency: 'SATS',
        fromAmount: numericSats,
        toCurrency: currencyCode,
        toAmount: Math.round(fiatPayout),
        rateUsed: currentRate,
        fee: satsFee,
        feeCurrency: 'SATS',
        recipient: `+${phone}${destination === 'telebirr' ? ` (${recipientName || 'Recipient'})` : ''}`,
        referenceNumber: refCode,
        walletType: wallet.type,
        note: `Direct payout to ${destination === 'mpesa' ? 'M-Pesa' : 'Telebirr'} mobile account`,
      });

      setStep('success');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Error processing payout.');
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
          <h2 className="text-base font-bold text-[#F8F0E7]">Sell Sats</h2>
          <div className="w-8" aria-hidden="true" />
        </div>

        {/* Content body */}
        <div className="p-5 overflow-y-auto space-y-4">
          {step === 'input' && (
            <>
              {/* Destination selector */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleDestinationChange('mpesa')}
                  className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                    destination === 'mpesa'
                      ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                      : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
                  }`}
                >
                  M-Pesa
                </button>
                <button
                  type="button"
                  onClick={() => handleDestinationChange('telebirr')}
                  className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                    destination === 'telebirr'
                      ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                      : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
                  }`}
                >
                  Telebirr
                </button>
              </div>

              {/* Sats Amount to sell */}
              <div>
                <div className="flex justify-between items-center text-xs text-[#D1B9B3] mb-1.5">
                  <span className="font-semibold">Sats to Sell</span>
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#9B97A2]">
                    <span>Avail: {availableSats.toLocaleString()} Sats</span>
                    <button
                      type="button"
                      onClick={() => setSatsAmountStr(availableSats.toString())}
                      className="text-[#D1B9B3] hover:underline"
                    >
                      MAX
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="1000"
                    value={satsAmountStr}
                    onChange={(e) => setSatsAmountStr(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="0"
                    className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-3 text-lg font-mono font-bold text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                  />
                  <span className="absolute right-4 top-3.5 font-mono text-sm font-semibold text-[#D1B9B3]">
                    Sats
                  </span>
                </div>
              </div>

              {/* Payout calculation */}
              <div className="flex justify-between items-center px-1 text-xs">
                <span className="text-[#9B97A2]">You Receive</span>
                <span className="font-mono font-bold text-[#F8F0E7]">
                  {Math.round(fiatPayout).toLocaleString()} {currencyCode}
                </span>
              </div>

              {/* Fee and Total Deducted readout without button box */}
              <div className="space-y-1.5 px-1 text-xs">
                <div className="flex justify-between items-center text-[#9B97A2]">
                  <span>Network Fee</span>
                  <span className="font-mono text-[#D1B9B3]">{satsFee.toLocaleString()} Sats</span>
                </div>
                <div className="flex justify-between items-center text-[#9B97A2]">
                  <span>Total Deducted</span>
                  <span className="font-mono font-bold text-[#F8F0E7]">{totalDeducted.toLocaleString()} Sats</span>
                </div>
              </div>

              {/* Recipient Phone & Name */}
              <div className="space-y-2.5">
                {destination === 'mpesa' ? (
                  <KenyaPhoneInput
                    value={phone}
                    onChange={(full) => setPhone(full)}
                    label="Recipient Phone"
                  />
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-[#D1B9B3] mb-1">
                        Recipient Phone
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

                    <div>
                      <label className="block text-xs font-semibold text-[#D1B9B3] mb-1">
                        Account Name
                      </label>
                      <input
                        type="text"
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        placeholder="Recipient Name"
                        className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-2 text-xs font-mono text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Network fee summary */}
              <div className="flex justify-between items-center text-xs text-[#9B97A2] px-1 font-mono">
                <span>Fee</span>
                <span>{satsFee} Sats</span>
              </div>

              {/* Submit CTA */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={
                  numericSats <= 0 ||
                  isInsufficientSats ||
                  (destination === 'mpesa' && !isValidKenyanPhone(phone)) ||
                  (destination === 'telebirr' && (!phone.trim() || !recipientName.trim()))
                }
                className="w-full h-12 rounded-2xl bg-[#946069] hover:bg-[#A96E78] active:scale-[0.98] text-[#F8F0E7] font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 mt-2 shadow-md shadow-[#946069]/20"
              >
                {isInsufficientSats ? 'Insufficient Sats Balance' : 'Sell Sats'}
              </button>
            </>
          )}

          {step === 'processing' && (
            <div className="py-8 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#946069]/20 border border-[#946069]/40 flex items-center justify-center text-[#D1B9B3]">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">Broadcasting Liquidation</h3>
              </div>
            </div>
          )}

          {step === 'error' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-red-950/30 border border-red-500/40 flex items-center justify-center text-red-400">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">Payout Failed</h3>
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
              <div className="w-14 h-14 rounded-full bg-[#946069]/25 border border-[#946069]/50 flex items-center justify-center text-[#D1B9B3]">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">Sats Sold</h3>
              </div>

              <div className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl p-3.5 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Sold Sats</span>
                  <span className="text-[#D1B9B3] font-bold">-{numericSats.toLocaleString()} Sats</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Credited To Phone</span>
                  <span className="text-[#F8F0E7] font-bold">+{Math.round(fiatPayout).toLocaleString()} {currencyCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Recipient</span>
                  <span className="text-[#D1B9B3]">+{phone}</span>
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

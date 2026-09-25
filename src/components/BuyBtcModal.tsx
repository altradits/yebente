import React, { useState } from 'react';
import { UserWallet, ExchangeRates, Transaction } from '../types';
import { X, ArrowDownLeft, Smartphone, CheckCircle2, Loader2, Info } from 'lucide-react';

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
  const [amountFiat, setAmountFiat] = useState<string>('5000');
  const [phone, setPhone] = useState<string>('254712345678');
  const [step, setStep] = useState<'input' | 'processing' | 'success'>('input');
  const [destMode, setDestMode] = useState<'custodial' | 'external'>(
    wallet.type === 'non-custodial' ? 'external' : 'custodial'
  );
  const [externalAddress, setExternalAddress] = useState<string>(
    wallet.nonCustodialAddress || 'bc1q9x38n7c4g2lpxym56d2t8k0l09a2q8u9478f7e'
  );

  if (!isOpen) return null;

  const currentRate = source === 'mpesa' ? rates.btcKes : rates.btcEtb;
  const currencyCode = source === 'mpesa' ? 'KES' : 'ETB';
  const numericFiat = parseFloat(amountFiat) || 0;
  const btcAmount = currentRate > 0 ? numericFiat / currentRate : 0;
  const estimatedFee = source === 'mpesa' ? 50 : 20;

  const handleSourceChange = (newSource: 'mpesa' | 'telebirr') => {
    setSource(newSource);
    if (newSource === 'mpesa') {
      setPhone('254712345678');
      setAmountFiat('5000');
    } else {
      setPhone('251911234567');
      setAmountFiat('4500');
    }
  };

  const handleConfirm = () => {
    if (numericFiat <= 0) return;
    setStep('processing');

    // Simulate mobile payment prompt response
    setTimeout(() => {
      const refCode =
        source === 'mpesa'
          ? `SAF-MP-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
          : `ETHIO-TB-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

      onSuccess({
        type: 'buy_btc',
        title: `Bought BTC via ${source === 'mpesa' ? 'M-Pesa' : 'Telebirr'}`,
        status: 'completed',
        fromCurrency: currencyCode,
        fromAmount: numericFiat,
        toCurrency: 'BTC',
        toAmount: parseFloat(btcAmount.toFixed(8)),
        rateUsed: currentRate,
        fee: estimatedFee,
        feeCurrency: currencyCode,
        recipient: destMode === 'custodial' ? 'In-App Custodial Wallet' : externalAddress,
        referenceNumber: refCode,
        walletType: destMode === 'custodial' ? 'custodial' : 'non-custodial',
        note: `Instant STK purchase to ${destMode === 'custodial' ? 'Custodial balance' : 'Self-custody on-chain'}`,
      });

      setStep('success');
    }, 2200);
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
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Buy Bitcoin</h2>
              <p className="text-[11px] text-neutral-400">Instant exchange from mobile money</p>
            </div>
          </div>
          <button
            onClick={handleResetAndClose}
            className="w-8 h-8 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center"
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
                <label className="block text-xs font-semibold text-neutral-300 mb-2">
                  Payment Source
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSourceChange('mpesa')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all ${
                      source === 'mpesa'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    M-Pesa (Kenya KES)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSourceChange('telebirr')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all ${
                      source === 'telebirr'
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-cyan-500" />
                    Telebirr (Ethiopia ETB)
                  </button>
                </div>
              </div>

              {/* Amount Inputs */}
              <div>
                <div className="flex justify-between items-center text-xs text-neutral-300 mb-1.5">
                  <span className="font-semibold">You Pay</span>
                  <span className="font-mono text-neutral-500">
                    Avail: {source === 'mpesa' ? `${wallet.mpesaBalanceKes.toLocaleString()} KES` : `${wallet.telebirrBalanceEtb.toLocaleString()} ETB`}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={amountFiat}
                    onChange={(e) => setAmountFiat(e.target.value)}
                    placeholder="Enter amount"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-lg font-mono font-bold text-white focus:outline-none focus:border-amber-500"
                  />
                  <span className="absolute right-4 top-3.5 font-mono text-sm font-semibold text-neutral-400">
                    {currencyCode}
                  </span>
                </div>
              </div>

              {/* You Receive Calculation */}
              <div className="bg-neutral-950/80 border border-neutral-800/80 rounded-xl p-3">
                <div className="flex justify-between items-center text-xs text-neutral-400 mb-1">
                  <span>You Receive</span>
                  <span className="text-[11px] font-mono text-amber-400/90">
                    1 BTC = {currentRate.toLocaleString()} {currencyCode}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-bold font-mono text-amber-400 tabular-nums">
                    {btcAmount.toFixed(8)}
                  </span>
                  <span className="text-sm font-bold text-white font-mono">BTC</span>
                </div>
              </div>

              {/* Destination Wallet Preference (Custodial or Non-Custodial) */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Deposit Destination
                </label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setDestMode('custodial')}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                      destMode === 'custodial'
                        ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                    }`}
                  >
                    Custodial (In-App)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDestMode('external')}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                      destMode === 'external'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400'
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
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-[10px] text-neutral-500 mt-1">
                      Bitcoin will be broadcast directly to your self-custody address.
                    </p>
                  </div>
                )}
              </div>

              {/* Mobile Phone for prompt */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  {source === 'mpesa' ? 'M-Pesa Phone Number' : 'Telebirr Phone Number'}
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={source === 'mpesa' ? '2547XXXXXXXX' : '2519XXXXXXXX'}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                  <Smartphone className="w-4 h-4 text-neutral-500 absolute right-3 top-3" />
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 mt-1.5">
                  <Info className="w-3 h-3 text-neutral-400 shrink-0" />
                  <span>An instant prompt will appear on this handset to authorize.</span>
                </div>
              </div>

              {/* Fees summary */}
              <div className="text-xs text-neutral-400 space-y-1 pt-1 font-mono">
                <div className="flex justify-between">
                  <span>Network / Carrier Fee</span>
                  <span>{estimatedFee} {currencyCode}</span>
                </div>
                <div className="flex justify-between font-bold text-white pt-1 border-t border-neutral-800">
                  <span>Total Debit</span>
                  <span>{(numericFiat + estimatedFee).toLocaleString()} {currencyCode}</span>
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={numericFiat <= 0}
                className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-neutral-950 font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 mt-2 shadow-lg shadow-amber-500/10"
              >
                Proceed with {source === 'mpesa' ? 'M-Pesa' : 'Telebirr'}
              </button>
            </>
          )}

          {step === 'processing' && (
            <div className="py-8 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {source === 'mpesa' ? 'M-Pesa STK Prompt Sent' : 'Telebirr Request Sent'}
                </h3>
                <p className="text-xs text-neutral-400 mt-1 max-w-xs font-mono">
                  Please check phone <span className="text-white">+{phone}</span> and enter your PIN to authorize payment of{' '}
                  <span className="text-amber-400 font-bold">{(numericFiat + estimatedFee).toLocaleString()} {currencyCode}</span>.
                </p>
              </div>
              <div className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3 text-xs text-neutral-400 font-mono">
                Simulating network authorization...
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="py-6 flex flex-col items-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Bitcoin Purchase Successful</h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Payment confirmed. Funds are now credited.
                </p>
              </div>

              <div className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3.5 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Bitcoin Acquired</span>
                  <span className="text-amber-400 font-bold">+{btcAmount.toFixed(8)} BTC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Paid Amount</span>
                  <span className="text-white">{numericFiat.toLocaleString()} {currencyCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Destination</span>
                  <span className="text-emerald-400 truncate max-w-[180px]">
                    {destMode === 'custodial' ? 'In-App Custodial' : externalAddress}
                  </span>
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

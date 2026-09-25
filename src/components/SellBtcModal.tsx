import React, { useState } from 'react';
import { UserWallet, ExchangeRates, Transaction } from '../types';
import { X, ArrowUpRight, Smartphone, CheckCircle2, Loader2, QrCode, Copy, Check } from 'lucide-react';

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
  const [btcAmountStr, setBtcAmountStr] = useState<string>('0.002');
  const [phone, setPhone] = useState<string>('254712345678');
  const [recipientName, setRecipientName] = useState<string>('John Doe');
  const [sourceMode, setSourceMode] = useState<'custodial' | 'external'>(
    wallet.type === 'non-custodial' ? 'external' : 'custodial'
  );
  const [step, setStep] = useState<'input' | 'processing' | 'success'>('input');
  const [copiedEscrow, setCopiedEscrow] = useState(false);

  if (!isOpen) return null;

  const currentRate = destination === 'mpesa' ? rates.btcKes : rates.btcEtb;
  const currencyCode = destination === 'mpesa' ? 'KES' : 'ETB';
  const numericBtc = parseFloat(btcAmountStr) || 0;
  const fiatPayout = numericBtc * currentRate;
  const btcFee = 0.00003; // ~standard on-chain fee

  const escrowAddress = 'bc1q78p9k6e0r3g52al5vxwtu402r8k8y44a7q39d2';

  const handleDestinationChange = (newDest: 'mpesa' | 'telebirr') => {
    setDestination(newDest);
    if (newDest === 'mpesa') {
      setPhone('254712345678');
    } else {
      setPhone('251911234567');
    }
  };

  const handleCopyEscrow = () => {
    navigator.clipboard.writeText(escrowAddress);
    setCopiedEscrow(true);
    setTimeout(() => setCopiedEscrow(false), 2000);
  };

  const handleConfirm = () => {
    if (numericBtc <= 0) return;
    setStep('processing');

    setTimeout(() => {
      const refCode =
        destination === 'mpesa'
          ? `SAF-MP-${Math.random().toString(36).substring(2, 10).toUpperCase()}`
          : `ETHIO-TB-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

      onSuccess({
        type: 'sell_btc',
        title: `Sold BTC for ${destination === 'mpesa' ? 'M-Pesa KES' : 'Telebirr ETB'}`,
        status: 'completed',
        fromCurrency: 'BTC',
        fromAmount: numericBtc,
        toCurrency: currencyCode,
        toAmount: Math.round(fiatPayout),
        rateUsed: currentRate,
        fee: btcFee,
        feeCurrency: 'BTC',
        recipient: `+${phone} (${recipientName})`,
        referenceNumber: refCode,
        walletType: sourceMode === 'custodial' ? 'custodial' : 'non-custodial',
        note: `Direct payout to ${destination === 'mpesa' ? 'M-Pesa' : 'Telebirr'} mobile account`,
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
            <div className="w-8 h-8 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-amber-400">
              <ArrowUpRight className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Sell Bitcoin</h2>
              <p className="text-[11px] text-neutral-400">Cash out to M-Pesa or Telebirr</p>
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
              {/* Destination selector */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-2">
                  Payout Mobile Destination
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleDestinationChange('mpesa')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all ${
                      destination === 'mpesa'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    M-Pesa (Kenya KES)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDestinationChange('telebirr')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-medium transition-all ${
                      destination === 'telebirr'
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-cyan-500" />
                    Telebirr (Ethiopia ETB)
                  </button>
                </div>
              </div>

              {/* BTC Amount to sell */}
              <div>
                <div className="flex justify-between items-center text-xs text-neutral-300 mb-1.5">
                  <span className="font-semibold">Bitcoin to Sell</span>
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-400">
                    <span>Avail: {wallet.btcBalance.toFixed(6)} BTC</span>
                    <button
                      type="button"
                      onClick={() => setBtcAmountStr(wallet.btcBalance.toString())}
                      className="text-amber-400 hover:underline"
                    >
                      MAX
                    </button>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="0.0001"
                    value={btcAmountStr}
                    onChange={(e) => setBtcAmountStr(e.target.value)}
                    placeholder="0.00000000"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-lg font-mono font-bold text-white focus:outline-none focus:border-amber-500"
                  />
                  <span className="absolute right-4 top-3.5 font-mono text-sm font-semibold text-amber-400">
                    BTC
                  </span>
                </div>
              </div>

              {/* Payout calculation */}
              <div className="bg-neutral-950/80 border border-neutral-800/80 rounded-xl p-3">
                <div className="flex justify-between items-center text-xs text-neutral-400 mb-1">
                  <span>You Will Receive</span>
                  <span className="text-[11px] font-mono text-neutral-400">
                    Rate: {currentRate.toLocaleString()} {currencyCode}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-bold font-mono text-emerald-400 tabular-nums">
                    {Math.round(fiatPayout).toLocaleString()}
                  </span>
                  <span className="text-sm font-bold text-white font-mono">{currencyCode}</span>
                </div>
              </div>

              {/* Source Mode (Custodial vs Non-Custodial) */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  BTC Funding Source
                </label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setSourceMode('custodial')}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                      sourceMode === 'custodial'
                        ? 'border-amber-500 bg-amber-500/10 text-amber-400'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                    }`}
                  >
                    Custodial (In-App)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceMode('external')}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium transition-all ${
                      sourceMode === 'external'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                    }`}
                  >
                    External Wallet (Self)
                  </button>
                </div>

                {sourceMode === 'external' && (
                  <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-neutral-400">
                      <span className="flex items-center gap-1">
                        <QrCode className="w-3.5 h-3.5 text-amber-400" />
                        Send BTC To Escrow Address
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyEscrow}
                        className="text-amber-400 hover:text-amber-300 flex items-center gap-1 font-mono text-[10px]"
                      >
                        {copiedEscrow ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        {copiedEscrow ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="font-mono text-[11px] text-neutral-300 break-all bg-neutral-900 p-2 rounded border border-neutral-800 select-all">
                      {escrowAddress}
                    </div>
                  </div>
                )}
              </div>

              {/* Recipient Phone & Name */}
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    {destination === 'mpesa' ? 'M-Pesa Recipient Phone' : 'Telebirr Recipient Phone'}
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder={destination === 'mpesa' ? '2547XXXXXXXX' : '2519XXXXXXXX'}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-amber-500"
                    />
                    <Smartphone className="w-4 h-4 text-neutral-500 absolute right-3 top-3" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Registered Account Name
                  </label>
                  <input
                    type="text"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Recipient Full Name"
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={numericBtc <= 0 || (sourceMode === 'custodial' && numericBtc > wallet.btcBalance)}
                className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-neutral-950 font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 mt-2 shadow-lg shadow-amber-500/10"
              >
                {sourceMode === 'custodial' && numericBtc > wallet.btcBalance
                  ? 'Insufficient Bitcoin Balance'
                  : `Confirm Sell for ${Math.round(fiatPayout).toLocaleString()} ${currencyCode}`}
              </button>
            </>
          )}

          {step === 'processing' && (
            <div className="py-8 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Broadcasting Liquidation</h3>
                <p className="text-xs text-neutral-400 mt-1 max-w-xs font-mono">
                  Processing payout of <span className="text-emerald-400 font-bold">{Math.round(fiatPayout).toLocaleString()} {currencyCode}</span> to phone +{phone}...
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
                <h3 className="text-lg font-bold text-white">BTC Cash Out Complete</h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Mobile funds disbursed directly to recipient.
                </p>
              </div>

              <div className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-3.5 text-left font-mono text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Sold Bitcoin</span>
                  <span className="text-amber-400 font-bold">-{numericBtc} BTC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Credited To Phone</span>
                  <span className="text-emerald-400 font-bold">+{Math.round(fiatPayout).toLocaleString()} {currencyCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Recipient Phone</span>
                  <span className="text-white">+{phone}</span>
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

import React, { useState } from 'react';
import { UserWallet, ExchangeRates, Transaction } from '../types';
import { X, ArrowUpRight, Smartphone, CheckCircle2, Loader2, QrCode, Copy, Check, ShieldCheck, AlertTriangle } from 'lucide-react';
import { KenyaPhoneInput } from './KenyaPhoneInput';
import { formatKenyanDisplayPhone, VerifyRecipientResponse, sendMpesaPayout } from '../services/mpesaService';

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
  const [verifiedInfo, setVerifiedInfo] = useState<VerifyRecipientResponse | null>(null);
  const [sourceMode, setSourceMode] = useState<'custodial' | 'external'>(
    wallet.type === 'non-custodial' ? 'external' : 'custodial'
  );
  const [step, setStep] = useState<'input' | 'processing' | 'success' | 'error'>('input');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [copiedEscrow, setCopiedEscrow] = useState(false);

  if (!isOpen) return null;

  const currentRate = destination === 'mpesa' ? rates.btcKes : rates.btcEtb;
  const currencyCode = destination === 'mpesa' ? 'KES' : 'ETB';
  const availableSats = wallet.satsBalance ?? Math.round((wallet.btcBalance || 0) * 100_000_000);
  const numericSats = parseInt(satsAmountStr, 10) || 0;
  const fiatPayout = (numericSats / 100_000_000) * currentRate;
  const satsFee = 500; // ~standard sats network fee

  const escrowAddress = 'bc1q78p9k6e0r3g52al5vxwtu402r8k8y44a7q39d2';

  const handleDestinationChange = (newDest: 'mpesa' | 'telebirr') => {
    setDestination(newDest);
    setPhone('');
    setErrorMessage('');
  };

  const handleCopyEscrow = () => {
    navigator.clipboard.writeText(escrowAddress);
    setCopiedEscrow(true);
    setTimeout(() => setCopiedEscrow(false), 2000);
  };

  const handleConfirm = async () => {
    if (numericSats <= 0) return;
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
          recipientName: recipientName || verifiedInfo?.name,
          note: 'Sats Cashout to M-Pesa',
        });

        if (!res.success) {
          setErrorMessage(res.error || 'Failed to dispatch M-Pesa payout.');
          setStep('error');
          return;
        }

        refCode = res.referenceNumber || `SAF${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      } else {
        refCode = `ETHIO-TB-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
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
        recipient: `+${phone} (${recipientName || verifiedInfo?.name || 'Recipient'})`,
        referenceNumber: refCode,
        walletType: sourceMode === 'custodial' ? 'custodial' : 'non-custodial',
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#120E16]/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#1D1627] border border-[#3A2D47] rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl shadow-black/80 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#382B44]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#946069]/25 border border-[#946069]/50 flex items-center justify-center text-[#D1B9B3]">
              <ArrowUpRight className="w-4 h-4 text-[#F8F0E7]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#F8F0E7]">Sell Sats</h2>
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
              {/* Destination selector */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-2">
                  Payout Mobile Destination
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleDestinationChange('mpesa')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-medium transition-all ${
                      destination === 'mpesa'
                        ? 'border-[#763698] bg-[#763698]/20 text-[#F8F0E7] shadow-sm shadow-[#763698]/20'
                        : 'border-[#382B44] bg-[#140E1B] text-[#9B97A2] hover:border-[#554653]'
                    }`}
                  >
                    M-Pesa (Kenya KES)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDestinationChange('telebirr')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-2xl border text-xs font-medium transition-all ${
                      destination === 'telebirr'
                        ? 'border-[#946069] bg-[#946069]/20 text-[#F8F0E7] shadow-sm shadow-[#946069]/20'
                        : 'border-[#382B44] bg-[#140E1B] text-[#9B97A2] hover:border-[#554653]'
                    }`}
                  >
                    Telebirr (Ethiopia ETB)
                  </button>
                </div>
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
              <div className="bg-[#140E1B]/90 border border-[#382B44] rounded-2xl p-3.5">
                <div className="flex justify-between items-center text-xs text-[#9B97A2] mb-1">
                  <span>You Will Receive</span>
                  <span className="text-[11px] font-mono text-[#9B97A2]">
                    Rate: 100,000 Sats = {Math.round(currentRate * 0.001).toLocaleString()} {currencyCode}
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-bold font-mono text-[#D1B9B3] tabular-nums">
                    {Math.round(fiatPayout).toLocaleString()}
                  </span>
                  <span className="text-sm font-bold text-[#F8F0E7] font-mono">{currencyCode}</span>
                </div>
              </div>

              {/* Source Mode (Custodial vs Non-Custodial) */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1.5">
                  Sats Funding Source
                </label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setSourceMode('custodial')}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                      sourceMode === 'custodial'
                        ? 'border-[#763698] bg-[#763698]/20 text-[#F8F0E7]'
                        : 'border-[#382B44] bg-[#140E1B] text-[#9B97A2]'
                    }`}
                  >
                    Custodial (In-App)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSourceMode('external')}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-all ${
                      sourceMode === 'external'
                        ? 'border-[#D1B9B3] bg-[#D1B9B3]/15 text-[#F8F0E7]'
                        : 'border-[#382B44] bg-[#140E1B] text-[#9B97A2]'
                    }`}
                  >
                    External Wallet (Self)
                  </button>
                </div>

                {sourceMode === 'external' && (
                  <div className="p-3.5 rounded-2xl bg-[#140E1B] border border-[#382B44] space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-[#9B97A2]">
                      <span className="flex items-center gap-1.5">
                        <QrCode className="w-3.5 h-3.5 text-[#D1B9B3]" />
                        Send BTC To Escrow Address
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyEscrow}
                        className="text-[#D1B9B3] hover:text-[#F8F0E7] flex items-center gap-1 font-mono text-[10px]"
                      >
                        {copiedEscrow ? <Check className="w-3 h-3 text-[#D1B9B3]" /> : <Copy className="w-3 h-3" />}
                        {copiedEscrow ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="font-mono text-[11px] text-[#D1B9B3] break-all bg-[#1D1627] p-2.5 rounded-xl border border-[#382B44] select-all">
                      {escrowAddress}
                    </div>
                  </div>
                )}
              </div>

              {/* Recipient Phone & Name */}
              <div className="space-y-2.5">
                {destination === 'mpesa' ? (
                  <>
                    <div className="space-y-1">
                      <KenyaPhoneInput
                        value={phone}
                        onChange={(full) => {
                          setPhone(full);
                          if (verifiedInfo) setVerifiedInfo(null);
                        }}
                        onVerifiedChange={(info) => {
                          setVerifiedInfo(info);
                          if (info?.name) setRecipientName(info.name);
                        }}
                        label="M-Pesa Recipient Phone"
                        autoVerify={false}
                      />
                    </div>

                    {(!verifiedInfo || !verifiedInfo.verified) && (
                      <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/30 text-amber-300 text-[11px]">
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                        <span>Receiver name must be verified on M-Pesa before payout can be initiated.</span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-[#D1B9B3] mb-1">
                        Telebirr Recipient Phone
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
                        Registered Account Name
                      </label>
                      <input
                        type="text"
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        placeholder="Recipient Full Name"
                        className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-2 text-xs font-mono text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* Submit CTA */}
              <button
                type="button"
                onClick={handleConfirm}
                disabled={
                  numericSats <= 0 ||
                  (sourceMode === 'custodial' && numericSats > availableSats) ||
                  (destination === 'mpesa' && (!verifiedInfo || !verifiedInfo.verified))
                }
                className="w-full h-12 rounded-2xl bg-[#946069] hover:bg-[#A96E78] active:scale-[0.98] text-[#F8F0E7] font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 mt-2 shadow-lg shadow-[#946069]/25"
              >
                {sourceMode === 'custodial' && numericSats > availableSats
                  ? 'Insufficient Sats Balance'
                  : destination === 'mpesa' && (!verifiedInfo || !verifiedInfo.verified)
                  ? 'Verify M-Pesa Receiver to Sell'
                  : `Confirm Sell for ${Math.round(fiatPayout).toLocaleString()} ${currencyCode}`}
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
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#F8F0E7]">Sats Cash Out Complete</h3>
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
                  <span className="text-[#9B97A2]">Recipient Phone</span>
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

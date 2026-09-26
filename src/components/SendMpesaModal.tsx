import React, { useState } from 'react';
import { UserWallet, ExchangeRates, Transaction } from '../types';
import {
  X,
  Send,
  Smartphone,
  CheckCircle2,
  Loader2,
  Store,
  Hash,
  AlertTriangle,
  Zap,
  ShieldCheck,
} from 'lucide-react';
import {
  sendMpesaPayout,
  formatKenyanDisplayPhone,
  isValidKenyanPhone,
  VerifyRecipientResponse,
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
  const [fundingSource, setFundingSource] = useState<'sats' | 'kes'>('sats');
  const [recipientType, setRecipientType] = useState<'phone' | 'till' | 'paybill'>('phone');
  const [phone, setPhone] = useState<string>('');
  const [verifiedInfo, setVerifiedInfo] = useState<VerifyRecipientResponse | null>(null);
  const [tillNumber, setTillNumber] = useState<string>('');
  const [paybillNumber, setPaybillNumber] = useState<string>('');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('500');
  const [note, setNote] = useState<string>('');
  const [step, setStep] = useState<'input' | 'processing' | 'success' | 'error'>('input');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [realReference, setRealReference] = useState<string>('');
  const [confirmedRecipientName, setConfirmedRecipientName] = useState<string>('');
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

  // Sats calculation for Sats funding
  const btcKesRate = rates.btcKes;
  const satsRequired = btcKesRate > 0 ? Math.round((numericAmount / btcKesRate) * 100_000_000) : 0;
  const satsFee = 250; // standard routing fee

  // Check balance sufficiency
  const isInsufficientSats = satsRequired + satsFee > availableSats;

  const getRecipientDisplay = () => {
    if (recipientType === 'phone') {
      const nameTag = verifiedInfo?.name ? ` (${verifiedInfo.name})` : '';
      return `${formatKenyanDisplayPhone(phone)}${nameTag}`;
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

    if (fundingSource === 'sats' && btcKesRate <= 0) {
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
      if (!verifiedInfo || !verifiedInfo.verified) {
        setErrorMessage('Receiver name must be verified on M-Pesa via Hakikisha before sending can be initiated.');
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
      const recipientName = verifiedInfo?.name || formatKenyanDisplayPhone(phone);
      setConfirmedRecipientName(recipientName);

      const res = await sendMpesaPayout({
        phone,
        amount: numericAmount,
        currency: 'KES',
        satsAmount: satsRequired,
        recipientName,
        note: note || 'Sats to M-Pesa Transfer',
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
        note: note || `Sats cashout directly to ${recipientName} on M-Pesa`,
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#120E16]/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#1D1627] border border-[#3A2D47] rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl shadow-black/80 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#382B44]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#554653]/35 border border-[#554653] flex items-center justify-center text-[#D1B9B3]">
              <Send className="w-4 h-4 text-[#F8F0E7]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#F8F0E7]">Send to M-Pesa</h2>
              <p className="text-[11px] text-[#9B97A2]">Pay directly with Sats or M-Pesa balance</p>
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
              {/* Funding Source Display */}
              <div className="bg-[#140E1B] border border-[#382B44] rounded-2xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-xs font-semibold text-[#D1B9B3]">Funded via Sats Balance</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-[#F8F0E7]">
                    {availableSats.toLocaleString()} Sats
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-[#9B97A2] pt-1.5 border-t border-[#261D2E]">
                  <span>Live Conversion:</span>
                  <span>1 KES ≈ {btcKesRate > 0 ? (100_000_000 / btcKesRate).toFixed(1) : '0'} Sats</span>
                </div>
              </div>

              {/* Transfer Destination Category */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1.5">
                  Transfer Category
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setRecipientType('phone')}
                    className={`py-2 px-2 rounded-2xl border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                      recipientType === 'phone'
                        ? 'border-[#763698] bg-[#763698]/20 text-[#F8F0E7]'
                        : 'border-[#382B44] bg-[#140E1B] text-[#9B97A2]'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>Send Money</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientType('till')}
                    className={`py-2 px-2 rounded-2xl border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                      recipientType === 'till'
                        ? 'border-[#763698] bg-[#763698]/20 text-[#F8F0E7]'
                        : 'border-[#382B44] bg-[#140E1B] text-[#9B97A2]'
                    }`}
                  >
                    <Store className="w-3.5 h-3.5" />
                    <span>Buy Goods</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecipientType('paybill')}
                    className={`py-2 px-2 rounded-2xl border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                      recipientType === 'paybill'
                        ? 'border-[#763698] bg-[#763698]/20 text-[#F8F0E7]'
                        : 'border-[#382B44] bg-[#140E1B] text-[#9B97A2]'
                    }`}
                  >
                    <Hash className="w-3.5 h-3.5" />
                    <span>Paybill</span>
                  </button>
                </div>
              </div>

              {/* Recipient Input with Kenya code and name verification */}
              {recipientType === 'phone' && (
                <KenyaPhoneInput
                  value={phone}
                  onChange={(full) => {
                    setPhone(full);
                    if (verifiedInfo) setVerifiedInfo(null);
                  }}
                  onVerifiedChange={(info) => setVerifiedInfo(info)}
                  label="Recipient Phone Number"
                  autoVerify={false}
                />
              )}

              {recipientType === 'till' && (
                <div>
                  <label className="block text-xs font-semibold text-[#D1B9B3] mb-1">
                    Till Number
                  </label>
                  <input
                    type="text"
                    value={tillNumber}
                    onChange={(e) => {
                      setTillNumber(e.target.value);
                      if (c2bVerified) setC2bVerified(null);
                    }}
                    placeholder="Enter 5-7 digit Till Number"
                    className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-2.5 text-sm font-mono text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={handleVerifyC2b}
                      disabled={isVerifyingC2b || !tillNumber.trim()}
                      className="px-2.5 py-1 rounded-xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#763698] text-[#D1B9B3] hover:text-[#F8F0E7] text-[11px] font-mono flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {isVerifyingC2b ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#763698]" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#763698]" />
                      )}
                      <span>Verify Till (C2B Hakikisha)</span>
                    </button>
                    {c2bVerified && recipientType === 'till' && (
                      <span className="text-[11px] font-mono text-emerald-400 font-semibold truncate max-w-[200px]">
                        {c2bVerified.name}
                      </span>
                    )}
                  </div>
                  {c2bError && recipientType === 'till' && (
                    <div className="mt-1 text-[11px] font-mono text-[#946069]">
                      {c2bError}
                    </div>
                  )}
                </div>
              )}

              {recipientType === 'paybill' && (
                <div>
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
                        placeholder="Paybill Number"
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
                  <div className="mt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={handleVerifyC2b}
                      disabled={isVerifyingC2b || !paybillNumber.trim()}
                      className="px-2.5 py-1 rounded-xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#763698] text-[#D1B9B3] hover:text-[#F8F0E7] text-[11px] font-mono flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    >
                      {isVerifyingC2b ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#763698]" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#763698]" />
                      )}
                      <span>Verify Paybill (C2B Hakikisha)</span>
                    </button>
                    {c2bVerified && recipientType === 'paybill' && (
                      <span className="text-[11px] font-mono text-emerald-400 font-semibold truncate max-w-[200px]">
                        {c2bVerified.name}
                      </span>
                    )}
                  </div>
                  {c2bError && recipientType === 'paybill' && (
                    <div className="mt-1 text-[11px] font-mono text-[#946069]">
                      {c2bError}
                    </div>
                  )}
                </div>
              )}

              {/* Amount to send */}
              <div>
                <div className="flex justify-between items-center text-xs text-[#D1B9B3] mb-1.5">
                  <span className="font-semibold">Recipient Receives (KES)</span>
                  <span className="font-mono text-[11px] text-[#9B97A2]">
                    Via Safaricom M-Pesa
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="0"
                    min="1"
                    className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-2.5 text-lg font-mono font-bold text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                  />
                  <span className="absolute right-4 top-3 font-mono text-sm font-semibold text-[#D1B9B3]">
                    KES
                  </span>
                </div>
              </div>

              {/* Conversion and Fee Breakdown */}
              <div className="bg-[#140E1B]/90 border border-[#382B44] rounded-2xl p-3.5 space-y-2 text-xs">
                <div className="flex justify-between text-[#9B97A2]">
                  <span>Sats To Deduct</span>
                  <span className="font-mono font-bold text-[#F8F0E7]">
                    ~{satsRequired.toLocaleString()} Sats
                  </span>
                </div>
                <div className="flex justify-between text-[#9B97A2]">
                  <span>Lightning Routing Fee</span>
                  <span className="font-mono">{satsFee} Sats</span>
                </div>
                <div className="flex justify-between text-[#D1B9B3] font-semibold border-t border-[#382B44] pt-2">
                  <span>Total Sats Cost</span>
                  <span className="font-mono text-[#F8F0E7] font-bold">
                    {(satsRequired + satsFee).toLocaleString()} Sats
                  </span>
                </div>
              </div>

              {/* Optional Note */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1">
                  Payment Reference Note (Optional)
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Lunch, Supplies, Rent"
                  className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-2 text-xs font-mono text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                />
              </div>

              {/* Recipient verification requirement badge */}
              {recipientType === 'phone' && (!verifiedInfo || !verifiedInfo.verified) && isValidKenyanPhone(phone) && (
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-amber-950/20 border border-amber-500/30 text-amber-300 text-xs">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>Hakikisha unverified in sandbox: Payment will dispatch to +{phone}.</span>
                </div>
              )}
              {recipientType === 'phone' && !isValidKenyanPhone(phone) && (
                <div className="flex items-center gap-2 p-3 rounded-2xl bg-[#231A2D] border border-[#3C2E49] text-[#9B97A2] text-xs">
                  <ShieldCheck className="w-4 h-4 shrink-0 text-[#9B97A2]" />
                  <span>Enter a valid 9-digit Kenyan phone number (e.g. 712 345 678).</span>
                </div>
              )}

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
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#763698] to-[#946069] hover:opacity-95 text-[#F8F0E7] text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-[#120E16]/80 disabled:opacity-50 transition-all active:scale-[0.99]"
              >
                <Send className="w-4 h-4" />
                <span>
                  {recipientType === 'phone' && !isValidKenyanPhone(phone)
                    ? 'Enter Valid Kenyan Phone Number'
                    : isInsufficientSats
                    ? 'Insufficient Sats Balance'
                    : `Send KES ${numericAmount.toLocaleString()} to ${verifiedInfo?.name ? verifiedInfo.name.split(' ')[0] : 'Recipient'}`}
                </span>
              </button>
            </>
          )}

          {step === 'processing' && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="w-10 h-10 text-[#763698] animate-spin" />
              <div className="font-bold text-[#F8F0E7]">
                {fundingSource === 'sats' ? 'Converting Sats & Disbursing M-Pesa...' : 'Dispatching M-Pesa Payment...'}
              </div>
              <div className="text-xs text-[#9B97A2] max-w-xs">
                Sending KES {numericAmount.toLocaleString()} to {confirmedRecipientName || getRecipientDisplay()}
              </div>
            </div>
          )}

          {step === 'success' && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <div className="text-base font-bold text-[#F8F0E7]">M-Pesa Transfer Dispatched!</div>
                <div className="text-xs text-[#9B97A2]">
                  KES {numericAmount.toLocaleString()} sent to {confirmedRecipientName || getRecipientDisplay()}
                </div>
              </div>

              <div className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl p-4 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Verified Recipient</span>
                  <span className="font-mono font-bold text-emerald-300">
                    {confirmedRecipientName || verifiedInfo?.name || 'M-Pesa Subscriber'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Destination Number</span>
                  <span className="font-mono text-[#F8F0E7]">{formatKenyanDisplayPhone(phone)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">Amount Sent</span>
                  <span className="font-mono font-bold text-[#F8F0E7]">KES {numericAmount.toLocaleString()}</span>
                </div>
                {fundingSource === 'sats' && (
                  <div className="flex justify-between">
                    <span className="text-[#9B97A2]">Sats Deducted</span>
                    <span className="font-mono font-bold text-amber-400">
                      {(satsRequired + satsFee).toLocaleString()} Sats
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-[#9B97A2]">M-Pesa Ref ID</span>
                  <span className="font-mono text-[11px] text-[#D1B9B3]">{realReference}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetAndClose}
                className="w-full py-3 px-4 rounded-2xl bg-[#2A1E37] text-[#F8F0E7] text-sm font-semibold hover:bg-[#342645] transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {step === 'error' && (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-[#946069]/20 border border-[#946069]/40 flex items-center justify-center text-[#946069]">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <div className="text-base font-bold text-[#F8F0E7]">Transfer Could Not Complete</div>
                <div className="text-xs text-[#946069] max-w-xs">{errorMessage}</div>
              </div>
              <button
                type="button"
                onClick={() => setStep('input')}
                className="py-2.5 px-5 rounded-2xl bg-[#2A1E37] text-sm font-semibold text-[#F8F0E7]"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

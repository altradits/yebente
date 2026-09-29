import React, { useState, useEffect } from 'react';
import { UserWallet, Transaction, ExchangeRates } from '../types';
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import {
  isLightningAddress,
  resolveLightningAddress,
  createLightningInvoice,
  disburseBitcoinOnChain,
} from '../services/lightningService';
import { isValidBitcoinAddress, sanitizeBitcoinAddress } from '../services/blockchainService';

interface SendBtcModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet;
  rates: ExchangeRates;
  onSuccess: (tx: Omit<Transaction, 'id' | 'timestamp'>) => void;
}

export const SendBtcModal: React.FC<SendBtcModalProps> = ({
  isOpen,
  onClose,
  wallet,
  rates,
  onSuccess,
}) => {
  const [recipient, setRecipient] = useState<string>('');
  const [satsAmountStr, setSatsAmountStr] = useState<string>('1000');
  const [step, setStep] = useState<'input' | 'processing' | 'success' | 'error'>('input');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [resolvedProvider, setResolvedProvider] = useState<string>('');
  const [recipientType, setRecipientType] = useState<'unknown' | 'lightning_address' | 'lightning_invoice' | 'onchain'>('unknown');
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedCallback, setResolvedCallback] = useState<string>('');
  const [txReference, setTxReference] = useState<string>('');

  const numericSats = parseInt(satsAmountStr, 10) || 0;
  const availableSats = wallet.satsBalance ?? Math.round((wallet.btcBalance || 0) * 100_000_000);

  // Fee calculation: 10 Sats for Lightning, 500 Sats for On-Chain
  const satsFee = recipientType === 'onchain' ? 500 : 10;
  const totalDeducted = numericSats + satsFee;
  const isInsufficientSats = totalDeducted > availableSats;

  // Auto-detect and resolve recipient format on change
  useEffect(() => {
    const clean = sanitizeBitcoinAddress(recipient);
    if (!clean) {
      setRecipientType('unknown');
      setResolvedProvider('');
      setResolvedCallback('');
      return;
    }

    if (clean.toLowerCase().startsWith('lnbc')) {
      setRecipientType('lightning_invoice');
      setResolvedProvider('Lightning Invoice (BOLT-11)');
      return;
    }

    if (isLightningAddress(clean)) {
      setRecipientType('lightning_address');
      setIsResolving(true);
      resolveLightningAddress(clean)
        .then((res) => {
          if (res.success) {
            setResolvedProvider(res.provider || 'Lightning Address');
            setResolvedCallback(res.callbackUrl || '');
          } else {
            setResolvedProvider('Unreachable Lightning Address');
          }
        })
        .finally(() => setIsResolving(false));
      return;
    }

    if (isValidBitcoinAddress(clean)) {
      setRecipientType('onchain');
      if (clean.startsWith('bc1p')) {
        setResolvedProvider('Taproot (Layer 1)');
      } else if (clean.startsWith('bc1q')) {
        setResolvedProvider('Native SegWit (Layer 1)');
      } else {
        setResolvedProvider('On-Chain Bitcoin (Layer 1)');
      }
      return;
    }

    setRecipientType('unknown');
    setResolvedProvider('');
    setResolvedCallback('');
  }, [recipient]);

  if (!isOpen) return null;

  const handleBack = () => {
    if (step === 'processing') return;
    if (step === 'error') {
      setStep('input');
      setErrorMessage('');
    } else {
      onClose();
    }
  };

  const handleSend = async () => {
    const cleanRecipient = sanitizeBitcoinAddress(recipient);
    if (!cleanRecipient) {
      setErrorMessage('Please enter a Lightning Address, BOLT-11 invoice, or Bitcoin address.');
      return;
    }

    if (numericSats <= 0) {
      setErrorMessage('Please enter an amount of 1 satoshi or more.');
      return;
    }

    if (isInsufficientSats) {
      setErrorMessage(`Insufficient balance. Required: ${totalDeducted.toLocaleString()} Sats (including fee). Available: ${availableSats.toLocaleString()} Sats.`);
      return;
    }

    setStep('processing');
    setErrorMessage('');

    try {
      let finalInvoice = cleanRecipient;

      // 1. If recipient is a Lightning Address, generate invoice via callback
      if (recipientType === 'lightning_address' && resolvedCallback) {
        const invRes = await createLightningInvoice(resolvedCallback, numericSats, 'Ye₿ente Payout');
        if (!invRes.success || !invRes.invoice) {
          setErrorMessage(invRes.error || 'Failed to generate invoice from recipient Lightning Address.');
          setStep('error');
          return;
        }
        finalInvoice = invRes.invoice;
      }

      // 2. Dispatch via Lightning Backend if Lightning
      if (recipientType === 'lightning_address' || recipientType === 'lightning_invoice') {
        const disburseRes = await fetch('/api/lightning/disburse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoice: finalInvoice,
            satsAmount: numericSats,
            destination: cleanRecipient,
          }),
        });

        const disburseData = await disburseRes.json();

        // If backend node is configured and routed successfully
        if (disburseRes.ok && disburseData.success) {
          const ref = disburseData.paymentHash || `LN-${Date.now().toString(36).toUpperCase()}`;
          setTxReference(ref);
          completeTransaction(ref, cleanRecipient);
          return;
        }

        setErrorMessage(
          disburseData.error ||
          'Failed to route Lightning payment. Ensure your Lightning node (LNBITS_URL or LND) is configured in .env.'
        );
        setStep('error');
        return;
      }

      // 3. If On-Chain Bitcoin Address
      if (recipientType === 'onchain') {
        const btcRes = await disburseBitcoinOnChain(cleanRecipient, numericSats, satsFee);
        if (btcRes.success && (btcRes.txid || btcRes.referenceNumber)) {
          const ref = btcRes.txid || btcRes.referenceNumber!;
          setTxReference(ref);
          completeTransaction(ref, cleanRecipient);
          return;
        }

        setErrorMessage(
          btcRes.error ||
          'Failed to broadcast on-chain Bitcoin transaction. Ensure Bitcoin node credentials (LND or Bitcoin RPC) are configured in .env.'
        );
        setStep('error');
        return;
      }

      setErrorMessage('Unrecognized recipient address format. Enter a valid Lightning or Bitcoin address.');
      setStep('error');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error dispatching payment';
      setErrorMessage(message);
      setStep('error');
    }
  };

  const completeTransaction = (ref: string, targetRecipient: string) => {
    setStep('success');
    onSuccess({
      type: 'send_btc',
      title: recipientType === 'onchain' ? 'Sent On-Chain Bitcoin' : 'Sent Lightning Sats',
      status: 'completed',
      fromCurrency: 'SATS',
      fromAmount: numericSats,
      fee: satsFee,
      feeCurrency: 'SATS',
      recipient: targetRecipient,
      referenceNumber: ref,
      walletType: wallet.type,
      note: `Dispatched to ${resolvedProvider || targetRecipient}`,
    });
  };

  return (
    <div
      onClick={handleBack}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#120E16]/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1D1627] border border-[#3A2D47] rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl shadow-black/80 flex flex-col max-h-[92vh]"
      >
        {/* Stan Style Header with Textless Back Navigation */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#382B44]/60">
          <button
            type="button"
            onClick={handleBack}
            className="p-1.5 rounded-lg text-[#9B97A2] hover:text-[#F8F0E7] transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold text-[#F8F0E7]">Send Sats</h2>
          <div className="w-8" aria-hidden="true" />
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* STEP 1: Input */}
          {step === 'input' && (
            <div className="space-y-4">
              {/* Current balance readout without button box */}
              <div className="flex justify-between items-center px-1 text-xs">
                <span className="text-[#9B97A2]">Available Balance</span>
                <span className="font-mono font-bold text-[#F8F0E7]">
                  {availableSats.toLocaleString()} Sats
                </span>
              </div>

              {/* Recipient Input (Lightning Address, Invoice, or Bitcoin Address) */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1.5">
                  Recipient
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    placeholder="user@walletofsatoshi.com, lnbc..., or bc1q..."
                    className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-2.5 text-xs font-mono text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                  />
                  {isResolving && (
                    <div className="absolute right-3 top-2.5">
                      <Loader2 className="w-4 h-4 animate-spin text-[#763698]" />
                    </div>
                  )}
                </div>

                {/* Auto-detected Recipient Badge */}
                {resolvedProvider && (
                  <div className="flex items-center justify-between mt-1.5 px-1 text-[11px] font-mono text-emerald-400">
                    <span>Detected Destination</span>
                    <span>{resolvedProvider}</span>
                  </div>
                )}
              </div>

              {/* Sats Amount Input */}
              <div>
                <div className="flex justify-between items-center text-xs text-[#D1B9B3] mb-1.5">
                  <span className="font-semibold">Sats to Send</span>
                  <button
                    type="button"
                    onClick={() => {
                      const maxSend = Math.max(0, availableSats - satsFee);
                      setSatsAmountStr(maxSend.toString());
                    }}
                    className="text-[#D1B9B3] hover:underline font-mono text-[11px]"
                  >
                    MAX
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="500"
                    min="1"
                    value={satsAmountStr}
                    onChange={(e) => setSatsAmountStr(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="1000"
                    className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-3 text-lg font-mono font-bold text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                  />
                  <span className="absolute right-4 top-3.5 font-mono text-sm font-semibold text-[#D1B9B3]">
                    Sats
                  </span>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="grid grid-cols-4 gap-2">
                {[500, 1000, 5000, 10000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSatsAmountStr(preset.toString())}
                    className={`py-2 rounded-xl border text-xs font-mono font-medium transition-all ${
                      numericSats === preset
                        ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                        : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2] hover:border-[#554653]'
                    }`}
                  >
                    {preset.toLocaleString()}
                  </button>
                ))}
              </div>

              {/* Fee and Total Readouts without button box */}
              <div className="space-y-1.5 px-1 pt-1 text-xs">
                <div className="flex justify-between items-center text-[#9B97A2]">
                  <span>Network Fee</span>
                  <span className="font-mono text-[#D1B9B3]">{satsFee.toLocaleString()} Sats</span>
                </div>
                <div className="flex justify-between items-center text-[#9B97A2]">
                  <span>Total Deducted</span>
                  <span className="font-mono font-bold text-[#F8F0E7]">{totalDeducted.toLocaleString()} Sats</span>
                </div>
              </div>

              {/* Error message */}
              {errorMessage && (
                <div className="p-3 rounded-2xl bg-red-950/30 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit CTA Button */}
              <button
                type="button"
                onClick={handleSend}
                disabled={!recipient.trim() || numericSats <= 0 || isInsufficientSats}
                className="w-full h-12 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] active:scale-[0.98] text-[#F8F0E7] font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 shadow-md shadow-[#763698]/20"
              >
                Send Sats
              </button>
            </div>
          )}

          {/* STEP 2: Processing */}
          {step === 'processing' && (
            <div className="py-8 text-center space-y-4">
              <Loader2 className="w-10 h-10 animate-spin text-[#763698] mx-auto" />
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[#F8F0E7]">Routing Payment</h3>
                <p className="text-xs text-[#9B97A2]">
                  Dispatching {numericSats.toLocaleString()} Sats to {resolvedProvider || recipient}...
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: Success */}
          {step === 'success' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[#F8F0E7]">Sats Sent Successfully</h3>
                <p className="text-xs text-[#9B97A2]">
                  Dispatched to {resolvedProvider || recipient}.
                </p>
              </div>

              <div className="p-3.5 bg-[#140E1B] border border-[#382B44] rounded-2xl space-y-2 text-left">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[#9B97A2]">Amount Sent</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">
                    -{numericSats.toLocaleString()} Sats
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[#9B97A2]">Network Fee</span>
                  <span className="text-xs font-mono text-[#D1B9B3]">
                    {satsFee.toLocaleString()} Sats
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[#9B97A2]">Reference</span>
                  <span className="text-xs font-mono text-[#D1B9B3] break-all">
                    {txReference}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full h-12 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] active:scale-[0.98] text-[#F8F0E7] font-bold text-sm flex items-center justify-center transition-all shadow-md shadow-[#763698]/20"
              >
                Done
              </button>
            </div>
          )}

          {/* STEP 4: Error */}
          {step === 'error' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[#F8F0E7]">Payment Failed</h3>
                <p className="text-xs text-red-300 px-2 leading-relaxed">
                  {errorMessage}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setStep('input')}
                className="w-full h-12 rounded-2xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#763698] text-[#F8F0E7] font-semibold text-xs flex items-center justify-center transition-colors"
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

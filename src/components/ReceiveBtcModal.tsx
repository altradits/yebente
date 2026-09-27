import React, { useState, useEffect, useRef } from 'react';
import { UserWallet, Transaction } from '../types';
import { ArrowLeft, CheckCircle2, AlertCircle, Copy, Check, Loader2 } from 'lucide-react';
import QRCode from 'qrcode';
import { createDepositInvoice, checkInvoiceStatus } from '../services/lightningService';

interface ReceiveBtcModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet;
  onSuccess: (tx: Omit<Transaction, 'id' | 'timestamp'>) => void;
}

export const ReceiveBtcModal: React.FC<ReceiveBtcModalProps> = ({
  isOpen,
  onClose,
  wallet,
  onSuccess,
}) => {
  const [step, setStep] = useState<'input' | 'invoice' | 'success' | 'error'>('input');
  const [satsAmountStr, setSatsAmountStr] = useState<string>('1000');
  const [memo, setMemo] = useState<string>('Deposit from Wallet of Satoshi');
  const [isGenerating, setIsGenerating] = useState(false);
  const [invoice, setInvoice] = useState<string>('');
  const [paymentHash, setPaymentHash] = useState<string>('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [copiedInvoice, setCopiedInvoice] = useState(false);
  const [isCheckingSettlement, setIsCheckingSettlement] = useState(false);
  const [isNodeConfigured, setIsNodeConfigured] = useState(true);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const numericSats = parseInt(satsAmountStr, 10) || 0;
  const currentSats = wallet.satsBalance ?? Math.round((wallet.btcBalance || 0) * 100_000_000);

  // Stop polling on unmount or modal close
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const handleBack = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    if (step === 'invoice' || step === 'error') {
      setStep('input');
      setErrorMessage('');
    } else {
      onClose();
    }
  };

  const handleCreateInvoice = async () => {
    if (numericSats <= 0) {
      setErrorMessage('Please enter an amount of 1 satoshi or more.');
      return;
    }

    setIsGenerating(true);
    setErrorMessage('');

    try {
      const res = await createDepositInvoice(numericSats, memo);

      if (!res.success || !res.invoice) {
        setIsNodeConfigured(Boolean(res.configured));
        setErrorMessage(
          res.error || 'Failed to generate Lightning invoice. Ensure your Lightning node is configured in .env.'
        );
        setStep('error');
        return;
      }

      setInvoice(res.invoice);
      setPaymentHash(res.paymentHash || '');
      setIsNodeConfigured(true);

      // Generate high contrast QR code for Wallet of Satoshi scanner
      const qrData = await QRCode.toDataURL(res.invoice.toUpperCase(), {
        margin: 2,
        width: 280,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
      });
      setQrCodeUrl(qrData);
      setStep('invoice');

      // Start polling for settlement
      if (res.paymentHash) {
        startPollingSettlement(res.paymentHash, numericSats);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error generating invoice';
      setErrorMessage(message);
      setStep('error');
    } finally {
      setIsGenerating(false);
    }
  };

  const startPollingSettlement = (hash: string, sats: number) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(async () => {
      setIsCheckingSettlement(true);
      try {
        const res = await checkInvoiceStatus(hash);
        if (res.paid || res.settled) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
          }
          triggerSuccess(hash, sats);
        }
      } catch {
        // Silently continue polling on transient network hiccup
      } finally {
        setIsCheckingSettlement(false);
      }
    }, 2500);
  };

  const triggerSuccess = (hash: string, sats: number) => {
    setStep('success');
    onSuccess({
      type: 'receive_btc',
      title: 'Received Lightning Sats',
      status: 'completed',
      fromCurrency: 'SATS',
      fromAmount: sats,
      toCurrency: 'SATS',
      toAmount: sats,
      fee: 0,
      feeCurrency: 'SATS',
      referenceNumber: `LN-${hash.slice(0, 10).toUpperCase()}`,
      walletType: wallet.type,
      note: 'Payment from Wallet of Satoshi',
    });
  };

  const handleCopyInvoice = () => {
    if (!invoice) return;
    navigator.clipboard.writeText(invoice);
    setCopiedInvoice(true);
    setTimeout(() => setCopiedInvoice(false), 2000);
  };

  // Development sandbox fallback trigger
  const handleSimulatePayment = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    const mockHash = paymentHash || `sim_${Date.now().toString(36)}`;
    triggerSuccess(mockHash, numericSats);
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
          <h2 className="text-base font-bold text-[#F8F0E7]">Receive Sats</h2>
          <div className="w-8" aria-hidden="true" />
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* STEP 1: Input */}
          {step === 'input' && (
            <div className="space-y-4">
              {/* Current balance readout without button border */}
              <div className="flex justify-between items-center px-1 text-xs">
                <span className="text-[#9B97A2]">Current Balance</span>
                <span className="font-mono font-bold text-[#F8F0E7]">
                  {currentSats.toLocaleString()} Sats
                </span>
              </div>

              {/* Sats amount input */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1.5">
                  Sats to Receive
                </label>
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

              {/* Optional Memo */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1.5">
                  Note
                </label>
                <input
                  type="text"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="Deposit from Wallet of Satoshi"
                  className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-2.5 text-xs text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                />
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="p-3 rounded-2xl bg-red-950/30 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Submit CTA Button */}
              <button
                type="button"
                onClick={handleCreateInvoice}
                disabled={numericSats <= 0 || isGenerating}
                className="w-full h-12 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] active:scale-[0.98] text-[#F8F0E7] font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 shadow-md shadow-[#763698]/20"
              >
                {isGenerating ? 'Generating...' : 'Create Invoice'}
              </button>
            </div>
          )}

          {/* STEP 2: Invoice Display & Polling */}
          {step === 'invoice' && (
            <div className="space-y-4 flex flex-col items-center text-center">
              {/* Requested Sats readout */}
              <div className="w-full flex justify-between items-center px-1 text-xs">
                <span className="text-[#9B97A2]">Invoice Amount</span>
                <span className="font-mono font-bold text-lg text-[#F8F0E7]">
                  {numericSats.toLocaleString()} Sats
                </span>
              </div>

              {/* High Contrast QR Code for Wallet of Satoshi scanning */}
              {qrCodeUrl && (
                <div className="p-3.5 bg-white rounded-3xl shadow-xl border border-white/20 my-1">
                  <img
                    src={qrCodeUrl}
                    alt="Lightning Invoice QR Code"
                    className="w-56 h-56 rounded-xl object-contain block"
                  />
                </div>
              )}

              {/* Live Status indicator */}
              <div className="flex items-center gap-2 text-xs font-mono text-[#D1B9B3]">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#763698]" />
                <span>Awaiting payment from Wallet of Satoshi...</span>
              </div>

              {/* Truncated Invoice String */}
              <div className="w-full bg-[#140E1B] border border-[#382B44] p-3 rounded-2xl text-left space-y-2">
                <div className="flex justify-between items-center text-[11px] text-[#9B97A2]">
                  <span>Lightning Invoice</span>
                  <span className="font-mono text-[10px]">BOLT-11</span>
                </div>
                <div className="font-mono text-[11px] text-[#D1B9B3] break-all max-h-16 overflow-y-auto select-all leading-relaxed">
                  {invoice}
                </div>
              </div>

              {/* Action Buttons: Copy Invoice */}
              <button
                type="button"
                onClick={handleCopyInvoice}
                className="w-full h-11 rounded-2xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#763698] text-[#F8F0E7] font-semibold text-xs flex items-center justify-center transition-colors"
              >
                {copiedInvoice ? 'Invoice Copied' : 'Copy Invoice'}
              </button>

              {/* Development testing fallback */}
              {!isNodeConfigured && (
                <button
                  type="button"
                  onClick={handleSimulatePayment}
                  className="w-full py-2 text-[11px] font-mono text-[#9B97A2] hover:text-[#F8F0E7] transition-colors underline"
                >
                  Simulate Settlement (Sandbox Test)
                </button>
              )}
            </div>
          )}

          {/* STEP 3: Success Screen */}
          {step === 'success' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[#F8F0E7]">Payment Received</h3>
                <p className="text-xs text-[#9B97A2]">
                  Satoshis have been deposited into your Ye₿ente wallet.
                </p>
              </div>

              <div className="p-3.5 bg-[#140E1B] border border-[#382B44] rounded-2xl space-y-2 text-left">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[#9B97A2]">Amount Added</span>
                  <span className="text-sm font-mono font-bold text-emerald-400">
                    +{numericSats.toLocaleString()} Sats
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[#9B97A2]">New Balance</span>
                  <span className="text-xs font-mono font-bold text-[#F8F0E7]">
                    {(currentSats + numericSats).toLocaleString()} Sats
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-[#9B97A2]">Network</span>
                  <span className="text-xs font-mono text-[#D1B9B3]">Lightning Network</span>
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

          {/* STEP 4: Error Screen */}
          {step === 'error' && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-8 h-8" />
              </div>

              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[#F8F0E7]">Generation Failed</h3>
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

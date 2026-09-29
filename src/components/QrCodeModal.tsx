import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserWallet, Transaction, ExchangeRates } from '../types';
import {
  ArrowLeft,
  Check,
  Copy,
  Camera,
  CameraOff,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Share2,
} from 'lucide-react';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {
  createDepositInvoice,
  checkInvoiceStatus,
  isLightningAddress,
  resolveLightningAddress,
  createLightningInvoice,
  disburseBitcoinOnChain,
} from '../services/lightningService';
import { isValidBitcoinAddress, sanitizeBitcoinAddress } from '../services/blockchainService';
import { getStoredSovereignAddress } from '../services/vaultService';

interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet;
  rates: ExchangeRates;
  initialMode?: 'receive' | 'send';
  onSuccess: (tx: Omit<Transaction, 'id' | 'timestamp'>) => void;
  onOpenWalletSettings: () => void;
}

export const QrCodeModal: React.FC<QrCodeModalProps> = ({
  isOpen,
  onClose,
  wallet,
  rates,
  initialMode = 'receive',
  onSuccess,
  onOpenWalletSettings,
}) => {
  const [mode, setMode] = useState<'receive' | 'send'>(initialMode);

  // Receive state
  const [rail, setRail] = useState<'lightning' | 'onchain'>('lightning');
  const [receiveSatsStr, setReceiveSatsStr] = useState<string>('1000');
  const [receiveMemo, setReceiveMemo] = useState<string>('Ye₿ente Sats Deposit');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [receivingAddress, setReceivingAddress] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCheckingSettlement, setIsCheckingSettlement] = useState(false);
  const [paymentHash, setPaymentHash] = useState<string>('');
  const [receiveError, setReceiveError] = useState<string>('');
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedLnAddress, setCopiedLnAddress] = useState(false);
  const [receiveSuccess, setReceiveSuccess] = useState(false);

  // Send state
  const [recipient, setRecipient] = useState<string>('');
  const [sendSatsStr, setSendSatsStr] = useState<string>('');
  const [sendMemo, setSendMemo] = useState<string>('');
  const [sendStep, setSendStep] = useState<'input' | 'processing' | 'success' | 'error'>('input');
  const [sendError, setSendError] = useState<string>('');
  const [txReference, setTxReference] = useState<string>('');
  const [resolvedProvider, setResolvedProvider] = useState<string>('');
  const [resolvedCallback, setResolvedCallback] = useState<string>('');
  const [isResolvingRecipient, setIsResolvingRecipient] = useState(false);

  // Camera scanner state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string>('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Polling ref for invoice settlement
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const availableSats = wallet.satsBalance ?? Math.round((wallet.btcBalance || 0) * 100_000_000);
  const sendNumericSats = parseInt(sendSatsStr, 10) || 0;
  const receiveNumericSats = parseInt(receiveSatsStr, 10) || 0;
  const satsFee = recipient && isValidBitcoinAddress(recipient) && !isLightningAddress(recipient) ? 500 : 0;
  const isInsufficientSats = sendNumericSats + satsFee > availableSats;

  // Resolve lightning address for sharing
  const userLightningAddress =
    wallet.nonCustodialAddress && isLightningAddress(wallet.nonCustodialAddress)
      ? wallet.nonCustodialAddress
      : '';

  // Sovereign Bitcoin address (guaranteed non-empty)
  const sovereignAddress =
    wallet.nonCustodialAddress &&
    !wallet.nonCustodialAddress.includes('@') &&
    !wallet.nonCustodialAddress.toLowerCase().startsWith('lnbc')
      ? wallet.nonCustodialAddress
      : getStoredSovereignAddress();

  const shareableLightningText = userLightningAddress
    ? userLightningAddress
    : `lightning:${receivingAddress || sovereignAddress}`;

  // Synchronize initial mode when modal opens
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setReceiveSuccess(false);
      setSendStep('input');
      setSendError('');
      setReceiveError('');
    }
  }, [isOpen, initialMode]);

  // Stop polling and camera on close / unmount
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopPolling();
      stopCamera();
    };
  }, [stopPolling, stopCamera]);

  // Handle invoice settlement polling
  const startPollingSettlement = useCallback(
    (hash: string, sats: number) => {
      stopPolling();

      pollIntervalRef.current = setInterval(async () => {
        setIsCheckingSettlement(true);
        try {
          const res = await checkInvoiceStatus(hash);
          if (res.paid || res.settled) {
            stopPolling();
            setReceiveSuccess(true);
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
              note: 'Payment received via QR invoice',
            });
          }
        } catch {
          // Transient network error, continue polling
        } finally {
          setIsCheckingSettlement(false);
        }
      }, 2500);
    },
    [onSuccess, stopPolling, wallet.type]
  );

  // Auto-generate QR code for receiving sats
  const generateReceiveQr = useCallback(
    async (customSats?: number) => {
      setReceiveError('');
      setIsGenerating(true);

      try {
        const activeSats = typeof customSats === 'number' ? customSats : receiveNumericSats;
        const satsToRequest = Math.max(1, activeSats);

        if (rail === 'lightning') {
          const res = await createDepositInvoice(satsToRequest, receiveMemo);

          if (res.success && res.invoice) {
            setReceivingAddress(res.invoice);
            setPaymentHash(res.paymentHash || '');

            const qrData = await QRCode.toDataURL(res.invoice.toUpperCase(), {
              margin: 2,
              width: 280,
              color: { dark: '#000000', light: '#FFFFFF' },
            });
            setQrCodeDataUrl(qrData);

            if (res.paymentHash) {
              startPollingSettlement(res.paymentHash, satsToRequest);
            }
            return;
          }

          // If backend node is not configured or offline, fallback to user's Lightning Address or sovereign address QR
          if (userLightningAddress) {
            setReceivingAddress(userLightningAddress);
            const qrData = await QRCode.toDataURL(`lightning:${userLightningAddress}`, {
              margin: 2,
              width: 280,
              color: { dark: '#000000', light: '#FFFFFF' },
            });
            setQrCodeDataUrl(qrData);
            setReceiveError('');
            return;
          }

          // Generate immediate fallback QR using sovereign address with BIP-21 parameter
          setReceivingAddress(sovereignAddress);
          const amountBtc = (satsToRequest / 100_000_000).toFixed(8);
          const btcUri = `bitcoin:${sovereignAddress}?amount=${amountBtc}&label=Yebente%20Deposit`;
          const qrData = await QRCode.toDataURL(btcUri, {
            margin: 2,
            width: 280,
            color: { dark: '#000000', light: '#FFFFFF' },
          });
          setQrCodeDataUrl(qrData);
          setReceiveError('Lightning node offline in .env. Displaying sovereign Bitcoin deposit QR.');
        } else {
          // Layer 1 On-Chain
          const targetAddress = sovereignAddress;
          setReceivingAddress(targetAddress);
          const amountBtc = (satsToRequest / 100_000_000).toFixed(8);
          const btcUri =
            satsToRequest > 0
              ? `bitcoin:${targetAddress}?amount=${amountBtc}&label=Yebente%20Deposit`
              : `bitcoin:${targetAddress}`;
          const qrData = await QRCode.toDataURL(btcUri, {
            margin: 2,
            width: 280,
            color: { dark: '#000000', light: '#FFFFFF' },
          });
          setQrCodeDataUrl(qrData);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Error generating QR code.';
        setReceiveError(message);
      } finally {
        setIsGenerating(false);
      }
    },
    [rail, receiveNumericSats, receiveMemo, userLightningAddress, sovereignAddress, startPollingSettlement]
  );

  const handleSelectReceivePreset = (preset: number) => {
    setReceiveSatsStr(preset.toString());
    generateReceiveQr(preset);
  };

  const handleStepReceiveSats = (delta: number) => {
    const cur = parseInt(receiveSatsStr, 10) || 1;
    const next = Math.max(1, cur + delta);
    setReceiveSatsStr(next.toString());
    generateReceiveQr(next);
  };

  // Auto-generate QR code whenever receive mode or rail changes
  useEffect(() => {
    if (isOpen && mode === 'receive') {
      generateReceiveQr();
    }
  }, [isOpen, mode, rail, generateReceiveQr]);

  // Debounced auto-regeneration when typing custom sats
  useEffect(() => {
    if (!isOpen || mode !== 'receive') return;
    const val = parseInt(receiveSatsStr, 10);
    if (isNaN(val) || val < 1) return;

    const timer = setTimeout(() => {
      generateReceiveQr(val);
    }, 450);

    return () => clearTimeout(timer);
  }, [receiveSatsStr, isOpen, mode, generateReceiveQr]);

  // Copy helpers
  const handleCopyReceivingAddress = () => {
    if (!receivingAddress) return;
    navigator.clipboard.writeText(receivingAddress);
    setCopiedAddress(true);
    setTimeout(() => setCopiedAddress(false), 2000);
  };

  const handleCopyLightningAddress = () => {
    if (!shareableLightningText) return;
    navigator.clipboard.writeText(shareableLightningText);
    setCopiedLnAddress(true);
    setTimeout(() => setCopiedLnAddress(false), 2000);
  };

  // Resolve recipient details when sending
  useEffect(() => {
    const clean = recipient.trim();
    if (!clean) {
      setResolvedProvider('');
      setResolvedCallback('');
      return;
    }

    if (isLightningAddress(clean)) {
      setIsResolvingRecipient(true);
      resolveLightningAddress(clean)
        .then((res) => {
          if (res.success) {
            setResolvedProvider(res.provider);
            setResolvedCallback(res.callbackUrl);
          } else {
            setResolvedProvider('');
            setResolvedCallback('');
          }
        })
        .finally(() => setIsResolvingRecipient(false));
      return;
    }

    setResolvedProvider('');
    setResolvedCallback('');
  }, [recipient]);

  // Camera QR scanner frame processing
  const scanVideoFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data) {
        let rawScanned = code.data.trim();
        // Parse bitcoin: or lightning: URI
        if (/^(bitcoin|lightning):/i.test(rawScanned)) {
          const parsedUrl = new URL(rawScanned);
          const cleanAddr = parsedUrl.pathname.replace(/^\/\//, '');
          setRecipient(cleanAddr);

          const amountParam = parsedUrl.searchParams.get('amount');
          if (amountParam) {
            const parsedAmount = parseFloat(amountParam);
            if (!isNaN(parsedAmount) && parsedAmount > 0) {
              // If bitcoin: amount is in BTC
              if (rawScanned.toLowerCase().startsWith('bitcoin:')) {
                setSendSatsStr(Math.round(parsedAmount * 100_000_000).toString());
              } else {
                // If lightning: amount is in millisats or sats
                setSendSatsStr(Math.round(parsedAmount).toString());
              }
            }
          }
        } else {
          setRecipient(rawScanned);
        }

        stopCamera();
        return;
      }
    }

    animFrameIdRef.current = requestAnimationFrame(scanVideoFrame);
  }, [stopCamera]);

  const startCamera = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 640 } },
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setIsCameraActive(true);
        animFrameIdRef.current = requestAnimationFrame(scanVideoFrame);
      }
    } catch {
      setCameraError('Camera access unavailable. Enter or paste address manually below.');
      setIsCameraActive(false);
    }
  };

  const handleToggleCamera = () => {
    if (isCameraActive) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const clean = sanitizeBitcoinAddress(text);
        setRecipient(clean);
      }
    } catch {
      // Clipboard permissions denied
    }
  };

  // Dispatch payment
  const handleConfirmSend = async () => {
    if (sendNumericSats <= 0) return;
    const cleanRecipient = recipient.trim();
    if (!cleanRecipient) {
      setSendError('Please enter a recipient Lightning or Bitcoin address.');
      return;
    }

    if (isInsufficientSats) {
      setSendError(
        `Insufficient Sats balance. Required: ${(sendNumericSats + satsFee).toLocaleString()} Sats, Available: ${availableSats.toLocaleString()} Sats.`
      );
      return;
    }

    setSendStep('processing');
    setSendError('');

    try {
      let finalInvoice = cleanRecipient;

      // 1. Resolve Lightning Address callback if applicable
      if (isLightningAddress(cleanRecipient)) {
        if (!resolvedCallback) {
          const resolved = await resolveLightningAddress(cleanRecipient);
          if (!resolved.success || !resolved.callbackUrl) {
            setSendError(resolved.error || 'Failed to resolve recipient Lightning Address.');
            setSendStep('error');
            return;
          }
          const invRes = await createLightningInvoice(resolved.callbackUrl, sendNumericSats, sendMemo || 'Ye₿ente Payout');
          if (!invRes.success || !invRes.invoice) {
            setSendError(invRes.error || 'Failed to generate invoice from recipient Lightning Address.');
            setSendStep('error');
            return;
          }
          finalInvoice = invRes.invoice;
        } else {
          const invRes = await createLightningInvoice(resolvedCallback, sendNumericSats, sendMemo || 'Ye₿ente Payout');
          if (!invRes.success || !invRes.invoice) {
            setSendError(invRes.error || 'Failed to generate invoice from recipient Lightning Address.');
            setSendStep('error');
            return;
          }
          finalInvoice = invRes.invoice;
        }
      }

      // 2. Dispatch Lightning Payment
      if (isLightningAddress(cleanRecipient) || cleanRecipient.toLowerCase().startsWith('lnbc')) {
        const disburseRes = await fetch('/api/lightning/disburse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            invoice: finalInvoice,
            satsAmount: sendNumericSats,
            destination: cleanRecipient,
          }),
        });

        const disburseData = await disburseRes.json();
        if (disburseRes.ok && disburseData.success) {
          const ref = disburseData.paymentHash || `LN-${Date.now().toString(36).toUpperCase()}`;
          setTxReference(ref);
          setSendStep('success');
          onSuccess({
            type: 'send_btc',
            title: 'Sent Lightning Sats',
            status: 'completed',
            fromCurrency: 'SATS',
            fromAmount: sendNumericSats,
            fee: 0,
            feeCurrency: 'SATS',
            recipient: cleanRecipient,
            referenceNumber: ref,
            walletType: wallet.type,
            note: sendMemo || `Dispatched to ${resolvedProvider || cleanRecipient}`,
          });
          return;
        }

        setSendError(
          disburseData.error ||
          'Failed to route Lightning payment. Ensure LNBITS_URL or LND credentials are configured in .env.'
        );
        setSendStep('error');
        return;
      }

      // 3. Dispatch Layer 1 On-Chain Bitcoin Payment
      if (isValidBitcoinAddress(cleanRecipient)) {
        const btcRes = await disburseBitcoinOnChain(cleanRecipient, sendNumericSats, satsFee);
        if (btcRes.success && (btcRes.txid || btcRes.referenceNumber)) {
          const ref = btcRes.txid || btcRes.referenceNumber!;
          setTxReference(ref);
          setSendStep('success');
          onSuccess({
            type: 'send_btc',
            title: 'Sent On-Chain Bitcoin',
            status: 'completed',
            fromCurrency: 'SATS',
            fromAmount: sendNumericSats,
            fee: satsFee,
            feeCurrency: 'SATS',
            recipient: cleanRecipient,
            referenceNumber: ref,
            walletType: wallet.type,
            note: sendMemo || `On-chain transfer to ${cleanRecipient}`,
          });
          return;
        }

        setSendError(
          btcRes.error ||
          'Failed to broadcast on-chain Bitcoin transaction. Ensure Bitcoin node credentials (LND or Bitcoin RPC) are configured in .env.'
        );
        setSendStep('error');
        return;
      }

      setSendError('Unrecognized recipient address format. Enter a valid Lightning or Bitcoin address.');
      setSendStep('error');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error dispatching payment.';
      setSendError(message);
      setSendStep('error');
    }
  };

  const handleBack = () => {
    stopCamera();
    stopPolling();
    if (sendStep === 'error' || sendStep === 'success') {
      setSendStep('input');
      setSendError('');
      return;
    }
    onClose();
  };

  if (!isOpen) return null;

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
          <h2 className="text-base font-bold text-[#F8F0E7]">
            {mode === 'receive' ? 'Receive Sats' : 'Send Sats'}
          </h2>
          <div className="w-8" aria-hidden="true" />
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Interactive Mode Tab Selector (Receive vs Send) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                stopCamera();
                setMode('receive');
              }}
              className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                mode === 'receive'
                  ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                  : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
              }`}
            >
              Receive
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('send');
              }}
              className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                mode === 'send'
                  ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                  : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
              }`}
            >
              Send
            </button>
          </div>

          {/* ============================================================ */}
          {/* RECEIVE SATS MODE (Auto-generates QR and displays address)     */}
          {/* ============================================================ */}
          {mode === 'receive' && (
            <div className="space-y-4">
              {/* Rail Selector: Lightning vs On-Chain */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRail('lightning')}
                  className={`p-2 rounded-xl border text-xs font-medium transition-all ${
                    rail === 'lightning'
                      ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                      : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
                  }`}
                >
                  Lightning (L2)
                </button>
                <button
                  type="button"
                  onClick={() => setRail('onchain')}
                  className={`p-2 rounded-xl border text-xs font-medium transition-all ${
                    rail === 'onchain'
                      ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                      : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
                  }`}
                >
                  On-Chain (Layer 1)
                </button>
              </div>

              {/* Success Notification if Payment Settled */}
              {receiveSuccess && (
                <div className="p-3.5 bg-emerald-950/40 border border-emerald-500/40 rounded-2xl flex items-center gap-2.5 text-emerald-300">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                  <div>
                    <p className="font-bold text-xs">Payment Received</p>
                    <p className="text-[11px] text-emerald-200/80">Satoshis deposited into your balance.</p>
                  </div>
                </div>
              )}

              {/* Sats Amount Configuration (Allows editing sats to the least amounts) */}
              <div className="space-y-2 pt-0.5">
                <div className="flex justify-between items-center px-1">
                  <label className="text-xs font-semibold text-[#D1B9B3]">
                    {rail === 'lightning' ? 'Invoice Amount' : 'Deposit Amount'}
                  </label>
                  {rates.btcKes > 0 && receiveNumericSats > 0 && (
                    <span className="font-mono text-xs text-[#9B97A2]">
                      {(receiveNumericSats / 100_000_000) * rates.btcKes < 0.01
                        ? '< KES 0.01'
                        : `≈ KES ${((receiveNumericSats / 100_000_000) * rates.btcKes).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleStepReceiveSats(-1)}
                    disabled={receiveNumericSats <= 1 || isGenerating}
                    className="w-10 h-10 rounded-xl bg-[#140E1B] border border-[#382B44] hover:border-[#763698] disabled:opacity-30 font-mono text-base font-bold text-[#F8F0E7] flex items-center justify-center transition-colors shrink-0"
                    aria-label="Decrease sats"
                  >
                    -
                  </button>

                  <div className="relative flex-1">
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={receiveSatsStr}
                      onChange={(e) => setReceiveSatsStr(e.target.value)}
                      onWheel={(e) => e.currentTarget.blur()}
                      placeholder="1"
                      className="w-full bg-[#140E1B] border border-[#382B44] rounded-xl px-3 py-2.5 font-mono font-bold text-sm text-[#F8F0E7] focus:outline-none focus:border-[#763698] text-center"
                    />
                    <span className="absolute right-3 top-3 font-mono text-xs text-[#9B97A2]">
                      Sats
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleStepReceiveSats(1)}
                    disabled={isGenerating}
                    className="w-10 h-10 rounded-xl bg-[#140E1B] border border-[#382B44] hover:border-[#763698] disabled:opacity-30 font-mono text-base font-bold text-[#F8F0E7] flex items-center justify-center transition-colors shrink-0"
                    aria-label="Increase sats"
                  >
                    +
                  </button>

                  <button
                    type="button"
                    onClick={() => generateReceiveQr()}
                    disabled={isGenerating || receiveNumericSats <= 0}
                    className="px-3 h-10 rounded-xl bg-[#763698] hover:bg-[#8A41B0] active:scale-[0.98] text-[#F8F0E7] font-semibold text-xs transition-all disabled:opacity-50 shrink-0 flex items-center justify-center"
                  >
                    {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Update QR'}
                  </button>
                </div>

                {/* Quick Least Amount Presets */}
                <div className="grid grid-cols-6 gap-1.5">
                  {[1, 10, 100, 500, 1000, 5000].map((preset) => {
                    const isSelected = receiveNumericSats === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => handleSelectReceivePreset(preset)}
                        className={`py-1.5 rounded-xl border text-[11px] font-mono font-medium transition-all ${
                          isSelected
                            ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7] font-bold'
                            : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2] hover:border-[#554653]'
                        }`}
                      >
                        {preset === 1 ? '1 Sat' : preset.toLocaleString()}
                      </button>
                    );
                  })}
                </div>

                {receiveNumericSats < 1 && (
                  <p className="text-[11px] text-amber-300 font-mono px-1">
                    Minimum receive amount is 1 satoshi.
                  </p>
                )}
              </div>

              {/* Auto-Generated QR Code Card */}
              <div className="flex flex-col items-center text-center space-y-3">
                {isGenerating ? (
                  <div className="w-56 h-56 rounded-3xl bg-[#140E1B] border border-[#382B44] flex flex-col items-center justify-center gap-2 text-[#9B97A2]">
                    <Loader2 className="w-6 h-6 animate-spin text-[#763698]" />
                    <span className="font-mono text-xs">Generating QR...</span>
                  </div>
                ) : qrCodeDataUrl ? (
                  <div className="p-3.5 bg-white rounded-3xl shadow-xl border border-white/20 my-1">
                    <img
                      src={qrCodeDataUrl}
                      alt="Bitcoin Receive QR Code"
                      className="w-52 h-52 rounded-xl object-contain block"
                    />
                  </div>
                ) : null}

                {/* Live Settlement Status Indicator for Lightning */}
                {rail === 'lightning' && qrCodeDataUrl && !receiveSuccess && (
                  <div className="flex items-center gap-2 text-xs font-mono text-[#D1B9B3]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#763698]" />
                    <span>Awaiting payment settlement...</span>
                  </div>
                )}
              </div>

              {/* Account Receiving Address (Displayed Immediately Below QR Code) */}
              {receivingAddress && (
                <div className="w-full bg-[#140E1B] border border-[#382B44] p-3 rounded-2xl text-left space-y-2">
                  <div className="flex justify-between items-center text-[11px] text-[#9B97A2]">
                    <span>Account Receiving Address</span>
                    <span className="font-mono text-[10px]">
                      {rail === 'lightning' ? 'BOLT-11' : 'Layer 1'}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-[#D1B9B3] break-all max-h-16 overflow-y-auto select-all leading-relaxed">
                    {receivingAddress}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyReceivingAddress}
                    className="w-full h-10 rounded-xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#763698] text-[#F8F0E7] font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {copiedAddress ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedAddress ? 'Address Copied' : 'Copy Receiving Address'}</span>
                  </button>
                </div>
              )}

              {/* Shareable Lightning Address / Link */}
              {shareableLightningText && (
                <div className="w-full bg-[#140E1B] border border-[#382B44] p-3 rounded-2xl text-left space-y-2">
                  <div className="flex justify-between items-center text-[11px] text-[#9B97A2]">
                    <span>Lightning Address</span>
                    <span className="font-mono text-[10px]">Share to Receive</span>
                  </div>
                  <div className="font-mono text-xs font-bold text-[#F8F0E7] break-all select-all">
                    {userLightningAddress || shareableLightningText}
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyLightningAddress}
                    className="w-full h-9 rounded-xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#763698] text-[#F8F0E7] font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {copiedLnAddress ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                    <span>{copiedLnAddress ? 'Lightning Address Copied' : 'Copy Lightning Address'}</span>
                  </button>
                </div>
              )}

              {/* Error Message */}
              {receiveError && (
                <div className="p-3 rounded-2xl bg-red-950/30 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{receiveError}</span>
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* SEND SATS MODE (Scan QR, Paste Address, and Dispatch)          */}
          {/* ============================================================ */}
          {mode === 'send' && (
            <div className="space-y-4">
              {sendStep === 'input' && (
                <>
                  {/* Current Available Balance Readout without button box */}
                  <div className="flex justify-between items-center px-1 text-xs">
                    <span className="text-[#9B97A2]">Available Balance</span>
                    <span className="font-mono font-bold text-[#F8F0E7]">
                      {availableSats.toLocaleString()} Sats
                    </span>
                  </div>

                  {/* QR Camera Scanner Viewport */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-[#D1B9B3]">Scan QR Code</span>
                      <button
                        type="button"
                        onClick={handleToggleCamera}
                        className="flex items-center gap-1 text-[11px] text-[#D1B9B3] hover:text-[#F8F0E7] font-mono transition-colors"
                      >
                        {isCameraActive ? (
                          <>
                            <CameraOff className="w-3.5 h-3.5 text-red-400" />
                            <span>Stop Camera</span>
                          </>
                        ) : (
                          <>
                            <Camera className="w-3.5 h-3.5 text-[#763698]" />
                            <span>Scan QR</span>
                          </>
                        )}
                      </button>
                    </div>

                    {isCameraActive && (
                      <div className="relative rounded-2xl overflow-hidden bg-black border border-[#382B44] aspect-square max-h-56 mx-auto flex items-center justify-center">
                        <video ref={videoRef} className="w-full h-full object-cover" />
                        <canvas ref={canvasRef} className="hidden" />
                        <div className="absolute inset-4 border-2 border-dashed border-[#763698]/70 rounded-xl pointer-events-none" />
                      </div>
                    )}

                    {cameraError && (
                      <p className="text-[11px] text-red-300 font-mono px-1">{cameraError}</p>
                    )}
                  </div>

                  {/* Recipient Address / Invoice Input */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="text-xs font-semibold text-[#D1B9B3]">Recipient</label>
                      <button
                        type="button"
                        onClick={handlePasteClipboard}
                        className="text-[11px] font-mono text-[#D1B9B3] hover:text-[#F8F0E7] transition-colors"
                      >
                        Paste Address
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                        placeholder="user@domain.com, lnbc..., or bc1..."
                        className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-3 text-xs font-mono text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                      />
                      {isResolvingRecipient && (
                        <div className="absolute right-3.5 top-3.5">
                          <Loader2 className="w-4 h-4 animate-spin text-[#763698]" />
                        </div>
                      )}
                    </div>
                    {resolvedProvider && (
                      <p className="text-[11px] text-emerald-400 font-mono mt-1 px-1">
                        Verified: {resolvedProvider} (Lightning Network)
                      </p>
                    )}
                  </div>

                  {/* Sats Amount Input */}
                  <div>
                    <label className="block text-xs font-semibold text-[#D1B9B3] mb-1.5">
                      Amount to Send
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={sendSatsStr}
                        onChange={(e) => setSendSatsStr(e.target.value)}
                        onWheel={(e) => e.currentTarget.blur()}
                        placeholder="0"
                        className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-3 text-lg font-mono font-bold text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                      />
                      <span className="absolute right-4 top-3.5 font-mono text-sm font-semibold text-[#D1B9B3]">
                        Sats
                      </span>
                    </div>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="grid grid-cols-6 gap-1.5">
                    {[1, 10, 100, 500, 1000, 5000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setSendSatsStr(preset.toString())}
                        className={`py-2 rounded-xl border text-xs font-mono font-medium transition-all ${
                          sendNumericSats === preset
                            ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                            : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2] hover:border-[#554653]'
                        }`}
                      >
                        {preset === 1 ? '1 Sat' : preset.toLocaleString()}
                      </button>
                    ))}
                  </div>

                  {/* Fee and Total Readouts without button box */}
                  <div className="space-y-1.5 px-1 font-mono text-xs">
                    <div className="flex justify-between items-center text-[#9B97A2]">
                      <span>Network Fee</span>
                      <span>{satsFee > 0 ? `${satsFee} Sats` : '0 Sats (Lightning)'}</span>
                    </div>
                    <div className="flex justify-between items-center text-[#9B97A2]">
                      <span>Total Deducted</span>
                      <span className="font-bold text-[#F8F0E7]">
                        {(sendNumericSats + satsFee).toLocaleString()} Sats
                      </span>
                    </div>
                  </div>

                  {/* Optional Note */}
                  <div>
                    <label className="block text-xs font-semibold text-[#D1B9B3] mb-1.5">Note</label>
                    <input
                      type="text"
                      value={sendMemo}
                      onChange={(e) => setSendMemo(e.target.value)}
                      placeholder="Optional memo"
                      className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-2.5 text-xs text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                    />
                  </div>

                  {/* Error Notification */}
                  {sendError && (
                    <div className="p-3 rounded-2xl bg-red-950/30 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                      <span>{sendError}</span>
                    </div>
                  )}

                  {/* Submit CTA Button */}
                  <button
                    type="button"
                    onClick={handleConfirmSend}
                    disabled={sendNumericSats <= 0 || !recipient.trim() || isInsufficientSats}
                    className="w-full h-12 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] active:scale-[0.98] text-[#F8F0E7] font-bold text-sm flex items-center justify-center transition-all disabled:opacity-50 mt-2 shadow-md shadow-[#763698]/20"
                  >
                    {isInsufficientSats ? 'Insufficient Sats Balance' : 'Send Sats'}
                  </button>
                </>
              )}

              {/* Processing View */}
              {sendStep === 'processing' && (
                <div className="py-8 flex flex-col items-center text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-[#763698]/20 border border-[#763698]/40 flex items-center justify-center text-[#F8F0E7]">
                    <Loader2 className="w-8 h-8 animate-spin text-[#763698]" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#F8F0E7]">Broadcasting Sats</h3>
                    <p className="text-xs text-[#9B97A2] mt-1">Routing transaction through Bitcoin node...</p>
                  </div>
                </div>
              )}

              {/* Success View */}
              {sendStep === 'success' && (
                <div className="text-center py-4 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-[#F8F0E7]">Sats Sent</h3>
                    <p className="text-xs text-[#9B97A2]">Transaction verified and broadcasted.</p>
                  </div>

                  <div className="p-3.5 bg-[#140E1B] border border-[#382B44] rounded-2xl space-y-2 text-left font-mono">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#9B97A2]">Amount Sent</span>
                      <span className="font-bold text-red-400">-{sendNumericSats.toLocaleString()} Sats</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#9B97A2]">Reference</span>
                      <span className="text-[#F8F0E7] text-[11px] truncate max-w-[200px]">{txReference}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#9B97A2]">Recipient</span>
                      <span className="text-[#D1B9B3] text-[11px] truncate max-w-[200px]">{recipient}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleBack}
                    className="w-full h-12 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] text-[#F8F0E7] font-bold text-sm flex items-center justify-center transition-all shadow-md shadow-[#763698]/20"
                  >
                    Done
                  </button>
                </div>
              )}

              {/* Error View */}
              {sendStep === 'error' && (
                <div className="text-center py-4 space-y-4">
                  <div className="w-16 h-16 rounded-full bg-red-500/20 border border-red-500/40 text-red-400 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-[#F8F0E7]">Payment Failed</h3>
                    <p className="text-xs text-red-300 px-2 leading-relaxed">{sendError}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSendStep('input')}
                    className="w-full h-12 rounded-2xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#763698] text-[#F8F0E7] font-semibold text-xs flex items-center justify-center transition-colors"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

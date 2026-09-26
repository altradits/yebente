import React, { useState } from 'react';
import { UserWallet, WalletType } from '../types';
import { fetchBitcoinAddressBalance, AddressBalanceResult } from '../services/blockchainService';
import { queryWebLNBalance, isLightningAddress } from '../services/lightningService';
import {
  X,
  ShieldCheck,
  KeyRound,
  Copy,
  Check,
  LogOut,
  Trash2,
  Plus,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Zap,
  Info,
} from 'lucide-react';

interface WalletSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet;
  onUpdateWallet: (updated: UserWallet) => void;
  onEjectWallet: () => void;
  onWipeWallet: () => void;
}

export const WalletSettingsModal: React.FC<WalletSettingsModalProps> = ({
  isOpen,
  onClose,
  wallet,
  onUpdateWallet,
  onEjectWallet,
  onWipeWallet,
}) => {
  const [selectedType, setSelectedType] = useState<WalletType>(wallet.type || 'non-custodial');
  const [address, setAddress] = useState(wallet.nonCustodialAddress || '');
  const [verifiedSats, setVerifiedSats] = useState<number>(
    wallet.isConnected && wallet.type === 'non-custodial' ? wallet.satsBalance : 0
  );
  const [weblnDetectedSats, setWeblnDetectedSats] = useState<number | null>(null);
  const [isVerifyingWebln, setIsVerifyingWebln] = useState(false);
  const [weblnStatusMessage, setWeblnStatusMessage] = useState<string>('');
  const [validationError, setValidationError] = useState<string>('');

  const [copiedAddr, setCopiedAddr] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [onChainResult, setOnChainResult] = useState<AddressBalanceResult | null>(null);

  if (!isOpen) return null;

  const handleVerifyOnChain = async () => {
    const cleanAddr = address.trim();
    if (!cleanAddr) {
      setValidationError('Please enter an on-chain Bitcoin address or Lightning address.');
      return;
    }
    setValidationError('');
    setIsVerifying(true);
    setOnChainResult(null);
    try {
      const res = await fetchBitcoinAddressBalance(cleanAddr);
      setOnChainResult(res);
      if (res.success) {
        if (!res.isLightning) {
          setVerifiedSats(res.sats);
        } else {
          setVerifiedSats(0);
          if (res.lightningAddress && cleanAddr.toLowerCase().replace(/^lightning:/i, '').startsWith('lnurl1')) {
            setAddress(res.lightningAddress);
          }
        }
      } else {
        setValidationError(res.error || 'Failed to verify address on public blockchain indexers.');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDetectWebLN = async () => {
    setIsVerifyingWebln(true);
    setWeblnStatusMessage('');
    setValidationError('');
    try {
      const res = await queryWebLNBalance();
      if (res.available && typeof res.sats === 'number') {
        setWeblnDetectedSats(res.sats);
        setVerifiedSats(res.sats);
        setWeblnStatusMessage(`Connected: ${res.sats.toLocaleString()} Sats detected via WebLN`);
      } else {
        setWeblnStatusMessage(res.error || 'No active WebLN provider detected in this browser.');
      }
    } finally {
      setIsVerifyingWebln(false);
    }
  };

  // Insert or update wallet
  const handleInsertOrUpdate = () => {
    setValidationError('');
    const rawAddress = address.trim();

    if (selectedType === 'non-custodial' && !rawAddress && weblnDetectedSats === null) {
      setValidationError('Please enter a Bitcoin address or connect a WebLN extension.');
      return;
    }

    const finalAddress =
      onChainResult?.lightningAddress &&
      rawAddress.toLowerCase().replace(/^lightning:/i, '').startsWith('lnurl1')
        ? onChainResult.lightningAddress
        : rawAddress;

    let finalSats = 0;
    if (selectedType === 'non-custodial') {
      if (onChainResult && onChainResult.success && !onChainResult.isLightning) {
        finalSats = onChainResult.sats;
      } else if (weblnDetectedSats !== null) {
        finalSats = weblnDetectedSats;
      } else if (wallet.type === 'non-custodial' && wallet.satsBalance > 0 && wallet.onChainVerified) {
        finalSats = wallet.satsBalance;
      } else {
        finalSats = 0;
      }
    } else {
      // In-App Custodial Vault: starts at 0 or preserves real past purchases
      finalSats = wallet.type === 'custodial' ? (wallet.satsBalance || 0) : 0;
    }

    const detectedLabel = onChainResult?.lightningProvider
      ? `${onChainResult.lightningProvider} (Lightning)`
      : (selectedType === 'custodial' ? 'In-App Custodial Vault' : 'Self-Custody Key');

    onUpdateWallet({
      ...wallet,
      isConnected: true,
      type: selectedType,
      nonCustodialAddress: finalAddress,
      nonCustodialLabel: detectedLabel,
      satsBalance: finalSats,
      btcBalance: finalSats / 100_000_000,
      mpesaBalanceKes: 0,
      telebirrBalanceEtb: 0,
      insertedAt: wallet.insertedAt || Date.now(),
      lastSyncedAt: Date.now(),
      onChainVerified: selectedType === 'non-custodial' && Boolean(onChainResult?.success && !onChainResult.isLightning),
    });

    onClose();
  };

  const handleEject = () => {
    onEjectWallet();
    onClose();
  };

  const handleWipe = () => {
    if (confirm('Permanently wipe and remove all wallet keys and balances from this device?')) {
      onWipeWallet();
      onClose();
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#120E16]/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1D1627] border border-[#3A2D47] rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl shadow-black/80 flex flex-col max-h-[92vh]"
      >
        {/* Header - No icon before H element */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#382B44]">
          <h2 className="text-base font-bold text-[#F8F0E7]">
            {wallet.isConnected ? 'Wallet Security & Keys' : 'Insert Sats Wallet'}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-[#251B30] text-[#9B97A2] hover:text-[#F8F0E7] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Custody Preference Switcher */}
          <div>
            <label className="block text-xs font-semibold text-[#D1B9B3] mb-2">
              {wallet.isConnected ? 'Custody Model' : 'Select Custody Type to Insert'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {/* Non-Custodial Option */}
              <button
                type="button"
                onClick={() => setSelectedType('non-custodial')}
                className={`p-3 rounded-2xl border text-left flex flex-col justify-center transition-all ${
                  selectedType === 'non-custodial'
                    ? 'border-[#763698] bg-[#763698]/20 text-[#F8F0E7] shadow-sm shadow-[#763698]/20'
                    : 'border-[#382B44] bg-[#140E1B] text-[#9B97A2] hover:border-[#554653]'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-[#763698]" />
                  <span className="font-bold text-xs text-[#F8F0E7]">Self-Custody</span>
                </div>
              </button>

              {/* Custodial Option */}
              <button
                type="button"
                onClick={() => setSelectedType('custodial')}
                className={`p-3 rounded-2xl border text-left flex flex-col justify-center transition-all ${
                  selectedType === 'custodial'
                    ? 'border-[#D1B9B3] bg-[#D1B9B3]/15 text-[#F8F0E7] shadow-sm'
                    : 'border-[#382B44] bg-[#140E1B] text-[#9B97A2] hover:border-[#554653]'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#D1B9B3]" />
                  <span className="font-bold text-xs text-[#F8F0E7]">In-App Vault</span>
                </div>
              </button>
            </div>
          </div>

          {/* Self-Custodial Inputs */}
          {selectedType === 'non-custodial' && (
            <div className="bg-[#140E1B] border border-[#382B44] rounded-2xl p-3.5 space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-semibold text-[#D1B9B3]">
                    Sats / Bitcoin Address or Lightning Address
                  </label>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      setOnChainResult(null);
                      setValidationError('');
                    }}
                    placeholder="bc1q... or username@walletofsatoshi.com"
                    className="w-full bg-[#1F1728] border border-[#382B44] rounded-xl px-3 py-2 text-xs font-mono text-[#D1B9B3] focus:outline-none focus:border-[#763698] pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (address) {
                        navigator.clipboard.writeText(address);
                        setCopiedAddr(true);
                        setTimeout(() => setCopiedAddr(false), 2000);
                      }
                    }}
                    className="absolute right-2 top-2 text-[#9B97A2] hover:text-[#F8F0E7]"
                  >
                    {copiedAddr ? <Check className="w-3.5 h-3.5 text-[#D1B9B3]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                {/* Verification Actions */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleVerifyOnChain}
                    disabled={!address.trim() || isVerifying}
                    className="px-3 py-1.5 rounded-xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#763698] text-[#D1B9B3] hover:text-[#F8F0E7] font-mono text-[11px] flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    {isVerifying ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#763698]" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#763698]" />
                    )}
                    <span>Verify On-Chain / Lightning</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDetectWebLN}
                    disabled={isVerifyingWebln}
                    className="px-3 py-1.5 rounded-xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#763698] text-[#D1B9B3] hover:text-[#F8F0E7] font-mono text-[11px] flex items-center gap-1.5 transition-colors disabled:opacity-50"
                    title="Auto-detect active WebLN browser extension"
                  >
                    {isVerifyingWebln ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    ) : (
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    <span>Auto-detect WebLN</span>
                  </button>
                </div>

                {/* On-chain or Lightning Verification status output */}
                {onChainResult && onChainResult.success && onChainResult.isLightning && (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-[#1C1425] border border-[#3C2E49] space-y-1 text-[11px] font-mono">
                    <div className="text-emerald-400 flex items-center gap-1.5 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Verified: {onChainResult.lightningProvider} (LUD-16 Active)</span>
                    </div>
                    <p className="text-[#9B97A2] text-[10px] leading-relaxed">
                      Lightning protocols protect user privacy by not disclosing private node balances over the public web. Sats sent or received settle in real time directly to this address.
                    </p>
                  </div>
                )}

                {onChainResult && onChainResult.success && !onChainResult.isLightning && (
                  <div className="mt-2.5 p-2.5 rounded-xl bg-[#1C1425] border border-[#3C2E49] space-y-1 text-[11px] font-mono">
                    <div className="text-emerald-400 flex items-center gap-1.5 font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Verified On-Chain: {onChainResult.sats.toLocaleString()} Sats</span>
                    </div>
                    <div className="text-[#9B97A2] text-[10px]">
                      UTXO balance confirmed via public blockchain indexers.
                    </div>
                  </div>
                )}

                {weblnStatusMessage && (
                  <div className="mt-2 text-[11px] font-mono text-[#D1B9B3]">
                    {weblnStatusMessage}
                  </div>
                )}
              </div>

              {/* Verified Sats Balance Card */}
              <div className="bg-[#1C1425] border border-[#3C2E49] rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-mono text-[#9B97A2]">Verified Sats Balance</span>
                  <div className="font-mono text-base font-bold text-[#F8F0E7]">
                    {verifiedSats.toLocaleString()} <span className="text-xs text-[#D1B9B3]">Sats</span>
                  </div>
                </div>
                <div className="text-[10px] font-mono text-[#9B97A2] text-right">
                  {onChainResult?.success && !onChainResult.isLightning ? 'Verified On-Chain' : weblnDetectedSats !== null ? 'WebLN Connected' : 'Strict Zero Base'}
                </div>
              </div>

              <div className="text-[10px] font-mono text-[#9B97A2] leading-relaxed flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#763698]" />
                <span>Balances are synchronized strictly with authentic blockchain indexers or WebLN browser providers. Manual balance fabrication is prohibited.</span>
              </div>
            </div>
          )}

          {/* Custodial Section */}
          {selectedType === 'custodial' && (
            <div className="bg-[#140E1B] border border-[#382B44] rounded-2xl p-3.5 space-y-3">
              <div className="bg-[#1C1425] border border-[#3C2E49] rounded-xl p-3 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-mono text-[#9B97A2]">In-App Vault Balance</span>
                  <div className="font-mono text-base font-bold text-[#F8F0E7]">
                    {(wallet.type === 'custodial' ? (wallet.satsBalance || 0) : 0).toLocaleString()} <span className="text-xs text-[#D1B9B3]">Sats</span>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                  Real Reserves Only
                </span>
              </div>

              <div className="text-[10px] font-mono text-[#9B97A2] leading-relaxed flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#D1B9B3]" />
                <span>The In-App Vault balance starts strictly at 0 Sats upon setup. Balances increase exclusively when Sats are purchased via live M-Pesa STK push or deposited via settled Lightning invoices.</span>
              </div>
            </div>
          )}

          {/* Validation error display */}
          {validationError && (
            <div className="p-2.5 rounded-xl bg-red-950/30 border border-red-500/40 text-red-300 text-xs font-mono flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Primary Action Button: Insert / Apply */}
          <button
            type="button"
            onClick={handleInsertOrUpdate}
            className="w-full h-11 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] text-[#F8F0E7] font-bold text-sm transition-all mt-2 shadow-lg shadow-[#763698]/25 flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span>{wallet.isConnected ? 'Save & Activate Wallet' : 'Insert & Activate Wallet'}</span>
          </button>

          {/* Full Removal / Wipe Options if wallet is attached */}
          {wallet.isConnected && (
            <div className="pt-2 border-t border-[#382B44] grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleEject}
                className="h-10 rounded-xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#946069] text-[#9B97A2] hover:text-[#946069] font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
                title="Disconnect wallet from current session"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Eject Session</span>
              </button>

              <button
                type="button"
                onClick={handleWipe}
                className="h-10 rounded-xl bg-[#231A2D] border border-[#3C2E49] hover:border-red-500/60 text-[#9B97A2] hover:text-red-400 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
                title="Wipe all keys and clear memory"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Wipe & Remove</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

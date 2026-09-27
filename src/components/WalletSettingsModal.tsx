import React, { useState } from 'react';
import { UserWallet, WalletType } from '../types';
import { fetchBitcoinAddressBalance, AddressBalanceResult } from '../services/blockchainService';
import { queryWebLNBalance } from '../services/lightningService';
import { computeCustodialBalanceFromTransactions, getStoredTransactions } from '../services/storageService';
import { useTheme } from '../theme/ThemeContext';
import {
  ArrowLeft,
  Copy,
  Check,
  AlertCircle,
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

  const { paletteId, setPaletteId, availablePalettes } = useTheme();

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
      finalSats = computeCustodialBalanceFromTransactions(getStoredTransactions());
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
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#382B44]/60">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9B97A2] hover:text-[#F8F0E7] transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold text-[#F8F0E7]">Settings</h2>
          <div className="w-8" aria-hidden="true" />
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Custody Switcher */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSelectedType('non-custodial')}
              className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                selectedType === 'non-custodial'
                  ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                  : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
              }`}
            >
              Self-Custody
            </button>
            <button
              type="button"
              onClick={() => setSelectedType('custodial')}
              className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                selectedType === 'custodial'
                  ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                  : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
              }`}
            >
              In-App Vault
            </button>
          </div>

          {/* Self-Custodial Inputs */}
          {selectedType === 'non-custodial' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1.5">
                  Bitcoin or Lightning Address
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      setOnChainResult(null);
                      setValidationError('');
                    }}
                    placeholder="bc1q... or username@domain.com"
                    className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-2.5 text-xs font-mono text-[#F8F0E7] focus:outline-none focus:border-[#763698] pr-10"
                  />
                  {address && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(address);
                        setCopiedAddr(true);
                        setTimeout(() => setCopiedAddr(false), 2000);
                      }}
                      className="absolute right-3 top-3 text-[#9B97A2] hover:text-[#F8F0E7]"
                    >
                      {copiedAddr ? <Check className="w-3.5 h-3.5 text-[#D1B9B3]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Verification Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleVerifyOnChain}
                  disabled={!address.trim() || isVerifying}
                  className="flex-1 py-2 px-3 rounded-xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#763698] text-[#D1B9B3] hover:text-[#F8F0E7] text-xs font-mono transition-colors disabled:opacity-50"
                >
                  {isVerifying ? 'Verifying...' : 'Verify Address'}
                </button>
                <button
                  type="button"
                  onClick={handleDetectWebLN}
                  disabled={isVerifyingWebln}
                  className="py-2 px-3 rounded-xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#763698] text-[#D1B9B3] hover:text-[#F8F0E7] text-xs font-mono transition-colors disabled:opacity-50"
                >
                  {isVerifyingWebln ? 'Detecting...' : 'Detect WebLN'}
                </button>
              </div>

              {/* Status outputs */}
              {onChainResult && onChainResult.success && (
                <div className="flex items-center justify-between text-xs font-mono text-emerald-400 px-1">
                  <span>Verified</span>
                  <span>{onChainResult.isLightning ? onChainResult.lightningProvider : `${onChainResult.sats.toLocaleString()} Sats`}</span>
                </div>
              )}

              {weblnStatusMessage && (
                <div className="text-xs font-mono text-[#D1B9B3] px-1">
                  {weblnStatusMessage}
                </div>
              )}

              {/* Verified Sats Balance readout - Clean typography without button box */}
              <div className="flex justify-between items-center px-1 text-xs">
                <span className="text-[#9B97A2]">Verified Balance</span>
                <span className="font-mono font-bold text-[#F8F0E7]">
                  {verifiedSats.toLocaleString()} Sats
                </span>
              </div>
            </div>
          )}

          {/* Custodial Section */}
          {selectedType === 'custodial' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center px-1 text-xs">
                <span className="text-[#9B97A2]">Vault Balance</span>
                <span className="font-mono font-bold text-[#F8F0E7]">
                  {(wallet.type === 'custodial' ? (wallet.satsBalance || 0) : 0).toLocaleString()} Sats
                </span>
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

          {/* Theme Palette Switcher */}
          <div className="space-y-1.5 pt-1">
            <span className="block text-xs font-semibold text-[#D1B9B3]">Theme Palette</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {availablePalettes.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPaletteId(p.id)}
                  className={`py-2 px-2 rounded-xl border text-xs font-medium transition-all text-center ${
                    paletteId === p.id
                      ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                      : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2] hover:border-[#554653]'
                  }`}
                >
                  {p.name.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Primary Action Button: Save / Connect */}
          <button
            type="button"
            onClick={handleInsertOrUpdate}
            className="w-full h-12 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] active:scale-[0.98] text-[#F8F0E7] font-bold text-sm flex items-center justify-center transition-all mt-2 shadow-md shadow-[#763698]/20"
          >
            {wallet.isConnected ? 'Save Settings' : 'Connect Wallet'}
          </button>

          {/* Disconnect & Wipe Options */}
          {wallet.isConnected && (
            <div className="pt-2 border-t border-[#382B44]/60 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleEject}
                className="h-10 rounded-xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#946069] text-[#9B97A2] hover:text-[#F8F0E7] font-medium text-xs flex items-center justify-center transition-colors"
              >
                Disconnect
              </button>

              <button
                type="button"
                onClick={handleWipe}
                className="h-10 rounded-xl bg-[#231A2D] border border-[#3C2E49] hover:border-red-500/60 text-[#9B97A2] hover:text-red-400 font-medium text-xs flex items-center justify-center transition-colors"
              >
                Wipe Wallet
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

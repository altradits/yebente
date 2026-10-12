import React, { useState } from 'react';
import { UserWallet, WalletType } from '../types';
import {
  isLightningAddress,
  resolveLightningAddress,
  queryWebLNBalance,
  LightningAddressDetails,
} from '../services/lightningService';
import {
  computeCustodialBalanceFromTransactions,
  getStoredTransactions,
  createInAppLightningWallet,
} from '../services/storageService';
import {
  hasEncryptedVault,
  initializeOrUpdateVault,
  wipeVaultStorage,
} from '../services/vaultService';
import {
  getBlinkSovereignAddress,
  getBlinkSovereignUsername,
  saveBlinkSovereignUsername,
} from '../services/blinkService';
import {
  getOfflineOutbox,
  syncOfflineOutbox,
  isNetworkOnline,
} from '../services/offlineService';
import {
  ArrowLeft,
  Copy,
  Check,
  AlertCircle,
  RefreshCw,
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
  const [selectedType, setSelectedType] = useState<WalletType>(wallet.type || 'custodial');
  const [address, setAddress] = useState(
    wallet.type === 'non-custodial' ? wallet.nonCustodialAddress : ''
  );
  const [verifiedSats, setVerifiedSats] = useState<number>(
    wallet.isConnected && wallet.type === 'non-custodial' ? wallet.satsBalance : 0
  );
  const [weblnDetectedSats, setWeblnDetectedSats] = useState<number | null>(null);
  const [isVerifyingWebln, setIsVerifyingWebln] = useState(false);
  const [weblnStatusMessage, setWeblnStatusMessage] = useState<string>('');
  const [validationError, setValidationError] = useState<string>('');
  const [generatedMessage, setGeneratedMessage] = useState<string>('');

  const [copiedBlink, setCopiedBlink] = useState(false);
  const [copiedExternal, setCopiedExternal] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [lightningResult, setLightningResult] = useState<LightningAddressDetails | null>(null);

  // Blink Sovereign Username state
  const [blinkUsername, setBlinkUsername] = useState<string>(
    wallet.blinkUsername || getBlinkSovereignUsername()
  );

  // Offline Outbox state
  const [offlineCount, setOfflineCount] = useState<number>(() => getOfflineOutbox().length);
  const [isSyncingOutbox, setIsSyncingOutbox] = useState<boolean>(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string>('');

  // Vault Encryption and Master PIN state
  const [vaultProtected, setVaultProtected] = useState(hasEncryptedVault());
  const [pinInput, setPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinSuccessMessage, setPinSuccessMessage] = useState('');
  const [showPinSetup, setShowPinSetup] = useState(false);

  if (!isOpen) return null;

  const handleVerifyLightning = async () => {
    const cleanAddr = address.trim();
    if (!cleanAddr) {
      setValidationError('Please enter a Lightning Address (e.g. user@domain.com).');
      return;
    }

    // Explicitly reject on-chain Bitcoin addresses
    const isL1 = /^(bc1[a-z0-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/i.test(cleanAddr);
    if (isL1) {
      setValidationError(
        'On-chain Bitcoin addresses are not supported. Only Lightning addresses (e.g. user@domain.com) and WebLN are supported.'
      );
      return;
    }

    if (!isLightningAddress(cleanAddr)) {
      setValidationError('Invalid Lightning Address format. Example: user@walletofsatoshi.com');
      return;
    }

    setValidationError('');
    setIsVerifying(true);
    setLightningResult(null);

    try {
      const res = await resolveLightningAddress(cleanAddr);
      setLightningResult(res);
      if (res.success) {
        setAddress(res.address);
        setVerifiedSats(0);
      } else {
        setValidationError(res.error || 'Failed to resolve Lightning Address.');
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

  const handleSyncOutbox = async () => {
    setIsSyncingOutbox(true);
    setSyncStatusMsg('');
    try {
      const res = await syncOfflineOutbox();
      const remaining = getOfflineOutbox().length;
      setOfflineCount(remaining);
      if (res.syncedCount > 0) {
        setSyncStatusMsg(`Successfully synchronized ${res.syncedCount} offline transaction(s).`);
      } else if (!isNetworkOnline()) {
        setSyncStatusMsg('Network offline. Reconnection required to sync.');
      } else {
        setSyncStatusMsg('Outbox is up to date.');
      }
      setTimeout(() => setSyncStatusMsg(''), 4000);
    } finally {
      setIsSyncingOutbox(false);
    }
  };

  const handleInsertOrUpdate = () => {
    setValidationError('');
    const rawAddress = address.trim();

    if (selectedType === 'non-custodial') {
      if (!rawAddress && weblnDetectedSats === null) {
        setValidationError('Please enter a Lightning Address or connect a WebLN extension.');
        return;
      }

      const isL1 = /^(bc1[a-z0-9]{25,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/i.test(rawAddress);
      if (isL1) {
        setValidationError(
          'On-chain Bitcoin addresses are not supported. Only Lightning addresses (e.g. user@domain.com) and WebLN are supported.'
        );
        return;
      }

      if (rawAddress && !isLightningAddress(rawAddress) && weblnDetectedSats === null) {
        setValidationError('Invalid Lightning Address format. Example: user@walletofsatoshi.com');
        return;
      }
    }

    // Save Blink sovereign username
    const cleanBlinkUser = blinkUsername.trim().toLowerCase().replace(/^@/, '');
    if (cleanBlinkUser) {
      saveBlinkSovereignUsername(cleanBlinkUser);
    }

    const sovereignAddr = `${cleanBlinkUser || getBlinkSovereignUsername()}@blink.sv`;
    const finalAddress = selectedType === 'custodial'
      ? sovereignAddr
      : (rawAddress || sovereignAddr);

    let finalSats = 0;
    if (selectedType === 'non-custodial') {
      if (weblnDetectedSats !== null) {
        finalSats = weblnDetectedSats;
      } else if (wallet.type === 'non-custodial' && wallet.satsBalance > 0 && wallet.onChainVerified) {
        finalSats = wallet.satsBalance;
      } else {
        finalSats = 0;
      }
    } else {
      finalSats = computeCustodialBalanceFromTransactions(getStoredTransactions());
    }

    const detectedLabel = selectedType === 'custodial'
      ? 'In-App Lightning Sovereign Vault'
      : (lightningResult?.provider ? `${lightningResult.provider} (Lightning)` : (weblnDetectedSats !== null ? 'WebLN Provider' : 'External Lightning'));

    onUpdateWallet({
      ...wallet,
      isConnected: true,
      type: selectedType,
      nonCustodialAddress: finalAddress,
      nonCustodialLabel: detectedLabel,
      blinkUsername: cleanBlinkUser || getBlinkSovereignUsername(),
      blinkAddress: sovereignAddr,
      satsBalance: finalSats,
      btcBalance: finalSats / 100_000_000,
      mpesaBalanceKes: 0,
      telebirrBalanceEtb: 0,
      insertedAt: wallet.insertedAt || Date.now(),
      lastSyncedAt: Date.now(),
      onChainVerified: selectedType === 'non-custodial' && Boolean(
        lightningResult?.success ||
        weblnDetectedSats !== null ||
        (wallet.onChainVerified && wallet.satsBalance > 0)
      ),
    });

    onClose();
  };

  const handleSavePin = async () => {
    if (pinInput.length < 4) {
      setValidationError('Master PIN must be at least 4 digits.');
      return;
    }
    if (pinInput !== confirmPinInput) {
      setValidationError('PIN confirmation does not match.');
      return;
    }
    setValidationError('');
    const res = await initializeOrUpdateVault(pinInput, {
      inAppSecret: `sec_${Date.now().toString(36)}`,
      rootAddress: getBlinkSovereignAddress(),
    });
    if (res.success) {
      setVaultProtected(true);
      setShowPinSetup(false);
      setPinInput('');
      setConfirmPinInput('');
      setPinSuccessMessage('Vault encrypted with AES-256-GCM.');
      setTimeout(() => setPinSuccessMessage(''), 3000);
    } else {
      setValidationError(res.error || 'Failed to encrypt vault.');
    }
  };

  const handleEject = () => {
    onEjectWallet();
    onClose();
  };

  const handleWipe = () => {
    if (confirm('Permanently wipe and remove all wallet keys and balances from this device?')) {
      wipeVaultStorage();
      onWipeWallet();
      onClose();
    }
  };

  const handleGenerateInAppLightningWallet = () => {
    const updated = createInAppLightningWallet();
    setBlinkUsername(updated.blinkUsername || '');
    setSelectedType('custodial');
    onUpdateWallet(updated);
    setGeneratedMessage('In-App Lightning Wallet Active: 100% off-chain with 0 on-chain fees.');
    setTimeout(() => setGeneratedMessage(''), 5000);
  };

  const sovereignBlinkAddress = `${blinkUsername || getBlinkSovereignUsername()}@blink.sv`;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#120E16]/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#1D1627] border border-[#3A2D47] rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl shadow-black/80 flex flex-col max-h-[92vh]"
      >
        {/* Header with Textless Back Navigation */}
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
          {/* Custody Switcher: Pure Lightning Rails */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setSelectedType('custodial');
                setValidationError('');
              }}
              className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                selectedType === 'custodial'
                  ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                  : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
              }`}
            >
              In-App Lightning
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedType('non-custodial');
                setValidationError('');
              }}
              className={`p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                selectedType === 'non-custodial'
                  ? 'bg-[#2E203C] border-[#763698] text-[#F8F0E7]'
                  : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2]'
              }`}
            >
              External Lightning
            </button>
          </div>

          {/* In-App Lightning Section */}
          {selectedType === 'custodial' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center px-1 text-xs">
                <span className="text-[#9B97A2]">Vault Balance</span>
                <span className="font-mono font-bold text-[#F8F0E7]">
                  {(wallet.type === 'custodial' ? (wallet.satsBalance || 0) : 0).toLocaleString()} Sats
                </span>
              </div>

              {/* Off-Chain Zero Fee Indicator */}
              <div className="flex justify-between items-center px-1 text-[11px]">
                <span className="text-[#9B97A2]">Transaction Rail</span>
                <span className="font-mono text-emerald-400 font-semibold">100% Off-Chain Lightning (0 On-Chain Fees)</span>
              </div>

              {/* Generate In-App Lightning Wallet Action */}
              <button
                type="button"
                onClick={handleGenerateInAppLightningWallet}
                className="w-full h-11 rounded-2xl bg-[#763698] hover:bg-[#8A41B0] active:scale-[0.98] text-[#F8F0E7] font-bold text-xs flex items-center justify-center transition-all shadow-md shadow-[#763698]/20"
              >
                Generate In-App Lightning Wallet
              </button>

              {generatedMessage && (
                <div className="p-3 rounded-2xl bg-emerald-950/30 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{generatedMessage}</span>
                </div>
              )}

              {/* Blink Sovereign Lightning Address */}
              <div>
                <div className="flex justify-between items-center text-xs text-[#D1B9B3] mb-1.5">
                  <span className="font-semibold">Sovereign Lightning Address</span>
                  <span className="font-mono text-[10px] text-emerald-400">Zero On-Chain Fees</span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    value={sovereignBlinkAddress}
                    className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-2.5 text-xs font-mono text-[#F8F0E7] focus:outline-none pr-10 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(sovereignBlinkAddress);
                      setCopiedBlink(true);
                      setTimeout(() => setCopiedBlink(false), 2000);
                    }}
                    className="absolute right-3 top-3 text-[#9B97A2] hover:text-[#F8F0E7]"
                  >
                    {copiedBlink ? <Check className="w-3.5 h-3.5 text-[#D1B9B3]" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Blink Username Handle */}
              <div>
                <label className="block text-xs font-semibold text-[#D1B9B3] mb-1.5">
                  Custom Lightning Handle
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={blinkUsername}
                    onChange={(e) => setBlinkUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="username"
                    className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-2.5 text-xs font-mono text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                  />
                  <span className="absolute right-3 top-3 font-mono text-xs text-[#9B97A2]">
                    @blink.sv
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* External Lightning Section */}
          {selectedType === 'non-custodial' && (
            <div className="space-y-3">
              <div>
                <div className="flex justify-between items-center text-xs text-[#D1B9B3] mb-1.5">
                  <span className="font-semibold">Lightning Address</span>
                  <span className="font-mono text-[10px] text-emerald-400">LNURL-pay / WebLN</span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      setLightningResult(null);
                      setValidationError('');
                    }}
                    placeholder="user@walletofsatoshi.com or user@getalby.com"
                    className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl px-4 py-2.5 text-xs font-mono text-[#F8F0E7] focus:outline-none focus:border-[#763698] pr-10"
                  />
                  {address && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(address);
                        setCopiedExternal(true);
                        setTimeout(() => setCopiedExternal(false), 2000);
                      }}
                      className="absolute right-3 top-3 text-[#9B97A2] hover:text-[#F8F0E7]"
                    >
                      {copiedExternal ? <Check className="w-3.5 h-3.5 text-[#D1B9B3]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Verification Actions */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleVerifyLightning}
                  disabled={!address.trim() || isVerifying}
                  className="flex-1 py-2 px-3 rounded-xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#763698] text-[#D1B9B3] hover:text-[#F8F0E7] text-xs font-mono transition-colors disabled:opacity-50"
                >
                  {isVerifying ? 'Verifying...' : 'Verify Lightning'}
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
              {lightningResult && lightningResult.success && (
                <div className="flex items-center justify-between text-xs font-mono text-emerald-400 px-1">
                  <span>Verified</span>
                  <span>{lightningResult.provider} ({lightningResult.address})</span>
                </div>
              )}

              {weblnStatusMessage && (
                <div className="text-xs font-mono text-[#D1B9B3] px-1">
                  {weblnStatusMessage}
                </div>
              )}

              {/* Verified Sats Balance readout */}
              <div className="flex justify-between items-center px-1 text-xs">
                <span className="text-[#9B97A2]">Verified Balance</span>
                <span className="font-mono font-bold text-[#F8F0E7]">
                  {verifiedSats.toLocaleString()} Sats
                </span>
              </div>
            </div>
          )}

          {/* Offline Outbox Section */}
          <div className="space-y-2 pt-2 border-t border-[#382B44]/60">
            <div className="flex justify-between items-center px-1 text-xs">
              <span className="text-[#D1B9B3] font-semibold">Offline Outbox</span>
              <span className="font-mono text-[11px] text-[#9B97A2]">
                {offlineCount > 0 ? `${offlineCount} Queued` : 'Empty'}
              </span>
            </div>

            {syncStatusMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-emerald-300 text-xs font-mono">
                {syncStatusMsg}
              </div>
            )}

            {offlineCount > 0 && (
              <button
                type="button"
                onClick={handleSyncOutbox}
                disabled={isSyncingOutbox}
                className="w-full py-2.5 px-3 rounded-xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#763698] text-[#D1B9B3] hover:text-[#F8F0E7] text-xs font-mono flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingOutbox ? 'animate-spin' : ''}`} />
                <span>{isSyncingOutbox ? 'Syncing...' : 'Sync Outbox Now'}</span>
              </button>
            )}
          </div>

          {/* Sovereign Vault Encryption Section */}
          <div className="space-y-2 pt-2 border-t border-[#382B44]/60">
            <div className="flex justify-between items-center px-1 text-xs">
              <span className="text-[#D1B9B3] font-semibold">Vault Security</span>
              <span className="font-mono text-[11px] text-emerald-400">
                {vaultProtected ? 'AES-256-GCM Active' : 'Unencrypted'}
              </span>
            </div>

            {pinSuccessMessage && (
              <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-emerald-300 text-xs font-mono">
                {pinSuccessMessage}
              </div>
            )}

            {!showPinSetup ? (
              <button
                type="button"
                onClick={() => setShowPinSetup(true)}
                className="w-full py-2.5 px-3 rounded-xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#763698] text-[#D1B9B3] hover:text-[#F8F0E7] text-xs font-mono transition-colors text-center"
              >
                {vaultProtected ? 'Update Master PIN' : 'Set Master PIN'}
              </button>
            ) : (
              <div className="space-y-2 p-3 rounded-2xl bg-[#140E1B] border border-[#382B44]">
                <div>
                  <label className="block text-[11px] text-[#9B97A2] mb-1">Enter Master PIN (4-6 digits)</label>
                  <input
                    type="password"
                    maxLength={6}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="••••••"
                    className="w-full bg-[#1D1627] border border-[#382B44] rounded-xl px-3 py-2 text-xs font-mono text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-[#9B97A2] mb-1">Confirm Master PIN</label>
                  <input
                    type="password"
                    maxLength={6}
                    value={confirmPinInput}
                    onChange={(e) => setConfirmPinInput(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="••••••"
                    className="w-full bg-[#1D1627] border border-[#382B44] rounded-xl px-3 py-2 text-xs font-mono text-[#F8F0E7] focus:outline-none focus:border-[#763698]"
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPinSetup(false);
                      setPinInput('');
                      setConfirmPinInput('');
                    }}
                    className="flex-1 py-2 rounded-xl bg-[#231A2D] border border-[#3C2E49] text-[#9B97A2] text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePin}
                    className="flex-1 py-2 rounded-xl bg-[#763698] hover:bg-[#8A41B0] text-[#F8F0E7] font-semibold text-xs transition-colors"
                  >
                    Save PIN
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Validation error display */}
          {validationError && (
            <div className="p-2.5 rounded-xl bg-red-950/30 border border-red-500/40 text-red-300 text-xs font-mono flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{validationError}</span>
            </div>
          )}

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

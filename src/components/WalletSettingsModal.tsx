import React, { useState } from 'react';
import { UserWallet, WalletType } from '../types';
import { fetchBitcoinAddressBalance, AddressBalanceResult } from '../services/blockchainService';
import { queryWebLNBalance } from '../services/lightningService';
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
  const [satsStr, setSatsStr] = useState<string>(
    wallet.satsBalance > 0 ? String(wallet.satsBalance) : ''
  );
  const [mpesaStr, setMpesaStr] = useState<string>(
    wallet.mpesaBalanceKes > 0 ? String(wallet.mpesaBalanceKes) : ''
  );
  const [telebirrStr, setTelebirrStr] = useState<string>(
    wallet.telebirrBalanceEtb > 0 ? String(wallet.telebirrBalanceEtb) : ''
  );

  const [copiedAddr, setCopiedAddr] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [onChainResult, setOnChainResult] = useState<AddressBalanceResult | null>(null);

  if (!isOpen) return null;

  const handleVerifyOnChain = async () => {
    const cleanAddr = address.trim();
    if (!cleanAddr) return;
    setIsVerifying(true);
    setOnChainResult(null);
    try {
      const res = await fetchBitcoinAddressBalance(cleanAddr);
      setOnChainResult(res);
      if (res.success) {
        setSatsStr(String(res.sats));
      }
    } finally {
      setIsVerifying(false);
    }
  };

  // Insert or update wallet
  const handleInsertOrUpdate = () => {
    const finalAddress = address.trim();
    let finalSats = 0;

    if (selectedType === 'non-custodial') {
      if (onChainResult && onChainResult.success && !onChainResult.isLightning) {
        finalSats = onChainResult.sats;
      } else {
        finalSats = parseInt(satsStr, 10) || 0;
      }
    } else {
      finalSats = parseInt(satsStr, 10) || 0;
    }

    const finalKes = parseFloat(mpesaStr) || 0;
    const finalEtb = parseFloat(telebirrStr) || 0;

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
      mpesaBalanceKes: finalKes,
      telebirrBalanceEtb: finalEtb,
      insertedAt: wallet.insertedAt || Date.now(),
      lastSyncedAt: Date.now(),
      onChainVerified: selectedType === 'non-custodial' && Boolean(onChainResult?.success),
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
                    Sats / Bitcoin Address (SegWit / Taproot / Legacy)
                  </label>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => {
                      setAddress(e.target.value);
                      setOnChainResult(null);
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

                {/* On-chain balance or Lightning Address verification action */}
                <div className="mt-2 flex items-center gap-2">
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
                    <span>Verify Wallet (On-Chain / Lightning)</span>
                  </button>

                  {onChainResult && onChainResult.success && onChainResult.isLightning && (
                    <span className="text-[11px] font-mono text-[#D1B9B3]">
                      Verified: {onChainResult.lightningProvider} (Active)
                    </span>
                  )}
                  {onChainResult && onChainResult.success && !onChainResult.isLightning && (
                    <span className="text-[11px] font-mono text-[#D1B9B3]">
                      Verified: {onChainResult.sats.toLocaleString()} Sats
                    </span>
                  )}
                  {onChainResult && !onChainResult.success && (
                    <span className="text-[11px] font-mono text-red-400">
                      {onChainResult.error || 'Unverified'}
                    </span>
                  )}
                </div>
              </div>

              {/* Sats balance override/display if not auto-verified */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block font-semibold text-[#D1B9B3]">
                    Sats Balance
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await queryWebLNBalance();
                      if (res.available && typeof res.sats === 'number') {
                        setSatsStr(String(res.sats));
                      }
                    }}
                    className="text-[10px] font-mono text-[#9B97A2] hover:text-[#D1B9B3] underline"
                    title="Auto-query connected WebLN extension"
                  >
                    Auto-detect WebLN
                  </button>
                </div>
                <input
                  type="number"
                  value={satsStr}
                  onChange={(e) => setSatsStr(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="0"
                  className="w-full bg-[#1F1728] border border-[#382B44] rounded-xl px-3 py-2 text-xs font-mono text-[#D1B9B3] focus:outline-none focus:border-[#763698]"
                />
              </div>

              {/* Real M-Pesa Balance */}
              <div>
                <label className="block font-semibold text-[#D1B9B3] mb-1">
                  M-Pesa Balance (KES)
                </label>
                <input
                  type="number"
                  value={mpesaStr}
                  onChange={(e) => setMpesaStr(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="0"
                  className="w-full bg-[#1F1728] border border-[#382B44] rounded-xl px-3 py-2 text-xs font-mono text-[#D1B9B3] focus:outline-none focus:border-[#763698]"
                />
              </div>

              {/* Real Telebirr Balance */}
              <div>
                <label className="block font-semibold text-[#D1B9B3] mb-1">
                  Telebirr Balance (ETB)
                </label>
                <input
                  type="number"
                  value={telebirrStr}
                  onChange={(e) => setTelebirrStr(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="0"
                  className="w-full bg-[#1F1728] border border-[#382B44] rounded-xl px-3 py-2 text-xs font-mono text-[#D1B9B3] focus:outline-none focus:border-[#763698]"
                />
              </div>
            </div>
          )}

          {/* Custodial Inputs */}
          {selectedType === 'custodial' && (
            <div className="bg-[#140E1B] border border-[#382B44] rounded-2xl p-3.5 space-y-3">
              <div>
                <label className="block font-semibold text-[#D1B9B3] mb-1">
                  Vault Sats Balance
                </label>
                <input
                  type="number"
                  value={satsStr}
                  onChange={(e) => setSatsStr(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="0"
                  className="w-full bg-[#1F1728] border border-[#382B44] rounded-xl px-3 py-2 text-xs font-mono text-[#D1B9B3] focus:outline-none focus:border-[#763698]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#D1B9B3] mb-1">
                  M-Pesa Balance (KES)
                </label>
                <input
                  type="number"
                  value={mpesaStr}
                  onChange={(e) => setMpesaStr(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="0"
                  className="w-full bg-[#1F1728] border border-[#382B44] rounded-xl px-3 py-2 text-xs font-mono text-[#D1B9B3] focus:outline-none focus:border-[#763698]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#D1B9B3] mb-1">
                  Telebirr Balance (ETB)
                </label>
                <input
                  type="number"
                  value={telebirrStr}
                  onChange={(e) => setTelebirrStr(e.target.value)}
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="0"
                  className="w-full bg-[#1F1728] border border-[#382B44] rounded-xl px-3 py-2 text-xs font-mono text-[#D1B9B3] focus:outline-none focus:border-[#763698]"
                />
              </div>
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

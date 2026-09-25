import React, { useState } from 'react';
import { UserWallet, WalletType } from '../types';
import { X, ShieldCheck, KeyRound, RefreshCw, Copy, Check, Sparkles } from 'lucide-react';
import { DEFAULT_WALLET } from '../services/storageService';

interface WalletSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallet: UserWallet;
  onUpdateWallet: (updated: UserWallet) => void;
}

const SAMPLE_SEED_WORDS = [
  'anchor', 'vintage', 'harvest', 'timber', 'solar', 'summit',
  'breeze', 'crypto', 'safari', 'nile', 'oasis', 'shield'
];

export const WalletSettingsModal: React.FC<WalletSettingsModalProps> = ({
  isOpen,
  onClose,
  wallet,
  onUpdateWallet,
}) => {
  const [selectedType, setSelectedType] = useState<WalletType>(wallet.type);
  const [address, setAddress] = useState(wallet.nonCustodialAddress);
  const [showSeed, setShowSeed] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    onUpdateWallet({
      ...wallet,
      type: selectedType,
      nonCustodialAddress: address.trim() || DEFAULT_WALLET.nonCustodialAddress,
    });
    onClose();
  };

  const handleResetDemoBalances = () => {
    onUpdateWallet({
      ...wallet,
      btcBalance: 0.05,
      mpesaBalanceKes: 50000,
      telebirrBalanceEtb: 40000,
    });
  };

  const handleGenerateNewAddress = () => {
    const chars = '023456789acdefghjklmnpqrstuvwxyz';
    let rand = 'bc1q';
    for (let i = 0; i < 38; i++) {
      rand += chars[Math.floor(Math.random() * chars.length)];
    }
    setAddress(rand);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-neutral-900 border border-neutral-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <h2 className="text-base font-bold text-white">Wallet Configuration</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-neutral-800 text-neutral-400 hover:text-white flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Mode Switcher */}
          <div>
            <label className="block text-xs font-semibold text-neutral-300 mb-2">
              Select Wallet Custody Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              {/* Custodial Option */}
              <button
                type="button"
                onClick={() => setSelectedType('custodial')}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  selectedType === 'custodial'
                    ? 'border-amber-500 bg-amber-500/10 text-white'
                    : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span className="font-bold text-xs text-white">Custodial</span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-snug">
                  Managed wallet with instant zero-fee transfers and automated key management.
                </p>
              </button>

              {/* Non-Custodial Option */}
              <button
                type="button"
                onClick={() => setSelectedType('non-custodial')}
                className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                  selectedType === 'non-custodial'
                    ? 'border-emerald-500 bg-emerald-500/10 text-white'
                    : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-700'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <KeyRound className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-xs text-white">Non-Custodial</span>
                </div>
                <p className="text-[11px] text-neutral-400 leading-snug">
                  Full self-custody. Connect your own external address; keys remain in your hands.
                </p>
              </button>
            </div>
          </div>

          {/* Non-Custodial specific settings */}
          {selectedType === 'non-custodial' && (
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-neutral-300">Your Bitcoin Address</span>
                <button
                  type="button"
                  onClick={handleGenerateNewAddress}
                  className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-mono"
                >
                  <Sparkles className="w-3 h-3" />
                  Generate New
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="bc1q..."
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-xs font-mono text-emerald-400 focus:outline-none focus:border-emerald-500 pr-9"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(address);
                    setCopiedAddr(true);
                    setTimeout(() => setCopiedAddr(false), 2000);
                  }}
                  className="absolute right-2 top-2 text-neutral-500 hover:text-neutral-300"
                >
                  {copiedAddr ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              {/* Seed phrase drawer */}
              <div className="pt-2 border-t border-neutral-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-neutral-400">12-Word Seed Recovery</span>
                  <button
                    type="button"
                    onClick={() => setShowSeed(!showSeed)}
                    className="text-[11px] text-neutral-400 hover:text-white underline font-mono"
                  >
                    {showSeed ? 'Hide Seed' : 'View Seed Words'}
                  </button>
                </div>

                {showSeed && (
                  <div className="grid grid-cols-3 gap-1.5 p-2 bg-neutral-900 rounded-lg border border-neutral-800 font-mono text-[10px]">
                    {SAMPLE_SEED_WORDS.map((w, i) => (
                      <div key={i} className="text-neutral-400">
                        <span className="text-neutral-600 mr-1">{i + 1}.</span>
                        <span className="text-white">{w}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Reset / Demo Funds option */}
          <div className="pt-2 border-t border-neutral-800 flex items-center justify-between">
            <div>
              <div className="font-semibold text-neutral-300">Quick Test Funds</div>
              <div className="text-[11px] text-neutral-500">
                Refill KES 50,000 · ETB 40,000 · 0.05 BTC
              </div>
            </div>
            <button
              type="button"
              onClick={handleResetDemoBalances}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-medium transition-colors"
            >
              <RefreshCw className="w-3 h-3 text-amber-400" />
              <span>Reset Funds</span>
            </button>
          </div>

          {/* Save Button */}
          <button
            type="button"
            onClick={handleSave}
            className="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-sm transition-colors mt-2"
          >
            Apply Configuration
          </button>
        </div>
      </div>
    </div>
  );
};

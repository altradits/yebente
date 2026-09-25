import React from 'react';
import { UserWallet } from '../types';
import { Shield, ShieldAlert, Smartphone, Plus, LogOut, Settings } from 'lucide-react';

interface TopBarProps {
  wallet: UserWallet;
  onOpenWalletSettings: () => void;
  onEjectWallet?: () => void;
  isFrameMode: boolean;
  onToggleFrameMode: () => void;
  showBalanceSection?: boolean;
  onToggleBalanceSection?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  wallet,
  onOpenWalletSettings,
  onEjectWallet,
  isFrameMode,
  onToggleFrameMode,
  showBalanceSection = false,
  onToggleBalanceSection,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[#16101D]/90 backdrop-blur-md border-b border-[#372A42] px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Brand Zone */}
        <div className="flex flex-col justify-center">
          <div className="flex items-center tracking-tight leading-none select-none">
            <span className="font-banana font-black text-[26px] text-[#F8F0E7] drop-shadow-sm">
              Ye
            </span>
            <span
              className="font-black text-[25px] text-[#D1B9B3] px-[0.5px] leading-none inline-flex items-center justify-center font-sans"
              style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
            >
              ₿
            </span>
            <span className="font-banana font-black text-[26px] text-[#F8F0E7] drop-shadow-sm">
              ente
            </span>
          </div>
        </div>

        {/* Action Zone */}
        <div className="flex items-center gap-2">
          {/* Desktop mobile frame toggle for wide viewports */}
          <button
            onClick={onToggleFrameMode}
            className="hidden md:flex w-8 h-8 rounded-xl bg-[#231A2D] border border-[#3C2E49] items-center justify-center text-[#9B97A2] hover:text-[#F8F0E7] hover:border-[#763698]/50 transition-colors active:scale-95"
            title={isFrameMode ? 'Switch to Full Screen' : 'Switch to Phone Frame'}
            aria-label="Toggle Phone Frame"
          >
            <Smartphone className={`w-3.5 h-3.5 ${isFrameMode ? 'text-[#D1B9B3]' : ''}`} />
          </button>

          {/* Wallet State: Connected or Insert Wallet */}
          {wallet.isConnected ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={onToggleBalanceSection || onOpenWalletSettings}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${
                  showBalanceSection
                    ? 'bg-[#763698] border-[#763698] text-[#F8F0E7] shadow-md shadow-[#763698]/30'
                    : 'bg-[#231A2D] border-[#3C2E49] hover:border-[#763698]/60 text-[#D1B9B3] hover:text-[#F8F0E7]'
                }`}
                title={showBalanceSection ? 'Hide Sats Balance' : 'Show Sats Balance'}
              >
                {wallet.type === 'custodial' ? (
                  <Shield className="w-3.5 h-3.5" />
                ) : (
                  <ShieldAlert className="w-3.5 h-3.5 text-[#763698]" />
                )}
                <span>Sats Balance</span>
              </button>

              <button
                onClick={onOpenWalletSettings}
                className="w-8 h-8 rounded-xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#763698] flex items-center justify-center text-[#9B97A2] hover:text-[#F8F0E7] transition-colors active:scale-95"
                title="Wallet details & security"
                aria-label="Wallet details"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>

              {onEjectWallet && (
                <button
                  onClick={onEjectWallet}
                  className="w-8 h-8 rounded-xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#946069] flex items-center justify-center text-[#9B97A2] hover:text-[#946069] transition-colors active:scale-95"
                  title="Eject / Remove Wallet (Secure session)"
                  aria-label="Eject wallet"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenWalletSettings}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#763698] hover:bg-[#8A41B0] text-xs font-semibold text-[#F8F0E7] shadow-md shadow-[#763698]/30 transition-all active:scale-95"
              title="Insert a Bitcoin wallet address or vault"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Insert Wallet</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

import React from 'react';
import { UserWallet } from '../types';
import { Smartphone, Settings } from 'lucide-react';

interface TopBarProps {
  wallet: UserWallet;
  onOpenWalletSettings: () => void;
  isFrameMode: boolean;
  onToggleFrameMode: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  wallet,
  onOpenWalletSettings,
  isFrameMode,
  onToggleFrameMode,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[#16101D]/90 backdrop-blur-md border-b border-[#372A42] px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Brand Wordmark */}
        <div className="flex flex-col justify-center select-none">
          <div className="flex items-center tracking-tight leading-none">
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

        {/* Action Zone: Minimum number of understandable buttons */}
        <div className="flex items-center gap-2">
          {/* Desktop phone frame toggle for wide viewports */}
          <button
            type="button"
            onClick={onToggleFrameMode}
            className="hidden md:flex w-9 h-9 rounded-xl bg-[#231A2D] border border-[#3C2E49] items-center justify-center text-[#9B97A2] hover:text-[#F8F0E7] hover:border-[#763698]/50 transition-colors active:scale-95"
            title={isFrameMode ? 'Switch to Full Width' : 'Switch to Phone Frame'}
            aria-label="Toggle Phone Frame"
          >
            <Smartphone className={`w-4 h-4 ${isFrameMode ? 'text-[#D1B9B3]' : ''}`} />
          </button>

          {/* Wallet State: Connected (Settings) or Connect */}
          {wallet.isConnected ? (
            <button
              type="button"
              onClick={onOpenWalletSettings}
              className="w-9 h-9 rounded-xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#763698] flex items-center justify-center text-[#9B97A2] hover:text-[#F8F0E7] transition-colors active:scale-95"
              title="Wallet settings"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenWalletSettings}
              className="px-3.5 py-1.5 rounded-xl bg-[#763698] hover:bg-[#8A41B0] text-xs font-semibold text-[#F8F0E7] shadow-md shadow-[#763698]/30 transition-all active:scale-95"
            >
              Connect
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

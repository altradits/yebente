import React from 'react';
import { UserWallet } from '../types';
import { Shield, ShieldAlert, RefreshCw, Smartphone } from 'lucide-react';

interface TopBarProps {
  wallet: UserWallet;
  isRatesLive: boolean;
  onRefreshRates: () => void;
  isRefreshing: boolean;
  onOpenWalletSettings: () => void;
  isFrameMode: boolean;
  onToggleFrameMode: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  wallet,
  isRatesLive,
  onRefreshRates,
  isRefreshing,
  onOpenWalletSettings,
  isFrameMode,
  onToggleFrameMode,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-neutral-950/90 backdrop-blur-md border-b border-neutral-900 px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Brand Zone */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-600 via-amber-500 to-yellow-400 flex items-center justify-center font-bold text-neutral-950 text-base shadow-sm">
            ₿
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold tracking-tight text-white">Altradits</span>
              <span className="text-xs font-medium text-amber-500/90 tracking-wide font-mono">yebente</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-400">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${isRatesLive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span>{isRatesLive ? 'Live rates' : 'Market active'}</span>
            </div>
          </div>
        </div>

        {/* Action Zone */}
        <div className="flex items-center gap-2">
          {/* Rate Refresh Button */}
          <button
            onClick={onRefreshRates}
            disabled={isRefreshing}
            className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 hover:text-white transition-colors active:scale-95 disabled:opacity-50"
            title="Refresh Exchange Rates"
            aria-label="Refresh rates"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-500' : ''}`} />
          </button>

          {/* Desktop mobile frame toggle for wide viewports */}
          <button
            onClick={onToggleFrameMode}
            className="hidden md:flex w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-800 items-center justify-center text-neutral-400 hover:text-white transition-colors active:scale-95"
            title={isFrameMode ? 'Switch to Full Screen' : 'Switch to Phone Frame'}
            aria-label="Toggle Phone Frame"
          >
            <Smartphone className={`w-3.5 h-3.5 ${isFrameMode ? 'text-amber-400' : ''}`} />
          </button>

          {/* Wallet Type Switcher / Settings */}
          <button
            onClick={onOpenWalletSettings}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-xs font-medium text-neutral-200 transition-colors active:scale-95"
            title="Wallet Configuration"
          >
            {wallet.type === 'custodial' ? (
              <>
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Custodial</span>
                <span className="sm:hidden">In-App</span>
              </>
            ) : (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Non-Custodial</span>
                <span className="sm:hidden">Self</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

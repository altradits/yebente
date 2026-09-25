import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Send, ArrowRight } from 'lucide-react';

interface ActionGridProps {
  onBuyBtc: () => void;
  onSellBtc: () => void;
  onSendMpesa: () => void;
  onSendTelebirr: () => void;
}

export const ActionGrid: React.FC<ActionGridProps> = ({
  onBuyBtc,
  onSellBtc,
  onSendMpesa,
  onSendTelebirr,
}) => {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {/* 1. Buy BTC */}
      <button
        onClick={onBuyBtc}
        className="group relative flex flex-col justify-between p-3.5 rounded-2xl bg-neutral-900 border border-neutral-800 hover:border-amber-500/50 hover:bg-neutral-850 active:scale-[0.98] transition-all text-left shadow-sm min-h-[92px]"
      >
        <div className="flex items-center justify-between w-full">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-mono text-neutral-500 group-hover:text-neutral-300 transition-colors">
            Instant
          </span>
        </div>
        <div className="mt-2">
          <div className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
            Buy BTC
          </div>
          <div className="text-[11px] text-neutral-400">
            From M-Pesa / Telebirr
          </div>
        </div>
      </button>

      {/* 2. Sell BTC */}
      <button
        onClick={onSellBtc}
        className="group relative flex flex-col justify-between p-3.5 rounded-2xl bg-neutral-900 border border-neutral-800 hover:border-amber-500/50 hover:bg-neutral-850 active:scale-[0.98] transition-all text-left shadow-sm min-h-[92px]"
      >
        <div className="flex items-center justify-between w-full">
          <div className="w-9 h-9 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center text-amber-400 group-hover:scale-105 transition-transform">
            <ArrowUpRight className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-mono text-neutral-500 group-hover:text-neutral-300 transition-colors">
            Cash Out
          </span>
        </div>
        <div className="mt-2">
          <div className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
            Sell BTC
          </div>
          <div className="text-[11px] text-neutral-400">
            To M-Pesa / Telebirr
          </div>
        </div>
      </button>

      {/* 3. Send M-Pesa */}
      <button
        onClick={onSendMpesa}
        className="group relative flex flex-col justify-between p-3.5 rounded-2xl bg-neutral-900 border border-neutral-800 hover:border-emerald-500/50 hover:bg-neutral-850 active:scale-[0.98] transition-all text-left shadow-sm min-h-[92px]"
      >
        <div className="flex items-center justify-between w-full">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform">
            <Send className="w-4 h-4" />
          </div>
          <span className="text-[10px] font-mono text-emerald-500 font-medium">
            Safaricom
          </span>
        </div>
        <div className="mt-2">
          <div className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors">
            Send M-Pesa
          </div>
          <div className="text-[11px] text-neutral-400">
            KES to Phone or Till
          </div>
        </div>
      </button>

      {/* 4. Send Telebirr */}
      <button
        onClick={onSendTelebirr}
        className="group relative flex flex-col justify-between p-3.5 rounded-2xl bg-neutral-900 border border-neutral-800 hover:border-cyan-500/50 hover:bg-neutral-850 active:scale-[0.98] transition-all text-left shadow-sm min-h-[92px]"
      >
        <div className="flex items-center justify-between w-full">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-105 transition-transform">
            <ArrowRight className="w-4 h-4" />
          </div>
          <span className="text-[10px] font-mono text-cyan-500 font-medium">
            Ethio Telecom
          </span>
        </div>
        <div className="mt-2">
          <div className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
            Send Telebirr
          </div>
          <div className="text-[11px] text-neutral-400">
            ETB to Mobile Account
          </div>
        </div>
      </button>
    </div>
  );
};

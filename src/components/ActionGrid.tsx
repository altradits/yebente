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
      {/* 1. Buy Sats */}
      <button
        onClick={onBuyBtc}
        className="group relative flex flex-col justify-between p-4 rounded-3xl bg-[#1E1727] border border-[#382B44] hover:border-[#763698] hover:bg-[#261D32] active:scale-[0.98] transition-all text-left shadow-md shadow-[#120E16]/50 min-h-[96px]"
      >
        <div className="flex items-center justify-between w-full">
          <div className="w-10 h-10 rounded-2xl bg-[#763698]/20 border border-[#763698]/40 flex items-center justify-center text-[#D1B9B3] group-hover:scale-105 group-hover:bg-[#763698]/30 transition-all">
            <ArrowDownLeft className="w-5 h-5 text-[#F8F0E7]" />
          </div>
          <span className="text-[10px] font-mono text-[#9B97A2] group-hover:text-[#D1B9B3] transition-colors">
            Instant
          </span>
        </div>
        <div className="mt-2.5">
          <div className="text-sm font-bold text-[#F8F0E7] group-hover:text-[#D1B9B3] transition-colors">
            Buy Sats
          </div>
          <div className="text-[11px] text-[#9B97A2]">
            From M-Pesa / Telebirr
          </div>
        </div>
      </button>

      {/* 2. Sell Sats */}
      <button
        onClick={onSellBtc}
        className="group relative flex flex-col justify-between p-4 rounded-3xl bg-[#1E1727] border border-[#382B44] hover:border-[#946069] hover:bg-[#261D32] active:scale-[0.98] transition-all text-left shadow-md shadow-[#120E16]/50 min-h-[96px]"
      >
        <div className="flex items-center justify-between w-full">
          <div className="w-10 h-10 rounded-2xl bg-[#946069]/20 border border-[#946069]/40 flex items-center justify-center text-[#D1B9B3] group-hover:scale-105 group-hover:bg-[#946069]/30 transition-all">
            <ArrowUpRight className="w-5 h-5 text-[#F8F0E7]" />
          </div>
          <span className="text-[10px] font-mono text-[#9B97A2] group-hover:text-[#D1B9B3] transition-colors">
            Cash Out
          </span>
        </div>
        <div className="mt-2.5">
          <div className="text-sm font-bold text-[#F8F0E7] group-hover:text-[#D1B9B3] transition-colors">
            Sell Sats
          </div>
          <div className="text-[11px] text-[#9B97A2]">
            To M-Pesa / Telebirr
          </div>
        </div>
      </button>

      {/* 3. Send M-Pesa */}
      <button
        onClick={onSendMpesa}
        className="group relative flex flex-col justify-between p-4 rounded-3xl bg-[#1E1727] border border-[#382B44] hover:border-[#D1B9B3]/70 hover:bg-[#261D32] active:scale-[0.98] transition-all text-left shadow-md shadow-[#120E16]/50 min-h-[96px]"
      >
        <div className="flex items-center justify-between w-full">
          <div className="w-10 h-10 rounded-2xl bg-[#554653]/35 border border-[#554653] flex items-center justify-center text-[#D1B9B3] group-hover:scale-105 group-hover:bg-[#554653]/50 transition-all">
            <Send className="w-4 h-4 text-[#F8F0E7]" />
          </div>
          <span className="text-[10px] font-mono text-[#D1B9B3] font-medium">
            Safaricom
          </span>
        </div>
        <div className="mt-2.5">
          <div className="text-sm font-bold text-[#F8F0E7] group-hover:text-[#D1B9B3] transition-colors">
            Send M-Pesa
          </div>
          <div className="text-[11px] text-[#9B97A2]">
            KES to Phone or Till
          </div>
        </div>
      </button>

      {/* 4. Send Telebirr */}
      <button
        onClick={onSendTelebirr}
        className="group relative flex flex-col justify-between p-4 rounded-3xl bg-[#1E1727] border border-[#382B44] hover:border-[#763698]/70 hover:bg-[#261D32] active:scale-[0.98] transition-all text-left shadow-md shadow-[#120E16]/50 min-h-[96px]"
      >
        <div className="flex items-center justify-between w-full">
          <div className="w-10 h-10 rounded-2xl bg-[#3C2E49] border border-[#554653] flex items-center justify-center text-[#9B97A2] group-hover:scale-105 group-hover:bg-[#4C3A5C] transition-all">
            <ArrowRight className="w-4 h-4 text-[#F8F0E7]" />
          </div>
          <span className="text-[10px] font-mono text-[#9B97A2] font-medium">
            Ethio Telecom
          </span>
        </div>
        <div className="mt-2.5">
          <div className="text-sm font-bold text-[#F8F0E7] group-hover:text-[#D1B9B3] transition-colors">
            Send Telebirr
          </div>
          <div className="text-[11px] text-[#9B97A2]">
            ETB to Mobile Account
          </div>
        </div>
      </button>
    </div>
  );
};

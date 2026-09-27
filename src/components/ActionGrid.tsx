import React from 'react';

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
        className="group relative flex items-center justify-center p-4 rounded-3xl bg-[#1E1727] border border-[#382B44] hover:border-[#763698] hover:bg-[#261D32] active:scale-[0.98] transition-all text-center shadow-md shadow-[#120E16]/50 min-h-[96px]"
      >
        <span className="text-base font-bold text-[#F8F0E7] group-hover:text-[#D1B9B3] transition-colors">
          Buy Sats
        </span>
      </button>

      {/* 2. Sell Sats */}
      <button
        onClick={onSellBtc}
        className="group relative flex items-center justify-center p-4 rounded-3xl bg-[#1E1727] border border-[#382B44] hover:border-[#946069] hover:bg-[#261D32] active:scale-[0.98] transition-all text-center shadow-md shadow-[#120E16]/50 min-h-[96px]"
      >
        <span className="text-base font-bold text-[#F8F0E7] group-hover:text-[#D1B9B3] transition-colors">
          Sell Sats
        </span>
      </button>

      {/* 3. Send M-Pesa */}
      <button
        onClick={onSendMpesa}
        className="group relative flex items-center justify-center p-4 rounded-3xl bg-[#1E1727] border border-[#382B44] hover:border-[#D1B9B3]/70 hover:bg-[#261D32] active:scale-[0.98] transition-all text-center shadow-md shadow-[#120E16]/50 min-h-[96px]"
      >
        <span className="text-base font-bold text-[#F8F0E7] group-hover:text-[#D1B9B3] transition-colors">
          Send M-Pesa
        </span>
      </button>

      {/* 4. Send Telebirr */}
      <button
        onClick={onSendTelebirr}
        className="group relative flex items-center justify-center p-4 rounded-3xl bg-[#1E1727] border border-[#382B44] hover:border-[#763698]/70 hover:bg-[#261D32] active:scale-[0.98] transition-all text-center shadow-md shadow-[#120E16]/50 min-h-[96px]"
      >
        <span className="text-base font-bold text-[#F8F0E7] group-hover:text-[#D1B9B3] transition-colors">
          Send Telebirr
        </span>
      </button>
    </div>
  );
};

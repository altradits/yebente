import React from 'react';

interface ActionGridProps {
  onBuyBtc: () => void;
  onReceiveBtc: () => void;
  onSellBtc: () => void;
  onSendMpesa: () => void;
  onSendTelebirr: () => void;
}

export const ActionGrid: React.FC<ActionGridProps> = ({
  onBuyBtc,
  onReceiveBtc,
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

      {/* 2. Receive Sats (Wallet of Satoshi / Lightning) */}
      <button
        onClick={onReceiveBtc}
        className="group relative flex items-center justify-center p-4 rounded-3xl bg-[#1E1727] border border-[#382B44] hover:border-[#763698] hover:bg-[#261D32] active:scale-[0.98] transition-all text-center shadow-md shadow-[#120E16]/50 min-h-[96px]"
      >
        <span className="text-base font-bold text-[#F8F0E7] group-hover:text-[#D1B9B3] transition-colors">
          Receive Sats
        </span>
      </button>

      {/* 3. Sell Sats */}
      <button
        onClick={onSellBtc}
        className="group relative flex items-center justify-center p-4 rounded-3xl bg-[#1E1727] border border-[#382B44] hover:border-[#946069] hover:bg-[#261D32] active:scale-[0.98] transition-all text-center shadow-md shadow-[#120E16]/50 min-h-[96px]"
      >
        <span className="text-base font-bold text-[#F8F0E7] group-hover:text-[#D1B9B3] transition-colors">
          Sell Sats
        </span>
      </button>

      {/* 4. Send M-Pesa */}
      <button
        onClick={onSendMpesa}
        className="group relative flex items-center justify-center p-4 rounded-3xl bg-[#1E1727] border border-[#382B44] hover:border-[#D1B9B3]/70 hover:bg-[#261D32] active:scale-[0.98] transition-all text-center shadow-md shadow-[#120E16]/50 min-h-[96px]"
      >
        <span className="text-base font-bold text-[#F8F0E7] group-hover:text-[#D1B9B3] transition-colors">
          Send M-Pesa
        </span>
      </button>

      {/* 5. Send Telebirr */}
      <button
        onClick={onSendTelebirr}
        className="col-span-2 group relative flex items-center justify-center p-4 rounded-3xl bg-[#1E1727] border border-[#382B44] hover:border-[#763698]/70 hover:bg-[#261D32] active:scale-[0.98] transition-all text-center shadow-md shadow-[#120E16]/50 min-h-[76px]"
      >
        <span className="text-base font-bold text-[#F8F0E7] group-hover:text-[#D1B9B3] transition-colors">
          Send Telebirr
        </span>
      </button>
    </div>
  );
};

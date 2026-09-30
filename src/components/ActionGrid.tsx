import React from 'react';

interface ActionGridProps {
  onBuyBtc: () => void;
  onSendMpesa: () => void;
  onReceiveBtc: () => void;
  onSendBtc: () => void;
}

export const ActionGrid: React.FC<ActionGridProps> = ({
  onBuyBtc,
  onSendMpesa,
  onReceiveBtc,
  onSendBtc,
}) => {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {/* Row 1: M-Pesa Rails (Buy Sats & Send M-Pesa) */}
      <button
        type="button"
        onClick={onBuyBtc}
        className="group relative flex items-center justify-center p-4 rounded-3xl bg-[#1E1727] border border-[#382B44] hover:border-[#763698] hover:bg-[#261D32] active:scale-[0.98] transition-all text-center shadow-md shadow-[#120E16]/50 min-h-[96px]"
      >
        <span className="text-base font-bold text-[#F8F0E7] group-hover:text-[#D1B9B3] transition-colors">
          Buy Sats
        </span>
      </button>

      <button
        type="button"
        onClick={onSendMpesa}
        className="group relative flex items-center justify-center p-4 rounded-3xl bg-[#1E1727] border border-[#382B44] hover:border-[#763698] hover:bg-[#261D32] active:scale-[0.98] transition-all text-center shadow-md shadow-[#120E16]/50 min-h-[96px]"
      >
        <span className="text-base font-bold text-[#F8F0E7] group-hover:text-[#D1B9B3] transition-colors">
          Send Mobile
        </span>
      </button>

      {/* Row 2: Bitcoin Rails (Receive Sats & Send Sats) */}
      <button
        type="button"
        onClick={onReceiveBtc}
        className="group relative flex items-center justify-center p-4 rounded-3xl bg-[#1E1727] border border-[#382B44] hover:border-[#763698] hover:bg-[#261D32] active:scale-[0.98] transition-all text-center shadow-md shadow-[#120E16]/50 min-h-[96px]"
      >
        <span className="text-base font-bold text-[#F8F0E7] group-hover:text-[#D1B9B3] transition-colors">
          Receive Sats
        </span>
      </button>

      <button
        type="button"
        onClick={onSendBtc}
        className="group relative flex items-center justify-center p-4 rounded-3xl bg-[#1E1727] border border-[#382B44] hover:border-[#763698] hover:bg-[#261D32] active:scale-[0.98] transition-all text-center shadow-md shadow-[#120E16]/50 min-h-[96px]"
      >
        <span className="text-base font-bold text-[#F8F0E7] group-hover:text-[#D1B9B3] transition-colors">
          Send Sats
        </span>
      </button>
    </div>
  );
};

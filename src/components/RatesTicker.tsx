import React, { useState } from 'react';
import { ExchangeRates } from '../types';
import { TrendingUp, TrendingDown, Calculator, ArrowRightLeft } from 'lucide-react';

interface RatesTickerProps {
  rates: ExchangeRates;
}

export const RatesTicker: React.FC<RatesTickerProps> = ({ rates }) => {
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcAmount, setCalcAmount] = useState<string>('10000');
  const [calcSource, setCalcSource] = useState<'KES' | 'ETB' | 'BTC'>('KES');

  const formatNumber = (num: number, maxDecimals = 0) => {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: maxDecimals,
    }).format(num);
  };

  const parsedAmount = parseFloat(calcAmount) || 0;
  let convertedBtc = 0;
  let convertedKes = 0;
  let convertedEtb = 0;

  if (calcSource === 'KES') {
    convertedBtc = rates.btcKes > 0 ? parsedAmount / rates.btcKes : 0;
    convertedEtb = rates.btcKes > 0 ? (parsedAmount / rates.btcKes) * rates.btcEtb : 0;
  } else if (calcSource === 'ETB') {
    convertedBtc = rates.btcEtb > 0 ? parsedAmount / rates.btcEtb : 0;
    convertedKes = rates.btcEtb > 0 ? (parsedAmount / rates.btcEtb) * rates.btcKes : 0;
  } else {
    // BTC
    convertedKes = parsedAmount * rates.btcKes;
    convertedEtb = parsedAmount * rates.btcEtb;
  }

  return (
    <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-3.5">
      <div className="flex items-center justify-between text-xs text-neutral-400 mb-2.5">
        <span className="font-semibold text-neutral-300">Live Exchange Rates</span>
        <button
          onClick={() => setShowCalculator(!showCalculator)}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
            showCalculator ? 'bg-amber-500/10 text-amber-400' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Calculator className="w-3 h-3" />
          <span>Quick Converter</span>
        </button>
      </div>

      {/* 3 Rates cards */}
      <div className="grid grid-cols-3 gap-2">
        {/* M-Pesa KES Rate */}
        <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-2.5">
          <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-0.5">
            <span className="font-medium text-emerald-400">BTC / KES</span>
            <span className="flex items-center text-[10px] text-emerald-500">
              {rates.change24hKes >= 0 ? (
                <TrendingUp className="w-2.5 h-2.5 mr-0.5" />
              ) : (
                <TrendingDown className="w-2.5 h-2.5 mr-0.5 text-rose-500" />
              )}
              {Math.abs(rates.change24hKes).toFixed(1)}%
            </span>
          </div>
          <div className="font-mono text-xs font-bold text-white tabular-nums truncate">
            {formatNumber(rates.btcKes, 0)}
          </div>
          <div className="text-[10px] text-neutral-500 font-mono mt-0.5">M-Pesa rate</div>
        </div>

        {/* Telebirr ETB Rate */}
        <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-2.5">
          <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-0.5">
            <span className="font-medium text-cyan-400">BTC / ETB</span>
            <span className="flex items-center text-[10px] text-cyan-500">
              {rates.change24hEtb >= 0 ? (
                <TrendingUp className="w-2.5 h-2.5 mr-0.5" />
              ) : (
                <TrendingDown className="w-2.5 h-2.5 mr-0.5 text-rose-500" />
              )}
              {Math.abs(rates.change24hEtb).toFixed(1)}%
            </span>
          </div>
          <div className="font-mono text-xs font-bold text-white tabular-nums truncate">
            {formatNumber(rates.btcEtb, 0)}
          </div>
          <div className="text-[10px] text-neutral-500 font-mono mt-0.5">Telebirr rate</div>
        </div>

        {/* BTC / USD Rate */}
        <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-2.5">
          <div className="flex items-center justify-between text-[11px] text-neutral-400 mb-0.5">
            <span className="font-medium text-amber-400">BTC / USD</span>
            <span className="flex items-center text-[10px] text-amber-500">
              {rates.change24hUsd >= 0 ? (
                <TrendingUp className="w-2.5 h-2.5 mr-0.5" />
              ) : (
                <TrendingDown className="w-2.5 h-2.5 mr-0.5 text-rose-500" />
              )}
              {Math.abs(rates.change24hUsd).toFixed(1)}%
            </span>
          </div>
          <div className="font-mono text-xs font-bold text-white tabular-nums truncate">
            ${formatNumber(rates.btcUsd, 0)}
          </div>
          <div className="text-[10px] text-neutral-500 font-mono mt-0.5">Global index</div>
        </div>
      </div>

      {/* Embedded interactive quick calculator if expanded */}
      {showCalculator && (
        <div className="mt-3 pt-3 border-t border-neutral-800 animate-in fade-in duration-200">
          <div className="flex items-center justify-between text-xs text-neutral-400 mb-2">
            <span>Instant Converter</span>
            <div className="flex items-center gap-1 bg-neutral-950 p-0.5 rounded-lg border border-neutral-800 text-[11px]">
              {(['KES', 'ETB', 'BTC'] as const).map((curr) => (
                <button
                  key={curr}
                  onClick={() => {
                    setCalcSource(curr);
                    if (curr === 'BTC') setCalcAmount('0.005');
                    else if (curr === 'KES') setCalcAmount('10000');
                    else setCalcAmount('8000');
                  }}
                  className={`px-2 py-0.5 rounded font-mono transition-colors ${
                    calcSource === curr ? 'bg-neutral-800 text-white font-medium' : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  {curr}
                </button>
              ))}
            </div>
          </div>

          <div className="relative mb-2">
            <input
              type="number"
              value={calcAmount}
              onChange={(e) => setCalcAmount(e.target.value)}
              placeholder="Enter amount..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-sm font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500"
            />
            <span className="absolute right-3 top-2.5 font-mono text-xs font-semibold text-neutral-400">
              {calcSource}
            </span>
          </div>

          <div className="bg-neutral-950/90 rounded-xl p-2.5 border border-neutral-800/80 space-y-1 font-mono text-xs">
            {calcSource === 'KES' && (
              <>
                <div className="flex justify-between items-center text-neutral-300">
                  <span className="text-neutral-500">Bitcoin</span>
                  <span className="text-amber-400 font-bold">{convertedBtc.toFixed(7)} BTC</span>
                </div>
                <div className="flex justify-between items-center text-neutral-400 text-[11px]">
                  <span className="text-neutral-500">Telebirr Equivalent</span>
                  <span>≈ {formatNumber(convertedEtb, 2)} ETB</span>
                </div>
              </>
            )}

            {calcSource === 'ETB' && (
              <>
                <div className="flex justify-between items-center text-neutral-300">
                  <span className="text-neutral-500">Bitcoin</span>
                  <span className="text-amber-400 font-bold">{convertedBtc.toFixed(7)} BTC</span>
                </div>
                <div className="flex justify-between items-center text-neutral-400 text-[11px]">
                  <span className="text-neutral-500">M-Pesa Equivalent</span>
                  <span>≈ {formatNumber(convertedKes, 2)} KES</span>
                </div>
              </>
            )}

            {calcSource === 'BTC' && (
              <>
                <div className="flex justify-between items-center text-neutral-300">
                  <span className="text-neutral-500">M-Pesa (Kenya)</span>
                  <span className="text-emerald-400 font-bold">KES {formatNumber(convertedKes, 0)}</span>
                </div>
                <div className="flex justify-between items-center text-neutral-300">
                  <span className="text-neutral-500">Telebirr (Ethiopia)</span>
                  <span className="text-cyan-400 font-bold">ETB {formatNumber(convertedEtb, 0)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

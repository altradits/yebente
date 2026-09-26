import React, { useState } from 'react';
import { Transaction, TransactionType } from '../types';
import { Search, ArrowDownLeft, ArrowUpRight, Send, ArrowRight, ChevronRight, FileDown, Filter, ChevronDown, Trash2 } from 'lucide-react';

interface TransactionHistoryProps {
  transactions: Transaction[];
  onSelectTransaction: (tx: Transaction) => void;
  onClearHistory?: () => void;
}

const FILTER_LABELS: Record<'all' | TransactionType, string> = {
  all: 'All',
  buy_btc: 'Buy Sats',
  sell_btc: 'Sell Sats',
  send_mpesa: 'M-Pesa',
  send_telebirr: 'Telebirr',
  deposit_mpesa: 'Deposits',
};

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  transactions,
  onSelectTransaction,
  onClearHistory,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [activeFilter, setActiveFilter] = useState<'all' | TransactionType>('all');
  const [isTabsOpen, setIsTabsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);

  const handleClearClick = () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      setTimeout(() => setConfirmingClear(false), 4000);
      return;
    }
    setConfirmingClear(false);
    if (onClearHistory) {
      onClearHistory();
    }
  };

  const filteredTransactions = transactions.filter((tx) => {
    if (!tx || typeof tx !== 'object') return false;
    // Only real, complete transactions with valid references
    if (tx.status !== 'completed') return false;
    if (!tx.referenceNumber || !tx.referenceNumber.trim()) return false;

    if (activeFilter !== 'all' && tx.type !== activeFilter) {
      return false;
    }
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchRef = tx.referenceNumber.toLowerCase().includes(q);
      const matchTitle = tx.title.toLowerCase().includes(q);
      const matchRecipient = tx.recipient?.toLowerCase().includes(q) || false;
      const matchNote = tx.note?.toLowerCase().includes(q) || false;
      return matchRef || matchTitle || matchRecipient || matchNote;
    }
    return true;
  });

  const getTxIcon = (type: TransactionType) => {
    switch (type) {
      case 'buy_btc':
        return <ArrowDownLeft className="w-4 h-4 text-[#D1B9B3]" />;
      case 'deposit_mpesa':
        return <ArrowDownLeft className="w-4 h-4 text-emerald-400" />;
      case 'sell_btc':
        return <ArrowUpRight className="w-4 h-4 text-[#946069]" />;
      case 'send_mpesa':
        return <Send className="w-3.5 h-3.5 text-[#D1B9B3]" />;
      case 'send_telebirr':
        return <ArrowRight className="w-3.5 h-3.5 text-[#9B97A2]" />;
    }
  };

  const formatRelativeTime = (timestamp: number) => {
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const handleExportCSV = () => {
    if (transactions.length === 0) return;
    const headers = ['ID', 'Date', 'Type', 'From Amount', 'From Currency', 'To Amount', 'To Currency', 'Fee', 'Recipient', 'Reference'];
    const rows = transactions.map((t) => [
      t.id,
      new Date(t.timestamp).toISOString(),
      t.type,
      t.fromAmount,
      t.fromCurrency,
      t.toAmount || '',
      t.toCurrency || '',
      t.fee,
      `"${t.recipient || ''}"`,
      t.referenceNumber,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `yebente_history_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-[#1A1322]/80 border border-[#382B44] rounded-3xl p-4 shadow-md shadow-[#120E16]/40 transition-all">
      {/* Title & Collapse Toggle Header */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-2.5 text-left group flex-1 focus:outline-none"
          aria-expanded={!isCollapsed}
        >
          <div className="w-8 h-8 rounded-xl bg-[#231A2D] border border-[#3C2E49] group-hover:border-[#763698]/60 flex items-center justify-center transition-colors">
            <ChevronDown
              className={`w-4 h-4 text-[#D1B9B3] transition-transform duration-200 ${
                isCollapsed ? '-rotate-90' : 'rotate-0'
              }`}
            />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#F8F0E7] group-hover:text-[#D1B9B3] transition-colors">
              Transaction History
            </h2>
            <div className="text-[11px] text-[#9B97A2]">
              {transactions.length} verified {transactions.length === 1 ? 'operation' : 'operations'} · {isCollapsed ? 'Tap to view' : 'Tap to collapse'}
            </div>
          </div>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isCollapsed && transactions.length > 0 && onClearHistory && (
            <button
              type="button"
              onClick={handleClearClick}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-[11px] font-mono transition-all active:scale-95 ${
                confirmingClear
                  ? 'bg-rose-950/70 border-rose-500/80 text-rose-300 font-bold'
                  : 'bg-[#231A2D] border-[#3C2E49] hover:border-[#946069] text-[#D1B9B3] hover:text-[#F8F0E7]'
              }`}
              title={confirmingClear ? 'Click again to permanently clear all history' : 'Clear all transaction history'}
            >
              <Trash2 className="w-3 h-3 text-[#946069]" />
              <span>{confirmingClear ? 'Confirm Clear?' : 'Clear'}</span>
            </button>
          )}

          {!isCollapsed && (
            <button
              onClick={handleExportCSV}
              disabled={transactions.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#763698]/60 text-[11px] font-mono text-[#D1B9B3] hover:text-[#F8F0E7] transition-all disabled:opacity-40"
              title="Export CSV"
            >
              <FileDown className="w-3 h-3 text-[#D1B9B3]" />
              <span>Export</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-[11px] font-mono px-2.5 py-1 rounded-xl bg-[#231A2D] border border-[#3C2E49] hover:border-[#763698]/60 text-[#9B97A2] hover:text-[#F8F0E7] transition-colors"
          >
            {isCollapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
      </div>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div className="mt-3.5 pt-3.5 border-t border-[#2B2135] animate-in fade-in duration-200">
          {/* Search Input and Collapsible Tabs Button */}
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by ref, phone or note..."
                className="w-full bg-[#140E1B] border border-[#382B44] rounded-2xl pl-8 pr-3.5 py-2 text-xs font-mono text-[#F8F0E7] placeholder-[#554653] focus:outline-none focus:border-[#763698]"
              />
              <Search className="w-3.5 h-3.5 text-[#9B97A2] absolute left-3 top-2.5" />
            </div>

            {/* Collapsible Tabs Toggle Button */}
            <button
              type="button"
              onClick={() => setIsTabsOpen(!isTabsOpen)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl border text-xs font-medium transition-all shrink-0 ${
                isTabsOpen || activeFilter !== 'all'
                  ? 'bg-[#763698]/20 border-[#763698]/60 text-[#F8F0E7]'
                  : 'bg-[#140E1B] border-[#382B44] text-[#9B97A2] hover:text-[#F8F0E7] hover:border-[#554653]'
              }`}
              title={isTabsOpen ? 'Collapse tabs' : 'Expand tabs'}
              aria-expanded={isTabsOpen}
            >
              <Filter className="w-3 h-3 text-[#D1B9B3]" />
              <span>{activeFilter === 'all' ? 'Tabs' : FILTER_LABELS[activeFilter]}</span>
              <ChevronDown
                className={`w-3 h-3 text-[#9B97A2] transition-transform duration-200 ${
                  isTabsOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>

      {/* Filter Tabs - Collapsible (collapsed by default) */}
      {isTabsOpen && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 mb-3.5 no-scrollbar animate-in fade-in duration-150">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-xl whitespace-nowrap transition-all ${
              activeFilter === 'all'
                ? 'bg-[#763698] text-[#F8F0E7] font-semibold shadow-sm'
                : 'text-[#9B97A2] hover:text-[#F8F0E7] hover:bg-[#23192D]'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setActiveFilter('buy_btc')}
            className={`px-3 py-1.5 text-xs font-medium rounded-xl whitespace-nowrap transition-all ${
              activeFilter === 'buy_btc'
                ? 'bg-[#763698]/25 text-[#D1B9B3] border border-[#763698]/50 font-semibold'
                : 'text-[#9B97A2] hover:text-[#F8F0E7] hover:bg-[#23192D]'
            }`}
          >
            Buy Sats
          </button>
          <button
            onClick={() => setActiveFilter('sell_btc')}
            className={`px-3 py-1.5 text-xs font-medium rounded-xl whitespace-nowrap transition-all ${
              activeFilter === 'sell_btc'
                ? 'bg-[#946069]/25 text-[#D1B9B3] border border-[#946069]/50 font-semibold'
                : 'text-[#9B97A2] hover:text-[#F8F0E7] hover:bg-[#23192D]'
            }`}
          >
            Sell Sats
          </button>
          <button
            onClick={() => setActiveFilter('send_mpesa')}
            className={`px-3 py-1.5 text-xs font-medium rounded-xl whitespace-nowrap transition-all ${
              activeFilter === 'send_mpesa'
                ? 'bg-[#554653]/40 text-[#D1B9B3] border border-[#554653] font-semibold'
                : 'text-[#9B97A2] hover:text-[#F8F0E7] hover:bg-[#23192D]'
            }`}
          >
            M-Pesa
          </button>
          <button
            onClick={() => setActiveFilter('send_telebirr')}
            className={`px-3 py-1.5 text-xs font-medium rounded-xl whitespace-nowrap transition-all ${
              activeFilter === 'send_telebirr'
                ? 'bg-[#3C2E49] text-[#D1B9B3] border border-[#554653] font-semibold'
                : 'text-[#9B97A2] hover:text-[#F8F0E7] hover:bg-[#23192D]'
            }`}
          >
            Telebirr
          </button>
        </div>
      )}

      {/* Transactions List */}
      <div className="divide-y divide-[#2B2135]">
        {filteredTransactions.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#9B97A2] font-mono">
            No transactions found matching criteria.
          </div>
        ) : (
          filteredTransactions.map((tx) => (
            <button
              key={tx.id}
              onClick={() => onSelectTransaction(tx)}
              className="w-full py-3 px-2 flex items-center justify-between text-left hover:bg-[#231A2D]/70 rounded-2xl transition-all group min-h-[58px]"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-9 h-9 rounded-2xl bg-[#140E1B] border border-[#3C2E49] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  {getTxIcon(tx.type)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-[#F8F0E7] truncate group-hover:text-[#D1B9B3] transition-colors">
                    {tx.title}
                  </div>
                  {/* Clean unboxed metadata with typographic separators */}
                  <div className="flex items-center gap-1.5 text-[11px] text-[#9B97A2] font-mono mt-0.5 truncate">
                    <span>{formatRelativeTime(tx.timestamp)}</span>
                    <span aria-hidden="true" className="text-[#554653]">·</span>
                    <span className="truncate">{tx.referenceNumber.substring(0, 14)}...</span>
                  </div>
                </div>
              </div>

              {/* Right side amount */}
              <div className="flex items-center gap-2 pl-2 shrink-0">
                <div className="text-right font-mono">
                  <div className="text-xs font-bold text-[#F8F0E7] tabular-nums">
                    {tx.type === 'buy_btc' && tx.toAmount
                      ? `+${(tx.toCurrency === 'BTC' ? Math.round(tx.toAmount * 100_000_000) : tx.toAmount).toLocaleString()} Sats`
                      : tx.type === 'sell_btc' && tx.toAmount
                      ? `+${tx.toAmount.toLocaleString()} ${tx.toCurrency}`
                      : `-${(tx.fromCurrency === 'BTC' ? Math.round(tx.fromAmount * 100_000_000) : tx.fromAmount).toLocaleString()} ${tx.fromCurrency === 'SATS' || tx.fromCurrency === 'BTC' ? 'Sats' : tx.fromCurrency}`}
                  </div>
                  <div className="text-[10px] text-[#9B97A2]">
                    {tx.type === 'buy_btc'
                      ? `-${tx.fromAmount.toLocaleString()} ${tx.fromCurrency}`
                      : tx.type === 'sell_btc'
                      ? `-${(tx.fromCurrency === 'BTC' ? Math.round(tx.fromAmount * 100_000_000) : tx.fromAmount).toLocaleString()} Sats`
                      : 'Completed'}
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-[#554653] group-hover:text-[#D1B9B3] group-hover:translate-x-0.5 transition-all" />
              </div>
            </button>
          ))
        )}
      </div>
        </div>
      )}
    </div>
  );
};

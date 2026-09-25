import React, { useState } from 'react';
import { Transaction, TransactionType } from '../types';
import { Search, ArrowDownLeft, ArrowUpRight, Send, ArrowRight, ChevronRight, FileDown } from 'lucide-react';

interface TransactionHistoryProps {
  transactions: Transaction[];
  onSelectTransaction: (tx: Transaction) => void;
  onClearHistory?: () => void;
}

export const TransactionHistory: React.FC<TransactionHistoryProps> = ({
  transactions,
  onSelectTransaction,
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | TransactionType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTransactions = transactions.filter((tx) => {
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
        return <ArrowDownLeft className="w-4 h-4 text-amber-400" />;
      case 'sell_btc':
        return <ArrowUpRight className="w-4 h-4 text-amber-400" />;
      case 'send_mpesa':
        return <Send className="w-3.5 h-3.5 text-emerald-400" />;
      case 'send_telebirr':
        return <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />;
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
    link.setAttribute('download', `altradits_history_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-neutral-900/60 border border-neutral-800/80 rounded-2xl p-4">
      {/* Title & Actions */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold text-white">Transaction History</h2>
          <div className="text-[11px] text-neutral-400">
            {transactions.length} verified operations recorded
          </div>
        </div>

        <button
          onClick={handleExportCSV}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-[11px] font-mono text-neutral-300 transition-colors"
          title="Export CSV"
        >
          <FileDown className="w-3 h-3" />
          <span>Export</span>
        </button>
      </div>

      {/* Search Input */}
      <div className="relative mb-3">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by ref, phone or note..."
          className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-8 pr-3 py-1.5 text-xs font-mono text-white placeholder-neutral-600 focus:outline-none focus:border-neutral-700"
        />
        <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-2.5" />
      </div>

      {/* Filter Tabs (Interactive Segmented Control) */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1.5 mb-3 no-scrollbar">
        <button
          onClick={() => setActiveFilter('all')}
          className={`px-2.5 py-1 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
            activeFilter === 'all'
              ? 'bg-neutral-800 text-white font-semibold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setActiveFilter('buy_btc')}
          className={`px-2.5 py-1 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
            activeFilter === 'buy_btc'
              ? 'bg-amber-500/20 text-amber-400 font-semibold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          Buy BTC
        </button>
        <button
          onClick={() => setActiveFilter('sell_btc')}
          className={`px-2.5 py-1 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
            activeFilter === 'sell_btc'
              ? 'bg-amber-500/20 text-amber-400 font-semibold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          Sell BTC
        </button>
        <button
          onClick={() => setActiveFilter('send_mpesa')}
          className={`px-2.5 py-1 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
            activeFilter === 'send_mpesa'
              ? 'bg-emerald-500/20 text-emerald-400 font-semibold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          M-Pesa
        </button>
        <button
          onClick={() => setActiveFilter('send_telebirr')}
          className={`px-2.5 py-1 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
            activeFilter === 'send_telebirr'
              ? 'bg-cyan-500/20 text-cyan-400 font-semibold'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          Telebirr
        </button>
      </div>

      {/* Transactions List */}
      <div className="divide-y divide-neutral-850">
        {filteredTransactions.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-500 font-mono">
            No transactions found matching criteria.
          </div>
        ) : (
          filteredTransactions.map((tx) => (
            <button
              key={tx.id}
              onClick={() => onSelectTransaction(tx)}
              className="w-full py-2.5 px-1.5 flex items-center justify-between text-left hover:bg-neutral-850/60 rounded-xl transition-colors group min-h-[56px]"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-8 h-8 rounded-xl bg-neutral-950 border border-neutral-800 flex items-center justify-center shrink-0">
                  {getTxIcon(tx.type)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-white truncate group-hover:text-amber-300 transition-colors">
                    {tx.title}
                  </div>
                  {/* Clean unboxed metadata with typographic separators */}
                  <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 font-mono mt-0.5 truncate">
                    <span>{formatRelativeTime(tx.timestamp)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate">{tx.referenceNumber.substring(0, 14)}...</span>
                  </div>
                </div>
              </div>

              {/* Right side amount */}
              <div className="flex items-center gap-2 pl-2 shrink-0">
                <div className="text-right font-mono">
                  <div className="text-xs font-bold text-white tabular-nums">
                    {tx.type === 'buy_btc' && tx.toAmount
                      ? `+${tx.toAmount} BTC`
                      : tx.type === 'sell_btc' && tx.toAmount
                      ? `+${tx.toAmount.toLocaleString()} ${tx.toCurrency}`
                      : `-${tx.fromAmount.toLocaleString()} ${tx.fromCurrency}`}
                  </div>
                  <div className="text-[10px] text-neutral-500">
                    {tx.type === 'buy_btc'
                      ? `-${tx.fromAmount.toLocaleString()} ${tx.fromCurrency}`
                      : tx.type === 'sell_btc'
                      ? `-${tx.fromAmount} BTC`
                      : 'Completed'}
                  </div>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-neutral-600 group-hover:text-neutral-400 group-hover:translate-x-0.5 transition-all" />
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

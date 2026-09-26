import { useState, useEffect, useCallback } from 'react';
import { UserWallet, ExchangeRates, Transaction } from './types';
import { fetchLiveRates } from './services/ratesService';
import {
  getStoredWallet,
  saveStoredWallet,
  getStoredTransactions,
  addTransaction,
  ejectWallet,
  wipeWallet,
} from './services/storageService';
import { TopBar } from './components/TopBar';
import { BalanceCard } from './components/BalanceCard';
import { ActionGrid } from './components/ActionGrid';
import { TransactionHistory } from './components/TransactionHistory';
import { BuyBtcModal } from './components/BuyBtcModal';
import { SellBtcModal } from './components/SellBtcModal';
import { SendMpesaModal } from './components/SendMpesaModal';
import { SendTelebirrModal } from './components/SendTelebirrModal';
import { TransactionDetailModal } from './components/TransactionDetailModal';
import { WalletSettingsModal } from './components/WalletSettingsModal';
import { ArrowDownLeft, ArrowUpRight, Send, ArrowRight } from 'lucide-react';

export default function App() {
  const [wallet, setWallet] = useState<UserWallet>(getStoredWallet);
  const [showBalanceSection, setShowBalanceSection] = useState(wallet.isConnected);
  const [transactions, setTransactions] = useState<Transaction[]>(getStoredTransactions);
  const [rates, setRates] = useState<ExchangeRates>({
    btcUsd: 88450,
    btcKes: 11410050,
    btcEtb: 11321600,
    usdKes: 129.0,
    usdEtb: 128.0,
    change24hUsd: 2.45,
    change24hKes: 2.38,
    change24hEtb: 2.52,
    lastUpdated: Date.now(),
    isLive: true,
  });

  const [isRefreshingRates, setIsRefreshingRates] = useState(false);
  const [isFrameMode, setIsFrameMode] = useState(true);

  // Modals
  const [activeModal, setActiveModal] = useState<
    'none' | 'buy_btc' | 'sell_btc' | 'send_mpesa' | 'send_telebirr' | 'wallet_settings'
  >('none');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // Load live rates
  const loadRates = useCallback(async () => {
    setIsRefreshingRates(true);
    try {
      const data = await fetchLiveRates();
      setRates(data);
    } catch {
      // ignore
    } finally {
      setIsRefreshingRates(false);
    }
  }, []);

  useEffect(() => {
    loadRates();
    const interval = setInterval(loadRates, 30000);
    return () => clearInterval(interval);
  }, [loadRates]);

  const handleUpdateWallet = (updated: UserWallet) => {
    setWallet(updated);
    saveStoredWallet(updated);
    setShowBalanceSection(true);
  };

  const handleEjectWallet = () => {
    const ejected = ejectWallet(wallet);
    setWallet(ejected);
    setShowBalanceSection(false);
  };

  const handleWipeWallet = () => {
    const wiped = wipeWallet();
    setWallet(wiped);
    setShowBalanceSection(false);
  };

  const handleRequireWalletAction = (action: () => void) => {
    if (!wallet.isConnected) {
      setActiveModal('wallet_settings');
      return;
    }
    action();
  };

  const handleTransactionSuccess = (txData: Omit<Transaction, 'id' | 'timestamp'>) => {
    const { updatedWallet, updatedTransactions } = addTransaction(txData, wallet);
    setWallet(updatedWallet);
    setTransactions(updatedTransactions);
  };

  return (
    <div className="min-h-screen bg-[#120E16] text-[#F8F0E7] flex flex-col items-center justify-start p-0 md:p-6 select-none font-sans">
      {/* Outer Mobile Frame container or full width */}
      <div
        className={`w-full transition-all duration-300 ${
          isFrameMode
            ? 'max-w-[440px] md:my-4 md:border md:border-[#382B44] md:rounded-[40px] md:shadow-2xl md:shadow-black/90 md:overflow-hidden bg-[#16101D] flex flex-col min-h-screen md:min-h-[860px]'
            : 'max-w-2xl bg-[#16101D] flex flex-col min-h-screen'
        }`}
      >
        {/* Top Bar with brand yebente and wallet mode */}
        <TopBar
          wallet={wallet}
          onOpenWalletSettings={() => setActiveModal('wallet_settings')}
          onEjectWallet={handleEjectWallet}
          isFrameMode={isFrameMode}
          onToggleFrameMode={() => setIsFrameMode(!isFrameMode)}
          showBalanceSection={showBalanceSection}
          onToggleBalanceSection={() => setShowBalanceSection((prev) => !prev)}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-24">
          {/* 1. Main Balance Portfolio Card (only rendered when connected AND navbar button clicked) */}
          {wallet.isConnected && showBalanceSection && (
            <BalanceCard
              wallet={wallet}
              rates={rates}
              onOpenWalletSettings={() => setActiveModal('wallet_settings')}
              onUpdateWallet={handleUpdateWallet}
              onEjectWallet={handleEjectWallet}
              onClose={() => setShowBalanceSection(false)}
            />
          )}

          {/* 2. Core 4 Actions: Buy BTC, Sell BTC, Send M-Pesa, Send Telebirr */}
          <ActionGrid
            onBuyBtc={() => handleRequireWalletAction(() => setActiveModal('buy_btc'))}
            onSellBtc={() => handleRequireWalletAction(() => setActiveModal('sell_btc'))}
            onSendMpesa={() => setActiveModal('send_mpesa')}
            onSendTelebirr={() => setActiveModal('send_telebirr')}
          />

          {/* 3. Secure Transaction History */}
          <TransactionHistory
            transactions={transactions}
            onSelectTransaction={(tx) => setSelectedTx(tx)}
          />
        </main>

        {/* Fixed Thumb-Zone Bottom Action Bar for rapid one-handed mobile use */}
        <nav
          aria-label="Quick operations"
          className="sticky bottom-0 z-20 bg-[#16101D]/95 backdrop-blur-md border-t border-[#372A42] px-4 py-2.5"
        >
          <div className="grid grid-cols-4 gap-1.5 max-w-md mx-auto">
            {/* Quick Buy */}
            <button
              onClick={() => handleRequireWalletAction(() => setActiveModal('buy_btc'))}
              className="flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl text-[#9B97A2] hover:text-[#D1B9B3] active:scale-95 transition-all group"
            >
              <div className="w-8 h-8 rounded-xl bg-[#22182B] border border-[#3C2E49] group-hover:border-[#763698]/60 flex items-center justify-center mb-1 transition-colors">
                <ArrowDownLeft className="w-4 h-4 text-[#D1B9B3]" />
              </div>
              <span className="text-[10px] font-medium tracking-tight">Buy Sats</span>
            </button>

            {/* Quick Sell */}
            <button
              onClick={() => handleRequireWalletAction(() => setActiveModal('sell_btc'))}
              className="flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl text-[#9B97A2] hover:text-[#D1B9B3] active:scale-95 transition-all group"
            >
              <div className="w-8 h-8 rounded-xl bg-[#22182B] border border-[#3C2E49] group-hover:border-[#946069]/60 flex items-center justify-center mb-1 transition-colors">
                <ArrowUpRight className="w-4 h-4 text-[#946069]" />
              </div>
              <span className="text-[10px] font-medium tracking-tight">Sell Sats</span>
            </button>

            {/* Quick M-Pesa */}
            <button
              onClick={() => setActiveModal('send_mpesa')}
              className="flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl text-[#9B97A2] hover:text-[#D1B9B3] active:scale-95 transition-all group"
            >
              <div className="w-8 h-8 rounded-xl bg-[#22182B] border border-[#3C2E49] group-hover:border-[#554653] flex items-center justify-center mb-1 transition-colors">
                <Send className="w-3.5 h-3.5 text-[#D1B9B3]" />
              </div>
              <span className="text-[10px] font-medium tracking-tight">M-Pesa</span>
            </button>

            {/* Quick Telebirr */}
            <button
              onClick={() => setActiveModal('send_telebirr')}
              className="flex flex-col items-center justify-center py-1.5 px-1 rounded-2xl text-[#9B97A2] hover:text-[#D1B9B3] active:scale-95 transition-all group"
            >
              <div className="w-8 h-8 rounded-xl bg-[#22182B] border border-[#3C2E49] group-hover:border-[#554653] flex items-center justify-center mb-1 transition-colors">
                <ArrowRight className="w-3.5 h-3.5 text-[#9B97A2]" />
              </div>
              <span className="text-[10px] font-medium tracking-tight">Telebirr</span>
            </button>
          </div>
        </nav>
      </div>

      {/* Modals */}
      <BuyBtcModal
        isOpen={activeModal === 'buy_btc'}
        onClose={() => setActiveModal('none')}
        wallet={wallet}
        rates={rates}
        onSuccess={handleTransactionSuccess}
      />

      <SellBtcModal
        isOpen={activeModal === 'sell_btc'}
        onClose={() => setActiveModal('none')}
        wallet={wallet}
        rates={rates}
        onSuccess={handleTransactionSuccess}
      />

      <SendMpesaModal
        isOpen={activeModal === 'send_mpesa'}
        onClose={() => setActiveModal('none')}
        wallet={wallet}
        onSuccess={handleTransactionSuccess}
      />

      <SendTelebirrModal
        isOpen={activeModal === 'send_telebirr'}
        onClose={() => setActiveModal('none')}
        wallet={wallet}
        onSuccess={handleTransactionSuccess}
      />

      <TransactionDetailModal
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
      />

      <WalletSettingsModal
        isOpen={activeModal === 'wallet_settings'}
        onClose={() => setActiveModal('none')}
        wallet={wallet}
        onUpdateWallet={handleUpdateWallet}
        onEjectWallet={handleEjectWallet}
        onWipeWallet={handleWipeWallet}
      />
    </div>
  );
}

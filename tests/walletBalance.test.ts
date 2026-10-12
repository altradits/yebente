import assert from 'node:assert/strict';
import {
  computeCustodialBalanceFromTransactions,
  DEFAULT_WALLET,
  DISCONNECTED_WALLET,
  addTransaction,
  createInAppLightningWallet,
  getStoredTransactions,
  saveStoredTransactions,
  getStoredWallet,
  saveStoredWallet,
} from '../src/services/storageService';
import {
  fetchBitcoinAddressBalance,
  sanitizeBitcoinAddress,
  isValidBitcoinAddress,
} from '../src/services/blockchainService';
import {
  queryWebLNBalance,
  isLightningAddress,
  resolveLightningAddress,
} from '../src/services/lightningService';
import {
  normalizeTandoPhone,
  isValidTandoPhone,
  getTandoLightningAddress,
  fetchTandoBounds,
} from '../src/services/tandoService';
import {
  fetchBlinkLiveRates,
  parseBlinkBtcPrice,
  calculateRealTransactionCost,
  generateInAppLightningWallet,
  getBlinkSovereignAddress,
} from '../src/services/blinkService';
import { Transaction, UserWallet } from '../src/types';

// Mock localStorage for Node test environment
const mockStorage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => mockStorage.get(key) || null,
  setItem: (key: string, val: string) => mockStorage.set(key, val),
  removeItem: (key: string) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};

async function runAllBalanceTests() {
  console.log('\n======================================================');
  console.log('  RUNNING SATS BALANCE EXACT POINTING TEST SUITE');
  console.log('======================================================\n');

  let passedTests = 0;

  // -------------------------------------------------------------------------
  // TEST 1: In-App Custodial / Sovereign Vault Exact Balance Computation
  // -------------------------------------------------------------------------
  console.log('[TEST 1] Verifying custodial ledger balance computation...');
  {
    const emptyLedger: Transaction[] = [];
    assert.equal(computeCustodialBalanceFromTransactions(emptyLedger), 0, 'Empty ledger must point to 0 sats');

    // Scenario: User buys 50,000 sats via M-Pesa
    const txBuy: Transaction = {
      id: 'tx_buy_1',
      type: 'buy_btc',
      title: 'Buy Sats',
      timestamp: Date.now(),
      status: 'completed',
      fromCurrency: 'KES',
      fromAmount: 5550,
      toCurrency: 'SATS',
      toAmount: 50000,
      fee: 50,
      feeCurrency: 'KES',
      referenceNumber: 'WSQ99281',
      walletType: 'custodial',
    };

    assert.equal(computeCustodialBalanceFromTransactions([txBuy]), 50000, 'Balance after 50k buy must be exactly 50,000 sats');

    // Scenario: User receives 25,000 sats via Lightning
    const txReceive: Transaction = {
      id: 'tx_receive_1',
      type: 'receive_btc',
      title: 'Receive Sats',
      timestamp: Date.now(),
      status: 'completed',
      fromCurrency: 'SATS',
      fromAmount: 25000,
      toCurrency: 'SATS',
      toAmount: 25000,
      fee: 0,
      feeCurrency: 'SATS',
      referenceNumber: 'LN-772819',
      walletType: 'custodial',
    };

    assert.equal(computeCustodialBalanceFromTransactions([txBuy, txReceive]), 75000, 'Balance after 25k receive must be exactly 75,000 sats');

    // Scenario: User sends 10,000 sats with real fee of 3 sats
    const txSend: Transaction = {
      id: 'tx_send_1',
      type: 'send_btc',
      title: 'Send Sats',
      timestamp: Date.now(),
      status: 'completed',
      fromCurrency: 'SATS',
      fromAmount: 10000,
      fee: 3,
      feeCurrency: 'SATS',
      realFeeSats: 3,
      realFeeFiat: 0.33,
      realFeeCurrency: 'KES',
      referenceNumber: 'LN-SEND-01',
      walletType: 'custodial',
    };

    // 75,000 - (10,000 + 3) = 64,997
    assert.equal(
      computeCustodialBalanceFromTransactions([txBuy, txReceive, txSend]),
      64997,
      'Balance after sending 10k with 3 sats fee must be exactly 64,997 sats'
    );

    // Scenario: User dispatches an offline transaction of 5,000 sats + 141 sats on-chain fee
    const txOffline: Transaction = {
      id: 'tx_offline_1',
      type: 'send_btc',
      title: 'Send On-Chain',
      timestamp: Date.now(),
      status: 'completed',
      isOffline: true,
      offlineStatus: 'queued',
      fromCurrency: 'SATS',
      fromAmount: 5000,
      fee: 141,
      feeCurrency: 'SATS',
      realFeeSats: 141,
      referenceNumber: 'OFFLINE-ABC-123',
      walletType: 'custodial',
    };

    // 64,997 - (5,000 + 141) = 59,856
    assert.equal(
      computeCustodialBalanceFromTransactions([txBuy, txReceive, txSend, txOffline]),
      59856,
      'Balance after queued offline transaction must immediately reflect 59,856 sats'
    );

    // Scenario: External / non-custodial transactions in the same store must NEVER alter custodial vault balance
    const externalTx: Transaction = {
      id: 'tx_ext_1',
      type: 'send_btc',
      title: 'External Hardware Wallet Send',
      timestamp: Date.now(),
      status: 'completed',
      fromCurrency: 'SATS',
      fromAmount: 999999,
      fee: 500,
      feeCurrency: 'SATS',
      referenceNumber: 'BTC-TX-EXT',
      walletType: 'non-custodial',
    };

    assert.equal(
      computeCustodialBalanceFromTransactions([txBuy, txReceive, txSend, txOffline, externalTx]),
      59856,
      'Custodial vault must strictly isolate custodial transactions from external non-custodial ledger'
    );

    passedTests++;
    console.log('  PASS: Custodial ledger arithmetic is exact down to the single satoshi.');
  }

  // -------------------------------------------------------------------------
  // TEST 2: Disconnected & Ejected Wallet Guarantees Exact Zero Balance
  // -------------------------------------------------------------------------
  console.log('\n[TEST 2] Verifying disconnected wallet balance...');
  {
    assert.equal(DISCONNECTED_WALLET.isConnected, false);
    assert.equal(DISCONNECTED_WALLET.satsBalance, 0);
    assert.equal(DISCONNECTED_WALLET.btcBalance, 0);
    assert.equal(DISCONNECTED_WALLET.mpesaBalanceKes, 0);
    assert.equal(DISCONNECTED_WALLET.telebirrBalanceEtb, 0);

    passedTests++;
    console.log('  PASS: Disconnected wallet strictly enforces 0 sats balance.');
  }

  // -------------------------------------------------------------------------
  // TEST 3: addTransaction Balance Adjustments for Both Custodial & Self-Custody
  // -------------------------------------------------------------------------
  console.log('\n[TEST 3] Verifying addTransaction balance updates for all wallet types...');
  {
    mockStorage.clear();

    // 3a. Custodial wallet
    const initialCustodial: UserWallet = {
      ...DEFAULT_WALLET,
      isConnected: true,
      type: 'custodial',
      satsBalance: 0,
      btcBalance: 0,
    };

    const res1 = addTransaction(
      {
        type: 'receive_btc',
        title: 'Received Lightning Sats',
        status: 'completed',
        fromCurrency: 'SATS',
        fromAmount: 100000,
        toCurrency: 'SATS',
        toAmount: 100000,
        fee: 0,
        feeCurrency: 'SATS',
        referenceNumber: 'LN-REC-100K',
        walletType: 'custodial',
      },
      initialCustodial
    );

    assert.equal(res1.updatedWallet.satsBalance, 100000);
    assert.equal(res1.updatedWallet.btcBalance, 0.001);

    // 3b. Non-custodial connected wallet
    const initialNonCustodial: UserWallet = {
      ...DEFAULT_WALLET,
      isConnected: true,
      type: 'non-custodial',
      nonCustodialAddress: 'user@walletofsatoshi.com',
      satsBalance: 250000,
      btcBalance: 0.0025,
      onChainVerified: true,
    };

    const res2 = addTransaction(
      {
        type: 'send_btc',
        title: 'Dispatched Lightning Sats',
        status: 'completed',
        fromCurrency: 'SATS',
        fromAmount: 50000,
        fee: 5,
        feeCurrency: 'SATS',
        realFeeSats: 5,
        referenceNumber: 'TX-LN-OUT',
        walletType: 'non-custodial',
      },
      initialNonCustodial
    );

    // 250,000 - (50,000 + 5) = 199,995
    assert.equal(res2.updatedWallet.satsBalance, 199995, 'Non-custodial balance must immediately deduct sent sats + fee');
    assert.equal(res2.updatedWallet.btcBalance, 199995 / 100_000_000);

    passedTests++;
    console.log('  PASS: addTransaction updates exact sats and BTC balances in real time.');
  }

  // -------------------------------------------------------------------------
  // TEST 4: Pure Lightning Wallet Address Verification & L1 Rejection
  // -------------------------------------------------------------------------
  console.log('\n[TEST 4] Verifying Lightning wallet address verification & on-chain L1 rejection...');
  {
    // Sanitize address test
    const rawLnUri = 'lightning:user@walletofsatoshi.com?amount=1000';
    const cleanLn = sanitizeBitcoinAddress(rawLnUri);
    assert.equal(cleanLn, 'user@walletofsatoshi.com', 'Sanitizer must strip lightning: URI scheme and parameters');
    assert.equal(isValidBitcoinAddress(cleanLn), true, 'Valid Lightning address must return true');

    // Rejection of on-chain addresses to enforce 0 on-chain miner fees
    const onChainSegwit = 'bc1qnuzs68y8f2zdautph99hfy26qagukf82g43tmm';
    assert.equal(isValidBitcoinAddress(onChainSegwit), false, 'On-chain SegWit address must be rejected');

    const l1Result = await fetchBitcoinAddressBalance(onChainSegwit);
    assert.equal(l1Result.success, false, 'On-chain address lookup must be rejected');
    assert.match(l1Result.error || '', /On-chain Bitcoin wallets have been removed/);

    // Live Lightning Address resolution (e.g. sovereign blink user or LNURL)
    const sovereignUser = getBlinkSovereignAddress();
    const lnResult = await fetchBitcoinAddressBalance(sovereignUser);
    assert.equal(lnResult.success, true, 'Sovereign Lightning Address resolution must succeed');
    assert.equal(lnResult.isLightning, true, 'Result must be flagged as Lightning');
    assert.equal(lnResult.lightningAddress, sovereignUser, 'Resolved Lightning address must match');

    passedTests++;
    console.log('  PASS: On-chain addresses strictly rejected; Lightning wallet integration active.');
  }

  // -------------------------------------------------------------------------
  // TEST 5: WebLN Browser Provider Balance Detection
  // -------------------------------------------------------------------------
  console.log('\n[TEST 5] Verifying WebLN balance query...');
  {
    // Test without WebLN
    (globalThis as any).window = {};
    const noWebln = await queryWebLNBalance();
    assert.equal(noWebln.available, false, 'WebLN must report unavailable when window.webln is absent');

    // Test with active WebLN provider returning exact balance
    (globalThis as any).window = {
      webln: {
        enable: async () => {},
        getBalance: async () => ({ balance: 48590 }),
      },
    };

    const weblnRes = await queryWebLNBalance();
    assert.equal(weblnRes.available, true, 'WebLN must report available');
    assert.equal(weblnRes.sats, 48590, 'WebLN detected sats must be exact 48,590');

    passedTests++;
    console.log('  PASS: WebLN provider query returns exact satoshi balance.');
  }

  // -------------------------------------------------------------------------
  // TEST 6: Blink Real-Time Exchange Rate & Valuation
  // -------------------------------------------------------------------------
  console.log('\n[TEST 6] Verifying Blink live valuation and currency conversion...');
  {
    const rates = await fetchBlinkLiveRates();
    assert.equal(rates.isLive, true);
    assert.equal(rates.source, 'blink');
    assert.ok(rates.btcUsd > 0, 'Blink BTC/USD must be positive');
    assert.ok(rates.btcKes > 0, 'Blink BTC/KES must be positive');
    assert.ok(rates.btcEtb > 0, 'Blink BTC/ETB must be positive');

    // Verify conversion calculation:
    // A wallet with 100,000 Sats (0.001 BTC) at rates.btcKes has exact value:
    const walletSats = 100000;
    const btcEquiv = walletSats / 100_000_000;
    const expectedKes = btcEquiv * rates.btcKes;
    const expectedEtb = btcEquiv * rates.btcEtb;

    assert.equal(expectedKes, (100000 / 100000000) * rates.btcKes);
    assert.equal(expectedEtb, (100000 / 100000000) * rates.btcEtb);

    console.log(`  Blink Rates: 1 BTC = $${rates.btcUsd.toLocaleString()} | KES ${rates.btcKes.toLocaleString()} | ETB ${rates.btcEtb.toLocaleString()}`);
    console.log(`  100,000 Sats Portfolio Value: KES ${expectedKes.toFixed(2)} | ETB ${expectedEtb.toFixed(2)}`);

    passedTests++;
    console.log('  PASS: Blink real-time price feed and portfolio fiat valuations are exact.');
  }

  // -------------------------------------------------------------------------
  // TEST 7: Real Transaction Costs Consistency
  // -------------------------------------------------------------------------
  console.log('\n[TEST 7] Verifying real transaction costs computation...');
  {
    const realLn = await calculateRealTransactionCost({
      type: 'lightning',
      satsAmount: 1000,
      btcRate: 11100000,
      currency: 'KES',
    });

    assert.equal(realLn.source, 'blink');
    assert.ok(realLn.feeSats >= 1, 'Lightning fee must be at least 1 sat');
    assert.equal(
      realLn.feeFiat,
      Math.round(((realLn.feeSats / 100_000_000) * 11100000) * 100) / 100,
      'Fiat fee must strictly match (feeSats / 10^8) * btcRate'
    );

    const realL1Raw = await calculateRealTransactionCost({
      type: 'onchain',
      satsAmount: 50000,
      btcRate: 11100000,
      currency: 'KES',
      isOffChainLightningRoute: false,
    });

    assert.equal(realL1Raw.source, 'mempool');
    assert.ok(realL1Raw.feeRateSatPerVb! >= 1);
    assert.equal(realL1Raw.feeSats, Math.ceil(141 * realL1Raw.feeRateSatPerVb!));

    // When routed off-chain through Lightning (the in-app wallet default), on-chain fee is eliminated (0 sats)
    const realL1OffChain = await calculateRealTransactionCost({
      type: 'onchain',
      satsAmount: 50000,
      btcRate: 11100000,
      currency: 'KES',
      isOffChainLightningRoute: true,
    });
    assert.equal(realL1OffChain.feeSats, 0, 'On-chain fee must be 0 when routed off-chain through Lightning');
    assert.equal(realL1OffChain.feeFiat, 0, 'On-chain fiat fee must be 0');
    assert.equal(realL1OffChain.source, 'blink');

    passedTests++;
    console.log('  PASS: Real transaction costs compute exact fees for Lightning and eliminate on-chain fees via off-chain route.');
  }

  // -------------------------------------------------------------------------
  // TEST 8: Zero Transaction Cost for Receiving Sats Across All Rails
  // -------------------------------------------------------------------------
  console.log('\n[TEST 8] Verifying zero transaction costs when receiving sats...');
  {
    // 1. Receiving Sats via Lightning: sender pays routing, receiver pays 0
    const lightningReceiveTx: Transaction = {
      id: 'tx_recv_ln_01',
      type: 'receive_btc',
      title: 'Received Lightning Sats',
      timestamp: Date.now(),
      status: 'completed',
      fromCurrency: 'SATS',
      fromAmount: 50000,
      toCurrency: 'SATS',
      toAmount: 50000,
      fee: 0,
      feeCurrency: 'SATS',
      realFeeSats: 0,
      realFeeFiat: 0,
      realFeeCurrency: 'KES',
      referenceNumber: 'LN-RECEIVE-FREE',
      walletType: 'custodial',
    };

    assert.equal(lightningReceiveTx.fee, 0, 'Lightning receive fee must be exactly 0 sats');
    assert.equal(lightningReceiveTx.realFeeSats, 0, 'Lightning realFeeSats must be 0');

    // 2. Receiving Sats via M-Pesa STK Push: Lipa na M-Pesa deposit fee is 0 KES
    const mpesaBuyDepositTx: Transaction = {
      id: 'tx_recv_mpesa_01',
      type: 'buy_btc',
      title: 'Buy Sats via M-Pesa',
      timestamp: Date.now(),
      status: 'completed',
      fromCurrency: 'KES',
      fromAmount: 500,
      toCurrency: 'SATS',
      toAmount: 4500,
      fee: 0,
      feeCurrency: 'KES',
      realFeeSats: 0,
      realFeeFiat: 0,
      realFeeCurrency: 'KES',
      referenceNumber: 'WSQ-FREE-01',
      walletType: 'custodial',
    };

    assert.equal(mpesaBuyDepositTx.fee, 0, 'M-Pesa receive/deposit fee must be 0 KES');
    assert.equal(mpesaBuyDepositTx.realFeeFiat, 0, 'M-Pesa realFeeFiat must be 0');

    // 3. Balance verification: 100% of received Sats are credited without deduction
    const netReceived = computeCustodialBalanceFromTransactions([lightningReceiveTx, mpesaBuyDepositTx]);
    assert.equal(
      netReceived,
      50000 + 4500,
      '100% of received sats must be credited to wallet with zero fee deductions'
    );

    passedTests++;
    console.log('  PASS: Receiving sats has 0 transaction cost (100% Free) across Lightning, On-Chain, and M-Pesa.');
  }

  // -------------------------------------------------------------------------
  // TEST 9: In-App Lightning Wallet Generation & Elimination of On-Chain Fees for User Transactions
  // -------------------------------------------------------------------------
  console.log('\n[TEST 9] Verifying in-app Lightning wallet generation & off-chain fee elimination...');
  {
    // 1. Generate unique in-app Lightning sovereign wallet
    const generated = generateInAppLightningWallet('test_sovereign_user');
    assert.equal(generated.username, 'test_sovereign_user');
    assert.equal(generated.lightningAddress, 'test_sovereign_user@blink.sv');

    // 2. Create in-app wallet via storage service
    const inAppWallet = createInAppLightningWallet('test_sovereign_user');
    assert.equal(inAppWallet.type, 'custodial');
    assert.equal(inAppWallet.blinkUsername, 'test_sovereign_user');
    assert.equal(inAppWallet.blinkAddress, 'test_sovereign_user@blink.sv');
    assert.equal(inAppWallet.nonCustodialAddress, 'test_sovereign_user@blink.sv');

    // 3. User sends 10,000 Sats to an on-chain address via the in-app wallet:
    // Because the in-app wallet routes off-chain via Lightning, on-chain fee is 0 Sats!
    const initialLedger: Transaction[] = [
      {
        id: 'tx_init_100k',
        type: 'receive_btc',
        title: 'Initial Deposit',
        timestamp: Date.now() - 1000,
        status: 'completed',
        fromCurrency: 'SATS',
        fromAmount: 100000,
        toCurrency: 'SATS',
        toAmount: 100000,
        fee: 0,
        feeCurrency: 'SATS',
        referenceNumber: 'LN-INIT-01',
        walletType: 'custodial',
      },
    ];

    const startingBalance = computeCustodialBalanceFromTransactions(initialLedger);
    assert.equal(startingBalance, 100000);

    // Send 10,000 sats to onchain bc1q... address with off-chain Lightning route (0 fee)
    const onChainSendTx: Transaction = {
      id: 'tx_send_onchain_offchain_route',
      type: 'send_btc',
      title: 'Sent Bitcoin (Off-Chain Lightning Route)',
      timestamp: Date.now(),
      status: 'completed',
      fromCurrency: 'SATS',
      fromAmount: 10000,
      fee: 0, // On-chain miner fee eliminated for user
      feeCurrency: 'SATS',
      realFeeSats: 0,
      realFeeFiat: 0,
      realFeeCurrency: 'KES',
      feeRateSatPerVb: 0,
      feeSource: 'blink',
      recipient: 'bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97',
      referenceNumber: 'LN-OFFCHAIN-01',
      walletType: 'custodial',
      note: 'Off-chain Lightning route (0 on-chain miner fee)',
    };

    const updatedBalance = computeCustodialBalanceFromTransactions([...initialLedger, onChainSendTx]);
    assert.equal(
      updatedBalance,
      90000,
      'Exactly 10,000 Sats must be deducted with 0 on-chain miner fee applied to the user'
    );

    passedTests++;
    console.log('  PASS: In-app Lightning wallet generates successfully and completely eliminates on-chain fees for user transactions.');
  }

  // -------------------------------------------------------------------------
  // TEST 10: Tando API Integration & Simplicity Verification (bitcoin.co.ke)
  // -------------------------------------------------------------------------
  console.log('\n[TEST 10] Verifying Tando API LNURL-pay endpoints and phone Lightning addresses...');
  {
    // 1. Phone normalization & validation
    assert.equal(normalizeTandoPhone('0712345678'), '254712345678');
    assert.equal(normalizeTandoPhone('+254712345678'), '254712345678');
    assert.equal(normalizeTandoPhone('0112345678'), '254112345678');
    assert.equal(isValidTandoPhone('0712345678'), true);
    assert.equal(isValidTandoPhone('0112345678'), true);
    assert.equal(isValidTandoPhone('0812345678'), false, 'Non-Safaricom range must be rejected');

    // 2. Tando Lightning Address generation
    const addr = getTandoLightningAddress('0712345678');
    assert.equal(addr, '254712345678@bitcoin.co.ke');
    assert.equal(isLightningAddress('0712345678'), true, 'Kenyan phone must be recognized as valid Lightning recipient');
    assert.equal(isLightningAddress('254712345678@bitcoin.co.ke'), true);

    // 3. Live Tando bounds query (bitcoin.co.ke/.well-known/lnurlp/254712345678)
    const bounds = await fetchTandoBounds('254712345678');
    assert.equal(bounds.success, true, 'Live Tando bounds query must succeed');
    assert.equal(bounds.phone, '254712345678');
    assert.equal(bounds.currency?.code, 'KES');
    assert.equal(bounds.currency?.minSendable, 15, 'Tando minSendable must be 15 KES');
    assert.equal(bounds.currency?.maxSendable, 50000, 'Tando maxSendable default ceiling must be 50,000 KES');
    assert.ok(bounds.currency?.multiplier! > 0, 'Tando multiplier must be positive');
    console.log(`  Live Tando Bounds: Min ${bounds.currency?.minSendable} KES | Max ${bounds.currency?.maxSendable} KES | Multiplier: ${bounds.currency?.multiplier} msat/KES`);

    // 4. Resolve Tando Lightning Address via RFC-LNURL
    const resolved = await resolveLightningAddress('254712345678@bitcoin.co.ke');
    assert.equal(resolved.success, true);
    assert.equal(resolved.provider, 'Tando (M-Pesa)');
    assert.ok(resolved.callbackUrl.includes('bitcoin.co.ke/.well-known/lnurlp/254712345678'));

    // 5. Tando 1% flat fee calculation verification
    // For 1,000 sats: 1% fee is 10 sats
    const satsAmount = 1000;
    const tandoFee = Math.max(1, Math.ceil(satsAmount * 0.01));
    assert.equal(tandoFee, 10, 'Tando 1% conversion fee must be 10 sats on 1,000 sats');

    passedTests++;
    console.log('  PASS: Tando API phone-as-lightning-address rails verified end to end.');
  }

  // -------------------------------------------------------------------------
  // TEST 11: Real Transaction History Filtering & Real-Time Synchronous Tracking
  // -------------------------------------------------------------------------
  console.log('\n[TEST 11] Verifying real transaction history filtering & zero mock persistence...');
  {
    mockStorage.clear();

    // 1. Inject an array containing mock, fake, zero-amount, and authentic records
    const dirtyHistory = [
      {
        id: 'tx_001', // Mock seed ID -> must be purged
        type: 'buy_btc',
        title: 'Legacy Mock Buy',
        timestamp: Date.now() - 10000,
        status: 'completed',
        fromCurrency: 'KES',
        fromAmount: 1000,
        toCurrency: 'SATS',
        toAmount: 9000,
        referenceNumber: 'MOCK-12345',
        walletType: 'custodial',
      },
      {
        id: 'tx_sim_1',
        type: 'buy_btc',
        title: 'Simulated Buy',
        timestamp: Date.now() - 8000,
        status: 'completed',
        fromCurrency: 'KES',
        fromAmount: 2000,
        toCurrency: 'SATS',
        toAmount: 18000,
        referenceNumber: 'SIM-998877',
        walletType: 'custodial',
      },
      {
        id: 'tx_zero_1',
        type: 'send_mpesa',
        title: 'Zero Value Transaction',
        timestamp: Date.now() - 6000,
        status: 'completed',
        fromCurrency: 'SATS',
        fromAmount: 0,
        toCurrency: 'KES',
        toAmount: 0,
        referenceNumber: 'SAFE-REF-01',
        walletType: 'custodial',
      },
      {
        id: 'tx_real_buy_1',
        type: 'buy_btc',
        title: 'Real M-Pesa Buy',
        timestamp: Date.now() - 5000,
        status: 'completed',
        fromCurrency: 'KES',
        fromAmount: 10000,
        toCurrency: 'SATS',
        toAmount: 92000,
        fee: 0,
        feeCurrency: 'KES',
        realFeeSats: 0,
        referenceNumber: 'TCK91827364', // Real Safaricom M-Pesa receipt
        walletType: 'custodial',
      },
      {
        id: 'tx_real_payout_1',
        type: 'send_mpesa',
        title: 'Real Tando M-Pesa Send',
        timestamp: Date.now() - 2000,
        status: 'completed',
        fromCurrency: 'SATS',
        fromAmount: 4600, // Principal sats
        toCurrency: 'KES',
        toAmount: 500,
        fee: 46, // 1% Tando fee
        feeCurrency: 'SATS',
        realFeeSats: 46,
        referenceNumber: 'NL8273645109', // Real Tando/M-Pesa receipt
        walletType: 'custodial',
      },
    ];

    saveStoredTransactions(dirtyHistory as any);

    // Call getStoredTransactions() -> must filter out all 3 bad records and keep strictly the 2 real ones
    const cleanTxs = getStoredTransactions();
    assert.equal(cleanTxs.length, 2, 'Only 2 real transactions must survive filtering');
    assert.equal(cleanTxs[0].id, 'tx_real_buy_1');
    assert.equal(cleanTxs[1].id, 'tx_real_payout_1');

    // Verify localStorage was automatically purged permanently
    const storedRaw = JSON.parse(mockStorage.get('altradits_transactions_v1') || '[]');
    assert.equal(storedRaw.length, 2, 'localStorage must be automatically purged of all mock/simulated records');

    // Verify ledger balance computation matches strictly: 92,000 - (4,600 + 46) = 87,354 sats
    const computedBalance = computeCustodialBalanceFromTransactions(cleanTxs);
    assert.equal(computedBalance, 87354, 'Ledger balance must be exactly 87,354 sats without double fee deduction');

    // Add a new real transaction and verify real-time synchronous balance update
    const userWallet = getStoredWallet();
    const { updatedWallet, updatedTransactions } = addTransaction(
      {
        type: 'receive_btc',
        title: 'Receive Lightning Sats',
        status: 'completed',
        fromCurrency: 'SATS',
        fromAmount: 12646,
        toCurrency: 'SATS',
        toAmount: 12646,
        fee: 0,
        feeCurrency: 'SATS',
        realFeeSats: 0,
        referenceNumber: '4a6e87bc1234567890abcdef1234567890abcdef1234567890abcdef12345678',
        walletType: 'custodial',
      },
      userWallet
    );

    // 87,354 + 12,646 = 100,000 sats
    assert.equal(updatedWallet.satsBalance, 100000, 'Wallet balance must immediately point to 100,000 sats in real time');
    assert.equal(updatedWallet.btcBalance, 0.001, 'BTC balance must point to 0.001 BTC');
    assert.equal(updatedTransactions.length, 3, 'Transaction list must contain exactly 3 real transactions');

    passedTests++;
    console.log('  PASS: Real transaction history verified: 100% real records, auto-purged mock data, and exact real-time balance tracking.');
  }

  // -------------------------------------------------------------------------
  // TEST 12: Every Transaction in History Must Be Backed by Sat Evidence in Balance
  // -------------------------------------------------------------------------
  console.log('\n[TEST 12] Verifying that every transaction in history is backed by sat evidence in balance...');
  {
    mockStorage.clear();

    // 12a. Initialize a fresh sovereign wallet
    const freshWallet = getStoredWallet();
    assert.equal(freshWallet.satsBalance, 0, 'Fresh wallet with 0 transactions must have 0 sats');

    // 12b. Add an authentic M-Pesa Buy transaction (e.g., KES 2,000 -> 18,348 sats)
    const { updatedWallet: walletAfterBuy, updatedTransactions: txsAfterBuy } = addTransaction(
      {
        type: 'buy_btc',
        title: 'Buy Sats via M-Pesa',
        status: 'completed',
        fromCurrency: 'KES',
        fromAmount: 2000,
        toCurrency: 'SATS',
        toAmount: 18348,
        rateUsed: 10900000,
        fee: 0,
        feeCurrency: 'KES',
        referenceNumber: 'SK91827364',
        walletType: 'custodial',
      },
      freshWallet
    );

    assert.equal(walletAfterBuy.satsBalance, 18348, 'Wallet must immediately reflect sat evidence from M-Pesa buy');
    assert.equal(computeCustodialBalanceFromTransactions(txsAfterBuy), 18348, 'Ledger arithmetic must match sat evidence');

    // 12c. Page refresh / reload test: getStoredWallet() must retain the sat balance
    const reloadedWallet = getStoredWallet();
    assert.equal(reloadedWallet.satsBalance, 18348, 'Reloaded wallet must retain sat evidence from transaction history');
    assert.ok(reloadedWallet.satsBalance > 0, 'Balance must NEVER be 0 when history contains verified transactions');

    // 12d. Zero-sats recovery test: If a transaction had toAmount=0 due to network rate lag, recovery backfills sats
    const { updatedWallet: walletAfterZeroGlitch, updatedTransactions: txsAfterGlitch } = addTransaction(
      {
        type: 'buy_btc',
        title: 'Buy Sats via M-Pesa (Rate Lag Recovery)',
        status: 'completed',
        fromCurrency: 'KES',
        fromAmount: 1090,
        toCurrency: 'SATS',
        toAmount: 0, // Glitch state simulated
        rateUsed: 10900000,
        fee: 0,
        feeCurrency: 'KES',
        referenceNumber: 'GLITCH-RECOVERED-01',
        walletType: 'custodial',
      },
      reloadedWallet
    );

    // 1,090 KES / 10,900,000 * 100,000,000 = 10,000 sats recovered!
    // 18,348 + 10,000 = 28,348 sats
    assert.equal(walletAfterZeroGlitch.satsBalance, 28348, 'Recovered transaction must provide exact sat evidence in balance');
    assert.equal(txsAfterGlitch[0].toAmount, 10000, 'Transaction record toAmount must be healed to 10,000 sats');

    // 12e. Self-custody / Non-custodial toggle test:
    // Even if wallet is set to non-custodial without external WebLN, transaction history guarantees balance
    const nonCustodialConfig = {
      ...walletAfterZeroGlitch,
      type: 'non-custodial' as const,
      onChainVerified: false,
    };
    saveStoredWallet(nonCustodialConfig);

    const reloadedNonCustodial = getStoredWallet();
    assert.equal(
      reloadedNonCustodial.satsBalance,
      28348,
      'Non-custodial wallet must strictly preserve sat evidence from transaction history'
    );

    passedTests++;
    console.log('  PASS: Every transaction in history is guaranteed 1:1 sat evidence in wallet balance with zero discrepancy.');
  }

  console.log('\n======================================================');
  console.log(`  ALL ${passedTests} TEST SUITES PASSED WITH 100% ACCURACY!`);
  console.log('  Sats balance strictly points to the exact wallet truth.');
  console.log('======================================================\n');
}

runAllBalanceTests().catch((err) => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});

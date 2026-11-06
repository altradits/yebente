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
  getLocalHandle,
} from '../src/services/storageService';
import {
  fetchBitcoinAddressBalance,
  sanitizeBitcoinAddress,
  isValidBitcoinAddress,
} from '../src/services/blockchainService';
import {
  decodeLnurl,
  isLightningAddress,
  resolveLightningAddress,
} from '../src/services/lightningService';
import {
  extractKenyanSubscriberDigits,
  isValidKenyanPhone,
  formatKenyanPhone,
  formatKenyanDisplayPhone,
  extractEthiopianSubscriberDigits,
  isValidEthiopianPhone,
  formatEthiopianPhone,
  formatEthiopianDisplayPhone,
} from '../src/services/phone';
import {
  requestFiatQuote,
  startFiatTransfer,
  queryFiatStatus,
  newIdempotencyKey,
} from '../src/services/fiatService';
import {
  fetchLiveRates,
  getCachedRates,
  saveCachedRates,
} from '../src/services/ratesService';
import { Transaction, UserWallet } from '../src/types';

// Mock localStorage for Node test environment
const mockStorage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => mockStorage.get(key) || null,
  setItem: (key: string, val: string) => mockStorage.set(key, val),
  removeItem: (key: string) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};

// Stub fetch: route -> { status, body }
type Route = { status: number; body: unknown };
let routes: Record<string, Route> = {};
const seenRequests: { url: string; method: string; body: unknown }[] = [];
(globalThis as any).fetch = async (url: string, init?: { method?: string; body?: string }) => {
  const method = init?.method || 'GET';
  let body: unknown = null;
  try {
    body = init?.body ? JSON.parse(init.body) : null;
  } catch {
    body = init?.body;
  }
  seenRequests.push({ url, method, body });
  const key = `${method} ${url}`;
  const route = routes[key] || routes[url] || { status: 404, body: { success: false, error: 'Not found' } };
  return {
    ok: route.status >= 200 && route.status < 300,
    status: route.status,
    text: async () => JSON.stringify(route.body),
    json: async () => route.body,
  };
};

function resetState() {
  mockStorage.clear();
  routes = {};
  seenRequests.length = 0;
}

// Minimal bech32 encoder, so the LNURL decode test uses an
// independently encoded vector instead of a pasted constant.
function bech32Encode(hrp: string, bytes: Uint8Array): string {
  const ALPHABET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  const words: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      words.push((acc >> bits) & 31);
    }
  }
  if (bits > 0) words.push((acc << (5 - bits)) & 31);
  const hrpExpand = (s: string) => [...s].map((c) => c.charCodeAt(0) >> 5).concat([0], [...s].map((c) => c.charCodeAt(0) & 31));
  const polymod = (values: number[]) => {
    const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
    let chk = 1;
    for (const v of values) {
      const b = chk >> 25;
      chk = ((chk & 0x1ffffff) << 5) ^ v;
      for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GEN[i];
    }
    return chk;
  };
  const values = hrpExpand(hrp).concat(words, [0, 0, 0, 0, 0, 0]);
  const mod = polymod(values) ^ 1;
  const checksum: number[] = [];
  for (let i = 0; i < 6; i++) checksum.push((mod >> (5 * (5 - i))) & 31);
  return `${hrp}1${words.concat(checksum).map((w) => ALPHABET[w]).join('')}`;
}

async function runAllBalanceTests() {
  console.log('\n======================================================');
  console.log('  RUNNING WALLET AND GENERIC SERVICE TEST SUITE');
  console.log('======================================================\n');

  let passedTests = 0;

  // -------------------------------------------------------------------------
  // TEST 1: Custodial ledger balance computation (generic + legacy kinds)
  // -------------------------------------------------------------------------
  console.log('[TEST 1] Verifying custodial ledger balance computation...');
  {
    resetState();
    const emptyLedger: Transaction[] = [];
    assert.equal(computeCustodialBalanceFromTransactions(emptyLedger), 0, 'Empty ledger must point to 0 sats');

    const buy: Transaction = {
      id: 'tx_buy',
      type: 'buy_btc',
      title: 'Buy Sats',
      timestamp: Date.now(),
      status: 'completed',
      fromCurrency: 'KES',
      fromAmount: 1000,
      toCurrency: 'SATS',
      toAmount: 10000,
      fee: 0,
      feeCurrency: 'KES',
      referenceNumber: 'LEDGER-1',
      walletType: 'custodial',
    };
    assert.equal(computeCustodialBalanceFromTransactions([buy]), 10000);

    const send: Transaction = {
      id: 'tx_send',
      type: 'send_mobile',
      title: 'Send Mobile',
      timestamp: Date.now(),
      status: 'completed',
      fromCurrency: 'SATS',
      fromAmount: 4000,
      toCurrency: 'KES',
      toAmount: 400,
      fee: 100,
      feeCurrency: 'SATS',
      realFeeSats: 100,
      referenceNumber: 'LEDGER-2',
      walletType: 'custodial',
    };
    assert.equal(computeCustodialBalanceFromTransactions([buy, send]), 10000 - 4000 - 100);

    // Legacy kinds stored by older versions still count.
    const legacy = { ...send, id: 'tx_legacy', type: 'send_mpesa' as unknown as Transaction['type'], referenceNumber: 'LEDGER-3' };
    assert.equal(computeCustodialBalanceFromTransactions([buy, legacy]), 10000 - 4000 - 100);

    // Mock references never count.
    const mock = { ...buy, id: 'tx_mock', referenceNumber: 'MOCK-1' };
    assert.equal(computeCustodialBalanceFromTransactions([mock]), 0);

    passedTests++;
    console.log('  PASS: ledger arithmetic is exact; legacy kinds still count; mocks excluded.');
  }

  // -------------------------------------------------------------------------
  // TEST 2: Disconnected wallet and wallet storage
  // -------------------------------------------------------------------------
  console.log('[TEST 2] Verifying disconnected wallet and wallet storage...');
  {
    resetState();
    assert.equal(DISCONNECTED_WALLET.isConnected, false);
    assert.equal(DISCONNECTED_WALLET.satsBalance, 0);
    assert.equal(DEFAULT_WALLET.isConnected, true);

    const wallet = getStoredWallet();
    assert.equal(wallet.isConnected, true);
    assert.equal(wallet.satsBalance, 0);
    assert.ok(wallet.localHandle);

    const created = createInAppLightningWallet('testhandle');
    assert.equal(created.localHandle, 'testhandle');
    assert.equal(created.type, 'custodial');
    assert.equal(getLocalHandle(), 'testhandle');

    // Legacy storage keys migrate once to the new names.
    resetState();
    mockStorage.set('altradits_user_wallet_v1', JSON.stringify({ ...DEFAULT_WALLET, isConnected: true, type: 'custodial' }));
    mockStorage.set('altradits_transactions_v1', JSON.stringify([]));
    const migrated = getStoredWallet();
    assert.equal(migrated.isConnected, true);
    assert.equal(mockStorage.get('yebente_wallet_v1') !== null, true);
    assert.equal(mockStorage.get('altradits_user_wallet_v1'), undefined);

    passedTests++;
    console.log('  PASS: wallet storage, handles, and legacy migration behave.');
  }

  // -------------------------------------------------------------------------
  // TEST 3: addTransaction updates balances from the ledger
  // -------------------------------------------------------------------------
  console.log('[TEST 3] Verifying addTransaction balance updates...');
  {
    resetState();
    const wallet: UserWallet = { ...DEFAULT_WALLET };
    const { updatedWallet, updatedTransactions } = addTransaction(
      {
        type: 'receive_btc',
        title: 'Received',
        status: 'completed',
        fromCurrency: 'SATS',
        fromAmount: 5000,
        toCurrency: 'SATS',
        toAmount: 5000,
        fee: 0,
        feeCurrency: 'SATS',
        referenceNumber: 'ADD-1',
        walletType: 'custodial',
      },
      wallet
    );
    assert.equal(updatedWallet.satsBalance, 5000);
    assert.equal(updatedTransactions.length, 1);
    assert.equal(getStoredTransactions().length, 1);

    const after = addTransaction(
      {
        type: 'send_btc',
        title: 'Sent',
        status: 'completed',
        fromCurrency: 'SATS',
        fromAmount: 2000,
        fee: 10,
        feeCurrency: 'SATS',
        referenceNumber: 'ADD-2',
        walletType: 'custodial',
      },
      updatedWallet
    );
    assert.equal(after.updatedWallet.satsBalance, 5000 - 2000 - 10);

    passedTests++;
    console.log('  PASS: addTransaction keeps the ledger balance exact.');
  }

  // -------------------------------------------------------------------------
  // TEST 4: Address validation (on-chain and Lightning, no network)
  // -------------------------------------------------------------------------
  console.log('[TEST 4] Verifying address validation...');
  {
    assert.equal(sanitizeBitcoinAddress('bitcoin:bc1qxy?amount=1'), 'bc1qxy');
    assert.equal(sanitizeBitcoinAddress('lightning:user@wallet-domain.com'), 'user@wallet-domain.com');

    // On-chain addresses are accepted (validated against the own node).
    assert.equal(isValidBitcoinAddress('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'), true);
    assert.equal(isValidBitcoinAddress('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'), true);
    // Lightning Addresses are accepted (open protocol).
    assert.equal(isValidBitcoinAddress('user@wallet-domain.com'), true);
    assert.equal(isValidBitcoinAddress('not an address'), false);
    assert.equal(isValidBitcoinAddress(''), false);

    // Balance calls fail honestly when no chain provider is configured.
    routes = { 'GET /api/chain/balance/bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4': { status: 501, body: { success: false, error: 'On-chain balances are not available yet: no Bitcoin Core node is configured.' } } };
    const missing = await fetchBitcoinAddressBalance('bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4');
    assert.equal(missing.success, false);
    assert.match(missing.error || '', /not available yet/);

    passedTests++;
    console.log('  PASS: on-chain and Lightning addresses validate; missing node fails honestly.');
  }

  // -------------------------------------------------------------------------
  // TEST 5: Lightning Address checks and LNURL decoding (no network)
  // -------------------------------------------------------------------------
  console.log('[TEST 5] Verifying Lightning Address checks and LNURL decoding...');
  {
    assert.equal(isLightningAddress('user@wallet-domain.com'), true);
    assert.equal(isLightningAddress('lnurl1dp68gurn8ghj7mrww4exctnxd9shg6npvchxxmmd9akxuatjdskkga'), true);
    assert.equal(isLightningAddress('not-an-address'), false);
    assert.equal(decodeLnurl('not-a-lnurl'), null);
    assert.equal(decodeLnurl('lnurl1zz'), null);

    // Round-trip: independently bech32-encode a URL, then decode it.
    const url = 'https://wallet-domain.com/.well-known/lnurlp/user';
    const encoded = bech32Encode('lnurl', new TextEncoder().encode(url));
    assert.ok(encoded.startsWith('lnurl1'));
    assert.equal(decodeLnurl(encoded), url);
    assert.equal(decodeLnurl(`lightning:${encoded.toUpperCase()}`), url);

    // LNURL-pay resolution parses limits and uses the domain as provider.
    routes = {
      'GET https://wallet-domain.com/.well-known/lnurlp/user': {
        status: 200,
        body: {
          tag: 'payRequest',
          callback: 'https://wallet-domain.com/lnurl/user',
          minSendable: 1000,
          maxSendable: 100000000,
          metadata: '[["text/plain","Pay to user"],["text/identifier","user@wallet-domain.com"]]',
          commentAllowed: 0,
        },
      },
      'GET https://down.example/.well-known/lnurlp/user': { status: 500, body: {} },
    };
    const resolved = await resolveLightningAddress('user@wallet-domain.com');
    assert.equal(resolved.success, true);
    assert.equal(resolved.provider, 'wallet-domain.com');
    assert.equal(resolved.minSendableSats, 1);
    assert.equal(resolved.maxSendableSats, 100000);
    assert.equal(resolved.callbackUrl, 'https://wallet-domain.com/lnurl/user');

    const failed = await resolveLightningAddress('user@down.example');
    assert.equal(failed.success, false);

    passedTests++;
    console.log('  PASS: LNURL decoding round-trips; resolution is protocol-generic.');
  }

  // -------------------------------------------------------------------------
  // TEST 6: Phone number utilities (Kenya and Ethiopia)
  // -------------------------------------------------------------------------
  console.log('[TEST 6] Verifying phone number utilities...');
  {
    assert.equal(extractKenyanSubscriberDigits('+254 707 172 370'), '707172370');
    assert.equal(extractKenyanSubscriberDigits('0707172370'), '707172370');
    assert.equal(isValidKenyanPhone('0707172370'), true);
    assert.equal(isValidKenyanPhone('0112345678'), true);
    assert.equal(isValidKenyanPhone('254707172370'), true);
    assert.equal(isValidKenyanPhone('0600000000'), false);
    assert.equal(formatKenyanPhone('0707172370'), '254707172370');
    assert.equal(formatKenyanDisplayPhone('254707172370'), '+254 707 172 370');

    assert.equal(extractEthiopianSubscriberDigits('+251911234567'), '911234567');
    assert.equal(extractEthiopianSubscriberDigits('0911234567'), '911234567');
    assert.equal(isValidEthiopianPhone('0911234567'), true);
    assert.equal(isValidEthiopianPhone('0711234567'), true);
    assert.equal(isValidEthiopianPhone('0611234567'), false);
    assert.equal(formatEthiopianPhone('0911234567'), '251911234567');
    assert.equal(formatEthiopianDisplayPhone('251911234567'), '+251 911 234 567');

    passedTests++;
    console.log('  PASS: Kenya and Ethiopia numbering rules validate and format.');
  }

  // -------------------------------------------------------------------------
  // TEST 7: Generic fiat client (stubbed backend)
  // -------------------------------------------------------------------------
  console.log('[TEST 7] Verifying generic fiat client...');
  {
    resetState();
    const keyA = newIdempotencyKey();
    const keyB = newIdempotencyKey();
    assert.ok(keyA.length >= 16);
    assert.notEqual(keyA, keyB);

    // No adapter configured: honest 501 surfaces as unavailable.
    routes = {
      'POST /api/fiat/quote': { status: 501, body: { success: false, error: 'This fiat rail is not available yet: no adapter is configured.' } },
      'POST /api/fiat/collect': { status: 501, body: { success: false, error: 'This fiat rail is not available yet: no adapter is configured.' } },
      'GET /api/fiat/status/REF-1': { status: 501, body: { success: false, error: 'This fiat rail is not available yet: no adapter is configured.' } },
    };
    const quoteDown = await requestFiatQuote({ direction: 'buy', currency: 'KES', amount: 100000 });
    assert.equal(quoteDown.success, false);
    assert.equal(quoteDown.unavailable, true);
    assert.match(quoteDown.error || '', /not available yet/);

    const collectDown = await startFiatTransfer({ direction: 'buy', quoteId: 'Q-1', phone: '254707172370', idempotencyKey: 'k-1' });
    assert.equal(collectDown.success, false);
    assert.equal(collectDown.unavailable, true);

    const statusDown = await queryFiatStatus('REF-1');
    assert.equal(statusDown.success, false);
    assert.equal(statusDown.unavailable, true);

    // Configured rail: quote, idempotent collect, status.
    routes = {
      'POST /api/fiat/quote': {
        status: 200,
        body: { success: true, quoteId: 'Q-9', fiatMinor: 100000, feeFiatMinor: 1000, sats: 7407, feeSats: 0, rateUsed: 13500000, rateSource: 'owner' },
      },
      'POST /api/fiat/collect': { status: 200, body: { success: true, reference: 'REF-9', state: 'pending' } },
      'GET /api/fiat/status/REF-9': { status: 200, body: { success: true, reference: 'REF-9', state: 'paid', receipt: 'RCPT-9' } },
    };
    const quote = await requestFiatQuote({ direction: 'buy', currency: 'KES', amount: 100000 });
    assert.equal(quote.success, true);
    assert.equal(quote.quoteId, 'Q-9');
    assert.equal(quote.sats, 7407);

    const collect = await startFiatTransfer({ direction: 'buy', quoteId: 'Q-9', phone: '254707172370', idempotencyKey: 'k-9' });
    assert.equal(collect.success, true);
    assert.equal(collect.reference, 'REF-9');
    assert.equal(seenRequests[seenRequests.length - 1].body && (seenRequests[seenRequests.length - 1].body as { idempotencyKey: string }).idempotencyKey, 'k-9');

    const status = await queryFiatStatus('REF-9');
    assert.equal(status.state, 'paid');
    assert.equal(status.receipt, 'RCPT-9');

    passedTests++;
    console.log('  PASS: fiat client quotes, transfers idempotently, and fails honestly at 501.');
  }

  // -------------------------------------------------------------------------
  // TEST 8: Owner-set rates with cache fallback (stubbed backend)
  // -------------------------------------------------------------------------
  console.log('[TEST 8] Verifying owner-set rates and cache fallback...');
  {
    resetState();
    routes = {
      'GET /api/rates': { status: 200, body: { success: true, btcUsd: 100000, btcKes: 13500000, btcEtb: 12000000, source: 'owner', at: 777 } },
    };
    const live = await fetchLiveRates();
    assert.equal(live.isLive, true);
    assert.equal(live.source, 'owner');
    assert.equal(live.btcKes, 13500000);
    assert.equal(live.usdKes, 135);
    assert.equal(live.lastUpdated, 777);

    // Backend down: cached rates serve, marked not live.
    routes = { 'GET /api/rates': { status: 501, body: { success: false, error: 'not available yet' } } };
    const cached = await fetchLiveRates();
    assert.equal(cached.isLive, false);
    assert.equal(cached.source, 'cache');
    assert.equal(cached.btcKes, 13500000);

    // Nothing cached and backend down: honest failure.
    resetState();
    routes = { 'GET /api/rates': { status: 501, body: { success: false, error: 'not available yet' } } };
    await assert.rejects(() => fetchLiveRates(), /not available yet/);

    // Cache helpers round-trip.
    saveCachedRates({ ...live, isLive: false, source: 'cache' });
    const reread = getCachedRates();
    assert.equal(reread && reread.btcUsd, 100000);

    passedTests++;
    console.log('  PASS: owner-set rates serve, cache covers outages, gaps fail honestly.');
  }

  // -------------------------------------------------------------------------
  // TEST 9: Stored history survives reload with healed records
  // -------------------------------------------------------------------------
  console.log('[TEST 9] Verifying stored history reload and healing...');
  {
    resetState();
    const wallet = getStoredWallet();
    const { updatedWallet } = addTransaction(
      {
        type: 'buy_btc',
        title: 'Buy Sats',
        status: 'completed',
        fromCurrency: 'KES',
        fromAmount: 1090,
        toCurrency: 'SATS',
        toAmount: 0, // stored unassigned: healed from fromAmount and rate
        rateUsed: 10900000,
        fee: 0,
        feeCurrency: 'KES',
        referenceNumber: 'HEAL-1',
        walletType: 'custodial',
      },
      wallet
    );
    assert.equal(updatedWallet.satsBalance, 10000);
    assert.equal(getStoredTransactions()[0].toAmount, 10000);

    const reloadedWallet = getStoredWallet();
    assert.equal(reloadedWallet.satsBalance, 10000);

    passedTests++;
    console.log('  PASS: stored history reloads with healed sat evidence.');
  }

  console.log('\n======================================================');
  console.log(`  ALL ${passedTests} TEST SUITES PASSED.`);
  console.log('======================================================\n');
}

runAllBalanceTests().catch((err) => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});

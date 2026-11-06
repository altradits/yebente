import assert from 'node:assert/strict';
import { CoreChainProvider } from '../src/providers/coreChain';
import {
  ChainRejected,
  ChainUnavailable,
  FiatNotConfigured,
  FiatRejected,
  FiatUnknown,
  LightningUnavailable,
  NotifyUnavailable,
  PriceUnavailable,
  ProviderError,
} from '../src/providers/errors';
import { FakeNotifications } from '../src/providers/fakeNotify';
import { FakeOffRamp, FakeOnRamp } from '../src/providers/fakeFiat';
import { configFromEnv, createProviders } from '../src/providers/index';
import { LndLightningProvider } from '../src/providers/lndLightning';
import { OwnerSetPriceProvider } from '../src/providers/ownerPrice';
import {
  UnavailableChainProvider,
  UnavailableLightningProvider,
  UnavailableNotifications,
  UnavailableOffRamp,
  UnavailableOnRamp,
  UnavailablePriceProvider,
} from '../src/providers/unavailable';
import {
  fiatMinorToSats,
  satsToFiatMinor,
} from '../src/providers/types';

type FetchStub = (url: string, init?: { method?: string; body?: string }) => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    json: async () => (typeof body === 'string' ? JSON.parse(body) : body),
  } as Response;
}

/** Stub Core RPC: method -> result. */
function coreStub(results: Record<string, unknown>, seen: string[] = []): FetchStub {
  return async (_url: string, init?: { body?: string }) => {
    const payload = JSON.parse(init?.body || '{}') as { method: string; params: unknown[] };
    seen.push(payload.method);
    if (!(payload.method in results)) {
      return jsonResponse({ result: null, error: { message: 'unknown method' } }, 500);
    }
    return jsonResponse({ result: results[payload.method], error: null });
  };
}

/** Stub LND REST: "METHOD path" -> body (string for streaming replies). */
function lndStub(routes: Record<string, unknown>): FetchStub {
  return async (url: string, init?: { method?: string }) => {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const key = `${init?.method || 'GET'} ${path}`;
    if (!(key in routes)) return jsonResponse({ message: 'not found' }, 404);
    return jsonResponse(routes[key]);
  };
}

async function assertThrowsCode(fn: () => Promise<unknown>, code: string): Promise<ProviderError> {
  try {
    await fn();
  } catch (error) {
    assert.ok(error instanceof ProviderError, `expected ProviderError, got ${String(error)}`);
    assert.equal(error.code, code);
    return error;
  }
  assert.fail(`expected ${code} to be thrown`);
}

async function runProviderTests() {
  console.log('\n======================================================');
  console.log('  RUNNING PROVIDER INTERFACE AND FAKE TEST SUITE');
  console.log('======================================================\n');

  let passed = 0;

  // ------------------------------------------------------------------
  // TEST 1: Unavailable providers fail clearly, never silently
  // ------------------------------------------------------------------
  console.log('[TEST 1] Unavailable providers say "not available yet"...');
  {
    const chain = new UnavailableChainProvider();
    const chainError = await assertThrowsCode(() => chain.getStatus(), 'CHAIN_UNAVAILABLE');
    assert.match(chainError.message, /not available yet/);
    assert.equal(chainError.httpStatus, 501);

    const lightning = new UnavailableLightningProvider();
    const lnError = await assertThrowsCode(() => lightning.createInvoice(100, 'x'), 'LIGHTNING_UNAVAILABLE');
    assert.match(lnError.message, /not available yet/);

    const price = new UnavailablePriceProvider();
    await assertThrowsCode(() => price.getRates(), 'PRICE_UNAVAILABLE');

    const onRamp = new UnavailableOnRamp('test-rail');
    const fiatError = await assertThrowsCode(() => onRamp.quote(1000, 'KES'), 'FIAT_NOT_CONFIGURED');
    assert.match(fiatError.message, /not available yet/);
    assert.match(fiatError.message, /test-rail/);
    assert.equal(fiatError.httpStatus, 501);

    const offRamp = new UnavailableOffRamp('test-rail');
    await assertThrowsCode(() => offRamp.floatBalance('KES'), 'FIAT_NOT_CONFIGURED');

    const notify = new UnavailableNotifications();
    const notifyError = await assertThrowsCode(
      () => notify.send({ channel: 'email', to: '5tan@altradits.com', kind: 'info', body: 'hi' }),
      'NOTIFY_UNAVAILABLE',
    );
    assert.match(notifyError.message, /not available yet/);

    assert.ok(new FiatRejected('no') instanceof ProviderError);
    assert.ok(new FiatUnknown() instanceof ProviderError);
    assert.ok(new ChainRejected('no') instanceof ProviderError);
    assert.ok(new ChainUnavailable() instanceof ProviderError);
    assert.ok(new PriceUnavailable() instanceof ProviderError);

    passed++;
    console.log('  PASS: every unavailable provider fails honestly with 501.');
  }

  // ------------------------------------------------------------------
  // TEST 2: Owner-set price provider
  // ------------------------------------------------------------------
  console.log('[TEST 2] Owner-set price provider uses exactly the configured rates...');
  {
    const provider = new OwnerSetPriceProvider({ btcKes: 13_500_000, btcEtb: 12_000_000, btcUsd: 100_000, at: 123 });
    const snapshot = await provider.getRates();
    assert.equal(snapshot.base, 'BTC');
    assert.equal(snapshot.source, 'owner');
    assert.equal(snapshot.at, 123);
    assert.deepEqual(snapshot.quotes, { KES: 13_500_000, ETB: 12_000_000, USD: 100_000 });

    // 1,000 KES at 13.5M per BTC = 7407 sats.
    assert.equal(fiatMinorToSats(100_000, 'KES', snapshot), 7407);
    assert.equal(satsToFiatMinor(7407, 'KES', snapshot), 99995);
    assert.equal(satsToFiatMinor(10_000_000, 'KES', snapshot), 1_350_000 * 100);

    assert.throws(() => new OwnerSetPriceProvider({ btcKes: 0, btcEtb: 1, btcUsd: 1 }), PriceUnavailable);

    passed++;
    console.log('  PASS: owner-set rates quote exactly, incomplete config throws.');
  }

  // ------------------------------------------------------------------
  // TEST 3: Fake on-ramp contract
  // ------------------------------------------------------------------
  console.log('[TEST 3] Fake on-ramp: quote, idempotent collect, status...');
  {
    const price = new OwnerSetPriceProvider({ btcKes: 10_000_000, btcEtb: 10_000_000, btcUsd: 100_000 });
    const ramp = new FakeOnRamp(price, { rail: 'test', feePercent: 1, autoSettle: true });

    const quote = await ramp.quote(100_000, 'KES'); // 1000.00 KES
    assert.equal(quote.currency, 'KES');
    assert.equal(quote.feeFiatMinor, 1000); // 1%
    assert.equal(quote.fiatMinor, 100_000);
    assert.ok(quote.sats > 0);
    assert.equal(quote.rateSource, 'owner');
    assert.ok(quote.expiresAt > Date.now());

    const first = await ramp.collect({ quoteId: quote.quoteId, phone: '254707172370', idempotencyKey: 'key-1' });
    assert.equal(first.state, 'paid'); // autoSettle
    assert.ok(first.receipt);

    // Same idempotency key: same reference, never a second charge.
    const replay = await ramp.collect({ quoteId: quote.quoteId, phone: '254707172370', idempotencyKey: 'key-1' });
    assert.equal(replay.reference, first.reference);

    const status = await ramp.status(first.reference);
    assert.equal(status.state, 'paid');

    await assertThrowsCode(() => ramp.status('NOPE'), 'FIAT_REJECTED');
    await assertThrowsCode(
      () => ramp.collect({ quoteId: quote.quoteId, phone: 'bad', idempotencyKey: 'key-2' }),
      'FIAT_REJECTED',
    );

    // Pending by default when autoSettle is off.
    const pending = new FakeOnRamp(price, { rail: 'test' });
    const q2 = await pending.quote(1000, 'KES');
    const t2 = await pending.collect({ quoteId: q2.quoteId, phone: '254707172370', idempotencyKey: 'k' });
    assert.equal(t2.state, 'pending');
    assert.equal((await pending.status(t2.reference)).state, 'pending');
    const settled = pending.settle(t2.reference, 'paid');
    assert.equal(settled.state, 'paid');
    assert.ok(settled.receipt);

    // Reconciliation feed carries the operator's idempotency keys.
    const records = await pending.listSettlements('1970-01-01T00:00:00.000Z');
    assert.equal(records.length, 1);
    assert.equal(records[0].idempotencyKey, 'k');

    passed++;
    console.log('  PASS: on-ramp contract holds, idempotency replays the same reference.');
  }

  // ------------------------------------------------------------------
  // TEST 4: Fake off-ramp contract
  // ------------------------------------------------------------------
  console.log('[TEST 4] Fake off-ramp: quote, payout, float, account lookup...');
  {
    const price = new OwnerSetPriceProvider({ btcKes: 10_000_000, btcEtb: 10_000_000, btcUsd: 100_000 });
    const ramp = new FakeOffRamp(price, {
      rail: 'test',
      feePercent: 2,
      floatMinor: 500_000,
      accounts: { '254707172370': 'Test User' },
    });

    const quote = await ramp.quote(1_000_000, 'KES'); // 0.01 BTC = 100,000.00 KES
    assert.equal(quote.fiatMinor + quote.feeFiatMinor, 10_000_000);
    assert.equal(quote.feeFiatMinor, 200_000);

    assert.equal(await ramp.floatBalance('KES'), 500_000);

    const found = await ramp.resolveAccount('254707172370');
    assert.equal(found.found, true);
    assert.equal(found.name, 'Test User');
    const missing = await ramp.resolveAccount('254700000000');
    assert.equal(missing.found, false);
    assert.equal(missing.name, undefined);

    const payout = await ramp.payout({ quoteId: quote.quoteId, phone: '254707172370', idempotencyKey: 'p-1' });
    assert.equal(payout.state, 'pending');
    const replay = await ramp.payout({ quoteId: quote.quoteId, phone: '254707172370', idempotencyKey: 'p-1' });
    assert.equal(replay.reference, payout.reference);

    // Scripted failures happen once, then behavior returns to normal.
    const flaky = new FakeOffRamp(price, { rail: 'test', failNext: 'rejected' });
    await assertThrowsCode(() => flaky.quote(1000, 'KES'), 'FIAT_REJECTED');
    await flaky.quote(1000, 'KES'); // works again

    passed++;
    console.log('  PASS: off-ramp contract holds, float and lookup behave.');
  }

  // ------------------------------------------------------------------
  // TEST 5: Fake notifications record messages
  // ------------------------------------------------------------------
  console.log('[TEST 5] Fake notifications record every message...');
  {
    const fake = new FakeNotifications();
    await fake.send({ channel: 'email', to: '5tan@altradits.com', kind: 'receipt', subject: 'Paid', body: 'done' });
    await fake.send({ channel: 'sms', to: '254707172370', kind: 'security', body: 'alert' });
    assert.equal(fake.sent.length, 2);
    assert.equal(fake.sent[0].channel, 'email');
    assert.equal(fake.sent[1].to, '254707172370');
    fake.clear();
    assert.equal(fake.sent.length, 0);

    passed++;
    console.log('  PASS: notifications are recorded exactly.');
  }

  // ------------------------------------------------------------------
  // TEST 6: Core chain provider over stubbed RPC
  // ------------------------------------------------------------------
  console.log('[TEST 6] Core chain provider speaks Core RPC...');
  {
    const seen: string[] = [];
    const chain = new CoreChainProvider({
      url: 'http://127.0.0.1:8332',
      user: 'u',
      password: 'p',
      fetchFn: coreStub(
        {
          getblockchaininfo: { chain: 'regtest', blocks: 10, bestblockhash: 'abc', initialblockdownload: false },
          getnewaddress: 'bcrt1qtestaddress',
          estimatesmartfee: { feerate: 0.0001 },
          sendtoaddress: 'txid-1',
        },
        seen,
      ) as typeof fetch,
    });

    const status = await chain.getStatus();
    assert.deepEqual(status, { chain: 'regtest', height: 10, synced: true, tipHash: 'abc' });
    assert.equal(await chain.newAddress('segwit'), 'bcrt1qtestaddress');
    // 0.0001 BTC/kvB = 10 sat/vB.
    assert.equal(await chain.estimateFee(6), 10);
    assert.deepEqual(await chain.send('bcrt1qdest', 1000, 2), { txid: 'txid-1' });
    assert.deepEqual(seen, ['getblockchaininfo', 'getnewaddress', 'estimatesmartfee', 'sendtoaddress']);

    // Balance math: confirmed vs total from getreceivedbyaddress.
    let calls = 0;
    const balanceChain = new CoreChainProvider({
      url: 'http://127.0.0.1:8332',
      user: 'u',
      password: 'p',
      fetchFn: (async () => {
        calls++;
        return jsonResponse({ result: calls === 1 ? 0.001 : 0.0015, error: null });
      }) as FetchStub as typeof fetch,
    });
    assert.deepEqual(await balanceChain.getBalance('bcrt1qaddr'), {
      confirmedSats: 100_000,
      unconfirmedSats: 50_000,
    });

    // Unreachable node fails as unavailable, never as a guess.
    const dead = new CoreChainProvider({
      url: 'http://127.0.0.1:9',
      user: 'u',
      password: 'p',
      fetchFn: (async () => {
        throw new Error('connect refused');
      }) as FetchStub as typeof fetch,
    });
    await assertThrowsCode(() => dead.getStatus(), 'CHAIN_UNAVAILABLE');
    await assertThrowsCode(() => dead.estimateFee(6), 'CHAIN_UNAVAILABLE');

    // Missing credentials fail before any call.
    const nocreds = new CoreChainProvider({ url: '', user: '', password: '' });
    await assertThrowsCode(() => nocreds.getStatus(), 'CHAIN_UNAVAILABLE');

    // Bad inputs are rejected, not sent.
    await assertThrowsCode(() => chain.send('', 100, 1), 'CHAIN_REJECTED');
    await assertThrowsCode(() => chain.estimateFee(0), 'CHAIN_REJECTED');

    passed++;
    console.log('  PASS: Core RPC shapes parse, failures are ChainUnavailable.');
  }

  // ------------------------------------------------------------------
  // TEST 7: LND provider over stubbed REST
  // ------------------------------------------------------------------
  console.log('[TEST 7] LND provider speaks LND REST...');
  {
    const rHashB64 = Buffer.from('11'.repeat(32), 'hex').toString('base64');
    const lnd = new LndLightningProvider({
      url: 'https://127.0.0.1:8080/',
      invoiceMacaroon: 'invoice-mac',
      payMacaroon: 'pay-mac',
      fetchFn: lndStub({
        'POST /v1/invoices': { payment_request: 'lnbcrt10n1...', r_hash: rHashB64 },
        [`GET /v1/invoice/${'11'.repeat(32)}`]: { settled: true, creation_date: '1000', expiry: '600' },
        'POST /v2/router/send': '{"result":{"status":"SUCCEEDED","fee_sat":"2","payment_preimage":"ab"}}',
        'GET /v1/balance/channels': { balance: '9000' },
        'GET /v1/channels?active_only=true': {
          channels: [
            { active: true, local_balance: '10000', remote_balance: '5000', local_chan_reserve_sat: '1000' },
            { active: false, local_balance: '999', remote_balance: '999' },
          ],
        },
      }) as typeof fetch,
    });

    const invoice = await lnd.createInvoice(1000, 'test');
    assert.equal(invoice.invoice, 'lnbcrt10n1...');
    assert.equal(invoice.paymentHash, '11'.repeat(32));
    assert.ok(invoice.expiresAt > Date.now());

    assert.equal(await lnd.invoiceStatus('11'.repeat(32)), 'settled');

    const paid = await lnd.payInvoice('lnbcrt10n1...', 10);
    assert.equal(paid.state, 'succeeded');
    assert.equal(paid.feeSats, 2);

    // Spendable = local minus reserve over active channels only.
    assert.deepEqual(await lnd.channelBalance(), { outboundSats: 9000, inboundSats: 5000 });

    // Failed and unknown payments map to the three-state result.
    const failedLnd = new LndLightningProvider({
      url: 'https://127.0.0.1:8080',
      invoiceMacaroon: 'i',
      payMacaroon: 'p',
      fetchFn: lndStub({
        'POST /v2/router/send': '{"result":{"status":"FAILED","failure_reason":"FAILURE_REASON_NO_ROUTE"}}',
      }) as typeof fetch,
    });
    const failed = await failedLnd.payInvoice('lnbcrt...', 5);
    assert.equal(failed.state, 'failed');
    assert.equal(failed.error, 'no route');

    const timeoutLnd = new LndLightningProvider({
      url: 'https://127.0.0.1:8080',
      invoiceMacaroon: 'i',
      payMacaroon: 'p',
      fetchFn: (async () => {
        throw new Error('timeout');
      }) as FetchStub as typeof fetch,
    });
    const unknown = await timeoutLnd.payInvoice('lnbcrt...', 5);
    assert.equal(unknown.state, 'unknown');

    // No pay macaroon: paying is not switched on.
    const nopay = new LndLightningProvider({
      url: 'https://127.0.0.1:8080',
      invoiceMacaroon: 'i',
      fetchFn: lndStub({}) as typeof fetch,
    });
    await assertThrowsCode(() => nopay.payInvoice('lnbcrt...', 5), 'LIGHTNING_UNAVAILABLE');

    // Missing config fails before any call.
    const noconfig = new LndLightningProvider({ url: '', invoiceMacaroon: '' });
    await assertThrowsCode(() => noconfig.createInvoice(1, 'x'), 'LIGHTNING_UNAVAILABLE');

    // Expired vs pending invoices.
    const expiredLnd = new LndLightningProvider({
      url: 'https://127.0.0.1:8080',
      invoiceMacaroon: 'i',
      fetchFn: lndStub({
        [`GET /v1/invoice/${'22'.repeat(32)}`]: { settled: false, creation_date: '1000', expiry: '600' },
        [`GET /v1/invoice/${'33'.repeat(32)}`]: {
          settled: false,
          creation_date: String(Math.floor(Date.now() / 1000)),
          expiry: '600',
        },
      }) as typeof fetch,
    });
    assert.equal(await expiredLnd.invoiceStatus('22'.repeat(32)), 'expired');
    assert.equal(await expiredLnd.invoiceStatus('33'.repeat(32)), 'pending');

    passed++;
    console.log('  PASS: LND REST shapes parse, payments are three-state.');
  }

  // ------------------------------------------------------------------
  // TEST 8: Provider factory and env config
  // ------------------------------------------------------------------
  console.log('[TEST 8] Factory defaults to unavailable, env configures...');
  {
    const empty = createProviders({});
    await assertThrowsCode(() => empty.chain.getStatus(), 'CHAIN_UNAVAILABLE');
    await assertThrowsCode(() => empty.lightning.channelBalance(), 'LIGHTNING_UNAVAILABLE');
    await assertThrowsCode(() => empty.price.getRates(), 'PRICE_UNAVAILABLE');
    await assertThrowsCode(() => empty.onRamp.status('x'), 'FIAT_NOT_CONFIGURED');
    await assertThrowsCode(() => empty.offRamp.status('x'), 'FIAT_NOT_CONFIGURED');
    await assertThrowsCode(
      () => empty.notify.send({ channel: 'sms', to: '1', kind: 'info', body: 'x' }),
      'NOTIFY_UNAVAILABLE',
    );

    // Env with nothing set: all null (unavailable).
    const none = configFromEnv({});
    assert.equal(none.core, null);
    assert.equal(none.lnd, null);
    assert.equal(none.ownerRates, null);

    // Env fully set: real providers are built.
    const full = createProviders(
      configFromEnv({
        BITCOIN_CORE_RPC_URL: 'http://127.0.0.1:8332',
        BITCOIN_CORE_RPC_USER: 'u',
        BITCOIN_CORE_RPC_PASSWORD: 'p',
        LND_REST_URL: 'https://127.0.0.1:8080',
        LND_INVOICE_MACAROON: 'aa',
        LND_PAY_MACAROON: 'bb',
        YEBENTE_OWNER_BTC_KES: '13500000',
        YEBENTE_OWNER_BTC_ETB: '12000000',
        YEBENTE_OWNER_BTC_USD: '100000',
      }),
    );
    assert.ok(full.chain instanceof CoreChainProvider);
    assert.ok(full.lightning instanceof LndLightningProvider);
    assert.ok(full.price instanceof OwnerSetPriceProvider);
    assert.equal((await full.price.getRates()).quotes.KES, 13_500_000);

    // Partial rate config: unavailable, not half a rate.
    const partial = createProviders(
      configFromEnv({ YEBENTE_OWNER_BTC_KES: '13500000', YEBENTE_OWNER_BTC_USD: '100000' }),
    );
    await assertThrowsCode(() => partial.price.getRates(), 'PRICE_UNAVAILABLE');

    // A plugged-in fake is used as-is.
    const price = new OwnerSetPriceProvider({ btcKes: 1, btcEtb: 1, btcUsd: 1 });
    const withFake = createProviders({ onRamp: new FakeOnRamp(price, { rail: 'ke' }) });
    assert.equal(withFake.onRamp.rail, 'ke');

    passed++;
    console.log('  PASS: factory wires configured providers, gaps stay unavailable.');
  }

  console.log('\n======================================================');
  console.log(`  ALL ${passed} PROVIDER TEST SUITES PASSED.`);
  console.log('======================================================\n');
}

runProviderTests().catch((err) => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});

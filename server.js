/**
 * YeBente backend: serves the app and talks to the operator's own
 * infrastructure only (Bitcoin Core and LND), plus the owner-set
 * rate. Fiat rails have no adapter configured in this repo, so every
 * /api/fiat/* route answers 501 with "not available yet" and points
 * at the adapter contract in docs/independence.md.
 *
 * Environment (see .env.example): BITCOIN_CORE_RPC_URL/USER/PASSWORD,
 * LND_REST_URL, LND_INVOICE_MACAROON, LND_PAY_MACAROON,
 * YEBENTE_OWNER_BTC_KES/ETB/USD, YEBENTE_OWNER_RATE_AT.
 */
import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config({ override: true });

const app = express();
app.disable('x-powered-by');
// Render sits behind one proxy: req.ip is the caller, not the proxy.
app.set('trust proxy', 1);
// Small JSON bodies only, never compressed ones (GHSA-27r3-jxmh-p828).
app.use(express.json({ limit: '20kb', inflate: false }));

const PORT = process.env.PORT || 3001;

const env = (key) => String(process.env[key] || '').trim();
const positiveNumber = (key) => {
  const value = Number(env(key));
  return Number.isFinite(value) && value > 0 ? value : null;
};

// Invoice creation mints node resources: at most 30 per caller per hour.
const invoiceAttempts = new Map();
function invoiceAllowed(ip) {
  const now = Date.now();
  const recent = (invoiceAttempts.get(ip) || []).filter((t) => now - t < 3600000);
  if (recent.length >= 30) return false;
  recent.push(now);
  invoiceAttempts.set(ip, recent);
  return true;
}

/** Honest 501 for every capability without a working implementation. */
function notAvailable(res, message) {
  return res.status(501).json({ success: false, configured: false, error: message });
}

/* ------------------------------------------------------------------ */
/* Bitcoin Core RPC                                                      */
/* ------------------------------------------------------------------ */

function coreConfig() {
  const url = env('BITCOIN_CORE_RPC_URL');
  const user = env('BITCOIN_CORE_RPC_USER');
  const password = env('BITCOIN_CORE_RPC_PASSWORD');
  if (!url || !user || !password) return null;
  return { url, user, password };
}

let coreRpcId = 0;

async function coreRpc(method, params = []) {
  const config = coreConfig();
  if (!config) throw new Error('not configured');
  const auth = Buffer.from(`${config.user}:${config.password}`).toString('base64');
  const response = await fetch(config.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({ jsonrpc: '1.0', id: `yebente-${++coreRpcId}`, method, params }),
  });
  const data = await response.json();
  if (!response.ok || data.error) {
    throw new Error(data.error?.message || `HTTP ${response.status}`);
  }
  return data.result;
}

/* ------------------------------------------------------------------ */
/* LND REST                                                              */
/* ------------------------------------------------------------------ */

function lndConfig() {
  const url = env('LND_REST_URL').replace(/\/+$/, '');
  const invoiceMacaroon = env('LND_INVOICE_MACAROON');
  if (!url || !invoiceMacaroon) return null;
  return { url, invoiceMacaroon, payMacaroon: env('LND_PAY_MACAROON') };
}

async function lndCall(path, macaroon, { method = 'GET', body } = {}) {
  const config = lndConfig();
  if (!config) throw new Error('not configured');
  const response = await fetch(`${config.url}${path}`, {
    method,
    headers: {
      'Grpc-Metadata-macaroon': macaroon,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  // Streaming calls answer one JSON object per line; the last one counts.
  const lastLine = text.trim().split('\n').filter(Boolean).at(-1) || '{}';
  let data = {};
  try {
    data = JSON.parse(lastLine);
  } catch {
    throw new Error(`non-JSON reply on ${path}`);
  }
  if (!response.ok) {
    throw new Error(String(data.message || data.error || `HTTP ${response.status}`).slice(0, 200));
  }
  return data;
}

/* ------------------------------------------------------------------ */
/* Health and rates                                                      */
/* ------------------------------------------------------------------ */

app.get('/api/health', (req, res) => {
  const chain = Boolean(coreConfig());
  const lightning = Boolean(lndConfig());
  const price =
    positiveNumber('YEBENTE_OWNER_BTC_KES') !== null &&
    positiveNumber('YEBENTE_OWNER_BTC_ETB') !== null &&
    positiveNumber('YEBENTE_OWNER_BTC_USD') !== null;
  res.json({
    status: 'ok',
    service: 'yebente',
    configured: { chain, lightning, price, fiat: false },
    features: {
      receive: lightning,
      send: lightning,
      buy: false,
      sendMobile: false,
    },
    timestamp: Date.now(),
  });
});

app.get('/api/rates', (req, res) => {
  const btcKes = positiveNumber('YEBENTE_OWNER_BTC_KES');
  const btcEtb = positiveNumber('YEBENTE_OWNER_BTC_ETB');
  const btcUsd = positiveNumber('YEBENTE_OWNER_BTC_USD');
  if (!btcKes || !btcEtb || !btcUsd) {
    return notAvailable(
      res,
      'Exchange rates are not available yet: the owner-set rate is not configured. Set YEBENTE_OWNER_BTC_KES, YEBENTE_OWNER_BTC_ETB and YEBENTE_OWNER_BTC_USD.'
    );
  }
  res.json({
    success: true,
    btcUsd,
    btcKes,
    btcEtb,
    source: 'owner',
    at: positiveNumber('YEBENTE_OWNER_RATE_AT') || Date.now(),
  });
});

/* ------------------------------------------------------------------ */
/* Chain (Bitcoin Core)                                                  */
/* ------------------------------------------------------------------ */

app.get('/api/chain/status', async (req, res) => {
  try {
    const info = await coreRpc('getblockchaininfo');
    if (!info || typeof info.blocks !== 'number' || !info.bestblockhash) {
      throw new Error('empty reply');
    }
    res.json({
      success: true,
      chain: String(info.chain || 'unknown'),
      height: info.blocks,
      synced: info.initialblockdownload === false,
      tipHash: String(info.bestblockhash),
    });
  } catch (error) {
    const message =
      error.message === 'not configured'
        ? 'Chain status is not available yet: no Bitcoin Core node is configured.'
        : 'Chain status is not available yet: the node cannot be reached.';
    return notAvailable(res, message);
  }
});

app.post('/api/chain/address', async (req, res) => {
  try {
    const kind = req.body?.kind === 'taproot' ? 'bech32m' : 'bech32';
    const address = await coreRpc('getnewaddress', ['', kind]);
    if (!address) throw new Error('empty reply');
    res.json({ success: true, address });
  } catch (error) {
    const message =
      error.message === 'not configured'
        ? 'On-chain addresses are not available yet: no Bitcoin Core node is configured.'
        : 'On-chain addresses are not available yet: the node cannot be reached.';
    return notAvailable(res, message);
  }
});

app.get('/api/chain/balance/:address', async (req, res) => {
  try {
    const address = String(req.params.address || '').trim();
    if (!address) {
      return res.status(400).json({ success: false, error: 'An address is required.' });
    }
    const [confirmed, total] = await Promise.all([
      coreRpc('getreceivedbyaddress', [address, 1]),
      coreRpc('getreceivedbyaddress', [address, 0]),
    ]);
    if (typeof confirmed !== 'number' || typeof total !== 'number') {
      throw new Error('empty reply');
    }
    const confirmedSats = Math.round(confirmed * 100_000_000);
    const totalSats = Math.round(total * 100_000_000);
    res.json({
      success: true,
      confirmedSats,
      unconfirmedSats: Math.max(0, totalSats - confirmedSats),
    });
  } catch (error) {
    const message =
      error.message === 'not configured'
        ? 'On-chain balances are not available yet: no Bitcoin Core node is configured.'
        : 'On-chain balances are not available yet: the node cannot be reached.';
    return notAvailable(res, message);
  }
});

app.get('/api/chain/fee', async (req, res) => {
  try {
    const target = Math.floor(Number(req.query.target) || 6);
    if (!(target >= 1)) {
      return res.status(400).json({ success: false, error: 'A confirmation target of at least 1 is required.' });
    }
    const estimate = await coreRpc('estimatesmartfee', [target]);
    if (!(estimate && typeof estimate.feerate === 'number' && estimate.feerate > 0)) {
      return notAvailable(res, 'Fee estimates are not available yet: the node has no estimate for that target.');
    }
    res.json({ success: true, satPerVb: Math.max(1, Math.round(estimate.feerate * 100_000)) });
  } catch (error) {
    const message =
      error.message === 'not configured'
        ? 'Fee estimates are not available yet: no Bitcoin Core node is configured.'
        : 'Fee estimates are not available yet: the node cannot be reached.';
    return notAvailable(res, message);
  }
});

/* ------------------------------------------------------------------ */
/* Lightning (LND)                                                       */
/* ------------------------------------------------------------------ */

app.post('/api/lightning/create-invoice', async (req, res) => {
  try {
    const amount = parseInt(req.body?.satsAmount, 10);
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'A positive satsAmount is required to generate a Lightning invoice.',
      });
    }

    if (!invoiceAllowed(req.ip)) {
      return res.status(429).json({ success: false, error: 'Too many invoices. Try again later.' });
    }

    const config = lndConfig();
    if (!config) {
      return notAvailable(
        res,
        'Lightning invoices are not available yet: no LND node is configured. Set LND_REST_URL and LND_INVOICE_MACAROON.'
      );
    }

    const data = await lndCall(
      '/v1/invoices',
      config.invoiceMacaroon,
      {
        method: 'POST',
        body: { value: amount, memo: req.body?.memo || 'YeBente Deposit', expiry: 600 },
      }
    );
    if (!data.payment_request || !data.r_hash) {
      return notAvailable(res, 'Lightning invoices are not available yet: the node did not return an invoice.');
    }
    res.json({
      success: true,
      configured: true,
      invoice: data.payment_request,
      paymentHash: Buffer.from(data.r_hash, 'base64').toString('hex'),
      satsAmount: amount,
    });
  } catch (error) {
    return notAvailable(res, 'Lightning invoices are not available yet: the node cannot be reached.');
  }
});

app.get('/api/lightning/invoice-status/:paymentHash', async (req, res) => {
  try {
    const paymentHash = String(req.params.paymentHash || '');
    if (!/^[0-9a-f]{64}$/i.test(paymentHash)) {
      return res.status(400).json({ success: false, settled: false, error: 'Invalid payment hash.' });
    }

    const config = lndConfig();
    if (!config) {
      return notAvailable(res, 'Invoice status is not available yet: no LND node is configured.');
    }

    const data = await lndCall(`/v1/invoice/${paymentHash}`, config.invoiceMacaroon);
    res.json({
      success: true,
      settled: Boolean(data.settled),
      paid: Boolean(data.settled),
      satsAmount: Number(data.value) || 0,
      preimage: data.r_preimage || '',
    });
  } catch (error) {
    return notAvailable(res, 'Invoice status is not available yet: the node cannot be reached.');
  }
});

/**
 * Server-side Lightning payment. Not available in this repo: paying
 * from the operator node needs the pay macaroon, a server ledger,
 * and per-wallet authentication, none of which are configured here.
 * Users pay from their own wallets (WebLN) instead.
 */
app.post('/api/lightning/disburse', (req, res) => {
  return notAvailable(
    res,
    'Server-side Lightning payment is not available yet: no pay path is configured. Pay from your own wallet instead.'
  );
});

/* ------------------------------------------------------------------ */
/* Fiat rails: no adapter configured                                     */
/* ------------------------------------------------------------------ */

const FIAT_UNAVAILABLE =
  'This fiat rail is not available yet: no adapter is configured. See the adapter contract in docs/independence.md.';

app.post('/api/fiat/quote', (req, res) => notAvailable(res, FIAT_UNAVAILABLE));
app.post('/api/fiat/collect', (req, res) => notAvailable(res, FIAT_UNAVAILABLE));
app.post('/api/fiat/payout', (req, res) => notAvailable(res, FIAT_UNAVAILABLE));
app.get('/api/fiat/status/:reference', (req, res) => notAvailable(res, FIAT_UNAVAILABLE));
app.post('/api/fiat/callback/:secret', (req, res) => notAvailable(res, FIAT_UNAVAILABLE));

// Any other API path does not exist.
app.all('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// Serve static frontend assets from dist in production
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.join(__dirname, 'dist');
const indexPath = path.join(distPath, 'index.html');

app.use(express.static(distPath));

// For SPA routing: any non-API route serves dist/index.html
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(200).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>yeBente</title>
    <style>
      body { background: #120E16; color: #F8F0E7; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
      h1 { color: #763698; font-size: 2.2rem; margin-bottom: 0.5rem; letter-spacing: -0.03em; }
      p { color: #D1B9B3; font-size: 0.95rem; margin: 0.3rem 0; }
      a { color: #34D399; text-decoration: none; margin-top: 1rem; display: inline-block; font-family: monospace; }
    </style>
  </head>
  <body>
    <h1>yeBente</h1>
    <p>Backend bridge is live and operational.</p>
    <p>Assets are compiling...</p>
    <a href="/api/health">Verify /api/health</a>
  </body>
</html>`);
});

// Only listen when run directly, so tests can import the app.
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`yebente backend running on 0.0.0.0:${PORT}`);
  });
}

export default app;

import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

dotenv.config({ override: true });

const app = express();
app.disable('x-powered-by');
// Render sits behind one proxy: req.ip is the caller, not the proxy.
app.set('trust proxy', 1);
// Small JSON bodies only, never compressed ones (GHSA-27r3-jxmh-p828).
app.use(express.json({ limit: '20kb', inflate: false }));

const PORT = process.env.PORT || 3001;

// Safaricom Daraja Environment URLs
const DARAJA_ENV = process.env.MPESA_ENVIRONMENT || 'sandbox';
const BASE_URL =
  DARAJA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

// STK results from Safaricom's callback, by CheckoutRequestID (result only, no phone numbers)
const recentCallbacks = new Map();

// STK Push sends a PIN prompt to a phone: at most 5 per caller per hour.
const stkAttempts = new Map();
function stkAllowed(ip) {
  const now = Date.now();
  const recent = (stkAttempts.get(ip) || []).filter((t) => now - t < 3600000);
  if (recent.length >= 5) return false;
  recent.push(now);
  stkAttempts.set(ip, recent);
  return true;
}

/**
 * Format phone number to Safaricom standard: 2547XXXXXXXX or 2541XXXXXXXX
 */
function formatKenyanPhone(phone) {
  const clean = String(phone).replace(/[^0-9]/g, '');
  if (clean.startsWith('254') && clean.length === 12) {
    return clean;
  }
  if (clean.startsWith('0') && clean.length === 10) {
    return `254${clean.slice(1)}`;
  }
  if (clean.length === 9) {
    return `254${clean}`;
  }
  return clean;
}

/**
 * Generate Timestamp format YYYYMMDDHHmmss in East Africa Time (UTC+3)
 */
function getTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

let cachedAccessToken = null;
let tokenExpiresAt = 0;

/**
 * Obtain OAuth Access Token from Safaricom Daraja API
 */
async function getDarajaAccessToken() {
  if (cachedAccessToken && Date.now() < tokenExpiresAt) {
    return cachedAccessToken;
  }

  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error('M-Pesa credentials not configured. Set MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET.');
  }

  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const response = await fetch(`${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: {
      Authorization: `Basic ${credentials}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to obtain M-Pesa access token: ${errorText}`);
  }

  const data = await response.json();
  cachedAccessToken = data.access_token;
  // Safaricom tokens are valid for 3599 seconds; refresh 60 seconds before expiry
  const expiresInMs = (parseInt(data.expires_in, 10) || 3599) * 1000;
  tokenExpiresAt = Date.now() + Math.max(expiresInMs - 60000, 60000);

  return cachedAccessToken;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'yebente-daraja-bridge',
    environment: DARAJA_ENV,
    configured: Boolean(process.env.MPESA_CONSUMER_KEY && process.env.MPESA_CONSUMER_SECRET),
    timestamp: Date.now(),
  });
});

/**
 * Trigger STK Push Prompt (Lipa Na M-Pesa Online)
 */
app.post('/api/mpesa/stkpush', async (req, res) => {
  try {
    const { phone, amount, accountReference, transactionDesc } = req.body;

    if (!phone || !amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, error: 'Valid phone and amount are required.' });
    }

    if (!stkAllowed(req.ip)) {
      return res.status(429).json({ success: false, error: 'Failed to trigger STK Push.' });
    }

    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const callbackUrl = process.env.MPESA_CALLBACK_URL || 'https://yebente.onrender.com/api/mpesa/callback';

    if (!shortcode) {
      return res.status(500).json({
        success: false,
        error: 'M-Pesa STK Push failed: MPESA_SHORTCODE is not configured in .env. Specify your Safaricom Paybill or Till shortcode.',
      });
    }

    if (!passkey) {
      return res.status(500).json({
        success: false,
        error: 'M-Pesa STK Push failed: MPESA_PASSKEY is not configured in .env. Obtain passkey from Safaricom Developer Portal.',
      });
    }

    const accessToken = await getDarajaAccessToken();
    const timestamp = getTimestamp();
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    const formattedPhone = formatKenyanPhone(phone);

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(Number(amount)),
      PartyA: formattedPhone,
      PartyB: shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl,
      AccountReference: accountReference || 'yebente',
      TransactionDesc: transactionDesc || 'Bitcoin Settlement',
    };

    const response = await fetch(`${BASE_URL}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || data.ResponseCode !== '0') {
      return res.status(400).json({
        success: false,
        error: data.errorMessage || data.ResponseDescription || 'Failed to trigger STK Push.',
        details: data,
      });
    }

    return res.json({
      success: true,
      merchantRequestId: data.MerchantRequestID,
      checkoutRequestId: data.CheckoutRequestID,
      responseCode: data.ResponseCode,
      responseDescription: data.ResponseDescription,
      customerMessage: data.CustomerMessage,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error during STK Push.',
    });
  }
});

/**
 * Query STK Push Status
 */
app.post('/api/mpesa/query', async (req, res) => {
  try {
    const { checkoutRequestId } = req.body;

    if (!checkoutRequestId) {
      return res.status(400).json({ success: false, error: 'checkoutRequestId is required.' });
    }

    // 1. Check local in-memory callback store
    if (recentCallbacks.has(checkoutRequestId)) {
      const cb = recentCallbacks.get(checkoutRequestId);
      return res.json({
        success: true,
        source: 'callback',
        responseCode: '0',
        resultCode: cb.resultCode,
        resultDesc: cb.resultDesc,
        mpesaReceiptNumber: cb.mpesaReceiptNumber || null,
        checkoutRequestId,
      });
    }

    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;

    if (!shortcode || !passkey) {
      return res.status(500).json({
        success: false,
        error: 'M-Pesa STK Query failed: MPESA_SHORTCODE and MPESA_PASSKEY must be configured in .env.',
      });
    }

    const accessToken = await getDarajaAccessToken();
    const timestamp = getTimestamp();
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    };

    const response = await fetch(`${BASE_URL}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    // Check if transaction is still pending / in-progress on user phone
    const isProcessing =
      data.ResultCode === 49 ||
      data.ResultCode === '49' ||
      data.errorCode === '500.001.1001' ||
      (typeof data.errorMessage === 'string' && data.errorMessage.toLowerCase().includes('being processed')) ||
      (typeof data.ResultDesc === 'string' && data.ResultDesc.toLowerCase().includes('being processed'));

    if (isProcessing) {
      return res.json({
        success: true,
        inProgress: true,
        source: 'daraja_query',
        resultCode: 49,
        resultDesc: 'The payment prompt is pending on your phone. Please enter your PIN.',
        merchantRequestId: data.MerchantRequestID,
        checkoutRequestId: data.CheckoutRequestID || checkoutRequestId,
      });
    }

    // Verified settlement by Safaricom
    if (data.ResultCode === 0 || data.ResultCode === '0') {
      return res.json({
        success: true,
        source: 'daraja_query',
        responseCode: data.ResponseCode || '0',
        resultCode: 0,
        resultDesc: data.ResultDesc || 'The service request is processed successfully.',
        merchantRequestId: data.MerchantRequestID,
        checkoutRequestId: data.CheckoutRequestID || checkoutRequestId,
        mpesaReceiptNumber: data.MpesaReceiptNumber || null,
      });
    }

    return res.json({
      success: response.ok,
      source: 'daraja_query',
      responseCode: data.ResponseCode,
      resultCode: data.ResultCode,
      resultDesc: data.ResultDesc || data.errorMessage || 'Transaction verification in progress.',
      merchantRequestId: data.MerchantRequestID,
      checkoutRequestId: data.CheckoutRequestID || checkoutRequestId,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error during STK Query.',
    });
  }
});

const C2B_HAKIKISHA_URL =
  DARAJA_ENV === 'production'
    ? 'https://api.safaricom.co.ke/c2b_hakikisha/v1/notify'
    : 'https://sandbox.safaricom.co.ke/c2b_hakikisha/v1/notify';

const B2B_HAKIKISHA_URL =
  DARAJA_ENV === 'production'
    ? 'https://api.safaricom.co.ke/sfcverify/v1/query/info'
    : 'https://sandbox.safaricom.co.ke/sfcverify/v1/query/info';

/**
 * Safaricom C2B Hakikisha - Paybill / Till Number Organization Verification
 * Queries Safaricom Daraja C2B Hakikisha endpoint. No fallback names.
 */
app.post('/api/mpesa/hakikisha/c2b', async (req, res) => {
  try {
    const { shortCode, accountNumber, phone } = req.body;
    if (!shortCode) {
      return res.status(400).json({ success: false, verified: false, error: 'ShortCode is required.' });
    }

    const cleanShortcode = String(shortCode).trim();
    const accessToken = await getDarajaAccessToken();
    const payload = {
      ShortCode: cleanShortcode,
      AccountNumber: accountNumber ? String(accountNumber).trim() : '',
      PhoneNumber: phone ? formatKenyanPhone(phone) : '',
    };

    const response = await fetch(C2B_HAKIKISHA_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let hakikishaData = null;
    try {
      hakikishaData = text ? JSON.parse(text) : {};
    } catch {
      return res.status(response.status).json({
        success: false,
        verified: false,
        error: `Safaricom C2B Hakikisha returned non-JSON response (${response.status}): ${text.slice(0, 200)}`,
      });
    }

    if (!response.ok) {
      return res.status(400).json({
        success: false,
        verified: false,
        error: hakikishaData.errorMessage || hakikishaData.ResponseDescription || hakikishaData.ResponseMessage || `Safaricom C2B Hakikisha lookup failed for ShortCode ${cleanShortcode}.`,
        details: hakikishaData,
      });
    }

    const resolvedOrgName = hakikishaData?.OrgName || hakikishaData?.BusinessName || hakikishaData?.name;

    if (!resolvedOrgName) {
      return res.status(404).json({
        success: false,
        verified: false,
        error: `Safaricom merchant not found for ShortCode ${cleanShortcode}. Ensure the shortcode is active on Safaricom Daraja.`,
        details: hakikishaData,
      });
    }

    return res.json({
      success: true,
      verified: true,
      shortCode: cleanShortcode,
      name: resolvedOrgName,
      accountNumber: accountNumber || '',
      provider: 'Safaricom M-Pesa C2B Hakikisha',
      upstreamVerified: true,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      verified: false,
      error: error.message || 'Internal server error during C2B Hakikisha verification.',
    });
  }
});

/**
 * Safaricom B2B Hakikisha - Organization Shortcode Verification (Query Org Info)
 * Queries Safaricom Daraja /sfcverify/v1/query/info endpoint.
 */
app.post('/api/mpesa/hakikisha/b2b', async (req, res) => {
  try {
    const { shortCode, identifierType } = req.body;
    if (!shortCode) {
      return res.status(400).json({ success: false, verified: false, error: 'shortCode is required.' });
    }

    const cleanShortcode = String(shortCode).trim();
    const accessToken = await getDarajaAccessToken();
    const payload = {
      IdentifierType: String(identifierType || '4'),
      Identifier: cleanShortcode,
    };

    const response = await fetch(B2B_HAKIKISHA_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status >= 400 ? response.status : 400).json({
        success: false,
        verified: false,
        error: data.errorMessage || data.ResponseDescription || `Safaricom B2B Hakikisha lookup failed for ${cleanShortcode}.`,
        details: data,
      });
    }

    return res.json({
      success: true,
      verified: true,
      shortCode: cleanShortcode,
      details: data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      verified: false,
      error: error.message || 'Internal server error during B2B Hakikisha verification.',
    });
  }
});

/**
 * Create a BOLT-11 Lightning Invoice to Receive Sats (e.g. from Wallet of Satoshi)
 */
app.post('/api/lightning/create-invoice', async (req, res) => {
  try {
    const { satsAmount, memo } = req.body;
    const amount = parseInt(satsAmount, 10);
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: 'A positive satsAmount is required to generate a Lightning invoice.',
      });
    }

    const lnbitsUrl = process.env.LNBITS_URL;
    const lnbitsKey = process.env.LNBITS_INVOICE_KEY;
    const lndRestUrl = process.env.LND_REST_URL;
    const lndMacaroon = process.env.LND_MACAROON || process.env.MACAROON;

    // 1. LNbits Integration
    if (lnbitsUrl && lnbitsKey) {
      const cleanUrl = lnbitsUrl.replace(/\/+$/, '');
      const invoiceRes = await fetch(`${cleanUrl}/api/v1/payments`, {
        method: 'POST',
        headers: {
          'X-Api-Key': lnbitsKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          out: false,
          amount: amount,
          memo: memo || 'Ye₿ente Deposit',
        }),
      });

      const invoiceData = await invoiceRes.json();
      if (!invoiceRes.ok) {
        return res.status(400).json({
          success: false,
          error: invoiceData.detail || invoiceData.message || 'LNbits node failed to generate invoice.',
        });
      }

      return res.json({
        success: true,
        configured: true,
        invoice: invoiceData.payment_request,
        paymentHash: invoiceData.payment_hash,
        satsAmount: amount,
        nodeType: 'lnbits',
      });
    }

    // 2. LND REST Integration
    if (lndRestUrl && lndMacaroon) {
      const cleanUrl = lndRestUrl.replace(/\/+$/, '');
      const lndRes = await fetch(`${cleanUrl}/v1/invoices`, {
        method: 'POST',
        headers: {
          'Grpc-Metadata-macaroon': lndMacaroon,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          value: amount,
          memo: memo || 'Ye₿ente Deposit',
        }),
      });

      const lndData = await lndRes.json();
      if (!lndRes.ok) {
        return res.status(400).json({
          success: false,
          error: lndData.message || 'LND node failed to generate invoice.',
        });
      }

      const paymentHash = lndData.r_hash
        ? Buffer.from(lndData.r_hash, 'base64').toString('hex')
        : '';

      return res.json({
        success: true,
        configured: true,
        invoice: lndData.payment_request,
        paymentHash: paymentHash,
        satsAmount: amount,
        nodeType: 'lnd',
      });
    }

    // 3. No node configured
    return res.status(501).json({
      success: false,
      configured: false,
      error: 'No Lightning node is configured. To accept live payments from Wallet of Satoshi, set LNBITS_URL & LNBITS_INVOICE_KEY (or LND_REST_URL & MACAROON) in your .env.',
      satsAmount: amount,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal error creating Lightning invoice.',
    });
  }
});

/**
 * Check Invoice Settlement Status (Polling status for Wallet of Satoshi payment)
 */
app.get('/api/lightning/invoice-status/:paymentHash', async (req, res) => {
  try {
    const { paymentHash } = req.params;
    if (!/^[0-9a-f]{64}$/i.test(String(paymentHash))) {
      return res.status(400).json({ success: false, settled: false, error: 'Invalid payment hash.' });
    }

    const lnbitsUrl = process.env.LNBITS_URL;
    const lnbitsKey = process.env.LNBITS_INVOICE_KEY;
    const lndRestUrl = process.env.LND_REST_URL;
    const lndMacaroon = process.env.LND_MACAROON || process.env.MACAROON;

    // 1. LNbits Status Check
    if (lnbitsUrl && lnbitsKey) {
      const cleanUrl = lnbitsUrl.replace(/\/+$/, '');
      const statusRes = await fetch(`${cleanUrl}/api/v1/payments/${paymentHash}`, {
        headers: {
          'X-Api-Key': lnbitsKey,
        },
      });

      const statusData = await statusRes.json();
      if (!statusRes.ok) {
        return res.status(400).json({
          success: false,
          error: statusData.detail || 'Failed to query invoice status from LNbits.',
        });
      }

      return res.json({
        success: true,
        settled: Boolean(statusData.paid),
        paid: Boolean(statusData.paid),
        satsAmount: statusData.details?.amount ? Math.round(statusData.details.amount / 1000) : 0,
        preimage: statusData.preimage || statusData.details?.preimage || '',
      });
    }

    // 2. LND Status Check
    if (lndRestUrl && lndMacaroon) {
      const cleanUrl = lndRestUrl.replace(/\/+$/, '');
      const statusRes = await fetch(`${cleanUrl}/v1/invoice/${paymentHash}`, {
        headers: {
          'Grpc-Metadata-macaroon': lndMacaroon,
        },
      });

      const lndData = await statusRes.json();
      if (!statusRes.ok) {
        return res.status(400).json({
          success: false,
          error: lndData.message || 'Failed to query invoice status from LND.',
        });
      }

      return res.json({
        success: true,
        settled: Boolean(lndData.settled),
        paid: Boolean(lndData.settled),
        satsAmount: Number(lndData.value) || 0,
        preimage: lndData.r_preimage || '',
      });
    }

    return res.status(501).json({
      success: false,
      configured: false,
      error: 'Lightning node not configured for status check.',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal error checking invoice status.',
    });
  }
});

/**
 * Asynchronous Callback Webhook Receiver
 * Safaricom invokes this endpoint when payment processing finishes
 */
app.post('/api/mpesa/callback', (req, res) => {
  // Only Safaricom knows the callback URL's token (MPESA_CALLBACK_URL ends in ?token=MPESA_CALLBACK_TOKEN).
  const expected = process.env.MPESA_CALLBACK_TOKEN || '';
  const given = String(req.query.token || '');
  if (!expected || given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return res.status(403).json({ ResultCode: 1, ResultDesc: 'Rejected' });
  }

  const stkCallback = req.body?.Body?.stkCallback;
  const checkoutRequestId = stkCallback?.CheckoutRequestID;

  let mpesaReceiptNumber = null;
  const items = stkCallback?.CallbackMetadata?.Item;
  if (Array.isArray(items)) {
    const receiptItem = items.find((i) => i && i.Name === 'MpesaReceiptNumber');
    if (receiptItem && receiptItem.Value) {
      mpesaReceiptNumber = String(receiptItem.Value);
    }
  }

  if (checkoutRequestId) {
    recentCallbacks.set(String(checkoutRequestId), {
      receivedAt: new Date().toISOString(),
      resultCode: stkCallback.ResultCode,
      resultDesc: String(stkCallback.ResultDesc || 'Processed').slice(0, 200),
      mpesaReceiptNumber,
    });
    console.log(`[mpesa] STK result ${stkCallback.ResultCode} for ${checkoutRequestId}`);
  }

  // Safaricom requires a rapid HTTP 200 with ResultCode 0
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

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
    <title>ye₿ente</title>
    <style>
      body { background: #120E16; color: #F8F0E7; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
      h1 { color: #763698; font-size: 2.2rem; margin-bottom: 0.5rem; letter-spacing: -0.03em; }
      p { color: #D1B9B3; font-size: 0.95rem; margin: 0.3rem 0; }
      a { color: #34D399; text-decoration: none; margin-top: 1rem; display: inline-block; font-family: monospace; }
    </style>
  </head>
  <body>
    <h1>ye₿ente</h1>
    <p>Backend bridge is live and operational.</p>
    <p>Assets are compiling...</p>
    <a href="/api/health">Verify /api/health</a>
  </body>
</html>`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`yebente Daraja bridge running on 0.0.0.0:${PORT} [${DARAJA_ENV}]`);
});

import express from 'express';
import dotenv from 'dotenv';

dotenv.config({ override: true });

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Safaricom Daraja Environment URLs
const DARAJA_ENV = process.env.MPESA_ENVIRONMENT || 'sandbox';
const BASE_URL =
  DARAJA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

// In-memory store for webhook callbacks
const recentCallbacks = new Map();
const callbackHistory = [];

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

    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const callbackUrl = process.env.MPESA_CALLBACK_URL;

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

    if (!callbackUrl) {
      return res.status(500).json({
        success: false,
        error: 'M-Pesa STK Push failed: MPESA_CALLBACK_URL is not configured in .env. Safaricom requires a publicly accessible HTTPS webhook URL to deliver payment confirmation.',
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

    if (recentCallbacks.has(checkoutRequestId)) {
      const cb = recentCallbacks.get(checkoutRequestId);
      return res.json({
        success: true,
        source: 'callback',
        responseCode: '0',
        resultCode: cb.resultCode,
        resultDesc: cb.resultDesc,
        checkoutRequestId,
        details: cb.payload,
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

    return res.json({
      success: response.ok,
      source: 'daraja_query',
      responseCode: data.ResponseCode,
      resultCode: data.ResultCode,
      resultDesc: data.ResultDesc,
      merchantRequestId: data.MerchantRequestID,
      checkoutRequestId: data.CheckoutRequestID,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error during STK Query.',
    });
  }
});

const B2C_HAKIKISHA_URL =
  DARAJA_ENV === 'production'
    ? 'https://api.safaricom.co.ke/mpesa/b2c/hakikisha/v1/hakikisha'
    : 'https://sandbox.safaricom.co.ke/mpesa/b2c/hakikisha/v1/hakikisha';

const C2B_HAKIKISHA_URL =
  DARAJA_ENV === 'production'
    ? 'https://api.safaricom.co.ke/c2b_hakikisha/v1/notify'
    : 'https://sandbox.safaricom.co.ke/c2b_hakikisha/v1/notify';

/**
 * Safaricom B2C Hakikisha - Recipient Subscriber Name Verification
 * Queries Safaricom Daraja B2C Hakikisha endpoint. No fallback names.
 */
app.post('/api/mpesa/hakikisha/b2c', async (req, res) => {
  try {
    const rawPhone = req.body.phone || req.query.phone;
    if (!rawPhone) {
      return res.status(400).json({ success: false, verified: false, error: 'Phone number is required.' });
    }

    const formatted = formatKenyanPhone(rawPhone);
    if (!/^254[71]\d{8}$/.test(formatted)) {
      return res.status(400).json({
        success: false,
        verified: false,
        error: 'Invalid Kenyan phone format. Must be a valid Safaricom subscriber number (07XXXXXXXX or 01XXXXXXXX).',
      });
    }

    const initiator = process.env.MPESA_INITIATOR_NAME;
    const security = process.env.MPESA_SECURITY_CREDENTIAL;
    const shortcode = process.env.MPESA_B2C_SHORTCODE || process.env.MPESA_SHORTCODE;

    if (!initiator || !security) {
      return res.status(500).json({
        success: false,
        verified: false,
        error: 'Safaricom B2C Hakikisha failed: MPESA_INITIATOR_NAME and MPESA_SECURITY_CREDENTIAL must be configured in .env. Obtain credentials from your Safaricom Daraja account.',
      });
    }

    const accessToken = await getDarajaAccessToken();
    const payload = {
      requestID: `REQ${Date.now()}`,
      timestamp: getTimestamp(),
      msisdn: formatted,
      shortcode: shortcode,
    };

    const response = await fetch(B2C_HAKIKISHA_URL, {
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
        error: `Safaricom B2C Hakikisha returned non-JSON response (${response.status}): ${text.slice(0, 200)}`,
      });
    }

    if (!response.ok) {
      return res.status(400).json({
        success: false,
        verified: false,
        error: hakikishaData.errorMessage || hakikishaData.ResponseDescription || hakikishaData.ResponseMessage || 'Safaricom B2C Hakikisha lookup failed.',
        details: hakikishaData,
      });
    }

    const resolvedName =
      hakikishaData?.CustomerName ||
      hakikishaData?.ReceiverName ||
      hakikishaData?.name ||
      hakikishaData?.recipientName;

    if (!resolvedName) {
      return res.status(404).json({
        success: false,
        verified: false,
        error: `Safaricom subscriber name not found for phone +${formatted}. Upstream response: ${JSON.stringify(hakikishaData)}`,
        details: hakikishaData,
      });
    }

    return res.json({
      success: true,
      verified: true,
      phone: formatted,
      formattedPhone: `+${formatted.slice(0, 3)} ${formatted.slice(3, 6)} ${formatted.slice(6, 9)} ${formatted.slice(9)}`,
      name: resolvedName,
      provider: 'Safaricom M-Pesa Hakikisha',
      accountStatus: 'Active',
      upstreamVerified: true,
      details: hakikishaData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      verified: false,
      error: error.message || 'Internal server error during B2C Hakikisha verification.',
    });
  }
});

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

// Backwards-compatible alias for existing frontend callers
app.post('/api/mpesa/verify-recipient', (req, res) => {
  req.url = '/api/mpesa/hakikisha/b2c';
  app.handle(req, res);
});

/**
 * B2C Payout / Disburse Sats or KES to M-Pesa Phone Number
 * Strictly queries Safaricom B2C API. No mock fallbacks.
 */
app.post('/api/mpesa/payout', async (req, res) => {
  try {
    const { phone, amount, currency, satsAmount, recipientName, note } = req.body;

    if (!phone || !amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, error: 'Valid phone and amount are required.' });
    }

    const formatted = formatKenyanPhone(phone);
    if (!/^254[71]\d{8}$/.test(formatted)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Kenyan phone number. Must use Kenya country code +254 (07XXXXXXXX or 01XXXXXXXX).',
      });
    }

    const b2cInitiator = process.env.MPESA_INITIATOR_NAME;
    const b2cSecurity = process.env.MPESA_SECURITY_CREDENTIAL;
    const b2cShortcode = process.env.MPESA_B2C_SHORTCODE || process.env.MPESA_SHORTCODE;
    const callbackUrl = process.env.MPESA_CALLBACK_URL;

    if (!b2cInitiator || !b2cSecurity || !b2cShortcode) {
      return res.status(500).json({
        success: false,
        error: 'M-Pesa B2C Payout failed: Missing required B2C credentials. Configure MPESA_INITIATOR_NAME, MPESA_SECURITY_CREDENTIAL, and MPESA_B2C_SHORTCODE in .env, and ensure utility float is funded in the Safaricom B2C disbursement account.',
      });
    }

    if (!callbackUrl) {
      return res.status(500).json({
        success: false,
        error: 'M-Pesa B2C Payout failed: MPESA_CALLBACK_URL is not configured in .env. Safaricom requires a public HTTPS webhook URL to deliver disbursement confirmation.',
      });
    }

    const accessToken = await getDarajaAccessToken();
    const b2cPayload = {
      InitiatorName: b2cInitiator,
      SecurityCredential: b2cSecurity,
      CommandID: 'BusinessPayment',
      Amount: Math.round(Number(amount)),
      PartyA: b2cShortcode,
      PartyB: formatted,
      Remarks: note || 'Bitcoin Sats Cashout',
      QueueTimeOutURL: callbackUrl,
      ResultURL: callbackUrl,
      Occasion: 'Settlement',
    };

    const b2cResponse = await fetch(`${BASE_URL}/mpesa/b2c/v1/paymentrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(b2cPayload),
    });

    const b2cData = await b2cResponse.json();

    if (!b2cResponse.ok || b2cData.ResponseCode !== '0') {
      return res.status(400).json({
        success: false,
        error: b2cData.errorMessage || b2cData.ResponseDescription || 'Safaricom B2C payment request failed.',
        details: b2cData,
      });
    }

    return res.json({
      success: true,
      referenceNumber: b2cData.ConversationID || b2cData.OriginatorConversationID,
      recipientName: recipientName || formatted,
      phone: formatted,
      amount: Number(amount),
      currency: currency || 'KES',
      satsAmount: satsAmount || 0,
      status: 'submitted',
      message: `M-Pesa payout dispatched successfully. ConversationID: ${b2cData.ConversationID}`,
      darajaResponse: b2cData,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error during M-Pesa payout.',
    });
  }
});

/**
 * Lightning Network Settlement / Disbursement Endpoint
 * Routes a BOLT-11 Lightning payment to external wallets (Wallet of Satoshi, Blink, etc.)
 * via an LNbits or LND node when configured.
 */
app.post('/api/lightning/disburse', async (req, res) => {
  try {
    const { invoice, satsAmount, destination } = req.body;

    if (!invoice) {
      return res.status(400).json({
        success: false,
        error: 'BOLT-11 invoice string is required for Lightning disbursement.',
      });
    }

    const lnbitsUrl = process.env.LNBITS_URL;
    const lnbitsAdminKey = process.env.LNBITS_ADMIN_KEY;
    const lndRestUrl = process.env.LND_REST_URL;
    const lndMacaroon = process.env.LND_MACAROON;

    // 1. If LNbits is configured
    if (lnbitsUrl && lnbitsAdminKey) {
      const cleanUrl = lnbitsUrl.replace(/\/+$/, '');
      const payRes = await fetch(`${cleanUrl}/api/v1/payments`, {
        method: 'POST',
        headers: {
          'X-Api-Key': lnbitsAdminKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ out: true, bolt11: invoice }),
      });

      const payData = await payRes.json();
      if (!payRes.ok) {
        return res.status(400).json({
          success: false,
          error: payData.detail || payData.message || 'LNbits failed to route Lightning payment.',
          details: payData,
        });
      }

      return res.json({
        success: true,
        settled: true,
        paymentHash: payData.payment_hash,
        satsAmount: Number(satsAmount) || 0,
        destination: destination || '',
        message: 'Lightning payment settled successfully via LNbits node.',
      });
    }

    // 2. If LND is configured
    if (lndRestUrl && lndMacaroon) {
      const cleanUrl = lndRestUrl.replace(/\/+$/, '');
      const lndRes = await fetch(`${cleanUrl}/v1/channels/transactions`, {
        method: 'POST',
        headers: {
          'Grpc-Metadata-macaroon': lndMacaroon,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payment_request: invoice }),
      });

      const lndData = await lndRes.json();
      if (!lndRes.ok || lndData.payment_error) {
        return res.status(400).json({
          success: false,
          error: lndData.payment_error || 'LND failed to route Lightning payment.',
          details: lndData,
        });
      }

      return res.json({
        success: true,
        settled: true,
        paymentHash: lndData.payment_hash,
        satsAmount: Number(satsAmount) || 0,
        destination: destination || '',
        message: 'Lightning payment settled successfully via LND node.',
      });
    }

    // 3. If no Lightning node is configured in environment
    return res.status(501).json({
      success: false,
      settled: false,
      configured: false,
      error: 'Lightning disbursement node is not configured. To enable automated settlement to external Lightning wallets (such as Wallet of Satoshi), configure LNBITS_URL & LNBITS_ADMIN_KEY (or LND_REST_URL & LND_MACAROON) in .env.',
      invoice,
      satsAmount: Number(satsAmount) || 0,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal error processing Lightning disbursement.',
    });
  }
});

/**
 * Asynchronous Callback Webhook Receiver
 * Safaricom invokes this endpoint when payment processing finishes
 */
app.post('/api/mpesa/callback', (req, res) => {
  const body = req.body;
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Safaricom Webhook Callback Received:`, JSON.stringify(body));

  const stkCallback = body?.Body?.stkCallback;
  const checkoutRequestId = stkCallback?.CheckoutRequestID;
  const resultCode = stkCallback?.ResultCode;
  const resultDesc = stkCallback?.ResultDesc;

  const record = {
    receivedAt: timestamp,
    checkoutRequestId: checkoutRequestId || body?.ConversationID || `CB-${Date.now()}`,
    resultCode: resultCode ?? (body?.Result?.ResultCode ?? 0),
    resultDesc: resultDesc || body?.Result?.ResultDesc || 'Processed',
    payload: body,
  };

  if (checkoutRequestId) {
    recentCallbacks.set(checkoutRequestId, record);
  }
  callbackHistory.unshift(record);
  if (callbackHistory.length > 50) {
    callbackHistory.pop();
  }

  // Safaricom requires a rapid HTTP 200 with ResultCode 0
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

/**
 * List recent webhook callbacks (for Postman/client testing)
 */
app.get('/api/mpesa/callbacks', (req, res) => {
  res.json({
    success: true,
    count: callbackHistory.length,
    callbacks: callbackHistory,
  });
});

/**
 * Get callback by checkoutRequestId
 */
app.get('/api/mpesa/callback/:checkoutRequestId', (req, res) => {
  const { checkoutRequestId } = req.params;
  const callback = recentCallbacks.get(checkoutRequestId);
  if (!callback) {
    return res.status(404).json({
      success: false,
      message: `No callback recorded for CheckoutRequestID: ${checkoutRequestId}`,
    });
  }
  res.json({
    success: true,
    callback,
  });
});

app.listen(PORT, () => {
  console.log(`yebente Daraja bridge running on port ${PORT} [${DARAJA_ENV}]`);
});


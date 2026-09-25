import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Safaricom Daraja Environment URLs
const DARAJA_ENV = process.env.MPESA_ENVIRONMENT || 'sandbox';
const BASE_URL =
  DARAJA_ENV === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

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

/**
 * Obtain OAuth Access Token from Safaricom Daraja API
 */
async function getDarajaAccessToken() {
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
  return data.access_token;
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
      return res.status(400).json({ error: 'Valid phone and amount are required.' });
    }

    const shortcode = process.env.MPESA_SHORTCODE || '174379'; // Sandbox default shortcode
    const passkey = process.env.MPESA_PASSKEY;
    const callbackUrl = process.env.MPESA_CALLBACK_URL || 'https://example.com/api/mpesa/callback';

    if (!passkey) {
      return res.status(500).json({ error: 'MPESA_PASSKEY is not configured.' });
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
      return res.status(400).json({ error: 'checkoutRequestId is required.' });
    }

    const shortcode = process.env.MPESA_SHORTCODE || '174379';
    const passkey = process.env.MPESA_PASSKEY;

    if (!passkey) {
      return res.status(500).json({ error: 'MPESA_PASSKEY is not configured.' });
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

/**
 * Asynchronous Callback Webhook Receiver
 */
app.post('/api/mpesa/callback', (req, res) => {
  // Webhook receiver for real-time Safaricom callback payloads
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
});

app.listen(PORT, () => {
  console.log(`yebente Daraja bridge running on port ${PORT} [${DARAJA_ENV}]`);
});

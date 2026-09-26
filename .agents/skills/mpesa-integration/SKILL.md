---
name: mpesa-integration
description: >-
  Comprehensive guide and operational runbook for integrating Safaricom M-Pesa Daraja
  payment rails (STK Push, Status Query, B2C Payouts, C2B Callbacks) into web, mobile,
  or backend applications. Use when implementing or troubleshooting M-Pesa authentication,
  OAuth token caching, phone number validation, webhook verification, or transitioning
  from Sandbox to Live production.
---

# Safaricom M-Pesa Daraja Integration Runbook

This skill encapsulates the complete architectural, backend, and security runbook for integrating Safaricom M-Pesa Daraja APIs into any software application.

---

## 1. Architectural Principles

1. **Transaction Rail, Not Balance Ledger**:
   - Safaricom Daraja does not expose an API to query an individual subscriber SIM card balance. Third-party applications act as payment receivers (C2B / STK Push) or payout dispatchers (B2C / B2B), never balance custodians.
2. **Zero-Simulation Policy**:
   - Never mock payment success, artificial timeouts, or fake transaction reference codes in production-bound code. Every response must come directly from authentic Safaricom gateways or explicit validation errors.
3. **Backend Credential Isolation**:
   - Never expose `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`, or `MPESA_SECURITY_CREDENTIAL` to client-side code. Route all Daraja interactions through a backend bridge (Express, Next.js API, Fastify, or Cloud Functions).
4. **OAuth Token Caching**:
   - Daraja endpoints enforce Incapsula Web Application Firewall (WAF) rate limits. Requesting a new OAuth token on every transaction will trigger HTTP 403 Forbidden blocks. Always cache bearer tokens in memory with an active expiry buffer.

---

## 2. Configuration and Environment Variables

Define the following environment variables in `.env`:

```bash
# Environment Mode: sandbox or live
MPESA_ENV=sandbox

# Daraja Developer Portal App Credentials
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret

# Lipa Na M-Pesa Online (STK Push)
MPESA_SHORTCODE=174379
MPESA_PASSKEY=bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
MPESA_CALLBACK_URL=https://yourdomain.com/api/mpesa/callback

# B2C Payout (Disbursements)
MPESA_B2C_SHORTCODE=600000
MPESA_B2C_INITIATOR_NAME=testapi
MPESA_SECURITY_CREDENTIAL=your_encrypted_credential
MPESA_B2C_QUEUE_TIMEOUT_URL=https://yourdomain.com/api/mpesa/b2c/timeout
MPESA_B2C_RESULT_URL=https://yourdomain.com/api/mpesa/b2c/result
```

---

## 3. Core Technical Modules

### Module 1: In-Memory OAuth Token Caching

```javascript
let cachedToken = null;
let tokenExpiryTime = 0;

async function getMpesaAccessToken(env, consumerKey, consumerSecret) {
  const now = Date.now();
  // Return valid cached token with a 5-minute safety buffer
  if (cachedToken && now < tokenExpiryTime - 5 * 60 * 1000) {
    return cachedToken;
  }

  const baseUrl = env === 'live'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';

  const authHeader = 'Basic ' + Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const response = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Daraja OAuth failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const expiresInSeconds = parseInt(data.expires_in, 10) || 3599;

  cachedToken = data.access_token;
  tokenExpiryTime = now + expiresInSeconds * 1000;
  return cachedToken;
}
```

---

### Module 2: Kenyan Phone Number Normalization

Kenyan mobile phone numbers must be formatted to the 12-digit international format (`2547XXXXXXXX` or `2541XXXXXXXX`):

```typescript
export function formatKenyanPhone(input: string): string {
  const cleaned = input.replace(/\D/g, '');
  if (cleaned.startsWith('254') && cleaned.length === 12) {
    return cleaned;
  }
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return `254${cleaned.slice(1)}`;
  }
  if ((cleaned.startsWith('7') || cleaned.startsWith('1')) && cleaned.length === 9) {
    return `254${cleaned}`;
  }
  return cleaned;
}

export function isValidKenyanPhone(input: string): boolean {
  const formatted = formatKenyanPhone(input);
  return /^254(7|1)\d{8}$/.test(formatted);
}
```

---

### Module 3: Lipa Na M-Pesa Online (STK Push Initiation)

To prompt the subscriber to enter their M-Pesa PIN:

```javascript
function generateStkPassword(shortcode, passkey, timestamp) {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}

function getFormattedTimestamp() {
  const date = new Date();
  const YYYY = date.getFullYear();
  const MM = String(date.getMonth() + 1).padStart(2, '0');
  const DD = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${YYYY}${MM}${DD}${hh}${mm}${ss}`;
}

async function initiateStkPush({ phone, amount, accountReference, transactionDesc }) {
  const token = await getMpesaAccessToken();
  const timestamp = getFormattedTimestamp();
  const password = generateStkPassword(process.env.MPESA_SHORTCODE, process.env.MPESA_PASSKEY, timestamp);

  const payload = {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline', // or CustomerBuyGoodsOnline for Till
    Amount: Math.round(amount),
    PartyA: formatKenyanPhone(phone),
    PartyB: process.env.MPESA_SHORTCODE,
    PhoneNumber: formatKenyanPhone(phone),
    CallBackURL: process.env.MPESA_CALLBACK_URL,
    AccountReference: accountReference.slice(0, 12),
    TransactionDesc: transactionDesc.slice(0, 100),
  };

  const response = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return await response.json();
}
```

---

### Module 4: STK Push Status Query (Polling)

When web clients wait for the subscriber to enter their PIN:

```javascript
async function queryStkStatus(checkoutRequestId) {
  const token = await getMpesaAccessToken();
  const timestamp = getFormattedTimestamp();
  const password = generateStkPassword(process.env.MPESA_SHORTCODE, process.env.MPESA_PASSKEY, timestamp);

  const payload = {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  };

  const response = await fetch(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return await response.json();
}
```

---

### Module 5: B2C Payout (Disbursement / Cashout)

Used to send funds directly from the business utility account to a subscriber handset:

```javascript
async function sendB2CPayout({ phone, amount, remarks, occasion }) {
  const token = await getMpesaAccessToken();
  const payload = {
    InitiatorName: process.env.MPESA_B2C_INITIATOR_NAME,
    SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
    CommandID: 'BusinessPayment', // SalaryPayment | PromotionPayment
    Amount: Math.round(amount),
    PartyA: process.env.MPESA_B2C_SHORTCODE,
    PartyB: formatKenyanPhone(phone),
    Remarks: remarks.slice(0, 100),
    QueueTimeOutURL: process.env.MPESA_B2C_QUEUE_TIMEOUT_URL,
    ResultURL: process.env.MPESA_B2C_RESULT_URL,
    Occasion: occasion ? occasion.slice(0, 100) : '',
  };

  const response = await fetch(`${baseUrl}/mpesa/b2c/v1/paymentrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return await response.json();
}
```

---

## 4. Key Error Codes and Interpretations

Result Code | Meaning | Actionable Developer Resolution
:--- | :--- | :---
`0` | Success | Transaction completed and funds settled. Extract `MpesaReceiptNumber`.
`1032` | Request Cancelled | User dismissed the STK prompt or pressed Cancel on handset.
`1037` | Timeout | Subscriber handset unreachable, SIM offline, or PIN prompt expired (40s limit).
`1` | Insufficient Balance | Subscriber M-Pesa balance cannot cover the requested payment amount.
`2001` | Invalid PIN | User entered an incorrect M-Pesa PIN.
`403` | Forbidden / WAF Block | Token cache missed or rate limit hit on `/oauth/v1/generate`. Verify token caching.
`500.001.1001` | Duplicate Transaction | Safaricom detected a duplicate CheckoutRequest or processing collision.

---

## 5. Transitioning from Sandbox to Live Production

1. **KYC Documents Preparation**:
   - Certificate of Incorporation or Business Registration.
   - CR12 (valid within 90 days) showing business directorship.
   - National IDs/Passports and KRA PIN certificates for all directors.
   - Business KRA PIN certificate.
2. **Shortcode & Operator Provisioning**:
   - Acquire a Safaricom Paybill (e.g. 5/6 digits) or Buy Goods Till (e.g. 6/7 digits).
   - Log in to the M-Pesa Organization Portal (`https://org.ke.m-pesa.com`).
   - Create an API Operator user with appropriate operational roles.
3. **Security Credential Generation**:
   - Download the Safaricom Live Public Certificate from Daraja.
   - Encrypt the Operator password using OpenSSL (RSA PKCS#1 padding) and Base64 encode it.
4. **Go-Live Application on Daraja**:
   - Navigate to `developer.safaricom.co.ke` -> Go Live.
   - Submit business documentation and link to the live shortcode.
   - Receive production `Consumer Key` and `Consumer Secret`.
5. **Production Infrastructure**:
   - Update `MPESA_ENV=live`.
   - Update Base URL to `https://api.safaricom.co.ke`.
   - Ensure callback URLs use public HTTPS domains with TLS 1.3 certificates.
   - Maintain transaction reconciliation using `MpesaReceiptNumber` as the unique database constraint.

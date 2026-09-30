---
name: mpesa-integration
description: >-
  Comprehensive guide and operational runbook for integrating Safaricom M-Pesa Daraja
  payment rails (STK Push, Status Query, B2C Payouts, B2B, Hakikisha, Ratiba, Account Balance,
  Reversals, C2B Callbacks, KYC, and SIM Operations) into web, mobile, or backend applications.
  Use when implementing or troubleshooting M-Pesa authentication, OAuth token caching, phone
  number validation, webhook verification, or transitioning from Sandbox to Live production.
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
5. **Apigee API Product Binding**:
   - Daraja routes all endpoints through Google Apigee. If an endpoint returns HTTP 401.001 with message "Invalid API call as no apiproduct match found", the developer app does not have that specific API product enabled in the Safaricom Developer Portal.

---

## 2. Configuration and Environment Variables

Define the following environment variables in `.env`:

```bash
# Environment Mode: sandbox or production
MPESA_ENVIRONMENT=sandbox

# Daraja Developer Portal App Credentials
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret

# Lipa Na M-Pesa Online (STK Push)
MPESA_SHORTCODE=174379
MPESA_PASSKEY=bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
MPESA_CALLBACK_URL=https://yourdomain.com/api/mpesa/callback

# B2C & B2B Disbursements / Float Operations
MPESA_B2C_SHORTCODE=600000
MPESA_INITIATOR_NAME=testapi
MPESA_SECURITY_CREDENTIAL=your_encrypted_credential
```

---

## 3. Core Technical Modules

### Module 1: In-Memory OAuth Token Caching

```javascript
let cachedToken = null;
let tokenExpiryTime = 0;

async function getMpesaAccessToken(env, consumerKey, consumerSecret) {
  const now = Date.now();
  if (cachedToken && now < tokenExpiryTime - 5 * 60 * 1000) {
    return cachedToken;
  }

  const baseUrl = env === 'production'
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

```javascript
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
```

---

### Module 3: Lipa Na M-Pesa Online (STK Push)

Initiates an interactive SIM Toolkit push on the subscriber phone:

- **Endpoint**: `POST /mpesa/stkpush/v1/processrequest`
- **Password**: `Base64(BusinessShortCode + Passkey + Timestamp)`
- **Timestamp Format**: `YYYYMMDDHHmmss` in East Africa Time (UTC+3).

```javascript
async function initiateStkPush({ phone, amount, accountReference, transactionDesc }) {
  const token = await getMpesaAccessToken();
  const timestamp = getTimestamp();
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline', // or CustomerBuyGoodsOnline
    Amount: Math.round(amount),
    PartyA: formatKenyanPhone(phone),
    PartyB: shortcode,
    PhoneNumber: formatKenyanPhone(phone),
    CallBackURL: callbackUrl,
    AccountReference: accountReference.slice(0, 12),
    TransactionDesc: transactionDesc.slice(0, 13),
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

### Module 4: STK Push Status Query

Polls the status of an ongoing STK Push session when webhook callback is delayed:

- **Endpoint**: `POST /mpesa/stkpushquery/v1/query`

```javascript
async function queryStkStatus(checkoutRequestId) {
  const token = await getMpesaAccessToken();
  const timestamp = getTimestamp();
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');

  const payload = {
    BusinessShortCode: shortcode,
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

### Module 5: B2C Payout (Disbursement / Cashout) & B2Pochi

Used to send funds directly from the business utility account to a subscriber handset:

- **Endpoint**: `POST /mpesa/b2c/v1/paymentrequest`
- **CommandID Values**:
  - `BusinessPayment`: Normal business payments / cashouts.
  - `SalaryPayment`: Employee salaries.
  - `PromotionPayment`: Promotional disbursements.
  - `BusinessPayToPochi`: Disbursement to Pochi la Biashara account.

```javascript
async function sendB2CPayout({ phone, amount, remarks, occasion, commandId }) {
  const token = await getMpesaAccessToken();
  const payload = {
    InitiatorName: process.env.MPESA_INITIATOR_NAME,
    SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
    CommandID: commandId || 'BusinessPayment',
    Amount: Math.round(amount),
    PartyA: process.env.MPESA_B2C_SHORTCODE || '600000',
    PartyB: formatKenyanPhone(phone),
    Remarks: remarks.slice(0, 100),
    QueueTimeOutURL: process.env.MPESA_CALLBACK_URL,
    ResultURL: process.env.MPESA_CALLBACK_URL,
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

### Module 6: B2C Hakikisha (Subscriber Name Verification)

Used to verify the legal registered name of a recipient subscriber before sending funds:

- **Endpoint**: `POST /mpesa/b2c/hakikisha/v1/hakikisha`
- **Authentication**: Bearer OAuth 2.0 token (does not require initiator security credentials).
- **Wire Protocol**: Safaricom Google Apigee requires nested `{ header, body }` structure.

```javascript
async function verifyRecipientHakikisha({ phone, shortcode }) {
  const token = await getMpesaAccessToken();
  const payload = {
    header: {
      requestID: `REQ${Date.now()}`,
      timestamp: new Date().toISOString(),
    },
    body: {
      msisdn: formatKenyanPhone(phone),
      shortcode: String(shortcode || '600000'),
    },
  };

  const response = await fetch(`${baseUrl}/mpesa/b2c/hakikisha/v1/hakikisha`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok || data.header?.status !== '200') {
    throw new Error(data.body?.message || data.header?.message || 'Hakikisha verification failed');
  }

  const { firstName, middleName, lastName } = data.body || {};
  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ').trim();
  return {
    verified: true,
    name: fullName,
    phone: formatKenyanPhone(phone),
  };
}
```

---

### Module 7: B2B Payment Request

Transfers funds between businesses (Paybill to Paybill, Paybill to Buy Goods Merchant, or utility transfer):

- **Endpoint**: `POST /mpesa/b2b/v1/paymentrequest`
- **CommandID Values**: `BusinessPayBill`, `BusinessBuyGoods`, `DisburseFundsToBusiness`, `BusinessToBusinessTransfer`.
- **SenderIdentifierType**: `4` (Paybill/Shortcode).
- **RecieverIdentifierType**: `4` (Paybill/Shortcode) or `2` (Till/Merchant).

```javascript
async function sendB2BPayment({ partyA, partyB, amount, accountReference, remarks, commandId }) {
  const token = await getMpesaAccessToken();
  const payload = {
    Initiator: process.env.MPESA_INITIATOR_NAME,
    SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
    CommandID: commandId || 'BusinessPayBill',
    SenderIdentifierType: '4',
    RecieverIdentifierType: '4',
    Amount: String(Math.round(amount)),
    PartyA: String(partyA || '600000'),
    PartyB: String(partyB),
    AccountReference: accountReference || 'INV001',
    Remarks: remarks || 'B2B Settlement',
    QueueTimeOutURL: process.env.MPESA_CALLBACK_URL,
    ResultURL: process.env.MPESA_CALLBACK_URL,
  };

  const response = await fetch(`${baseUrl}/mpesa/b2b/v1/paymentrequest`, {
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

### Module 8: B2B Hakikisha (Organization Info Verification)

Queries official business organization information and shortcode validity:

- **Endpoint**: `POST /sfcverify/v1/query/info`
- **Authentication**: Bearer OAuth 2.0 token.

```javascript
async function queryOrgInfo(shortcode, identifierType = '4') {
  const token = await getMpesaAccessToken();
  const payload = {
    IdentifierType: String(identifierType),
    Identifier: String(shortcode),
  };

  const response = await fetch(`${baseUrl}/sfcverify/v1/query/info`, {
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

### Module 9: Account Balance Query

Queries real working, utility, and charges balances of an organization shortcode:

- **Endpoint**: `POST /mpesa/accountbalance/v1/query`
- **Result Mechanism**: Asynchronous callback to `ResultURL`. Safaricom responds with immediate HTTP 200 containing `ConversationID`.

```javascript
async function queryAccountBalance({ shortcode, remarks }) {
  const token = await getMpesaAccessToken();
  const payload = {
    Initiator: process.env.MPESA_INITIATOR_NAME,
    SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
    CommandID: 'AccountBalance',
    PartyA: String(shortcode || '600000'),
    IdentifierType: '4',
    Remarks: remarks || 'Balance Query',
    QueueTimeOutURL: process.env.MPESA_CALLBACK_URL,
    ResultURL: process.env.MPESA_CALLBACK_URL,
  };

  const response = await fetch(`${baseUrl}/mpesa/accountbalance/v1/query`, {
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

### Module 10: General Transaction Status Query

Queries the lifecycle status of any M-Pesa transaction (B2C, B2B, or C2B):

- **Endpoint**: `POST /mpesa/transactionstatus/v1/query`

```javascript
async function queryTransactionStatus({ transactionId, shortcode, remarks }) {
  const token = await getMpesaAccessToken();
  const payload = {
    Initiator: process.env.MPESA_INITIATOR_NAME,
    SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
    CommandID: 'TransactionStatusQuery',
    TransactionID: String(transactionId).trim(),
    PartyA: String(shortcode || '600000'),
    IdentifierType: '4',
    ResultURL: process.env.MPESA_CALLBACK_URL,
    QueueTimeOutURL: process.env.MPESA_CALLBACK_URL,
    Remarks: remarks || 'Status Query',
    Occasion: 'Query',
  };

  const response = await fetch(`${baseUrl}/mpesa/transactionstatus/v1/query`, {
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

### Module 11: Transaction Reversal Request

Initiates reversal of an accidental transaction:

- **Endpoint**: `POST /mpesa/reversal/v1/request`
- **RecieverIdentifierType**: `11` for MSISDN / handset receiver, or `4` for Organization shortcode. Note the specific parameter spelling required by Safaricom: `RecieverIdentifierType`.

```javascript
async function reverseTransaction({ transactionId, amount, receiverParty, receiverIdentifierType = '11', remarks }) {
  const token = await getMpesaAccessToken();
  const payload = {
    Initiator: process.env.MPESA_INITIATOR_NAME,
    SecurityCredential: process.env.MPESA_SECURITY_CREDENTIAL,
    CommandID: 'TransactionReversal',
    TransactionID: String(transactionId).trim(),
    Amount: String(Math.round(amount)),
    ReceiverParty: String(receiverParty || '600000'),
    RecieverIdentifierType: String(receiverIdentifierType),
    ResultURL: process.env.MPESA_CALLBACK_URL,
    QueueTimeOutURL: process.env.MPESA_CALLBACK_URL,
    Remarks: remarks || 'Transaction Reversal',
    Occasion: 'Reversal',
  };

  const response = await fetch(`${baseUrl}/mpesa/reversal/v1/request`, {
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

### Module 12: M-Pesa Ratiba (Standing Orders & Recurring Payments)

Creates automated standing order payment reminder schedules:

- **Endpoint**: `POST /standingorder/v1/createStandingOrderExternal`
- **Paybill TransactionType**: `Standing Order Customer Pay Bill` (`ReceiverPartyIdentifierType: "4"`)
- **Buy Goods TransactionType**: `Standing Order Customer Pay Merchant` (`ReceiverPartyIdentifierType: "2"`)

```javascript
async function createRatibaStandingOrder({
  orderName,
  shortcode,
  phone,
  amount,
  transactionType,
  accountReference,
  frequency,
  startDate,
  endDate,
}) {
  const token = await getMpesaAccessToken();
  const isBuyGoods = transactionType === 'Standing Order Customer Pay Merchant';

  const payload = {
    StandingOrderName: orderName,
    BusinessShortCode: String(shortcode),
    CustomStoId: `STO${Date.now()}`,
    TransactionType: transactionType || (isBuyGoods ? 'Standing Order Customer Pay Merchant' : 'Standing Order Customer Pay Bill'),
    Amount: String(Math.round(amount)),
    PartyA: formatKenyanPhone(phone),
    ReceiverPartyIdentifierType: isBuyGoods ? '2' : '4',
    CallBackURL: process.env.MPESA_CALLBACK_URL,
    AccountReference: accountReference,
    TransactionDesc: 'Recurring Plan',
    Frequency: frequency || 'Monthly',
    StartDate: String(startDate).replace(/[^0-9]/g, ''),
    EndDate: String(endDate).replace(/[^0-9]/g, ''),
  };

  const response = await fetch(`${baseUrl}/standingorder/v1/createStandingOrderExternal`, {
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

### Module 13: C2B URL Registration & Simulation

For classic Customer-to-Business integrations:

- **Register Endpoint**: `POST /mpesa/c2b/v1/registerurl`
- **Simulate Endpoint**: `POST /mpesa/c2b/v1/simulate`

```javascript
async function registerC2BUrls(shortcode, confirmationUrl, validationUrl) {
  const token = await getMpesaAccessToken();
  const payload = {
    ShortCode: String(shortcode),
    ResponseType: 'Completed',
    ConfirmationURL: confirmationUrl,
    ValidationURL: validationUrl,
  };

  const response = await fetch(`${baseUrl}/mpesa/c2b/v1/registerurl`, {
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

### Module 14: Pull Transactions API

Used to retrieve missed transaction records or perform bulk offline transaction sync:

- **Register URL**: `POST /pulltransactions/v1/register`
  - Payload: `{ ShortCode, RequestType, NominatedNumber, CallBackURL }`
- **Query Transactions**: `POST /pulltransactions/v1/query`
  - Payload: `{ ShortCode, StartDate, EndDate, OffSetValue }`

---

### Module 15: Fraud Prevention, KYC & SIM Swap Detection

Used in high-value settlements and financial services to prevent SIM-swap fraud:

- **SIM Swap Check**: `POST /imsi/v2/checkATI` (`{ customerNumber }`)
- **Subscriber Age on Network**: `POST /registration/lookup/v1/checkATI` (`{ customerNumber }`)
- **Government KYC ID Validation**: `POST /v1/KYC-validation/validateID` (`{ requestRefID, shortCode, msisdn, idType, idNumber }`)

---

### Module 16: IoT & SIM Operations Portal

For fleet tracking, point-of-sale machines, and smart metering SIM cards:

- **Search Messages**: `POST /simportal/v1/searchmessages`
- **SIM Lifecycle Status**: `POST /simportal/v1/queryLifeCycleStatus`
- **SIM Activation**: `POST /simportal/v1/simactivation`
- **Suspend/Unsuspend**: `POST /simportal/v1/suspend_unsuspend_sub`

---

## 4. Key Error Codes and Interpretations

Result / Error Code | Meaning | Actionable Developer Resolution
:--- | :--- | :---
`0` | Success | Transaction completed and funds settled. Extract `MpesaReceiptNumber` or `ConversationID`.
`1032` | Request Cancelled | User dismissed the STK prompt or pressed Cancel on handset.
`1037` | Timeout | Subscriber handset unreachable, SIM offline, or PIN prompt expired (40s limit).
`1` | Insufficient Balance | Subscriber M-Pesa balance cannot cover the requested payment amount.
`2001` | Invalid PIN | User entered an incorrect M-Pesa PIN.
`403` | Forbidden / WAF Block | Token cache missed or rate limit hit on `/oauth/v1/generate`. Verify token caching.
`401.001` | No API Product Match | Daraja App does not have the target API product activated in the Safaricom Developer Portal.
`400.002.02` | Invalid RecieverIdentifierType | Incorrect party type provided. For Reversals use `11` (subscriber) or `4` (organization).
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
   - Update `MPESA_ENVIRONMENT=production`.
   - Update Base URL to `https://api.safaricom.co.ke`.
   - Ensure callback URLs use public HTTPS domains with TLS 1.3 certificates.
   - Maintain transaction reconciliation using `MpesaReceiptNumber` as the unique database constraint.

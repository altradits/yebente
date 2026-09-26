/**
 * M-Pesa Daraja Edge Function
 * Compatible with Supabase Edge Functions, Cloudflare Workers, Vercel Edge, and Deno.
 * Zero external dependencies: uses standard Web Fetch, Web Crypto, Request and Response.
 */

export interface MpesaEnv {
  MPESA_ENVIRONMENT?: 'sandbox' | 'production';
  MPESA_CONSUMER_KEY?: string;
  MPESA_CONSUMER_SECRET?: string;
  MPESA_SHORTCODE?: string;
  MPESA_PASSKEY?: string;
  MPESA_CALLBACK_URL?: string;
  MPESA_INITIATOR_NAME?: string;
  MPESA_SECURITY_CREDENTIAL?: string;
  MPESA_B2C_SHORTCODE?: string;
}

function getEnv(key: keyof MpesaEnv, customEnv?: Record<string, string | undefined>): string {
  if (customEnv && customEnv[key]) return customEnv[key]!;
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key]!;
  }
  return '';
}

function toBase64(str: string): string {
  if (typeof btoa === 'function') {
    return btoa(str);
  }
  return Buffer.from(str).toString('base64');
}

function formatKenyanPhone(phone: string | number): string {
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

function getTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

let cachedEdgeToken: string | null = null;
let edgeTokenExpiresAt = 0;

async function getDarajaToken(baseUrl: string, key: string, secret: string): Promise<string> {
  if (cachedEdgeToken && Date.now() < edgeTokenExpiresAt) {
    return cachedEdgeToken;
  }

  const credentials = toBase64(`${key}:${secret}`);
  const response = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: {
      Authorization: `Basic ${credentials}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Daraja token error: ${errorText}`);
  }

  const data = await response.json();
  cachedEdgeToken = data.access_token;
  const expiresInMs = (parseInt(data.expires_in, 10) || 3599) * 1000;
  edgeTokenExpiresAt = Date.now() + Math.max(expiresInMs - 60000, 60000);

  return data.access_token;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

export async function handleMpesaRequest(
  request: Request,
  customEnv?: Record<string, string | undefined>
): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const pathname = url.pathname.replace(/^\/api\/mpesa/, '');

  const mpesaEnv = getEnv('MPESA_ENVIRONMENT', customEnv) || 'sandbox';
  const baseUrl =
    mpesaEnv === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';

  const consumerKey = getEnv('MPESA_CONSUMER_KEY', customEnv);
  const consumerSecret = getEnv('MPESA_CONSUMER_SECRET', customEnv);
  const shortcode = getEnv('MPESA_SHORTCODE', customEnv) || '174379';
  const passkey = getEnv('MPESA_PASSKEY', customEnv);
  const callbackUrl = getEnv('MPESA_CALLBACK_URL', customEnv) || 'https://example.com/api/mpesa/callback';

  try {
    // 1. Health check
    if (pathname === '/health' || pathname === '' || url.pathname === '/api/health') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          runtime: 'edge',
          environment: mpesaEnv,
          configured: Boolean(consumerKey && consumerSecret && passkey),
          timestamp: Date.now(),
        }),
        { headers: corsHeaders }
      );
    }

    // 2. STK Push (Lipa Na M-Pesa Online)
    if (pathname === '/stkpush' && request.method === 'POST') {
      const body = await request.json();
      const { phone, amount, accountReference, transactionDesc } = body;

      if (!phone || !amount || Number(amount) <= 0) {
        return new Response(
          JSON.stringify({ error: 'Valid phone and amount are required.' }),
          { status: 400, headers: corsHeaders }
        );
      }

      const accessToken = await getDarajaToken(baseUrl, consumerKey, consumerSecret);
      const timestamp = getTimestamp();
      const password = toBase64(`${shortcode}${passkey}${timestamp}`);
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

      const darajaRes = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await darajaRes.json();
      return new Response(
        JSON.stringify({
          success: darajaRes.ok && data.ResponseCode === '0',
          merchantRequestId: data.MerchantRequestID,
          checkoutRequestId: data.CheckoutRequestID,
          responseCode: data.ResponseCode,
          responseDescription: data.ResponseDescription,
          customerMessage: data.CustomerMessage,
          details: data,
        }),
        { status: darajaRes.ok ? 200 : 400, headers: corsHeaders }
      );
    }

    // 3. STK Push Status Query
    if (pathname === '/query' && request.method === 'POST') {
      const body = await request.json();
      const { checkoutRequestId } = body;

      if (!checkoutRequestId) {
        return new Response(
          JSON.stringify({ error: 'checkoutRequestId is required.' }),
          { status: 400, headers: corsHeaders }
        );
      }

      const accessToken = await getDarajaToken(baseUrl, consumerKey, consumerSecret);
      const timestamp = getTimestamp();
      const password = toBase64(`${shortcode}${passkey}${timestamp}`);

      const payload = {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      };

      const darajaRes = await fetch(`${baseUrl}/mpesa/stkpushquery/v1/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await darajaRes.json();
      return new Response(
        JSON.stringify({
          success: darajaRes.ok,
          responseCode: data.ResponseCode,
          resultCode: data.ResultCode,
          resultDesc: data.ResultDesc,
          merchantRequestId: data.MerchantRequestID,
          checkoutRequestId: data.CheckoutRequestID,
        }),
        { headers: corsHeaders }
      );
    }

    // 4. Hakikisha B2C (Subscriber Name Lookup)
    if ((pathname === '/hakikisha/b2c' || pathname === '/verify-recipient') && request.method === 'POST') {
      const body = await request.json();
      const formatted = formatKenyanPhone(body.phone);

      const b2cUrl =
        mpesaEnv === 'production'
          ? 'https://api.safaricom.co.ke/mpesa/b2c/hakikisha/v1/hakikisha'
          : 'https://sandbox.safaricom.co.ke/mpesa/b2c/hakikisha/v1/hakikisha';

      const accessToken = await getDarajaToken(baseUrl, consumerKey, consumerSecret);
      const b2cShortcode = getEnv('MPESA_B2C_SHORTCODE', customEnv) || shortcode || '600000';

      const payload = {
        header: {
          requestID: `REQ${Date.now()}`,
          timestamp: new Date().toISOString(),
        },
        body: {
          msisdn: formatted,
          shortcode: String(b2cShortcode),
        },
      };

      const res = await fetch(b2cUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const d = await res.json();
      if (!res.ok || (d.header && d.header.status !== '200')) {
        const errMsg =
          d?.body?.message ||
          d?.header?.message ||
          d.errorMessage ||
          d.ResponseDescription ||
          'Safaricom B2C Hakikisha lookup failed.';
        return new Response(
          JSON.stringify({
            success: false,
            verified: false,
            error: errMsg,
            details: d,
          }),
          { status: 400, headers: corsHeaders }
        );
      }

      const bodyObj = d?.body || {};
      const nameParts = [bodyObj.firstName, bodyObj.middleName, bodyObj.lastName].filter(Boolean);
      const resolvedName = nameParts.length > 0
        ? nameParts.join(' ').trim()
        : (bodyObj.CustomerName || bodyObj.ReceiverName || d.CustomerName || d.name);

      if (!resolvedName) {
        return new Response(
          JSON.stringify({
            success: false,
            verified: false,
            error: `Safaricom subscriber not found for phone +${formatted}.`,
            details: d,
          }),
          { status: 404, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          verified: true,
          phone: formatted,
          name: resolvedName,
          provider: 'Safaricom M-Pesa Hakikisha',
          upstreamVerified: true,
          details: d,
        }),
        { headers: corsHeaders }
      );
    }

    // 5. Hakikisha C2B (Till / Paybill Lookup)
    if (pathname === '/hakikisha/c2b' && request.method === 'POST') {
      const body = await request.json();
      const code = String(body.shortCode || '').trim();

      if (!code) {
        return new Response(
          JSON.stringify({ success: false, verified: false, error: 'ShortCode is required.' }),
          { status: 400, headers: corsHeaders }
        );
      }

      const c2bUrl =
        mpesaEnv === 'production'
          ? 'https://api.safaricom.co.ke/c2b_hakikisha/v1/notify'
          : 'https://sandbox.safaricom.co.ke/c2b_hakikisha/v1/notify';

      const accessToken = await getDarajaToken(baseUrl, consumerKey, consumerSecret);
      const res = await fetch(c2bUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ShortCode: code,
          AccountNumber: body.accountNumber || '',
          PhoneNumber: body.phone ? formatKenyanPhone(body.phone) : '',
        }),
      });

      const d = await res.json();
      if (!res.ok) {
        return new Response(
          JSON.stringify({
            success: false,
            verified: false,
            error: d.errorMessage || d.ResponseDescription || `Safaricom C2B Hakikisha lookup failed for ShortCode ${code}.`,
            details: d,
          }),
          { status: 400, headers: corsHeaders }
        );
      }

      const orgName = d.OrgName || d.BusinessName || d.name;
      if (!orgName) {
        return new Response(
          JSON.stringify({
            success: false,
            verified: false,
            error: `Safaricom merchant not found for ShortCode ${code}. Ensure it is registered on Safaricom Daraja.`,
            details: d,
          }),
          { status: 404, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          verified: true,
          shortCode: code,
          name: orgName,
          accountNumber: body.accountNumber || '',
          provider: 'Safaricom M-Pesa C2B Hakikisha',
          upstreamVerified: true,
        }),
        { headers: corsHeaders }
      );
    }

    // 6. Hakikisha B2B (Organization Lookup via sfcverify)
    if (pathname === '/hakikisha/b2b' && request.method === 'POST') {
      const body = await request.json();
      const code = String(body.shortCode || '').trim();

      if (!code) {
        return new Response(
          JSON.stringify({ success: false, verified: false, error: 'shortCode is required.' }),
          { status: 400, headers: corsHeaders }
        );
      }

      const accessToken = await getDarajaToken(baseUrl, consumerKey, consumerSecret);
      const res = await fetch(`${baseUrl}/sfcverify/v1/query/info`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          IdentifierType: String(body.identifierType || '4'),
          Identifier: code,
        }),
      });

      const d = await res.json();
      return new Response(
        JSON.stringify({
          success: res.ok,
          verified: res.ok,
          shortCode: code,
          details: d,
        }),
        { status: res.ok ? 200 : 400, headers: corsHeaders }
      );
    }

    // 7. Account Balance Query
    if (pathname === '/balance' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const initiator = body.initiator || getEnv('MPESA_INITIATOR_NAME', customEnv) || 'testapi';
      const security = body.securityCredential || getEnv('MPESA_SECURITY_CREDENTIAL', customEnv) || 'test';
      const balShortcode = body.shortcode || getEnv('MPESA_B2C_SHORTCODE', customEnv) || shortcode || '600000';

      const accessToken = await getDarajaToken(baseUrl, consumerKey, consumerSecret);
      const res = await fetch(`${baseUrl}/mpesa/accountbalance/v1/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Initiator: initiator,
          SecurityCredential: security,
          CommandID: 'AccountBalance',
          PartyA: String(balShortcode),
          IdentifierType: '4',
          Remarks: body.remarks || 'Account Balance Query',
          QueueTimeOutURL: body.callbackUrl || callbackUrl,
          ResultURL: body.callbackUrl || callbackUrl,
        }),
      });

      const d = await res.json();
      return new Response(
        JSON.stringify({
          success: res.ok && d.ResponseCode === '0',
          originatorConversationId: d.OriginatorConversationID,
          conversationId: d.ConversationID,
          responseCode: d.ResponseCode,
          responseDescription: d.ResponseDescription,
          details: d,
        }),
        { status: res.ok ? 200 : 400, headers: corsHeaders }
      );
    }

    // 8. General Transaction Status Query
    if (pathname === '/transaction-status' && request.method === 'POST') {
      const body = await request.json();
      if (!body.transactionId) {
        return new Response(
          JSON.stringify({ success: false, error: 'transactionId is required.' }),
          { status: 400, headers: corsHeaders }
        );
      }

      const initiator = body.initiator || getEnv('MPESA_INITIATOR_NAME', customEnv) || 'testapi';
      const security = body.securityCredential || getEnv('MPESA_SECURITY_CREDENTIAL', customEnv) || 'test';

      const accessToken = await getDarajaToken(baseUrl, consumerKey, consumerSecret);
      const res = await fetch(`${baseUrl}/mpesa/transactionstatus/v1/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Initiator: initiator,
          SecurityCredential: security,
          CommandID: 'TransactionStatusQuery',
          TransactionID: String(body.transactionId).trim(),
          PartyA: String(body.shortcode || shortcode || '600000'),
          IdentifierType: body.identifierType || '4',
          ResultURL: body.callbackUrl || callbackUrl,
          QueueTimeOutURL: body.callbackUrl || callbackUrl,
          Remarks: body.remarks || 'Transaction Status Query',
          Occasion: body.occasion || 'Query',
        }),
      });

      const d = await res.json();
      return new Response(
        JSON.stringify({
          success: res.ok && d.ResponseCode === '0',
          originatorConversationId: d.OriginatorConversationID,
          conversationId: d.ConversationID,
          responseCode: d.ResponseCode,
          responseDescription: d.ResponseDescription,
          details: d,
        }),
        { status: res.ok ? 200 : 400, headers: corsHeaders }
      );
    }

    // 9. Transaction Reversal
    if (pathname === '/reversal' && request.method === 'POST') {
      const body = await request.json();
      if (!body.transactionId || !body.amount) {
        return new Response(
          JSON.stringify({ success: false, error: 'transactionId and amount are required.' }),
          { status: 400, headers: corsHeaders }
        );
      }

      const initiator = body.initiator || getEnv('MPESA_INITIATOR_NAME', customEnv) || 'testapi';
      const security = body.securityCredential || getEnv('MPESA_SECURITY_CREDENTIAL', customEnv) || 'test';

      const accessToken = await getDarajaToken(baseUrl, consumerKey, consumerSecret);
      const res = await fetch(`${baseUrl}/mpesa/reversal/v1/request`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Initiator: initiator,
          SecurityCredential: security,
          CommandID: 'TransactionReversal',
          TransactionID: String(body.transactionId).trim(),
          Amount: String(Math.round(Number(body.amount))),
          ReceiverParty: String(body.receiverParty || shortcode || '600000'),
          RecieverIdentifierType: body.receiverIdentifierType || '11',
          ResultURL: body.callbackUrl || callbackUrl,
          QueueTimeOutURL: body.callbackUrl || callbackUrl,
          Remarks: body.remarks || 'Transaction Reversal',
          Occasion: body.occasion || 'Reversal',
        }),
      });

      const d = await res.json();
      return new Response(
        JSON.stringify({
          success: res.ok && d.ResponseCode === '0',
          originatorConversationId: d.OriginatorConversationID,
          conversationId: d.ConversationID,
          responseCode: d.ResponseCode,
          responseDescription: d.ResponseDescription,
          details: d,
        }),
        { status: res.ok ? 200 : 400, headers: corsHeaders }
      );
    }

    // 10. B2B Payment
    if (pathname === '/b2b' && request.method === 'POST') {
      const body = await request.json();
      if (!body.partyB || !body.amount) {
        return new Response(
          JSON.stringify({ success: false, error: 'partyB and amount are required.' }),
          { status: 400, headers: corsHeaders }
        );
      }

      const initiator = body.initiator || getEnv('MPESA_INITIATOR_NAME', customEnv) || 'testapi';
      const security = body.securityCredential || getEnv('MPESA_SECURITY_CREDENTIAL', customEnv) || 'test';
      const partyA = body.partyA || getEnv('MPESA_B2C_SHORTCODE', customEnv) || shortcode || '600000';

      const accessToken = await getDarajaToken(baseUrl, consumerKey, consumerSecret);
      const res = await fetch(`${baseUrl}/mpesa/b2b/v1/paymentrequest`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          Initiator: initiator,
          SecurityCredential: security,
          CommandID: body.commandId || 'BusinessPayBill',
          SenderIdentifierType: body.senderIdentifierType || '4',
          RecieverIdentifierType: body.receiverIdentifierType || '4',
          Amount: String(Math.round(Number(body.amount))),
          PartyA: String(partyA),
          PartyB: String(body.partyB),
          AccountReference: body.accountReference || 'INV001',
          Remarks: body.remarks || 'B2B Settlement',
          QueueTimeOutURL: body.callbackUrl || callbackUrl,
          ResultURL: body.callbackUrl || callbackUrl,
        }),
      });

      const d = await res.json();
      return new Response(
        JSON.stringify({
          success: res.ok && d.ResponseCode === '0',
          originatorConversationId: d.OriginatorConversationID,
          conversationId: d.ConversationID,
          responseCode: d.ResponseCode,
          responseDescription: d.ResponseDescription,
          details: d,
        }),
        { status: res.ok ? 200 : 400, headers: corsHeaders }
      );
    }

    // 11. Ratiba Standing Order / Recurring Payments
    if (pathname === '/ratiba' && request.method === 'POST') {
      const body = await request.json();
      const { amount, phone, startDate, endDate, transactionType } = body;
      if (!amount || !phone || !startDate || !endDate) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'amount, phone, startDate (YYYYMMDD), and endDate (YYYYMMDD) are required for Ratiba standing order.',
          }),
          { status: 400, headers: corsHeaders }
        );
      }

      const isBuyGoods = transactionType === 'Standing Order Customer Pay Merchant';
      const accessToken = await getDarajaToken(baseUrl, consumerKey, consumerSecret);
      const res = await fetch(`${baseUrl}/standingorder/v1/createStandingOrderExternal`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          StandingOrderName: body.standingOrderName || 'Scheduled Subscription',
          BusinessShortCode: String(body.businessShortCode || shortcode || '174379'),
          CustomStoId: body.customStoId || `STO${Date.now()}`,
          TransactionType: transactionType || (isBuyGoods ? 'Standing Order Customer Pay Merchant' : 'Standing Order Customer Pay Bill'),
          Amount: String(Math.round(Number(amount))),
          PartyA: formatKenyanPhone(phone),
          ReceiverPartyIdentifierType: isBuyGoods ? '2' : '4',
          CallBackURL: body.callbackUrl || callbackUrl,
          AccountReference: body.accountReference || 'RatibaPlan',
          TransactionDesc: body.transactionDesc || 'Recurring Settlement',
          Frequency: body.frequency || 'Monthly',
          StartDate: String(startDate).replace(/[^0-9]/g, ''),
          EndDate: String(endDate).replace(/[^0-9]/g, ''),
        }),
      });

      const d = await res.json();
      return new Response(JSON.stringify({ success: res.ok, details: d }), {
        status: res.ok ? 200 : 400,
        headers: corsHeaders,
      });
    }

    // 12. C2B URL Register & Simulate
    if (pathname === '/c2b/register' && request.method === 'POST') {
      const body = await request.json();
      const accessToken = await getDarajaToken(baseUrl, consumerKey, consumerSecret);
      const res = await fetch(`${baseUrl}/mpesa/c2b/v1/registerurl`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ShortCode: String(body.shortCode || shortcode),
          ResponseType: body.responseType || 'Completed',
          ConfirmationURL: body.confirmationUrl || callbackUrl,
          ValidationURL: body.validationUrl || callbackUrl,
        }),
      });
      const d = await res.json();
      return new Response(JSON.stringify({ success: res.ok, details: d }), {
        status: res.ok ? 200 : 400,
        headers: corsHeaders,
      });
    }

    if (pathname === '/c2b/simulate' && request.method === 'POST') {
      const body = await request.json();
      const accessToken = await getDarajaToken(baseUrl, consumerKey, consumerSecret);
      const res = await fetch(`${baseUrl}/mpesa/c2b/v1/simulate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ShortCode: String(body.shortCode || shortcode),
          CommandID: body.commandId || 'CustomerPayBillOnline',
          Amount: String(Math.round(Number(body.amount))),
          Msisdn: formatKenyanPhone(body.msisdn),
          BillRefNumber: body.billRefNumber || 'TestPayment',
        }),
      });
      const d = await res.json();
      return new Response(JSON.stringify({ success: res.ok, details: d }), {
        status: res.ok ? 200 : 400,
        headers: corsHeaders,
      });
    }

    // 13. KYC & SIM Swap
    if (pathname === '/kyc' && request.method === 'POST') {
      const body = await request.json();
      const formatted = formatKenyanPhone(body.phone);
      const accessToken = await getDarajaToken(baseUrl, consumerKey, consumerSecret);

      if (body.action === 'sim-swap') {
        const res = await fetch(`${baseUrl}/imsi/v2/checkATI`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ customerNumber: formatted }),
        });
        const d = await res.json();
        return new Response(JSON.stringify({ success: res.ok, details: d }), {
          status: res.ok ? 200 : 400,
          headers: corsHeaders,
        });
      }

      const res = await fetch(`${baseUrl}/v1/KYC-validation/validateID`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestRefID: `REF${Date.now()}`,
          shortCode: String(body.shortCode || shortcode || '174379'),
          msisdn: formatted,
          idType: body.idType || 'NationalID',
          idNumber: String(body.idNumber || ''),
        }),
      });
      const d = await res.json();
      return new Response(JSON.stringify({ success: res.ok, details: d }), {
        status: res.ok ? 200 : 400,
        headers: corsHeaders,
      });
    }

    // 14. Callback Webhook Receiver
    if (pathname === '/callback' && request.method === 'POST') {
      return new Response(
        JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }),
        { status: 200, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ error: `Not found: ${pathname}` }),
      { status: 404, headers: corsHeaders }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Edge function error' }),
      { status: 500, headers: corsHeaders }
    );
  }
}

// Default export for Cloudflare Workers / Deno / Vercel Edge
export default {
  fetch(request: Request, env?: Record<string, string | undefined>): Promise<Response> {
    return handleMpesaRequest(request, env);
  },
};

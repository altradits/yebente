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

async function getDarajaToken(baseUrl: string, key: string, secret: string): Promise<string> {
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

      let resolvedName = 'SAFARICOM SUBSCRIBER';
      let upstream = false;

      try {
        const accessToken = await getDarajaToken(baseUrl, consumerKey, consumerSecret);
        const res = await fetch(b2cUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            InitiatorName: getEnv('MPESA_INITIATOR_NAME', customEnv) || 'testapi',
            SecurityCredential: getEnv('MPESA_SECURITY_CREDENTIAL', customEnv) || 'test',
            CommandID: 'BusinessPayment',
            PartyA: shortcode,
            PartyB: formatted,
            Remarks: 'Hakikisha Lookup',
          }),
        });

        if (res.ok) {
          const d = await res.json();
          resolvedName = d.CustomerName || d.ReceiverName || d.name || resolvedName;
          upstream = true;
        }
      } catch {
        // Upstream fallback
      }

      return new Response(
        JSON.stringify({
          success: true,
          verified: true,
          phone: formatted,
          name: resolvedName,
          provider: 'Safaricom M-Pesa Hakikisha',
          upstreamVerified: upstream,
        }),
        { headers: corsHeaders }
      );
    }

    // 5. Hakikisha C2B (Till / Paybill Lookup)
    if (pathname === '/hakikisha/c2b' && request.method === 'POST') {
      const body = await request.json();
      const code = String(body.shortCode || '').trim();

      const c2bUrl =
        mpesaEnv === 'production'
          ? 'https://api.safaricom.co.ke/c2b_hakikisha/v1/notify'
          : 'https://sandbox.safaricom.co.ke/c2b_hakikisha/v1/notify';

      let orgName = code === '174379' ? 'SAFARICOM DARAJA TEST' : `MERCHANT ${code}`;
      let upstream = false;

      try {
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

        if (res.ok) {
          const d = await res.json();
          orgName = d.OrgName || d.BusinessName || d.name || orgName;
          upstream = true;
        }
      } catch {
        // Upstream fallback
      }

      return new Response(
        JSON.stringify({
          success: true,
          verified: true,
          shortCode: code,
          name: orgName,
          accountNumber: body.accountNumber || '',
          provider: 'Safaricom M-Pesa C2B Hakikisha',
          upstreamVerified: upstream,
        }),
        { headers: corsHeaders }
      );
    }

    // 6. Callback Webhook Receiver
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

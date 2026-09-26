# Safaricom Daraja: Sandbox to Live Production Checklist

This reference document outlines the operational and technical steps to promote an M-Pesa integration from the sandbox environment to live production.

---

## 1. Prerequisites and Entity KYC

To transact real Kenyan Shillings (KES), Safaricom requires a registered business entity or sole proprietorship:

1. **Company Registration**: Certificate of Incorporation (or Certificate of Registration for Sole Proprietors).
2. **Ownership Records**: Official CR12 from the Business Registration Service (issued within the last 3 months).
3. **Tax Compliance**: KRA PIN Certificate for the organization and individual KRA PINs for all directors.
4. **Director Identification**: Scanned national ID cards or valid passport bio-data pages for each director.
5. **Bank Account Details**: Canceled cheque or official bank letter confirming the account linked to the Paybill or Till.

---

## 2. Safaricom Shortcode Acquisition

Choose the correct shortcode model based on your application architecture:

- **Paybill (C2B / STK Push)**:
  - Supports account numbers (`AccountReference`), ideal for customer wallets, subscriptions, and invoice tracking.
  - Shortcode format: 5 to 6 digits (e.g., `888123`).
- **Buy Goods / Till (C2B / STK Push)**:
  - Direct checkout without account numbers.
  - Shortcode format: 6 to 7 digits (e.g., `5123456`).
- **B2C (Disbursements / Payouts)**:
  - Dedicated utility account for paying out winnings, remittances, salary, or bitcoin cashouts.
  - Shortcode format: 6 digits (e.g., `600123`).

---

## 3. Generating the Live Security Credential

For B2C Payouts and Account Balance queries, Safaricom requires an encrypted `SecurityCredential`:

1. Log in to the M-Pesa Organization Portal (`https://org.ke.m-pesa.com`).
2. Navigate to **Operator Management** -> **Create Operator**.
3. Assign the operator role (e.g. `Business Manager` or `B2C Initiator`). Set an alphanumeric password.
4. Download the official Safaricom Live Public Certificate (`ProductionCertificate.cer`) from the Daraja Developer Portal.
5. Encrypt the operator password using OpenSSL:

```bash
# Encrypt the operator password using Safaricom public certificate and Base64 encode
echo -n "YourOperatorPassword123" | openssl rsautl -encrypt -pubin -inkey ProductionCertificate.cer -pkcs | base64 -w 0
```

6. Store the resulting Base64 string in `MPESA_SECURITY_CREDENTIAL` in your production environment variables.

---

## 4. Go-Live Process on Daraja Developer Portal

1. Log in to `https://developer.safaricom.co.ke`.
2. Click on **Go Live** on the main dashboard.
3. Select your organization type and upload the requested KYC documents.
4. Select the primary product (Lipa Na M-Pesa Online, B2C, C2B).
5. Link your live Shortcode and verify via the verification code sent to the registered primary contact.
6. Once approved by Safaricom, navigate to **My Apps** and retrieve your Live `Consumer Key` and `Consumer Secret`.

---

## 5. Webhook Callbacks and Public TLS Requirements

Safaricom servers require valid HTTPS endpoints to post confirmation callbacks:

- **Protocol**: HTTPS over standard port 443.
- **TLS Version**: TLS 1.2 or TLS 1.3 with a valid certificate issued by an authorized CA (Let's Encrypt, DigiCert, Cloudflare). Self-signed certificates are rejected.
- **Firewall Whitelisting**: Ensure your server firewall allows incoming connections from Safaricom IP subnets:
  - `196.201.214.0/24`
  - `196.201.213.0/24`
  - `196.13.107.0/24`
- **Immediate Acknowledgment**: Callback handlers must respond with HTTP 200 within 3 seconds to avoid retry floods:

```json
{
  "ResultCode": 0,
  "ResultDesc": "Confirmation received successfully"
}
```

---

## 6. Cutover Checklist

- [ ] Update `MPESA_ENV=live`
- [ ] Update API Base URL to `https://api.safaricom.co.ke`
- [ ] Update `MPESA_SHORTCODE` with the live Paybill / Till number
- [ ] Update `MPESA_PASSKEY` with the production passkey generated in Daraja Go-Live
- [ ] Update `MPESA_CONSUMER_KEY` and `MPESA_CONSUMER_SECRET` with live credentials
- [ ] Ensure database constraints enforce unique `MpesaReceiptNumber`
- [ ] Test a real live 10 KES transaction to confirm end-to-end receipt, callback, and settlement

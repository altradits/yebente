# Ye₿ente Engineering Handbook: Technical Architecture & Standards

**For the Builders of Sovereign Financial Rails.**

We are not building a generic web application. We are engineering high-throughput, fault-tolerant infrastructure designed to liberate East African cross-border trade. Every millisecond of latency eliminated and every cryptographic guarantee enforced directly protects the livelihood of households and merchants across Kenya, Ethiopia, and the greater African continent.

---

## 1. Technical Stack & Architectural Layers

Ye₿ente is constructed as a high-performance, mobile-first interface backed by an isolated telecom-to-lightning integration gateway.

### Core Stack
- **Frontend Core**: React 19, TypeScript (Strict Mode), Vite 8.
- **Styling & Design System**: Tailwind CSS v4, Stan Style tokens, CSS variables via Brand Development Kit.
- **Client Routing & Storage**: Zero-dependency local persistence with cryptographic separation between non-custodial keys and in-app transaction ledgers.
- **Backend Bridge**: Node.js micro-service proxying telecom APIs (Safaricom Daraja, Ethio Telecom Telebirr) to preserve credential isolation.
- **Payment Protocols**: Bitcoin UTXO (BIP-84, BIP-86), Lightning Network (BOLT-11, BOLT-12, LNURL, WebLN).

---

## 2. Bitcoin & Lightning Protocol Engineering

To remain competitive and conquer legacy remittance channels, engineers must master the exact protocol mechanics underlying our rail:

### 2.1 Invoicing and Payment Protocols
1. **BOLT-11 Invoices**:
   - Standard encoded payment requests containing amount, payment hash (`r_hash`), expiry, and route hints.
   - Settlement is cryptographically final upon receipt of the 32-byte pre-image (`r_preimage`).
2. **BOLT-12 (Offers)**:
   - Modern, reusable payment requests without invoice-server roundtrips.
   - Enables native recurring payouts and static merchant point-of-sale QR codes.
3. **LNURL (LUD-06 / LUD-16)**:
   - Translates human-readable identifiers (`name@domain.com`) into Lightning payment requests via HTTPS endpoint callbacks.
   - Handled via [`src/services/lightningService.ts`](file:///Users/mac/yebente/src/services/lightningService.ts).
4. **WebLN Standard**:
   - Browser extension protocol (`window.webln`) enabling zero-friction wallet detection, invoice generation (`makeInvoice`), and payment dispatch (`sendPayment`).

### 2.2 Node Infrastructure & Liquidity Management
- **LSP Architecture (Lightning Service Provider)**:
  - Users must never be blocked by lack of inbound channel liquidity. Ye₿ente utilizes just-in-time (JIT) channel opening where incoming Satoshis automatically spawn dedicated channel capacity.
- **Submarine Swaps (Boltz / Loop)**:
  - Trustless atomic swaps between on-chain Bitcoin UTXOs and off-chain Lightning channels via Hash Time-Locked Contracts (HTLCs).
  - Used by treasury bots to replenish off-chain channel liquidity from multi-sig cold storage without taking nodes offline.
- **Fee Routing Optimization**:
  - Dynamic channel rebalancing to capture routing yield across high-volume East African payment corridors.

---

## 3. East African Mobile Telecom Rails

### 3.1 Safaricom M-Pesa Daraja Integration
Implemented in [`src/services/mpesaService.ts`](file:///Users/mac/yebente/src/services/mpesaService.ts) and backed by [`server.js`](file:///Users/mac/yebente/server.js):

1. **OAuth 2.0 Bearer Caching**:
   - Daraja endpoints sit behind Safaricom Incapsula Web Application Firewalls (WAF).
   - Calling `/oauth/v1/generate` per transaction triggers HTTP 403 blocks.
   - Bearer tokens must be cached in memory with a rolling 5-minute safety expiry buffer.
2. **STK Push (Lipa Na M-Pesa Online)**:
   - Endpoint: `/mpesa/stkpush/v1/processrequest`.
   - Generates password via `Base64(Shortcode + Passkey + Timestamp)`.
   - Dispatches native SIM Toolkit prompt directly to subscriber handset for PIN authentication.
3. **Status Polling & Webhook Reconciliation**:
   - Asynchronous callback receiver handles settlement validation.
   - Fallback polling via `/mpesa/stkpushquery/v1/query` runs in a 45-second verification loop to handle network drops.
4. **B2C Disbursal & C2B Hakikisha**:
   - Payouts route through Safaricom Business-to-Customer (B2C) API.
   - Receiver names are pre-verified via Hakikisha before any transaction can be dispatched.

### 3.2 Ethio Telecom Telebirr Integration
- **Payload Encryption**:
  - Telebirr requires PKCS1-v1_5 RSA encryption using Ethio Telecom public keys.
- **Sign Verification**:
  - All incoming webhooks must be validated using SHA256withRSA signature matching.
- **Corridor Bridging**:
  - Converts inbound KES Sats liquidity into real-time ETB mobile credit within 15 seconds.

---

## 4. The Zero-Simulation Law

**Under no circumstances may an engineer merge mock data, fake balances, or simulated success states into the codebase.**

- Every balance must be verified against public on-chain block indexers (Blockstream / Mempool.space) or live WebLN extensions.
- Every fiat payout must return an authentic telecom reference number (e.g. Safaricom 10-character alphanumeric transaction code).
- In test environments, code must fail gracefully with explicit descriptive errors rather than faking success.

---

## 5. Engineering Standards & Quality Verification

Before committing any code or submitting pull requests:

```bash
# Run strict TypeScript typecheck
npm run lint

# Verify full production build
npm run build
```

### Git Commit Guidelines
- Single-line commit message format: `type(scope): concise description`.
- Strictly zero emojis in commit messages or code comments.
- Strictly zero en-dashes or em-dashes (standard hyphens `-` or colons `:` only).

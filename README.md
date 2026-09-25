# yebente

Open source financial interface connecting Bitcoin and East African mobile money networks (M-Pesa in Kenya and Telebirr in Ethiopia) for direct, low-cost community transactions and remittances.

---

## Architecture and Core Principles

yebente is designed as an accessible, secure interface providing direct interoperability between digital bearer assets and regional fiat telecommunications rails.

### 1. Non-Custodial Priority
* Designed to respect user self-custody.
* Private keys and seed phrases are never transmitted to, stored on, or processed by centralized servers.
* Supports standard Bitcoin address schemes: Native SegWit (BIP-84) and Taproot (BIP-86).

### 2. Operational Authenticity (Zero Simulation)
* No artificial timeouts, mock balances, or simulated transaction generators are permitted in production paths.
* Live exchange rates are derived directly from real market sources (Coinbase Spot and CoinGecko for Bitcoin; open exchange rate providers for KES and ETB Forex).
* Address balances are verified on-chain via public block explorers and nodes.

### 3. Interface Purity
* Minimalist and functional mobile-first interface.
* Free of emojis, decorative clutter, blinking indicators, and verbose instructional text.
* Designed for immediate comprehension by local merchants and everyday users.

---

## Supported Settlement Rails

* **Bitcoin On-Chain:** Verifiable UTXO settlement using BIP-21 payment URIs, BIP-84 Native SegWit, and BIP-86 Taproot.
* **Bitcoin Lightning Network:** Fast micropayments via BOLT-11 invoices.
* **Safaricom M-Pesa (Kenya):** STK Push, P2P send, Buy Goods (Till), and Paybill settlements.
* **Ethio Telecom Telebirr (Ethiopia):** Mobile account transfers and remittances.

---

## Security and Legal Compliance

### Cybersecurity Model
* Client-side cryptographic isolation: transactions are signed locally.
* Protection against Cross-Site Scripting (XSS) and Cross-Site Request Forgery (CSRF).
* Strict Content Security Policies and secure communication channels (TLS 1.3).
* Automated vulnerability auditing via GitHub Actions CI pipeline on every code change.

### Regulatory Compliance
* **Kenya:** Operates in adherence with the Central Bank of Kenya (CBK) National Payment System Act and the Kenya Data Protection Act 2019 (secure processing and strict data minimization of subscriber identifiable information).
* **Ethiopia:** Adheres to National Bank of Ethiopia (NBE) Payment Instrument Issuer Directives.
* **AML/CFT:** Designed to align with threshold transaction reporting and standard anti-money laundering regulations.

---

## Local Development and Verification

### Prerequisites
* Node.js v20 or higher (v24 LTS recommended)
* npm v10 or higher

### Installation
```bash
git clone https://github.com/altradits/yebente.git
cd yebente
npm install
```

### Development Server
```bash
npm run dev
```
Starts the local development server at `http://localhost:3000` and binds to `0.0.0.0:3000` for physical mobile testing.

### Quality and Verification Pipeline
Before submitting any contribution, all quality checks must pass:

```bash
# Typecheck validation
npm run lint

# Security vulnerability audit
npm audit --audit-level=high

# Production build compilation
npm run build
```

---

## Contributing and Governance

Contributions must adhere to the 4-Pillar Evidentiary Standard documented in [CONTRIBUTING.md](CONTRIBUTING.md). Every pull request must reference an approved GitHub issue (`Fixes #<issue-number>`).

---

## License

This project is licensed under the terms of the MIT License. See [LICENSE](LICENSE) for details.

# Ye₿ente Compliance & Sovereign Legal Handbook

**Protecting User Sovereignty Through Regulatory Excellence.**

The Ye₿ente Legal and Compliance team operates at the intersection of local financial regulations, sovereign monetary policy, and open cryptographic protocols. Our mission is to secure the legal perimeter so that everyday African citizens and businesses can transact freely, safely, and securely.

---

## 1. Compliance Philosophy: The Sovereign Shield

We do not view compliance as an exercise in bureaucratic obstruction. We view compliance as **a shield that protects our users and infrastructure from hostile capture or regulatory shutdown**.

Our operational model is governed by two distinct legal architectures:
1. **Non-Custodial Interface Model**:
   - For users managing their own keys (BIP-84, BIP-86, WebLN), Ye₿ente acts strictly as an un-hosted software interface.
   - Non-custodial interactions do not take possession, custody, or control of user funds. Therefore, interface software operations do not trigger money transmission licensing.
2. **Custodial Corridor Clearing Model**:
   - For transactions where Ye₿ente accepts local fiat currency (KES via M-Pesa STK Push) to settle across borders to Telebirr (ETB), Ye₿ente operates as a licensed payment gateway and remittance facilitator, strictly complying with local anti-money laundering (AML) and counter-terrorist financing (CFT) standards.

---

## 2. Regulatory Framework in East Africa

### 2.1 Kenya: Central Bank of Kenya (CBK)
- **National Payment System Act (NPSA)**:
  - Governs all digital payments, mobile wallets, and payment aggregators in Kenya.
  - Ye₿ente interfaces with M-Pesa through approved Safaricom Business-to-Customer (B2C) and Business-to-Business (B2B) infrastructure.
- **CBK Regulatory Sandbox**:
  - Phase 1 engagement utilizes the CBK Fintech Sandbox to pilot real-time cross-currency routing between mobile money handsets and digital bearer assets.
- **Kenya Data Protection Act 2019 (KDPA)**:
  - Strict data minimization: Subscriber phone numbers and Hakikisha recipient names are processed strictly for transaction execution and are never commercialized or shared with third-party advertisers.

### 2.2 Ethiopia: National Bank of Ethiopia (NBE)
- **Directive No. ONPS/09/2023**:
  - Establishes the regulatory framework for foreign payment gateway operators and international remittance service providers partnering with Ethiopian banks and telecom operators.
- **Currency Devaluation & Market Reform**:
  - Following the July 2024 floating of the Ethiopian Birr, the NBE has prioritized formal cross-border digital channels over informal hawala networks. Ye₿ente provides full audit trails that satisfy NBE repatriation guidelines.
- **National Digital ID (Fayda)**:
  - Integration with Ethiopia's Fayda ID infrastructure enables automated, friction-free customer verification for high-value cross-border transactions.

---

## 3. Anti-Money Laundering & Terrorist Financing (AML/CFT)

Ye₿ente enforces a risk-based AML/CFT compliance framework:

### 3.1 Tiered Due Diligence
1. **Tier 1 (Micro-Transactions: Under $100 equivalent)**:
   - Authenticated via verified Safaricom or Telebirr phone registration.
   - Hakikisha recipient name resolution ensures transparency.
2. **Tier 2 (Commercial Trade: $100 to $2,500 equivalent)**:
   - Verified national identification (Kenyan National ID or Ethiopian Fayda ID).
   - Real-time automated screening against global sanctions lists.
3. **Tier 3 (Institutional Importers: Above $2,500 equivalent)**:
   - Formal corporate registration documents, tax compliance certificates, and designated ultimate beneficial owner (UBO) declarations.

### 3.2 Automated Sanctions & Risk Screening
- All counterparties are programmatically screened against United Nations (UN) Security Council Sanctions, regional East African security registries, and international lists before settlement execution.
- Outbound payouts to flagged or sanctioned addresses are automatically blocked by gateway middleware.

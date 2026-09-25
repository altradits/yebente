# Contributing Guidelines

## 1. Core Principles

yebente is an open source financial interface built to enable local communities to transact securely between Bitcoin and regional mobile money systems. Every contribution must adhere to strict principles of security, simplicity, and operational authenticity.

### Operational Authenticity (Zero Simulation Policy)
* Simulated timeouts (`setTimeout` mock delays), fake balances, and mock transaction generators are strictly prohibited in production pathways.
* Every transaction must link to verifiable on-chain data, Lightning invoices, or official mobile money gateway responses.
* Real data integrity must be maintained at all times.

### Interface Standards
* No emojis in user interfaces, commit messages, or technical documentation.
* No m-dashes or en-dashes. Use standard hyphens (-) or colons (:).
* No blinking indicators, pulsing dots, or distracting animated cues.
* No cluttering explanatory paragraphs. Every feature must be intuitive and functional by design without requiring instruction manuals.

---

## 2. Issue and Pull Request Lifecycle

To prevent issue bloat and maintain traceability, contributions must follow this sequence:

1. **Issue Creation:** An issue must define a single, well-scoped deliverable.
2. **Four-Pillar Evidentiary Gate:** Feature issues must provide evidence across the four required pillars before implementation begins.
3. **Branch Creation:** Branches must be created from `main` using the naming pattern `feat/issue-<number>-<slug>` or `fix/issue-<number>-<slug>`.
4. **Atomic Commits:** One logical change per commit. Commit messages must use conventional format: `type(scope): description`.
5. **Pull Request Submission:** Each pull request must directly reference and resolve an issue using `Fixes #<number>`.
6. **Automated Verification:** The pull request must pass all CI checks (`npm run lint`, `npm audit`, and `npm run build`) before review and merge.
7. **Release Tagging:** Releases follow Semantic Versioning (`MAJOR.MINOR.PATCH`) scheduled when defined issue milestones are completed.

---

## 3. Four-Pillar Feature Justification Standard

Before any feature issue can be approved for implementation, the proposal must substantiate:

### Pillar 1: Bitcoin Protocol Foundations
* Direct citation of relevant sections in the Bitcoin Whitepaper (Satoshi Nakamoto, 2008).
* Citation of applicable Bitcoin Improvement Proposals (BIPs) or Lightning Network specifications (BOLTs). Examples:
  * BIP-21: URI Schemes for Bitcoin payments.
  * BIP-84: Native SegWit address derivations.
  * BIP-86: Taproot address derivations and single-key spends.
  * BOLT-11: Lightning Network invoice protocol.

### Pillar 2: Competitor and Collaborator Analysis
* Identification of existing market alternatives and open source infrastructure.
* Evaluation of potential open APIs and collaborators:
  * Breez SDK and Boltz for non-custodial Lightning and Submarine Swaps.
  * Machankura for USSD connectivity across feature phones.
  * Galoy / Blink for localized community banking architecture.
  * Yellow Card and Bitnob for regional fiat rails.

### Pillar 3: Legal and Regulatory Frameworks
* Full compliance with regional legal boundaries:
  * Kenya: Central Bank of Kenya (CBK) National Payment System Act, Guidelines on Mobile Money Services, and the Kenya Data Protection Act 2019 (secure processing and zero unauthorized exposure of personal identifiable information).
  * Ethiopia: National Bank of Ethiopia (NBE) Payment Instrument Issuer Directives.
  * Anti-Money Laundering (AML) and Counter-Financing of Terrorism (CFT) reporting thresholds.

### Pillar 4: Cybersecurity and Threat Modeling
* Non-custodial architectural priority: Private keys and seed material must never be sent to, stored on, or processed by centralized servers.
* Defensive sanitization against Cross-Site Scripting (XSS), Injection, and Cross-Site Request Forgery (CSRF).
* Cryptographic validation of all third-party payloads and webhook signatures before state updates.

---

## 4. Local Verification Checklist

Before pushing commits and submitting a pull request, run:

```bash
# Verify code syntax and TypeScript type integrity
npm run lint

# Verify dependency security
npm audit --audit-level=high

# Verify production compilation
npm run build
```

All commands must exit with code 0.

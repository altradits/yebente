---
name: Feature Proposal
about: Propose a new feature with protocol, independence and security evidence
title: "[FEAT]: "
labels: ["enhancement"]
assignees: ""
---

## 1. Deliverable Description
<!-- Describe the specific feature, user journey, and operational outcome. -->

## 2. Protocol Foundations
<!-- Cite the specific protocol basis: e.g. the Bitcoin whitepaper section, or the relevant BIP/BOLT (BIP-21, BIP-84, BIP-86, BOLT-11). -->

## 3. Independence Check
<!-- Name every outside system this feature needs. For each: the generic adapter contract it implements (docs/independence.md), and what happens while no adapter is configured ("not available yet"). Confirm zero company-specific code, names, URLs or config in the core. -->

## 4. Legal and Regulatory Fit
<!-- Detail compliance with relevant frameworks:
- Kenya: Central Bank of Kenya National Payment System Act and Kenya Data Protection Act 2019.
- Ethiopia: National Bank of Ethiopia payment-system and payment-instrument directives.
- AML/CFT threshold compliance and consumer protection. -->

## 5. Cybersecurity and Threat Mitigation
<!-- Describe the security architecture:
- Custodial boundary: node credentials and spending power stay server-side with least privilege; confirm zero private keys or credentials sent to browsers or third parties.
- Sanitization: protection against XSS, CSRF, and injection attacks.
- Honest states: no mock fallbacks or simulated results; unclear money answers stay pending. -->

## 6. Implementation Plan
- [ ] Specification and API contract definition
- [ ] Tests written alongside the change (no live outside services in tests)
- [ ] Capability table in docs/independence.md updated the same day
- [ ] Pull request linked to this issue

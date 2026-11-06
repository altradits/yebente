## Issue Reference
Fixes #

## Description of Changes
<!-- Concise summary of changes introduced in this PR. -->

## Compliance Checklist
- [ ] Solves a single scoped issue.
- [ ] Your own work only (code, tests, translations).
- [ ] No company-specific code, names, URLs or config in the core; outside systems sit behind generic adapter contracts.
- [ ] No live implementation gaps hidden: missing capabilities fail with "not available yet" and are listed in docs/independence.md.
- [ ] Custody honesty: nothing described as non-custodial or sovereign.
- [ ] UI purity: zero emojis, zero m-dashes or en-dashes, zero blinking indicators, zero cluttered explanatory text.
- [ ] Cybersecurity: zero transmission or exposure of private keys or unencrypted credentials.

## Verification Checklist
- [ ] `npm run lint` exits with code 0
- [ ] `npm test` exits with code 0
- [ ] `npm audit --audit-level=high` exits with code 0
- [ ] `npm run build` exits with code 0

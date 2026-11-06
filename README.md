# Ye₿ente

**Money for the home: a custodial Bitcoin wallet for African households.**

[![Live App](https://img.shields.io/badge/Live%20App-yebente.onrender.com-763698?style=flat&logo=render)](https://yebente.onrender.com)
[![Status](https://img.shields.io/badge/Status-Live-emerald)](https://yebente.onrender.com/api/health)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

* **Live Web Application:** [https://yebente.onrender.com](https://yebente.onrender.com)
* **Health & API Gateway:** [https://yebente.onrender.com/api/health](https://yebente.onrender.com/api/health)

---

## What Ye₿ente is

Ye₿ente lets households hold Bitcoin-denominated balances, receive and send
over the Lightning Network, see prices in KES, ETB and USD, and (once fiat
adapters exist) buy sats with mobile money and cash out to mobile money.

An honest statement about custody, which everything in this repo follows:

* **The live Ye₿ente is custodial.** The operator holds the bitcoin on its
  own node and keeps the ledger. Users do not hold their own keys in this
  system.
* This repo therefore **must not be described as non-custodial or
  sovereign**, here or anywhere else. Those words appear nowhere in this
  README or in docs/ except in this paragraph explaining why.
* Balances shown in the browser are views of the operator's ledger and
  local transaction records, not keys the user controls.

---

## The independence principle

Ye₿ente must not depend on any company. Every outside service the app once
relied on (buying sats, cashing out to mobile money, Lightning address
lookups, exchange rates, block data) was some company's own build on top of
open infrastructure. Ye₿ente does the same:

* **Bitcoin Core** for chain truth: addresses, balances, confirmations, fee
  estimates.
* **LND** for Lightning: invoices, payments, channels, liquidity.
* **Ye₿ente's own fiat integration layer** for mobile money and banks,
  defined by generic adapter contracts in this repo, implemented per
  operator from source.

Where Ye₿ente does not have a piece yet, the code fails clearly ("not
available yet") and [docs/independence.md](docs/independence.md) says exactly
what that piece needs. No company names appear in code, config, docs, README
or CONTRIBUTING.

---

## Architecture

The app core talks only to provider interfaces (ports). Defaults talk to
Bitcoin Core, LND, or Ye₿ente's own modules. Fiat rails and notification
channels plug in behind generic contracts.

```
Browser app (React)                Backend (Node, server.js)
------------------------           -------------------------
Buy / Send Mobile ----\
Receive / Send Sats ----+--> /api/* routes --> providers + fiat adapters
Rates / history ------/               |                |
                                      v                v
                              Bitcoin Core (RPC)   LND (REST)
                              Owner-set rate       (no fiat adapter yet: 501)
```

| Interface | Default implementation | Configured by |
|-----------|------------------------|---------------|
| Chain (Bitcoin Core) | Core RPC client (`src/providers/coreChain.ts`) | `BITCOIN_CORE_RPC_URL/USER/PASSWORD` |
| Lightning (LND) | LND REST client (`src/providers/lndLightning.ts`) | `LND_REST_URL`, `LND_INVOICE_MACAROON`, `LND_PAY_MACAROON` |
| Price | Owner-set rate (`src/providers/ownerPrice.ts`) | `YEBENTE_OWNER_BTC_KES/ETB/USD` |
| Fiat on-ramp | None yet: honest 501 | Operator adapter (contract in docs/independence.md) |
| Fiat off-ramp | None yet: honest 501 | Operator adapter (contract in docs/independence.md) |
| Notifications | None yet: honest 501 | Operator sender (contract in docs/independence.md) |

Anything unconfigured resolves to an Unavailable provider that throws a
clear error instead of guessing. Fakes exist for tests
(`src/providers/fakeFiat.ts`, `src/providers/fakeNotify.ts`).

Details: [docs/architecture.md](docs/architecture.md). The UI follows the
Stan Style tokens in `src/theme/brandKit.ts`.

---

## Run it on your own stack

Prerequisites: Node.js v20 or higher (v24 LTS recommended), npm v10 or
higher, plus your own `bitcoind` and `lnd` (see
[docs/running-your-own-stack.md](docs/running-your-own-stack.md) for full
regtest/signet setup).

```bash
git clone https://github.com/altradits/yebente.git
cd yebente
npm install
cp .env.example .env
# fill in your node credentials and owner-set rate in .env
```

```bash
# Frontend dev server (http://localhost:3000, reachable on local WiFi)
npm run dev

# Backend bridge (serves /api/* and the production build)
node server.js
```

Checks that must pass before any pull request:

```bash
npm run lint
npm test
npm run build
```

Production deploys continuously on Render via
[render.yaml](render.yaml) (`npm install && npm run build`, then
`node server.js`, health check at `/api/health`).

---

## What is built and what is still needed

Built: provider interfaces with Core, LND and owner-price implementations;
generic fiat and notification contracts with fakes; Lightning receive and
status over the operator node; on-chain validation, balances and fee
estimates over the operator node; honest 501s everywhere else.

Still needed: in-house Lightning address serving, the server-side LND pay
path, live fiat adapters (collection, disbursement, callbacks,
reconciliation), a live notification sender, and the operator's server
ledger deployment. Each gap has an exact contract.

The full list is the capability table in
[docs/independence.md](docs/independence.md). That document is the
checklist: it must be updated the same day any dependency is added or
removed.

---

## Documentation

* [Independence: research, capability table and contracts](docs/independence.md)
* [Architecture](docs/architecture.md)
* [Running your own stack (regtest/signet with your own nodes)](docs/running-your-own-stack.md)
* [Security](docs/security.md)
* [Brand Development Kit](docs/BRAND_DEVELOPMENT_KIT.md): visual identity and token engine.

---

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. The short version: your own
work only, one-line commit messages, generic code with no company names,
an adapter contract for every outside system, and tests with every change.

---

## License

This project is licensed under the terms of the MIT License. See
[LICENSE](LICENSE) for details.

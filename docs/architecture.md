# Architecture

Ye₿ente is a custodial Bitcoin wallet: a React frontend, a Node backend
bridge, and provider interfaces whose defaults talk to the operator's
own Bitcoin Core and LND nodes. This document describes the system as
built in this repo. [independence.md](independence.md) holds the
research, the capability table, and the contracts for what is missing.

## Components

```
+------------------+   HTTPS/JSON   +-------------------+
|  Browser app     | --------------> |  Backend bridge   |
|  React + Vite    | <-------------- |  Node + Express   |
|  src/            |   /api/*        |  server.js        |
+--------+---------+                 +--------+----------+
         |                                    |
         | localStorage                       | fetch (server-side)
         | (records cache)                    |
         v                                    v
+------------------+                 +-------------------+
|  Operator nodes  |                 |  Fiat adapters    |
|  bitcoind (RPC)  |                 |  (none bundled:   |
|  lnd (REST)      |                 |   routes 501)     |
+------------------+                 +-------------------+
```

* **Browser app (`src/`)**: screens and modals (`src/components/`),
  thin service clients (`src/services/`: rates, fiat, chain,
  Lightning, storage, offline outbox, vault), provider interfaces
  and implementations (`src/providers/`), shared types
  (`src/types.ts`), Stan Style tokens (`src/theme/brandKit.ts`).
  The browser never holds node credentials and never calls a money
  network directly; every money operation goes through `/api/*`.
* **Backend bridge (`server.js`)**: serves `/api/*` and the
  production `dist/` build. Reads Core and LND over server-side
  fetch, serves the owner-set rate, and answers 501 for fiat rails
  (no adapter configured). Small JSON bodies only, per-caller rate
  limits on resource-minting routes, token-gated callback shape for
  future adapters.
* **Provider interfaces (`src/providers/`)**: `ChainProvider`,
  `LightningProvider`, `PriceProvider`, `FiatOnRamp`, `FiatOffRamp`,
  `Notifications`, plus `CoreChainProvider`, `LndLightningProvider`,
  `OwnerSetPriceProvider`, `Unavailable*` stubs, `Fake*` test
  doubles, and the `createProviders` factory. Real node calls run
  server-side; the browser uses the same shapes through HTTP.
* **Storage (`src/services/storageService.ts`)**: transaction records
  and wallet state in web storage, with a local handle per device.
  Records are the app's memory, not the ledger: the operator's
  server ledger (deployment work, specified in independence.md 4.9)
  is the source of truth for custodial balances.
* **Offline outbox (`src/services/offlineService.ts`)**: queues
  locally created records while offline and reconciles them on
  reconnect. It never invents network results.
* **Client vault (`src/services/vaultService.ts`)**: AES-256-GCM
  encryption of client-held secrets under a device PIN. It holds no
  node credentials and no ability to move operator funds.

## Request flows

* **Rates**: app `GET /api/rates` -> owner-set rate from env ->
  cached in the browser and marked live; on failure the last cached
  rate serves marked stale, else an honest error.
* **Lightning receive**: app `POST /api/lightning/create-invoice`
  -> LND `AddInvoice` (invoice macaroon) -> invoice plus payment
  hash; the app polls `GET /api/lightning/invoice-status/:hash`
  until settled, then records the credit.
* **Lightning send**: the user's own browser wallet pays through
  WebLN after the user approves; nothing is paid by the server. The
  server-side pay path (`POST /api/lightning/disburse`) answers 501
  until the operator configures it.
* **On-chain read**: app `GET /api/chain/balance/:address`,
  `/api/chain/fee`, `/api/chain/status` -> Core RPC on the
  operator node. Addresses come from `POST /api/chain/address`.
* **Fiat buy/sell**: app `POST /api/fiat/quote` -> `collect` or
  `payout` with an idempotency key -> poll `GET /api/fiat/status`.
  With no adapter configured every step answers 501 "not available
  yet", and the UI says exactly that.
* **Health**: `GET /api/health` reports which providers are
  configured and which features are on, so the app only shows
  controls that can complete.

## Configuration surface

All operator configuration is environment, never code:
`BITCOIN_CORE_RPC_URL/USER/PASSWORD`, `LND_REST_URL`,
`LND_INVOICE_MACAROON`, `LND_PAY_MACAROON`,
`YEBENTE_OWNER_BTC_KES/ETB/USD`, `YEBENTE_OWNER_RATE_AT`. See
`.env.example` and [running-your-own-stack.md](running-your-own-stack.md).
Fiat adapter settings will follow the same rule: generic names,
documented in the adapter contract, values never committed.

## Adding a capability

1. Extend the provider interface in `src/providers/types.ts`, or use
   the existing one.
2. Implement it (real client, unavailable stub behavior, fake for
   tests).
3. Expose it through `/api/*` with the same error vocabulary
   (rejected / unknown / not-configured).
4. Cover it in `tests/` with stubbed network.
5. Update the capability table in [independence.md](independence.md)
   the same day.

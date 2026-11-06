# Ye₿ente independence: run on your own stack, depend on no company

Principle: Ye₿ente builds on open Bitcoin infrastructure (Bitcoin Core,
LND) directly, plus a fiat integration layer that Ye₿ente itself defines
and can implement from source. No capability in the app may depend on a
specific company staying in business, keeping an API open, or keeping
favorable terms. Where Ye₿ente does not have a piece yet, this document
says exactly what that piece needs.

This document is research plus a build list. It covers:

1. How a Bitcoin and Lightning wallet works end to end on its own
   infrastructure.
2. How to price without a third-party price API.
3. Every capability in the app: what it uses today, what it needs on
   Ye₿ente's own stack, and what is missing.
4. What we still need to build, with the exact contract for each gap.

Words used precisely in this repo:

- Custodial: the operator holds the bitcoin and keeps the ledger. The
  live Ye₿ente is custodial. Nothing here claims users hold their own
  keys.
- In-house: runs on infrastructure the operator controls, built on open
  protocols and open-source software (Bitcoin Core, LND).
- Adapter: a replaceable module that talks to one outside system (a
  mobile-money network, a bank, a notification channel) behind a generic
  interface the core defines. The core never imports an adapter's
  internals; adapters never leak their vendor's names or shapes into
  the core.

---

## 1. A Bitcoin and Lightning wallet on its own infrastructure

### 1.1 Bitcoin Core: the chain side

A self-hosted wallet starts with a fully validating Bitcoin node,
Bitcoin Core. The node downloads and checks every block against the
consensus rules, so balances and confirmations need no third party.

What the node provides, and which part of Ye₿ente uses it:

- Chain truth (RPC): `getblockchaininfo` (sync state, chain, height),
  `getblockhash` / `getblock` (block contents), `getrawtransaction`
  with `txindex` or from a watched wallet (proof a payment exists).
  Used by: deposits, reconciliation, "is this confirmed" checks.
- Addresses and coins (wallet RPC): `getnewaddress` (BIP-84 native
  SegWit and BIP-86 Taproot addresses), `listunspent`,
  `createrawtransaction` / `fundrawtransaction` /
  `signrawtransactionwithwallet` / `sendrawtransaction` (build and
  broadcast spends). Used by: on-chain receive, on-chain send.
- Wallet vs watch-only: a node with private keys can spend; a
  watch-only wallet (`importdescriptors` with descriptors but no
  private keys, then `scantxoutset` or wallet rescan) can see balances
  and confirmations without being able to spend. An operator typically
  keeps keys on a signing setup and runs the public-facing node
  watch-only, so a server breach cannot steal on-chain funds.
- Fee estimation: `estimatesmartfee` returns a feerate (sat/vB) for a
  confirmation target, learned from the node's own mempool and recent
  blocks. No fee API needed.
- Live updates (ZMQ): the node publishes `rawtx`, `rawblock`, and
  `hashtx` messages over ZeroMQ as transactions and blocks arrive.
  Used by: crediting deposits the moment they confirm, watching for
  spends, keeping the ledger in sync without polling.
- Pruning vs archival: a pruned node (a few GB) validates everything
  but drops old block data; an archival node with `txindex=1` can
  serve any historical transaction. A wallet that only watches its
  own addresses runs fine pruned; a service that must prove old
  payments keeps either an archival node or its own index of the
  transactions it cares about.

Sources: the Bitcoin whitepaper (bitcoin.org/bitcoin.pdf) sections
2-9 for the chain model; BIP-21 (payment URIs), BIP-32/39/44
(hierarchical keys and recovery phrases), BIP-84 (SegWit accounts),
BIP-86 (Taproot accounts), BIP-174 (partially signed transactions,
the standard way to keep signing offline); the Bitcoin Core RPC and
ZMQ reference at developer.bitcoin.org and bitcoincore.org/en/doc.

### 1.2 LND: the Lightning side

Lightning moves sats off-chain through payment channels, settling to
the chain only when channels open or close. LND is the operator's
Lightning node: it holds channels, makes and pays invoices, and
routes payments.

Pieces Ye₿ente needs from its own LND node:

- Invoices (BOLT-11): `AddInvoice` creates an invoice for an amount;
  the node reports it settled when paid. Used by: Lightning receive.
  Invoices carry an expiry and a payment hash; the preimage of that
  hash is the proof of payment.
- Payments: `SendPaymentV2` pays an invoice with a caller-set fee
  limit. Results are three-valued: succeeded, failed, or unknown
  (timed out: check `LookupInvoice` / `TrackPaymentV2` before
  retrying or refunding, because the payment may still complete).
- Channels and liquidity: `OpenChannel` / `CloseChannel` manage
  chain-backed channels. Each channel has local balance (what the
  node can send) and remote balance (what it can receive), plus a
  channel reserve (about 1%) that can never be spent. Liquidity
  management is the real operations work: inbound capacity (others
  open to you, or you spend) lets users receive; outbound capacity
  (you open and fund) lets users send and lets the operator pay
  out. An operator watches both per channel and rebalances or opens
  new channels before either side runs dry.
- LNURL-pay and Lightning addresses served in-house: a Lightning
  address (`user@operator-domain`) is LNURL-pay over HTTPS served by
  the operator: `GET /.well-known/lnurlp/<user>` returns limits and
  a callback URL; the sender's wallet calls the callback with an
  amount and gets a fresh BOLT-11 invoice from the operator's own
  LND. No outside provider is involved once the operator serves
  these two endpoints and backs them with `AddInvoice`. The
  endpoints must answer every username the same way (same limits,
  one generic refusal for unknown users) so strangers cannot probe
  balances, and invoices must expire quickly.
- BOLT-11 vs BOLT-12: BOLT-11 invoices are the working standard
  every wallet pays today. BOLT-12 (offers: reusable payment codes
  with payer privacy) is the successor; operator support follows
  LND's implementation. Ye₿ente builds on BOLT-11 now and tracks
  BOLT-12 for later, without depending on any wallet vendor for
  either.

Sources: the BOLT specifications (github.com/lightning/bolts),
especially BOLT-2 (channels), BOLT-4 (routing), BOLT-7 (gossip),
BOLT-11 (invoices) and BOLT-12 (offers); LND's API and operations
documentation at docs.lightning.engineering; the LNURL-pay and
LUD-16 (Lightning address) specifications.

### 1.3 Fiat on/off ramps: what a mobile-money or bank rail needs

Bitcoin rails are permissionless; fiat rails are accounts with
regulated institutions. Each country needs its own rail work. The
generic shape is the same everywhere:

1. A merchant or aggregator account: a contract with a mobile-money
   operator or a licensed aggregator (or a bank for bank rails) that
   gives API credentials, a shortcode or till or account number, and
   access to collection and disbursement products.
2. Collection API (money in): the customer authorizes a payment from
   their phone or bank account to the operator (a PIN prompt to the
   phone, a USSD push, a checkout page, or a pull from an account).
   The API returns a transaction id immediately; finality arrives
   later by callback.
3. Disbursement API (money out): the operator pays from its own
   float to a customer's phone or bank account (business-to-customer
   payment). Needs its own credentials and usually its own approval
   or security credential.
4. Callbacks (webhooks): the money network calls the operator back
   with the final result. A correct callback handler verifies the
   caller (secret in the path or a signature over the raw body),
   answers fast with success, and treats the callback as a hint:
   balances move only after a server-to-server status query agrees,
   or after the callback's signature and idempotency key check out.
5. Reconciliation: every collection and disbursement is matched
   against money-network receipts and settlement reports, daily, by
   an idempotency key the operator generated (never the network's
   reference alone). Double callbacks, retried requests, and
   "unknown" answers must never move money twice.
6. Float management: disbursements pay out of the operator's own
   prefunded balance with the money network. The operator tops up
   float before it runs dry and sweeps collected funds to where they
   are needed. Float is the fiat equivalent of Lightning liquidity.
7. KYC/AML: customer identification, transaction limits, screening,
   and suspicious-activity reporting per the country's law. Even a
   small operator needs written thresholds, record keeping, and a
   way to freeze and report.
8. Licensing in each country: Kenya (Central Bank of Kenya:
   National Payment System Act 2011 and its regulations, which cover
   electronic money issuers and payment service providers; Kenya
   Data Protection Act 2019 for customer data) and Ethiopia
   (National Bank of Ethiopia payment-system and payment-instrument
   directives, which license and supervise mobile-money issuers and
   their agents). An operator either holds the local licence or
   contracts with a licensed institution that does; the adapter
   contract in section 4 is the same either way.

Sources: Central Bank of Kenya national-payments-system pages and
the National Payment System Act 2011 (centralbank.go.ke); National
Bank of Ethiopia payment-system directives (nbe.gov.et); the
operator's or aggregator's own API documentation for the exact
endpoints once an account exists.

---

## 2. Price data without a third-party API

Ye₿ente needs a BTC/fiat rate to quote buys, sells, and conversions.
Depending on a price API is depending on a company. Three
self-hosted options, in order of independence:

Option A: owner-set rate (built first).
The operator sets the rate in configuration (BTC per KES, BTC per
ETB, BTC per USD), with an effective timestamp. Quotes use exactly
that rate. Advantages: zero outside calls, the operator's margin is
explicit, and the quote is always explainable. Cost: the operator
must update the rate as the market moves, or accept the spread risk.
This is the default price provider in this repo.

Option B: rate derived from the operator's own fiat trades.
Once the operator buys and sells against its own float, the executed
trade prices are a real price feed: a rolling average (for example
volume-weighted over the last 24 hours) of the operator's own fills
becomes the mid rate, with a configured spread for quotes. No market
data leaves or enters the building. Needs: a trade log (already part
of reconciliation) and a rule for thin periods (fall back to the
owner-set rate when fewer than N trades exist in the window).

Option C: self-hosted feed with documented inputs and outputs.
The operator runs its own price collector: it fetches public market
data from sources the operator chooses, combines them with a written
rule (for example median of three, outliers dropped), and serves the
result to the app from the operator's own endpoint. The feed's
inputs, combination rule, staleness limit, and failure behavior
(freeze last good rate and mark quotes stale) are documented in the
operator's configuration, not hidden in an app dependency. The app
sees one interface; changing sources never changes the app.

What Ye₿ente must never do: silently mix sources, silently serve a
stale rate as live, or quote from a source the operator did not
configure. Every rate carries its source label and timestamp, and
the UI marks cached or stale rates as such.

---

## 3. Capability table: today, in-house target, missing

"Today" describes this public repo as checked out. Names of outside
companies are deliberately not used here; each row names the
category of dependency instead.

| # | Capability | Uses today | In-house target | Missing |
|---|-----------|-----------|-----------------|---------|
| 1 | BTC/fiat price quotes | A third-party Lightning-wallet company's price API (primary); a third-party exchange spot API plus a third-party FX API (fallback); a browser cache | Owner-set rate (Option A now); trade-derived rate (Option B) once the operator trades; self-hosted feed (Option C) as documented | Options B and C are specified but not built |
| 2 | Lightning receive (invoices) | Invoices minted by a third-party wallet company's API; or the operator's own LND node via the backend bridge; generic LNURL-pay resolution of any domain | Operator's own LND (`AddInvoice`), plus operator-served Lightning addresses (section 1.2) | Operator-served address endpoints are specified but not built in this repo |
| 3 | Lightning send | The user's own browser wallet pays (WebLN); no server-side payment path | Operator's own LND (`SendPaymentV2` with fee limit, three-state result handling) for operator-initiated payouts; user wallets keep paying for themselves | Server-side LND pay path is specified but not built in this repo |
| 4 | On-chain Bitcoin receive and send | Removed from the app: on-chain addresses are rejected; no chain provider | Bitcoin Core: `getnewaddress` (BIP-84/86), watch-only tracking, `sendrawtransaction` for spends | Chain provider interface plus Core implementation; key-management and signing policy (operator decision, documented in docs/security.md) |
| 5 | Fee estimation | A public block-explorer fee API, with a hardcoded fallback | Bitcoin Core `estimatesmartfee` from the operator's own node | Built with capability 4 (same Core client) |
| 6 | Lightning address lookup (paying others) | Direct HTTPS LNURL-pay resolution from the browser to any domain | Server-side LNURL-pay resolution through an egress guard (exact-amount invoice check), as an open-protocol client, not a vendor SDK | Server-side resolver with egress guard is specified but not built in this repo |
| 7 | Kenya fiat on-ramp (collectKES from a phone) | A mobile-money operator's collection API (STK-style PIN prompt) via a backend bridge; credentials in server env | Generic collection adapter (contract in section 4): same flow, operator's own account, no vendor names in the core | No licensed account is bundled (cannot be: it is a per-operator contract); adapter interface plus fake are in the repo, a live adapter is operator work |
| 8 | Kenya fiat off-ramp (pay KES to a phone) | A third-party payout company's Lightning-address-per-number API over LNURL-pay (number@host), fee on top, receipt published by them | Generic disbursement adapter (contract in section 4): operator's own disbursement account, or the same number@host shape behind the generic interface | Same as 7: interface plus fake in repo, live adapter is operator work |
| 9 | Ethiopia fiat on/off ramp (ETB) | Stub client calling backend routes that do not exist (fails at runtime) | Generic collection/disbursement adapter for an Ethiopian licensed partner (contract in section 4) | Same as 7 and 8, plus no partner account exists yet; must fail clearly until one does |
| 10 | Merchant/account verification | A mobile-money operator's name-lookup API via the backend bridge | Part of the generic fiat adapter contract (optional `resolveAccount`): verified names only from the operator's own account, never invented | Same as 7: interface in repo, live adapter is operator work |
| 11 | Card and bank deposits | Not in this repo (exists only in the operator's private deployment) | Generic card/bank adapter: provider-hosted checkout, server-to-server settlement check, credit only on explicit Completed for the exact quoted amount | Specified in section 4; not built |
| 12 | Transaction status and receipts | Status from each vendor's API shape; receipts as vendor URLs | Status and receipts normalized by the adapter into the generic contract; the core stores receipt references, never vendor URLs | Built with 7-11 (part of the contract) |
| 13 | User notifications (email/SMS/push) | None in this repo (transaction state lives in the browser) | Generic notification interface (contract in section 4); operator plugs in its own mail/SMS/push sender | Interface plus fake in repo; live sender is operator work |
| 14 | Custody and ledger | Browser-local balances in web storage plus a client-side encrypted vault; the live deployment is custodial with a server ledger | This repo is honest about custody (see README): balances the operator holds are the operator's ledger entries, and the repo's provider interfaces assume a server ledger; the client vault stays for client-held secrets only | Server ledger is operator deployment work, specified in docs/architecture.md; the repo must not claim the browser balance is the ledger |

---

## 4. What we still need to build

Each item below is a buildable unit with an exact contract. Until a
unit is built, the code that needs it fails clearly ("not available
yet") instead of faking success. Adapter contracts use JSON over
HTTPS; field names are fixed so adapters are interchangeable.

### 4.1 Bitcoin chain provider (Bitcoin Core)

Status: interface plus Core implementation live in this repo
(`src/providers/`); needs an operator's node to talk to.

Contract (interface `ChainProvider`):

- `getStatus()`: `{ chain, height, synced, tipHash }`. From
  `getblockchaininfo`. Failure: throw `ChainUnavailable`.
- `newAddress(kind: 'segwit' | 'taproot')`: string address. From
  `getnewaddress` with `bech32` / `bech32m`. Failure: throw
  `ChainUnavailable`.
- `getBalance(address)`: `{ confirmedSats, unconfirmedSats }` from
  the watch-only wallet. Failure: throw `ChainUnavailable`.
- `estimateFee(targetBlocks)`: sat/vB number from
  `estimatesmartfee`. Failure: throw `ChainUnavailable` (never a
  guessed number).
- `send(toAddress, sats, feeRate)`: txid, via wallet RPC
  fund/sign/send. Failure: throw `ChainUnavailable` or
  `ChainRejected(reason)`. Only callable server-side.

Configuration: `BITCOIN_CORE_RPC_URL`, `BITCOIN_CORE_RPC_USER`,
`BITCOIN_CORE_RPC_PASSWORD`. Never commit values. See
docs/running-your-own-stack.md.

### 4.2 Lightning provider (LND)

Status: interface plus LND implementation live in this repo
(`src/providers/`); needs an operator's node to talk to.

Contract (interface `LightningProvider`):

- `createInvoice(sats, memo)`: `{ invoice, paymentHash, expiresAt }`.
  From `AddInvoice`. Failure: throw `LightningUnavailable`.
- `invoiceStatus(paymentHash)`: `'pending' | 'settled' | 'expired'`.
  From `LookupInvoice`. Failure: throw `LightningUnavailable`.
- `payInvoice(invoice, feeLimitSats)`:
  `{ state: 'succeeded' | 'failed' | 'unknown', feeSats?, preimage? }`.
  From `SendPaymentV2`; unknown means "check again", never "retry
  blindly". Failure to reach the node: throw `LightningUnavailable`.
- `channelBalance()`: `{ outboundSats, inboundSats }` (local minus
  reserve, remote). From `ChannelBalance` / `ListChannels`. Failure:
  throw `LightningUnavailable`.

Macaroon rule: invoice creation and lookup use an invoice-only
macaroon; paying uses a separate pay macaroon; the admin macaroon is
never on the server. Configuration: `LND_REST_URL`,
`LND_INVOICE_MACAROON`, `LND_PAY_MACAROON`, optional `LND_TLS_CERT`.

### 4.3 In-house Lightning addresses (LNURL-pay serve)

Status: not built. Specified here.

Contract: the operator serves, on its own domain, for each wallet
handle:

- `GET /.well-known/lnurlp/<handle>` returns:
  `{ "tag": "payRequest", "callback": "https://<domain>/lnurl/<handle>",
  "minSendable": <msat>, "maxSendable": <msat>, "metadata": <json>,
  "commentAllowed": 0 }`, with min/max FIXED for all handles.
- `GET /lnurl/<handle>?amount=<msat>` returns
  `{ "pr": <bolt11 from own LND>, "routes": [] }` for amounts within
  the fixed limits, else `{ "status": "ERROR", "reason": "<generic>" }`.
- Unknown handles get the same generic refusal as known ones; no
  handle-specific limits, memos, or errors. Invoices expire in 10
  minutes and do not count toward incoming totals until settled.

### 4.4 Server-side LNURL-pay resolver (paying others' addresses)

Status: not built. Specified here.

Contract (function `resolveAddress(address)` behind the server's
egress guard):

- Input: `user@domain` or bech32 LNURL string. Steps: parse, fetch
  the well-known URL with a timeout and size cap, read limits and
  callback, request an invoice for the exact millisat amount.
- Checks: the returned invoice must decode to exactly the requested
  amount; anything else is rejected. Domains on the operator's
  denylist (including fiat-adapter hosts whose rail is switched off)
  are never resolved or paid.
- Failure: return `{ ok: false, error: <generic> }`. Never expose
  the remote server's internals to the client.

### 4.5 Fiat on-ramp adapter (collect fiat from a customer)

Status: generic interface plus fake in this repo
(`src/providers/`); no live adapter bundled (a live adapter needs
the operator's own licensed account).

Contract (interface `FiatOnRamp`):

- `quote(fiatAmount, currency)` returns
  `{ sats, feeFiat, rateUsed, rateSource, rateAt, quoteId, expiresAt }`.
  The rate comes from the configured price provider only.
- `collect({ quoteId, phone, idempotencyKey })` starts one
  collection and returns `{ reference, state: 'pending' }`. The
  idempotency key is a fresh UUID per user action, stored with the
  record; retries reuse it and can never charge twice.
- `status(reference)` returns
  `{ state: 'pending' | 'paid' | 'failed', receipt?, paidAt? }`.
  `paid` only after the money network's server-to-server
  confirmation or a verified callback plus status query.
- Callback endpoint `POST /api/fiat/callback/<secret>`: verifies
  the caller (secret path plus, where the network supports it, an
  HMAC signature over timestamp + raw body inside a 5-minute
  window), answers fast with success, and only updates display
  status; balances move through `status()`.
- Errors are one of: `FiatNotConfigured` (rail off: HTTP 501, "not
  available yet"), `FiatRejected` (definitive: bad number, bad
  amount), `FiatUnknown` (retryable: network unclear). Unknown never
  credits and never closes the record.
- Reconciliation: the adapter exposes `listSettlements(since)` for
  the daily match of collections against network receipts; every
  record carries the operator's idempotency key.

### 4.6 Fiat off-ramp adapter (pay fiat to a customer)

Status: same as 4.5: interface plus fake in repo, live adapter is
operator work.

Contract (interface `FiatOffRamp`):

- `quote(sats, currency)` returns
  `{ fiatAmount, feeFiat, feeSats, rateUsed, rateSource, rateAt, quoteId, expiresAt }`.
- `payout({ quoteId, phone, idempotencyKey })` returns
  `{ reference, state: 'pending' }`. Same idempotency rule as 4.5.
- `status(reference)` returns
  `{ state: 'pending' | 'paid' | 'failed', receipt?, paidAt? }`.
- `floatBalance()` returns the operator's disbursement float in
  minor units, or throws `FiatUnknown` when the network cannot say.
  Payouts refuse before taking anything when float cannot cover
  them.
- Optional `resolveAccount(phoneOrCode)` returns
  `{ name }` for verified names only; a miss returns "not found",
  never a guessed name.
- Same error set and reconciliation rule as 4.5. Payouts also
  require Lightning outbound capacity (section 1.2) when the rail
  settles over Lightning; the check happens before anything is
  taken.

### 4.7 Card and bank adapter

Status: not built. Specified here; same shape as 4.5 once built.

Contract: the customer pays on the provider's own hosted page (card
and bank details never touch Ye₿ente servers). `createOrder` pins
the operator's own reference and the exact quoted amount;
`status()` settles through a server-to-server query; credit happens
once, only on an explicit Completed for the exact quoted amount;
anything unclear stays pending. Same idempotency, callback, error,
and reconciliation rules as 4.5.

### 4.8 Notification provider

Status: generic interface plus fake in this repo
(`src/providers/`); live sender is operator work.

Contract (interface `Notifications`):

- `send({ channel: 'email' | 'sms', to, kind, subject?, body })`.
  Channels are separate methods on one interface so adding push
  later changes nothing.
- Privacy rule: wallet notifications carry no handle, balance, or
  amount beyond what the message strictly needs, and security
  emails carry no secrets or links that act on click (links only
  open a page with a button).
- Failure: throw `NotifyUnknown`; the caller logs and continues.
  Sending notifications never blocks money movement.

### 4.9 Server ledger (operator deployment)

Status: specified in docs/architecture.md; the ledger itself is
operator deployment work, not a library in this repo.

Contract: every balance change runs under one lock; credits happen
once per reference (payment hash, fiat receipt); no amount may
exceed 21 million BTC or leave safe-integer range; per-wallet caps
(max balance, max payment, daily send) are enforced before anything
is taken; every change writes a history entry. See
docs/architecture.md and docs/security.md.

---

## 5. Sources

Protocol and node documentation:

- S. Nakamoto, "Bitcoin: A Peer-to-Peer Electronic Cash System",
  bitcoin.org/bitcoin.pdf.
- Bitcoin Improvement Proposals: BIP-21 (URIs), BIP-32/39/44
  (keys), BIP-84 (SegWit), BIP-86 (Taproot), BIP-174 (PSBT);
  index at github.com/bitcoin/bips.
- Lightning BOLTs: BOLT-2 (channels), BOLT-4 (routing), BOLT-7
  (gossip), BOLT-11 (invoices), BOLT-12 (offers);
  specs at github.com/lightning/bolts.
- Bitcoin Core RPC, wallet, and ZMQ reference:
  developer.bitcoin.org and bitcoincore.org/en/doc.
- LND API and operations guides: docs.lightning.engineering.
- LNURL-pay and LUD-16 (Lightning address) specifications.

Fiat and regulatory background:

- Central Bank of Kenya, national payment system material and the
  National Payment System Act 2011: centralbank.go.ke.
- Kenya Data Protection Act 2019 (customer data handling).
- National Bank of Ethiopia, payment-system and payment-instrument
  directives: nbe.gov.et.
- The operator's own mobile-money or bank API documentation for the
  exact endpoints behind each adapter (per-operator, not bundled).

---

## 6. Maintenance rule

This document is the independence checklist. A change that adds an
outside dependency must update the capability table the same day,
and a change that removes one must move its row to the in-house
column. A row may never silently drift: what the table says is what
the code does.

# Security

Ye₿ente is custodial: the operator holds bitcoin and keeps the
ledger, so the operator's nodes, credentials and deployment are the
security boundary. This document states the threat model, the rules
the code enforces, and the operator's responsibilities.

## Threat model

* **Remote attacker**: probes `/api/*` for unauthenticated money
  movement, callback forgery, invoice spam, and data leaks. All
  money-moving routes assume hostile input: strict validation, rate
  limits, and no ambient authority.
* **Callback forger**: replays or invents money-network webhooks.
  Callbacks are verified (secret path plus signature where the
  network supports it) and treated as hints: balances move only
  after a server-to-server status query agrees.
* **Double-submitter**: double taps, retries, replays. Every fiat
  transfer carries a fresh operator-generated idempotency key stored
  with the record; replays return the original reference and can
  never charge or pay twice.
* **Compromised server**: a breached app server must not yield
  spending power. The server holds no admin macaroon, no chain
  private keys beyond the node's hot wallet, and node credentials
  live only in environment, never in code or logs.
* **Curious insider / log reader**: balances, handles, phone numbers
  and secrets must not appear in logs, error messages to clients, or
  wallet emails beyond what each message strictly needs.

Out of scope for this repo (operator deployment work): host
hardening, backups and disaster recovery, the server ledger's own
access controls, and HSM or multisig custody design. The ledger
contract it must meet is in
[independence.md](independence.md#49-server-ledger-operator-deployment):
single lock per balance change, credit once per reference, 21M BTC
and safe-integer guards, per-wallet caps, and a history entry per
change.

## Rules the code enforces

* **Least-privilege node credentials**: Core RPC credentials and the
  LND invoice macaroon are the only node secrets the backend may
  hold. Paying uses a separate pay macaroon; the admin macaroon is
  never on the server. Invoice creation is rate-limited per caller.
* **No secrets in the repo**: `.env` is git-ignored; `.env.example`
  carries placeholders only. Never print or commit keys, macaroons,
  tokens or phone numbers.
* **Three-valued money answers**: every money call resolves to
  success, definitive failure, or unknown. Unknown never credits,
  never closes, and is safe to ask again. Timeouts are unknown, not
  failure.
* **Honest unavailability**: unconfigured capabilities answer 501
  "not available yet". There is no silent fallback, no guessed rate,
  no invented balance.
* **Small request surface**: JSON bodies capped at 20KB, no
  compressed bodies, unknown `/api/*` paths 404, static assets only
  from `dist/`.
* **Privacy minimums**: Lightning address endpoints (when built)
  answer every handle identically so balances cannot be probed;
  wallet notifications carry no handle, balance or amount beyond
  need; security links open a page with a button instead of acting
  on click.
* **Dependency hygiene**: CI runs `npm audit --audit-level=high`
  plus the typecheck and the production build on every pull
  request. Tests run offline with stubbed network and must pass
  before review.

## Operator responsibilities

1. Generate long random RPC passwords, callback secrets and webhook
   secrets per environment; store them in the deployment's secret
   manager, not in the repo or in chat.
2. Run `bitcoind` and `lnd` on hosts the operator controls, RPC and
   REST bound to localhost or a private network, with firewall rules
   to match.
3. Fund and watch both kinds of liquidity: Lightning outbound and
   inbound capacity per channel, and fiat float per rail. Refuse
   payouts before taking anything when either cannot cover them.
4. Reconcile daily: match every collection and disbursement against
   money-network receipts and settlement reports by idempotency key.
5. Keep per-wallet caps (max balance, max payment, daily send) and
   the recovery hold behavior described in the ledger contract, and
   review them as volume grows.
6. Meet local obligations: licensing directly or through a licensed
   institution, KYC/AML thresholds and reporting, and customer-data
   handling per the country's law (see the regulatory sources in
   [independence.md](independence.md#5-sources)).
7. Rotate any credential that may have leaked, then investigate; a
   leaked callback secret or macaroon is an incident, not a cleanup.

## Reporting

Security issues in this repo should be reported privately to the
maintainer (see the repo owner on GitHub) with steps to reproduce
and the affected routes. Do not open a public issue for a live
vulnerability, and do not include real credentials or phone numbers
in any report.

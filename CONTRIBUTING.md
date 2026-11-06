# Contributing to Ye₿ente

## 1. Own work

Code, tests and translations must be your own work.

Do not paste code, text or translations you do not have the right to
contribute under this repo's MIT licence. Dependencies stay minimal and
must be licence-compatible; adding one needs a line in the pull request
saying why it is needed.

## 2. No company-specific code in the core

The core (app, backend, providers) must not name, call, or shape itself
around any company. Concretely, the core must contain:

* No company or product names in code, comments, config, docs, commit
  messages or UI strings.
* No vendor URLs, endpoints, credentials, collection files or
  vendor-shaped request/response types.
* No vendor-prefixed environment variables. Operator configuration uses
  generic names (`BITCOIN_CORE_*`, `LND_*`, `YEBENTE_*`).

Every outside system (a mobile-money network, a bank, a notification
channel) plugs in behind a generic adapter interface the core defines.
The adapter lives outside the core, implements the documented contract
exactly, and is the only place that knows the vendor's protocol. The
core reviews an adapter the way it reviews a network boundary: no
leaked shapes, no silent fallbacks.

## 3. How to build an adapter to the documented contracts

Contracts live in [docs/independence.md](docs/independence.md)
(sections 4.5 to 4.8). To add a live adapter:

1. Read the contract for your rail: `quote`, `collect`/`payout`,
   `status`, callback verification, idempotency, errors,
   reconciliation.
2. Implement the matching TypeScript interface from
   `src/providers/types.ts` (`FiatOnRamp`, `FiatOffRamp`,
   `Notifications`). Keep every method's shape exactly; add nothing
   vendor-specific to shared types.
3. Quote from the configured price provider only. Never invent a rate,
   never silently mix sources, never serve a stale rate as live.
4. Generate one fresh idempotency key per user action, store it with
   the record, and reuse it on retry so no retry can move money twice.
5. Verify callbacks before trusting them (secret path, and a signature
   over the raw body where the network supports it). Answer fast.
   Move balances only after a server-to-server status query agrees.
6. Map outcomes onto the three error kinds only: rejected (definitive,
   safe to show), unknown (retryable, never treated as success or
   failure), not-configured (rail off, HTTP 501, "not available yet").
7. Expose the reconciliation feed (`listSettlements`) so the daily
   match runs against the operator's idempotency keys.
8. Until the adapter is live and funded, its rail stays off and every
   call fails with "not available yet". Faking success is never
   acceptable.

Worked example: copy `src/providers/fakeFiat.ts`, replace the
in-memory state with real network calls, and keep the tests in
`tests/providers.test.ts` passing against your adapter.

## 4. Commits, branches and pull requests

* Branches come off `main` with a descriptive name
  (`feat/...`, `fix/...`, `docs/...`). One scoped change per branch.
* Commit messages are one line each, plain text, no signing trailer:
  `Add generic fiat quote client`.
* No AI attribution in commits, code or docs. The work stands on its
  own with its tests.
* No emojis and no em-dashes or en-dashes in code, UI, docs or commit
  messages.
* Pull requests target `main` and stay small and reviewable. Never
  push to `main` directly, never merge your own PR without review,
  never force-push.
* UI changes follow the Stan Style patterns already in the codebase
  (textless back navigation, action-only buttons, borderless readouts
  for non-interactive data).

## 5. Tests required

Every change that touches behavior ships with tests in the same pull
request, and all of these must exit with code 0:

```bash
npm run lint
npm test
npm run build
```

* New provider or adapter: contract tests against the interface,
  including the unhappy paths (rejected, unknown, not-configured)
  and idempotent replay.
* New UI flow: at least the service-level tests for the calls it
  makes, with stubbed network. Tests must never depend on live
  outside services.
* A failing existing test is a requirement, not an artifact: fix the
  change, not the test.

## 6. Custody honesty

The live Ye₿ente is custodial. Do not describe this repo, in code,
docs or UI strings, as non-custodial or sovereign, and do not imply
users hold their own keys. Capabilities without an implementation
fail with "not available yet" and are listed in
[docs/independence.md](docs/independence.md) under "What we still
need to build".

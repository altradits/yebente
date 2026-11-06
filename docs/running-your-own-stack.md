# Running your own stack

This guide runs Ye₿ente end to end against nodes you control: your own
`bitcoind` and your own `lnd`, on regtest (local, instant blocks) or
signet (public test network). No company account is needed for any
step. Values below marked `CHANGE-ME` are placeholders: generate real
ones and never commit them.

## 1. Bitcoin Core

Install Bitcoin Core (24.0 or newer) and create a network config.
Regtest for local work:

```
# ~/.bitcoin/bitcoin.conf (regtest example)
regtest=1
server=1
rpcuser=yebente
rpcpassword=CHANGE-ME-LONG-RANDOM
rpcallowip=127.0.0.1
rpcbind=127.0.0.1
zmqpubrawblock=tcp://127.0.0.1:28332
zmqpubrawtx=tcp://127.0.0.1:28333
txindex=1
```

Start it and check it answers:

```bash
bitcoind -daemon
bitcoin-cli -regtest getblockchaininfo
```

For signet instead of regtest, use `signet=1` in place of `regtest=1`
and the matching `bitcoin-cli -signet` flag. Create a wallet for the
node if your build has none loaded:

```bash
bitcoin-cli -regtest createwallet "yebente" false false "" false true
bitcoin-cli -regtest getnewaddress "" bech32
```

On regtest, generate your own blocks to fund tests:

```bash
bitcoin-cli -regtest generatetoaddress 101 "$(bitcoin-cli -regtest getnewaddress "" bech32)"
```

Note the RPC URL, user and password: they become
`BITCOIN_CORE_RPC_URL` (default `http://127.0.0.1:8332`, regtest
`http://127.0.0.1:18443`, signet `http://127.0.0.1:38332`),
`BITCOIN_CORE_RPC_USER` and `BITCOIN_CORE_RPC_PASSWORD` in `.env`.

## 2. LND

Install LND (0.18 or newer) and configure it against your bitcoind.
Regtest example:

```
# ~/.lnd/lnd.conf (regtest example)
[Application Options]
alias=yebente-test
restlisten=127.0.0.1:8080
rpclisten=127.0.0.1:10009

[Bitcoin]
bitcoin.active=true
bitcoin.regtest=true
bitcoin.node=bitcoind

[Bitcoind]
bitcoind.rpchost=127.0.0.1:18443
bitcoind.rpcuser=yebente
bitcoind.rpcpass=CHANGE-ME-LONG-RANDOM
bitcoind.zmqpubrawblock=127.0.0.1:28332
bitcoind.zmqpubrawtx=127.0.0.1:28333
```

Start it, create the wallet, and unlock on every restart:

```bash
lnd
lncli --network=regtest create
lncli --network=regtest unlock
lncli --network=regtest getinfo
```

For signet use `bitcoin.signet=true` and `--network=signet` with the
signet RPC host, port and ZMQ ports.

### Macaroons: least privilege

Ye₿ente never uses the admin macaroon on a server. Bake two narrow
ones (paths for a default install; adjust `--lnddir` as needed):

```bash
# Invoice-only: create and look up invoices, never spend
lncli --network=regtest bakemacaroon \
  --save_to=/tmp/invoice.macaroon \
  uri:/lnrpc.Lightning/AddInvoice \
  uri:/lnrpc.Lightning/LookupInvoice

# Pay: needed only for the server-side pay path
lncli --network=regtest bakemacaroon \
  --save_to=/tmp/pay.macaroon \
  uri:/routerrpc.Router/SendPaymentV2 \
  uri:/routerrpc.Router/TrackPaymentV2
```

Convert each to hex for `.env`:

```bash
xxd -p -c 256 /tmp/invoice.macaroon | tr -d '\n'; echo
```

Set `LND_REST_URL` (e.g. `https://127.0.0.1:8080`),
`LND_INVOICE_MACAROON` (hex), and `LND_PAY_MACAROON` (hex, or empty
to keep server-side paying off). If LND uses a self-signed
certificate, point your client at it explicitly; never disable
certificate verification in production.

### Channels and liquidity (your first sats)

1. Fund the LND on-chain wallet: `lncli --network=regtest newaddress
   p2wkh`, then send regtest coins to it and mine blocks (regtest) or
   wait for confirmations (signet).
2. Open a channel to a peer: `lncli --network=regtest openchannel
   --node_key=<peer-pubkey> --local_amt=<sats>`. On regtest, run a
   second local LND as the peer, or use a signet faucet-and-peer
   workflow documented by the LND guides.
3. Check sending power before testing payouts: `lncli
   --network=regtest channelbalance`. Each channel keeps about 1% as
   an unspendable reserve; only the balance above it can be sent.
4. Inbound capacity (for receiving) comes from peers opening to you
   or from spending out of your channels.

## 3. Wire up Ye₿ente

```bash
cp .env.example .env
```

Fill in the Core RPC values, the LND REST URL and macaroon hex, and
the owner-set rate (`YEBENTE_OWNER_BTC_KES/ETB/USD`). Then:

```bash
npm install
node server.js &
npm run dev
```

Verify:

* `GET /api/health` shows `chain`, `lightning` and `price` as
  configured, with `receive` on.
* `GET /api/rates` returns your owner-set rate with source `owner`.
* `GET /api/chain/status` reports your node's height and sync state.
* In the app, Receive creates a real invoice on your LND; paying it
  from another wallet credits after settlement.
* `POST /api/fiat/quote` answers 501 "not available yet": correct
  until a fiat adapter is configured.

## 4. Troubleshooting

* `Chain status is not available yet`: bitcoind is not running, the
  RPC credentials in `.env` do not match `bitcoin.conf`, or the
  wrong network port is set (8332 mainnet, 18332 testnet, 18443
  regtest, 38332 signet).
* `Lightning invoices are not available yet`: LND is locked
  (`lncli unlock`), the REST listener differs from `LND_REST_URL`,
  or the macaroon hex is wrong (re-export with `xxd`).
* Invoice created but never settles: no inbound capacity or no
  route; check `channelbalance` and peer connectivity.
* Fee estimate missing for a target: a fresh regtest node has no
  mempool history; send a few transactions and mine blocks first.
* Never paste real mainnet credentials, macaroons or seeds into
  chat, issues or pull requests. Rotate anything that leaks.

/**
 * Bitcoin Core chain provider: the real chain side over Core RPC.
 * Talks only to the operator's own bitcoind. Every failure to reach
 * or parse the node throws ChainUnavailable; estimates are never
 * guessed and balances are never invented.
 */
import { ChainRejected, ChainUnavailable } from './errors';
import {
  AddressBalance,
  AddressKind,
  ChainProvider,
  ChainStatus,
  assertSafeSats,
} from './types';

export interface CoreRpcConfig {
  url: string;
  user: string;
  password: string;
  /** Injected in tests; defaults to global fetch. */
  fetchFn?: typeof fetch;
}

const SATS_PER_BTC = 100_000_000;

function toSats(btc: number, what: string): number {
  const sats = Math.round(btc * SATS_PER_BTC);
  assertSafeSats(sats, what);
  return sats;
}

export class CoreChainProvider implements ChainProvider {
  private readonly config: CoreRpcConfig;
  private rpcId = 0;

  constructor(config: CoreRpcConfig) {
    this.config = config;
  }

  private get fetchFn(): typeof fetch {
    const fn = this.config.fetchFn || fetch;
    if (typeof fn !== 'function') throw new ChainUnavailable();
    return fn;
  }

  private async rpc<T>(method: string, params: unknown[] = []): Promise<T> {
    const { url, user, password } = this.config;
    if (!url || !user || !password) throw new ChainUnavailable();
    let res: Response;
    try {
      const auth =
        typeof Buffer !== 'undefined'
          ? Buffer.from(`${user}:${password}`).toString('base64')
          : btoa(`${user}:${password}`);
      res = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
        body: JSON.stringify({
          jsonrpc: '1.0',
          id: `yebente-${++this.rpcId}`,
          method,
          params,
        }),
      });
    } catch {
      throw new ChainUnavailable();
    }
    let data: { result?: T; error?: { message?: string } };
    try {
      data = (await res.json()) as { result?: T; error?: { message?: string } };
    } catch {
      throw new ChainUnavailable('Bitcoin Core answered with a non-JSON reply.');
    }
    if (!res.ok || data.error) {
      throw new ChainUnavailable(`Bitcoin Core error on ${method}: ${data.error?.message || res.status}`);
    }
    return data.result as T;
  }

  async getStatus(): Promise<ChainStatus> {
    const info = await this.rpc<{
      chain: string;
      blocks: number;
      bestblockhash: string;
      initialblockdownload: boolean;
    }>('getblockchaininfo');
    if (!info || typeof info.blocks !== 'number' || !info.bestblockhash) {
      throw new ChainUnavailable('Bitcoin Core answered without chain state.');
    }
    return {
      chain: String(info.chain || 'unknown'),
      height: info.blocks,
      synced: info.initialblockdownload === false,
      tipHash: String(info.bestblockhash),
    };
  }

  async newAddress(kind: AddressKind): Promise<string> {
    const addressType = kind === 'taproot' ? 'bech32m' : 'bech32';
    const address = await this.rpc<string>('getnewaddress', ['', addressType]);
    if (!address || typeof address !== 'string') {
      throw new ChainUnavailable('Bitcoin Core did not return an address.');
    }
    return address;
  }

  async getBalance(address: string): Promise<AddressBalance> {
    const clean = String(address || '').trim();
    if (!clean) throw new ChainRejected('An address is required.');
    // Needs the address imported into the node wallet (watch-only
    // importdescriptors is enough); the node never needs the keys.
    const [confirmed, total] = await Promise.all([
      this.rpc<number>('getreceivedbyaddress', [clean, 1]),
      this.rpc<number>('getreceivedbyaddress', [clean, 0]),
    ]);
    if (typeof confirmed !== 'number' || typeof total !== 'number') {
      throw new ChainUnavailable('Bitcoin Core answered without a balance.');
    }
    const confirmedSats = toSats(confirmed, 'confirmed balance');
    const totalSats = toSats(total, 'total balance');
    return { confirmedSats, unconfirmedSats: Math.max(0, totalSats - confirmedSats) };
  }

  async estimateFee(targetBlocks: number): Promise<number> {
    const target = Math.floor(Number(targetBlocks));
    if (!Number.isFinite(target) || target < 1) {
      throw new ChainRejected('A confirmation target of at least 1 block is required.');
    }
    const estimate = await this.rpc<{ feerate?: number; errors?: string[] }>('estimatesmartfee', [target]);
    const feerate = estimate ? estimate.feerate : undefined;
    if (!(typeof feerate === 'number' && feerate > 0)) {
      throw new ChainUnavailable('Bitcoin Core has no fee estimate for that target yet.');
    }
    // BTC/kvB to sat/vB.
    return Math.max(1, Math.round(feerate * 100_000));
  }

  async send(toAddress: string, sats: number, feeRateSatVb: number): Promise<{ txid: string }> {
    const clean = String(toAddress || '').trim();
    if (!clean) throw new ChainRejected('A destination address is required.');
    assertSafeSats(sats, 'send amount');
    if (sats <= 0) throw new ChainRejected('A positive amount is required.');
    if (!(feeRateSatVb >= 1)) throw new ChainRejected('A fee rate of at least 1 sat/vB is required.');
    const txid = await this.rpc<string>('sendtoaddress', [
      clean,
      sats / SATS_PER_BTC,
      '',
      '',
      false,
      null,
      null,
      'unset',
      true,
      Math.floor(feeRateSatVb),
    ]);
    if (!txid || typeof txid !== 'string') {
      throw new ChainUnavailable('Bitcoin Core did not return a txid.');
    }
    return { txid };
  }
}

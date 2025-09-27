'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Alchemy, Network, type TokenAddressRequest } from 'alchemy-sdk';
import { formatUnits } from 'viem';

type SimpleToken = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  amount: number; // human units
  usd?: number;
  network: string; // label
};

const DEFAULT_NETWORKS = ['ETH_MAINNET', 'WORLDCHAIN_MAINNET', 'ARB_MAINNET', 'BASE_MAINNET', 'OPT_MAINNET'];

const NETWORK_PRIORITY: Record<string, number> = {
  'ETH_MAINNET': 1,
  'WORLDCHAIN_MAINNET': 2,
  'BASE_MAINNET': 3,
  'ARB_MAINNET': 4,
  'OPT_MAINNET': 5,
};

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

function parseNetworks(): Array<{ network: Network; label: string; nativeSymbol: string }> {
  const raw = process.env.NEXT_PUBLIC_ALCHEMY_NETWORKS;
  const list = raw?.split(',').map((entry) => entry.trim()).filter(Boolean) ?? DEFAULT_NETWORKS;
  const configs: Array<{ network: Network; label: string; nativeSymbol: string }> = [];

  const NETWORK_LABELS: Record<string, { label: string; nativeSymbol: string }> = {
    ETH_MAINNET: { label: 'Ethereum Mainnet', nativeSymbol: 'ETH' },
    WORLDCHAIN_MAINNET: { label: 'World Chain', nativeSymbol: 'ETH' },
    WORLDCHAIN_SEPOLIA: { label: 'World Chain Sepolia', nativeSymbol: 'ETH' },
    MATIC_MAINNET: { label: 'Polygon', nativeSymbol: 'MATIC' },
    ARB_MAINNET: { label: 'Arbitrum One', nativeSymbol: 'ETH' },
    OPT_MAINNET: { label: 'Optimism', nativeSymbol: 'ETH' },
    BASE_MAINNET: { label: 'Base', nativeSymbol: 'ETH' },
  };

  for (const value of list) {
    const keyCandidate = value.toUpperCase().replace(/[-\s]/g, '_');
    const network = (Network as Record<string, Network>)[keyCandidate] as Network | undefined;
    if (!network) continue;

    const mapping = NETWORK_LABELS[keyCandidate] ?? { label: network, nativeSymbol: 'ETH' };
    configs.push({ network, label: mapping.label, nativeSymbol: mapping.nativeSymbol });
  }

  return configs.sort((a, b) => (NETWORK_PRIORITY[a.network] || 999) - (NETWORK_PRIORITY[b.network] || 999));
}

async function getGlobalPrice(symbol: string, alchemy: Alchemy): Promise<number | undefined> {
  try {
    const symbolPrices = await alchemy.prices.getTokenPriceBySymbol([symbol]);
    const priceEntry = symbolPrices?.data?.[0]?.prices?.[0];
    if (priceEntry?.value) return Number(priceEntry.value);
  } catch {}
  return undefined;
}

export function HealthScore() {
  const { data } = useSession();
  const params = useSearchParams();
  const queryAddress = params.get('address');
  const walletAddress = (queryAddress && ADDRESS_REGEX.test(queryAddress) ? queryAddress : undefined) || (data?.user?.walletAddress as `0x${string}` | undefined);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokens, setTokens] = useState<SimpleToken[]>([]);

  const alchemyNetworks = useMemo(parseNetworks, []);

  useEffect(() => {
    const run = async () => {
      if (!walletAddress) return;
      const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
      if (!apiKey) {
        setError('Missing NEXT_PUBLIC_ALCHEMY_API_KEY.');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const instances = alchemyNetworks.map(cfg => ({ cfg, alchemy: new Alchemy({ apiKey, network: cfg.network }) }));
        const globalEth = await getGlobalPrice('ETH', instances[0].alchemy);

        const perNetwork = await Promise.all(instances.map(async ({ cfg, alchemy }) => {
          try {
            const [nativeBal, tokenRes] = await Promise.all([
              alchemy.core.getBalance(walletAddress),
              alchemy.core.getTokenBalances(walletAddress)
            ]);

            const result: SimpleToken[] = [];
            // native
            const nativeBalBigInt = BigInt(nativeBal.toString());
            if (nativeBalBigInt > BigInt(0)) {
              const amount = Number(formatUnits(nativeBalBigInt, 18));
              result.push({
                address: 'native',
                symbol: cfg.nativeSymbol,
                name: `${cfg.label} Native`,
                decimals: 18,
                amount,
                usd: globalEth ? amount * globalEth : undefined,
                network: cfg.label,
              });
            }

            const withBalance = tokenRes.tokenBalances.filter(tb => {
              try { return BigInt(tb.tokenBalance ?? '0') !== BigInt(0); } catch { return false; }
            }).slice(0, 60);

            // fetch metadata sequentially in small batches to keep it light
            const metaBatchSize = 10;
            for (let i = 0; i < withBalance.length; i += metaBatchSize) {
              const slice = withBalance.slice(i, i + metaBatchSize);
              const metas = await Promise.all(
                slice.map(async (tb) => {
                  try {
                    const md = await alchemy.core.getTokenMetadata(tb.contractAddress as `0x${string}`);
                    const decimals = md?.decimals ?? 18;
                    const amount = Number(formatUnits(BigInt(tb.tokenBalance ?? '0'), Number(decimals)));
                    return {
                      address: tb.contractAddress,
                      symbol: md?.symbol || 'UNKNOWN',
                      name: md?.name || 'Unknown Token',
                      decimals: Number(decimals),
                      amount,
                      network: cfg.label,
                    } as SimpleToken;
                  } catch {
                    return null;
                  }
                })
              );
              metas.filter(Boolean).forEach(m => result.push(m as SimpleToken));
            }

            // price top N tokens by amount to keep requests small
            const top = [...result]
              .filter(t => t.address !== 'native')
              .sort((a, b) => b.amount - a.amount)
              .slice(0, 20);
            const requests: TokenAddressRequest[] = top.map(t => ({ network: cfg.network, address: t.address }));
            if (requests.length > 0) {
              try {
                const priceResp = await alchemy.prices.getTokenPriceByAddress(requests);
                priceResp?.data?.forEach((row) => {
                  const token = result.find(t => t.address.toLowerCase() === row.address.toLowerCase());
                  const valueStr = row.prices?.[0]?.value;
                  if (token && valueStr) {
                    const price = Number(valueStr);
                    token.usd = price * token.amount;
                  }
                });
              } catch {}
            }

            return result;
          } catch {
            return [] as SimpleToken[];
          }
        }));

        setTokens(perNetwork.flat());
      } catch {
        setError('Failed to analyze portfolio');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [walletAddress, alchemyNetworks]);

  // Compute available tokens for suggested actions
  const availableWld = useMemo(() => {
    if (!tokens) return 0;
    return tokens
      .filter((t) => (t.symbol || '').toUpperCase() === 'WLD')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
  }, [tokens]);

  const availableUsdc = useMemo(() => {
    if (!tokens) return 0;
    return tokens
      .filter((t) => (t.symbol || '').toUpperCase() === 'USDC')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
  }, [tokens]);

  const openPoolTogether = useCallback(() => {
    const appId = 'app_85f4c411dc00aadabc96cce7b3a77219';
    const url = `https://world.org/mini-app?app_id=${encodeURIComponent(appId)}`;
    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  }, []);

  const openUno = useCallback(() => {
    const appId = 'app_a4f7f3e62c1de0b9490a5260cb390b56';
    const url = `https://world.org/mini-app?app_id=${encodeURIComponent(appId)}`;
    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  }, []);

  const openAddMoney = useCallback(() => {
    const appId = 'app_e7d27c5ce2234e00558776f227f791ef';
    const url = `https://world.org/mini-app?app_id=${encodeURIComponent(appId)}`;
    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Suggested Actions Header */}
      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-zinc-900 dark:to-zinc-900">
        <div className="flex items-center gap-3">
          <span className="inline-block w-2 h-2 rounded-full bg-blue-600" />
          <h2 className="text-base font-semibold">Suggested Actions</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Optimize your portfolio with these recommended actions
        </p>
      </section>

      {!walletAddress && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Connect a wallet on the Tracker tab to see suggestions.</p>
      )}
      {loading && <p className="text-sm text-zinc-600 dark:text-zinc-400">Analyzing portfolio…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {tokens && tokens.length > 0 && (
        <>
          {/* PoolTogether WLD Deposit */}
          {availableWld > 0 && (
            <section className="rounded-2xl border-2 border-purple-300 p-5 bg-gradient-to-r from-purple-50 to-purple-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center">
                  <span className="text-purple-700 font-bold">🎯</span>
                </div>
                <h3 className="text-lg font-semibold text-purple-800">PoolTogether Deposit</h3>
              </div>
              <p className="text-sm text-purple-700 mb-4">
                You have <span className="font-bold">{availableWld.toLocaleString(undefined, { maximumFractionDigits: 4 })} WLD</span> which can be deposited to PoolTogether to potentially save and win prizes!
              </p>
              <button
                type="button"
                onClick={openPoolTogether}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-purple-600 text-white px-4 py-3 text-sm font-semibold shadow-sm hover:bg-purple-700 transition-all duration-200 transform hover:scale-105"
              >
                🎯 Deposit WLD in PoolTogether
              </button>
            </section>
          )}

          {/* UNO USDC to WLD Conversion */}
          {availableUsdc > 0 && (
            <section className="rounded-2xl border-2 border-blue-300 p-5 bg-gradient-to-r from-blue-50 to-blue-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center">
                  <span className="text-blue-700 font-bold">💱</span>
                </div>
                <h3 className="text-lg font-semibold text-blue-800">Convert USDC to WLD</h3>
              </div>
              <p className="text-sm text-blue-700 mb-4">
                You have <span className="font-bold">{availableUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC</span> which can be converted to WLD to use in apps using UNO!
              </p>
              <button
                type="button"
                onClick={openUno}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 text-white px-4 py-3 text-sm font-semibold shadow-sm hover:bg-blue-700 transition-all duration-200 transform hover:scale-105"
              >
                💱 Swap with UNO
              </button>
            </section>
          )}

          {/* Add Money */}
          <section className="rounded-2xl border-2 border-green-300 p-5 bg-gradient-to-r from-green-50 to-green-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-green-200 flex items-center justify-center">
                <span className="text-green-700 font-bold">💰</span>
              </div>
              <h3 className="text-lg font-semibold text-green-800">Add More WLD</h3>
            </div>
            <p className="text-sm text-green-700 mb-4">
              Add more money to your WLD wallet using Add Money to fund your World App wallet directly from exchanges!
            </p>
            <button
              type="button"
              onClick={openAddMoney}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 text-white px-4 py-3 text-sm font-semibold shadow-sm hover:bg-green-700 transition-all duration-200 transform hover:scale-105"
            >
              💰 Add Money to Wallet
            </button>
          </section>
        </>
      )}
    </div>
  );
}



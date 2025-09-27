'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
  const [copied, setCopied] = useState(false);

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

  const summary = useMemo(() => {
    if (!tokens || tokens.length === 0) return null;
    const withUsd = tokens.map(t => ({ ...t, usd: t.usd ?? 0 }));
    const totalUsd = withUsd.reduce((s, t) => s + (t.usd ?? 0), 0);

    // group by symbol
    const bySymbol = new Map<string, number>();
    for (const t of withUsd) {
      bySymbol.set(t.symbol, (bySymbol.get(t.symbol) ?? 0) + (t.usd ?? 0));
    }
    const symbolTotals = [...bySymbol.entries()].sort((a, b) => b[1] - a[1]);
    const topSymbol = symbolTotals[0];
    const topShare = totalUsd > 0 ? (topSymbol?.[1] ?? 0) / totalUsd : 0;

    const STABLES = new Set(['USDC', 'USDT', 'DAI', 'USDC.E', 'USDCe']);
    const stableUsd = withUsd.filter(t => STABLES.has(t.symbol.toUpperCase())).reduce((s, t) => s + (t.usd ?? 0), 0);
    const stableShare = totalUsd > 0 ? stableUsd / totalUsd : 0;

    // chain distribution
    const byChain = new Map<string, number>();
    for (const t of withUsd) {
      byChain.set(t.network, (byChain.get(t.network) ?? 0) + (t.usd ?? 0));
    }
    const chains = [...byChain.entries()].sort((a, b) => b[1] - a[1]);

    // scoring
    let score = 90;
    if (topShare > 0.6) score -= 20; else if (topShare > 0.4) score -= 10;
    if (stableShare < 0.1) score -= 10; else if (stableShare > 0.8) score -= 5;
    if (chains.length < 2) score -= 5;
    if (totalUsd < 10) score = Math.min(score, 70); // low portfolio size confidence
    score = Math.max(0, Math.min(100, score));

    const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'E';
    return { score, grade, totalUsd, topSymbol, topShare, stableShare, chains };
  }, [tokens]);

  const shorten = (addr: string, n = 4) => {
    if (!addr) return '';
    return `${addr.slice(0, n + 2)}…${addr.slice(-n)}`;
  };

  const onCopy = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="space-y-4">
      {/* Hero Score Card */}
      <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 p-5 bg-gradient-to-r from-emerald-50 to-green-50 dark:from-zinc-900 dark:to-zinc-900">
        <div className="flex items-center gap-3">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-600" />
          <h2 className="text-base font-semibold">Portfolio Health</h2>
        </div>
        {summary ? (
          <div className="mt-3 flex items-center gap-4">
            <div className={`w-16 h-16 rounded-full text-white flex items-center justify-center text-2xl font-bold ${summary.score >= 90 ? 'bg-green-600' : summary.score >= 80 ? 'bg-emerald-600' : summary.score >= 70 ? 'bg-yellow-600' : summary.score >= 60 ? 'bg-orange-600' : 'bg-red-600'}`}>
              {summary.grade}
            </div>
            <div>
              <div className="text-2xl font-extrabold text-zinc-900 dark:text-zinc-50">{summary.score}/100</div>
              <div className="text-xs text-zinc-600 dark:text-zinc-400">Simple heuristic score for quick guidance</div>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Connect a wallet or enter an address to analyze.</p>
        )}

        {/* Address row */}
        <div className="mt-4 flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              {/* wallet icon substitute */}
              <span className="text-xs font-bold">0x</span>
            </div>
            <div className="min-w-0">
              <div className="text-xs text-zinc-500">Analyzing address</div>
              <div className="text-sm font-mono text-zinc-800 dark:text-zinc-100 truncate max-w-[200px]">
                {walletAddress ? shorten(walletAddress) : '—'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCopy}
              className="text-xs px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900"
              disabled={!walletAddress}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <Link
              href={walletAddress ? `/home?address=${walletAddress}` : '/home'}
              className="text-xs px-2 py-1 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
            >
              Edit
            </Link>
          </div>
        </div>
      </section>

      {!walletAddress && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Connect a wallet on the Tracker tab to analyze.</p>
      )}
      {loading && <p className="text-sm text-zinc-600 dark:text-zinc-400">Analyzing…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {summary && (
        <>
          {/* Metrics grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-gradient-to-br from-emerald-50 to-green-50 dark:bg-zinc-950">
              <div className="text-xs text-zinc-500">Top concentration</div>
              <div className="mt-1 text-lg font-bold">{Math.round(summary.topShare * 100)}% {summary.topSymbol?.[0] ? `(${summary.topSymbol[0]})` : ''}</div>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-gradient-to-br from-emerald-50 to-green-50 dark:bg-zinc-950">
              <div className="text-xs text-zinc-500">Stable allocation</div>
              <div className="mt-1 text-lg font-bold">{Math.round(summary.stableShare * 100)}%</div>
            </div>
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-gradient-to-br from-emerald-50 to-green-50 dark:bg-zinc-950">
              <div className="text-xs text-zinc-500">Chains used</div>
              <div className="mt-1 text-lg font-bold">{summary.chains.length}</div>
            </div>
          </div>

          {/* Suggestions */}
          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-gradient-to-br from-emerald-50 to-green-50 dark:bg-zinc-950">
            <h3 className="text-sm font-semibold mb-1 text-emerald-800">Suggestions</h3>
            <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
              {summary.topShare > 0.5 && <li>Reduce reliance on your top asset by swapping a portion into stables.</li>}
              {summary.stableShare < 0.15 && <li>Increase stablecoin buffer for volatility protection (10–30%).</li>}
              {summary.chains.length < 2 && <li>Diversify across an L2 (e.g., Base or Arbitrum) to cut gas and risk.</li>}
              {summary.topShare <= 0.5 && summary.stableShare >= 0.15 && summary.chains.length >= 2 && (
                <li>Looking solid. Consider putting idle stables to work for yield.</li>
              )}
            </ul>
          </section>

          {/* Explainer */}
          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-gradient-to-br from-emerald-50 to-green-50 dark:bg-zinc-950">
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-emerald-800">How it&apos;s calculated</summary>
              <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-400 space-y-1">
                <p>We compute a score out of 100 based on:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><span className="font-medium">Top asset concentration</span>: higher than 60% lowers the score (−20), above 40% (−10).</li>
                  <li><span className="font-medium">Stablecoin allocation</span>: less than 10% lowers the score (−10); above 80% lowers slightly (−5) for growth potential.</li>
                  <li><span className="font-medium">Chain diversification</span>: using only one chain reduces score (−5).</li>
                  <li><span className="font-medium">Portfolio size heuristic</span>: very small portfolios cap the score at 70.</li>
                </ul>
                <p>This is a simple heuristic meant for quick guidance, not financial advice.</p>
              </div>
            </details>
          </section>
        </>
      )}
    </div>
  );
}



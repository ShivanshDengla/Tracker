'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { formatUnits } from 'viem';
import { Alchemy, Network } from 'alchemy-sdk';

type PortfolioToken = {
  symbol: string;
  name: string;
  amount: string; // formatted human-readable
  usdValue?: string; // formatted USD if price available
  network: string;
};

type NetworkConfig = {
  network: Network;
  label: string;
  nativeSymbol: string;
};

const DEFAULT_NETWORKS = ['ETH_MAINNET', 'WORLDCHAIN_MAINNET', 'ARB_MAINNET', 'BASE_MAINNET', 'OPT_MAINNET'];

const NETWORK_LABELS: Record<string, { label: string; nativeSymbol: string }> = {
  ETH_MAINNET: { label: 'Ethereum Mainnet', nativeSymbol: 'ETH' },
  WORLDCHAIN_MAINNET: { label: 'World Chain', nativeSymbol: 'ETH' },
  WORLDCHAIN_SEPOLIA: { label: 'World Chain Sepolia', nativeSymbol: 'ETH' },
  MATIC_MAINNET: { label: 'Polygon', nativeSymbol: 'MATIC' },
  ARB_MAINNET: { label: 'Arbitrum One', nativeSymbol: 'ETH' },
  OPT_MAINNET: { label: 'Optimism', nativeSymbol: 'ETH' },
  BASE_MAINNET: { label: 'Base', nativeSymbol: 'ETH' },
};

function parseNetworks(): NetworkConfig[] {
  const raw = process.env.NEXT_PUBLIC_ALCHEMY_NETWORKS;
  const list = raw?.split(',').map((entry) => entry.trim()).filter(Boolean) ?? DEFAULT_NETWORKS;

  const configs: NetworkConfig[] = [];

  for (const value of list) {
    const normalized = value.trim();
    if (!normalized) continue;

    const keyCandidate = normalized.toUpperCase().replace(/[-\s]/g, '_');
    let network: Network | undefined = (Network as Record<string, Network>)[keyCandidate];

    if (!network) {
      const lower = normalized.toLowerCase();
      const match = (Object.values(Network) as string[]).find((n) => n === lower);
      if (match) {
        network = match as Network;
      }
    }

    if (!network) {
      console.warn(`Unsupported Alchemy network: ${normalized}. Skipping.`);
      continue;
    }

    const metadataKey = network.toUpperCase().replace(/[-\s]/g, '_');
    const mapping =
      NETWORK_LABELS[metadataKey] ?? NETWORK_LABELS[keyCandidate] ?? {
        label: network,
        nativeSymbol: 'ETH',
      };

    configs.push({
      network,
      label: mapping.label,
      nativeSymbol: mapping.nativeSymbol,
    });
  }

  return configs;
}

async function getWldUsdPrice(): Promise<number | undefined> {
  try {
    const res = await fetch(
      'https://app-backend.worldcoin.dev/public/v1/miniapps/prices?cryptoCurrencies=WLD&fiatCurrencies=USD',
    );
    const json = await res.json();
    const amount = json?.result?.prices?.WLD?.USD?.amount;
    const decimals = json?.result?.prices?.WLD?.USD?.decimals;
    if (amount && typeof decimals === 'number') {
      return Number(amount) * 10 ** -decimals;
    }
  } catch (e) {
    console.warn('Failed to fetch WLD price', e);
  }
  return undefined;
}

export const TokenList = () => {
  const session = useSession();
  const [tokens, setTokens] = useState<PortfolioToken[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const walletAddress = session?.data?.user?.walletAddress as `0x${string}` | undefined;

  const alchemyNetworks = useMemo(parseNetworks, []);

  useEffect(() => {
    const run = async () => {
      if (!walletAddress) return;
        const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
        if (!apiKey) {
          setError('Missing NEXT_PUBLIC_ALCHEMY_API_KEY. Add it to your environment.');
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const results: PortfolioToken[] = [];

        const wldPrice = await getWldUsdPrice();

        for (const config of alchemyNetworks) {
          const alchemy = new Alchemy({
            apiKey,
            network: config.network,
          });

          // Native balance per network
          try {
            const native = await alchemy.core.getBalance(walletAddress);
            const nativeAmount = Number(
              formatUnits(BigInt(native.toString()), 18),
            );
            results.push({
              symbol: config.nativeSymbol,
              name: `${config.label} Native`,
              amount: nativeAmount.toLocaleString(undefined, {
                maximumFractionDigits: 6,
              }),
              network: config.label,
            });
          } catch (nativeError) {
            console.warn(`Failed to fetch native balance for ${config.label}`, nativeError);
          }

          // ERC-20 balances per network
          try {
            const response = await alchemy.core.getTokenBalances(walletAddress);
            const tokensWithBalance = response.tokenBalances.filter((balance) => {
              try {
                return BigInt(balance.tokenBalance ?? '0') !== BigInt(0);
              } catch (err) {
                console.warn('Failed to parse token balance', err);
                return false;
              }
            });

            const metadataPromises = tokensWithBalance.map((token) =>
              alchemy.core.getTokenMetadata(token.contractAddress).then((metadata) => ({
                metadata,
                token,
              })),
            );

            const metadataResults = await Promise.allSettled(metadataPromises);

            for (const result of metadataResults) {
              if (result.status !== 'fulfilled') {
                console.warn('Failed to fetch token metadata', result.reason);
                continue;
              }

              const { metadata, token } = result.value;
              const decimals = metadata?.decimals ?? 18;

              try {
                const raw = token.tokenBalance ?? '0';
                const amount = Number(formatUnits(BigInt(raw), Number(decimals)));
                let usdValue: string | undefined;

                if (metadata?.symbol === 'WLD' && wldPrice !== undefined) {
                  usdValue = `$${(amount * wldPrice).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}`;
                }

                results.push({
                  symbol: metadata?.symbol || 'UNKNOWN',
                  name: metadata?.name || 'Unknown Token',
                  amount: amount.toLocaleString(undefined, {
                    maximumFractionDigits: 6,
                  }),
                  usdValue,
                  network: config.label,
                });
              } catch (err) {
                console.warn('Failed to process token balance', err);
              }
            }
          } catch (tokenError) {
            console.warn(`Failed to fetch token balances via Alchemy for ${config.label}`, tokenError);
          }
        }

        setTokens(results);
      } catch (e) {
        console.error(e);
        setError('Failed to load balances');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [walletAddress, alchemyNetworks]);

  const totalValue = useMemo(() => {
    if (!tokens) return 0;
    return tokens.reduce((sum, t) => {
      const v = t.usdValue ? Number(t.usdValue.replace(/[$,]/g, '')) : 0;
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  }, [tokens]);

  return (
    <div className="w-full space-y-4">
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 text-white">
        <h2 className="text-lg font-semibold mb-2">Portfolio Value</h2>
        <p className="text-3xl font-bold">${totalValue.toLocaleString()}</p>
        <p className="text-sm opacity-90 mt-1">
          Connected to: {walletAddress || 'Unknown Wallet'}
        </p>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">Your Tokens</h3>
        {!walletAddress && (
          <p className="text-sm text-gray-500">Connect your wallet to view balances.</p>
        )}
        {loading && <p className="text-sm text-gray-500">Loading balances…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && walletAddress && tokens?.length === 0 && (
          <p className="text-sm text-gray-500">No balances found.</p>
        )}
        {tokens?.map((token, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-4 bg-white border-2 border-gray-100 rounded-xl hover:border-gray-200 transition-colors"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                {token.symbol.charAt(0)}
              </div>
              <div>
                <p className="font-semibold text-gray-800">{token.symbol}</p>
                <p className="text-sm text-gray-500">{token.name}</p>
                <p className="text-xs text-gray-400">{token.network}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold text-gray-800">{token.amount}</p>
              {token.usdValue && (
                <p className="text-sm text-gray-500">{token.usdValue}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

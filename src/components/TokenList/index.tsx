'use client';
import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { formatUnits } from 'viem';
import { Alchemy, Network, type TokenAddressRequest } from 'alchemy-sdk';

type PortfolioToken = {
  symbol: string;
  name: string;
  amount: string; // formatted human-readable
  usdValue?: string; // formatted USD if price available
  network: string;
  usdValueNumber?: number;
  logo?: string | null;
};

type NetworkConfig = {
  network: Network;
  label: string;
  nativeSymbol: string;
};

const DEFAULT_NETWORKS = ['ETH_MAINNET', 'WORLDCHAIN_MAINNET', 'ARB_MAINNET', 'BASE_MAINNET', 'OPT_MAINNET'];

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

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
  const params = useSearchParams();
  const queryAddress = params.get('address');
  const walletAddress =
    (queryAddress && ADDRESS_REGEX.test(queryAddress) ? queryAddress : undefined) ||
    (session?.data?.user?.walletAddress as `0x${string}` | undefined);
  const [tokens, setTokens] = useState<PortfolioToken[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

          let nativePrice: number | undefined;
          try {
            const symbolPrices = await alchemy.prices.getTokenPriceBySymbol([
              config.nativeSymbol,
            ]);
            const nativePriceEntry = symbolPrices?.data?.[0]?.prices?.[0];
            if (nativePriceEntry?.value) {
              nativePrice = Number(nativePriceEntry.value);
            }
          } catch (priceError) {
            console.warn(`Failed to fetch native price for ${config.label}`, priceError);
          }

          try {
            const native = await alchemy.core.getBalance(walletAddress);
            const nativeRaw = BigInt(native.toString());
            if (nativeRaw > BigInt(0)) {
              const nativeAmount = Number(formatUnits(nativeRaw, 18));
              const nativeUsd =
                nativePrice !== undefined ? nativeAmount * nativePrice : undefined;
              results.push({
                symbol: config.nativeSymbol,
                name: `${config.label} Native`,
                amount: nativeAmount.toLocaleString(undefined, {
                  maximumFractionDigits: 6,
                }),
                network: config.label,
                usdValue:
                  nativeUsd !== undefined
                    ? `$${nativeUsd.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}`
                    : undefined,
                usdValueNumber: nativeUsd,
              });
            }
          } catch (nativeError) {
            console.warn(`Failed to fetch native balance for ${config.label}`, nativeError);
          }

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

            if (tokensWithBalance.length === 0) {
              continue;
            }

            const metadataPromises = tokensWithBalance.map((token) =>
              alchemy.core.getTokenMetadata(token.contractAddress).then((metadata) => ({
                metadata,
                token,
              })),
            );

            const metadataResults = await Promise.allSettled(metadataPromises);

            const tokenEntries = metadataResults
              .filter(
                (result): result is PromiseFulfilledResult<{
                  metadata: Awaited<ReturnType<typeof alchemy.core.getTokenMetadata>>;
                  token: (typeof tokensWithBalance)[number];
                }> => result.status === 'fulfilled',
              )
              .map((result) => result.value)
              .map(({ metadata, token }) => {
                const decimals = metadata?.decimals ?? 18;
                const raw = token.tokenBalance ?? '0';
                const amountNumber = Number(
                  formatUnits(BigInt(raw), Number(decimals)),
                );
                return {
                  contractAddress: token.contractAddress,
                  amountNumber,
                  decimals,
                  symbol: metadata?.symbol || 'UNKNOWN',
                  name: metadata?.name || 'Unknown Token',
                  logo: metadata?.logo || null,
                };
              })
              .filter((entry) => entry.amountNumber > 0);

            if (tokenEntries.length === 0) {
              continue;
            }

            const priceRequests: TokenAddressRequest[] = tokenEntries.map((entry) => ({
              network: config.network,
              address: entry.contractAddress,
            }));

            const priceMap = new Map<string, number>();
            try {
              const priceResponse = await alchemy.prices.getTokenPriceByAddress(
                priceRequests,
              );
              priceResponse?.data?.forEach((item) => {
                const priceValue = item.prices?.[0]?.value;
                if (priceValue) {
                  priceMap.set(item.address.toLowerCase(), Number(priceValue));
                }
              });
            } catch (priceError) {
              console.warn(
                `Failed to fetch token prices for ${config.label}`,
                priceError,
              );
            }

            tokenEntries.forEach((entry) => {
              const priceFromMap = priceMap.get(entry.contractAddress.toLowerCase());
              const price =
                priceFromMap !== undefined
                  ? priceFromMap
                  : entry.symbol === 'WLD' && wldPrice !== undefined
                    ? wldPrice
                    : undefined;
              const usdValueNumber =
                price !== undefined ? entry.amountNumber * price : undefined;
              results.push({
                symbol: entry.symbol,
                name: entry.name,
                amount: entry.amountNumber.toLocaleString(undefined, {
                  maximumFractionDigits: 6,
                }),
                usdValue:
                  usdValueNumber !== undefined
                    ? `$${usdValueNumber.toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}`
                    : undefined,
                usdValueNumber,
                network: config.label,
                logo: entry.logo,
              });
            });
          } catch (tokenError) {
            console.warn(
              `Failed to fetch token balances via Alchemy for ${config.label}`,
              tokenError,
            );
          }
        }

        results.sort(
          (a, b) => (b.usdValueNumber ?? 0) - (a.usdValueNumber ?? 0),
        );
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
    return tokens.reduce((sum, t) => sum + (t.usdValueNumber ?? 0), 0);
  }, [tokens]);

  const formattedTotal = useMemo(
    () =>
      totalValue.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [totalValue],
  );

  return (
    <div className="w-full space-y-4">
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 text-white">
        <h2 className="text-lg font-semibold mb-2">Portfolio Value</h2>
        <p className="text-3xl font-bold">${formattedTotal}</p>
        <p className="text-sm opacity-90 mt-1">
          Viewing:{' '}
          {queryAddress && ADDRESS_REGEX.test(queryAddress)
            ? queryAddress
            : walletAddress || 'Unknown Wallet'}
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
              {token.logo ? (
                <Image
                  src={token.logo}
                  alt={`${token.symbol} logo`}
                  width={40}
                  height={40}
                  className="rounded-full object-cover border border-gray-200"
                />
              ) : (
                <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                  {token.symbol.charAt(0)}
                </div>
              )}
              <div>
                <p className="font-semibold text-gray-800">{token.symbol}</p>
                <p className="text-sm text-gray-500">{token.name}</p>
                <p className="text-xs text-gray-400">{token.network}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold text-gray-800">{token.amount}</p>
              <p className="text-sm text-gray-500">
                {token.usdValue ?? '—'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

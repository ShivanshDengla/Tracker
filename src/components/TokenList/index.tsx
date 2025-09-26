'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

// Cache TTL constants
const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const METADATA_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Network priority for faster networks first
const NETWORK_PRIORITY: Record<string, number> = {
  'ETH_MAINNET': 1,
  'WORLDCHAIN_MAINNET': 2,
  'BASE_MAINNET': 3,
  'ARB_MAINNET': 4,
  'OPT_MAINNET': 5,
};

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

const shortenAddress = (address: string, visibleChars = 4) => {
  if (!address || address.length <= visibleChars * 2 + 2) return address;
  return `${address.slice(0, visibleChars + 2)}…${address.slice(-visibleChars)}`;
};

type TokenMetadataCache = {
  symbol: string;
  name: string;
  decimals: number;
  logo: string | null;
  timestamp: number;
};

type PriceCacheEntry = {
  price: number;
  timestamp: number;
};

type TokenBalance = {
  contractAddress: string;
  tokenBalance: string | null;
};

type TokenBalancesResponse = {
  tokenBalances: TokenBalance[];
};

type NetworkResult = {
  config: NetworkConfig;
  nativeBalance: bigint;
  tokenBalances: TokenBalancesResponse;
  nativePrice?: number;
};

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

  // Sort by priority for faster networks first
  return configs.sort((a, b) => {
    const priorityA = NETWORK_PRIORITY[a.network] || 999;
    const priorityB = NETWORK_PRIORITY[b.network] || 999;
    return priorityA - priorityB;
  });
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
  const callCounter = useRef(0);
  
  // Enhanced caches with TTL
  const metadataCache = useRef<Map<string, TokenMetadataCache>>(new Map());
  const priceCache = useRef<Map<string, PriceCacheEntry>>(new Map());
  
  // Progressive loading state
  const [partialResults, setPartialResults] = useState<PortfolioToken[]>([]);
  const [processedNetworks, setProcessedNetworks] = useState<Set<string>>(new Set());

  const alchemyNetworks = useMemo(parseNetworks, []);
  
  // Check if this is the user's own address for optimization
  // const isOwnAddress = walletAddress === session?.data?.user?.walletAddress;

  // Helper functions for cache management
  const getCachedPrice = useCallback((key: string): number | null => {
    const cached = priceCache.current.get(key);
    if (cached && Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
      return cached.price;
    }
    return null;
  }, []);

  const setCachedPrice = useCallback((key: string, price: number) => {
    priceCache.current.set(key, { price, timestamp: Date.now() });
  }, []);

  const getCachedMetadata = useCallback((address: string): TokenMetadataCache | null => {
    const cached = metadataCache.current.get(address);
    if (cached && Date.now() - cached.timestamp < METADATA_CACHE_TTL) {
      return cached;
    }
    return null;
  }, []);

  const setCachedMetadata = useCallback((address: string, metadata: Omit<TokenMetadataCache, 'timestamp'>) => {
    metadataCache.current.set(address, { ...metadata, timestamp: Date.now() });
  }, []);

  // Global price fetcher with caching
  const getGlobalPrice = useCallback(async (symbol: string, alchemy: Alchemy): Promise<number | undefined> => {
    const cacheKey = `global-${symbol}`;
    const cached = getCachedPrice(cacheKey);
    if (cached !== null) {
      return cached;
    }

    try {
      callCounter.current += 1;
      console.log(`API call ${callCounter.current}: getTokenPriceBySymbol(${symbol}) - Global cache`);
      const symbolPrices = await alchemy.prices.getTokenPriceBySymbol([symbol]);
      const priceEntry = symbolPrices?.data?.[0]?.prices?.[0];
      if (priceEntry?.value) {
        const price = Number(priceEntry.value);
        setCachedPrice(cacheKey, price);
        return price;
      }
    } catch (error) {
      console.warn(`Failed to fetch global price for ${symbol}`, error);
    }
    return undefined;
  }, [getCachedPrice, setCachedPrice]);

  // Process a single network result
  const processNetworkResult = useCallback(async (
    result: NetworkResult,
    wldPrice: number | undefined,
    alchemy: Alchemy
  ): Promise<PortfolioToken[]> => {
    const { config, nativeBalance, tokenBalances, nativePrice } = result;
    const networkTokens: PortfolioToken[] = [];

    // Process native balance
    if (nativeBalance > BigInt(0)) {
      const nativeAmount = Number(formatUnits(nativeBalance, 18));
      const nativeUsd = nativePrice !== undefined ? nativeAmount * nativePrice : undefined;
      networkTokens.push({
        symbol: config.nativeSymbol,
        name: `${config.label} Native`,
        amount: nativeAmount.toLocaleString(undefined, {
          maximumFractionDigits: 6,
        }),
        network: config.label,
        usdValue: nativeUsd !== undefined
          ? `$${nativeUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
          : undefined,
        usdValueNumber: nativeUsd,
      });
    }

    // Process token balances
    const tokensWithBalance = tokenBalances.tokenBalances.filter((balance: TokenBalance) => {
      try {
        return BigInt(balance.tokenBalance ?? '0') !== BigInt(0);
      } catch (err) {
        console.warn('Failed to parse token balance', err);
        return false;
      }
    });

    if (tokensWithBalance.length === 0) {
      return networkTokens;
    }

    // Get metadata for tokens
    const metadataRequests = tokensWithBalance
      .map((token: TokenBalance) => token.contractAddress.toLowerCase())
      .filter((address: string) => !getCachedMetadata(address));

    if (metadataRequests.length > 0) {
      callCounter.current += metadataRequests.length;
      console.log(
        `API calls ${callCounter.current - metadataRequests.length + 1}-${callCounter.current}: getTokenMetadata(batch) for ${config.label}`
      );

      await Promise.all(
        metadataRequests.map(async (address: string) => {
          try {
            const metadata = await alchemy.core.getTokenMetadata(address as `0x${string}`);
            setCachedMetadata(address, {
              symbol: metadata?.symbol || 'UNKNOWN',
              name: metadata?.name || 'Unknown Token',
              decimals: metadata?.decimals ?? 18,
              logo: metadata?.logo || null,
            });
          } catch (err) {
            console.warn('Failed to fetch token metadata', err);
          }
        }),
      );
    }

    // Process token entries
    const tokenEntries = tokensWithBalance
      .map((token: TokenBalance) => {
        const cache = getCachedMetadata(token.contractAddress.toLowerCase());
        const decimals = cache?.decimals ?? 18;
        const raw = token.tokenBalance ?? '0';
        const amountNumber = Number(formatUnits(BigInt(raw), Number(decimals)));
        return {
          contractAddress: token.contractAddress,
          amountNumber,
          decimals,
          symbol: cache?.symbol || 'UNKNOWN',
          name: cache?.name || 'Unknown Token',
          logo: cache?.logo || null,
        };
      })
      .filter((entry) => entry.amountNumber > 0);

    if (tokenEntries.length === 0) {
      return networkTokens;
    }

    // Get prices for tokens
    const uncachedPriceRequests: TokenAddressRequest[] = tokenEntries
      .filter((entry) => !getCachedPrice(`${config.network}-${entry.contractAddress.toLowerCase()}`))
      .map((entry) => ({
        network: config.network,
        address: entry.contractAddress,
      }));

    if (uncachedPriceRequests.length > 0) {
      callCounter.current += 1;
      console.log(
        `API call ${callCounter.current}: getTokenPriceByAddress(${uncachedPriceRequests.length} tokens on ${config.label})`
      );
      try {
        const priceResponse = await alchemy.prices.getTokenPriceByAddress(uncachedPriceRequests);
        priceResponse?.data?.forEach((item) => {
          const priceValue = item.prices?.[0]?.value;
          if (priceValue) {
            setCachedPrice(`${config.network}-${item.address.toLowerCase()}`, Number(priceValue));
          }
        });
      } catch (priceError) {
        console.warn(`Failed to fetch token prices for ${config.label}`, priceError);
      }
    }

    // Add token entries to results
    tokenEntries.forEach((entry) => {
      const priceFromMap = getCachedPrice(`${config.network}-${entry.contractAddress.toLowerCase()}`);
      const price = priceFromMap !== null
        ? priceFromMap
        : entry.symbol === 'WLD' && wldPrice !== undefined
          ? wldPrice
          : undefined;
      const usdValueNumber = price !== undefined ? entry.amountNumber * price : undefined;
      
      networkTokens.push({
        symbol: entry.symbol,
        name: entry.name,
        amount: entry.amountNumber.toLocaleString(undefined, {
          maximumFractionDigits: 6,
        }),
        usdValue: usdValueNumber !== undefined
          ? `$${usdValueNumber.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
          : undefined,
        usdValueNumber,
        network: config.label,
        logo: entry.logo,
      });
    });

    return networkTokens;
  }, [getCachedMetadata, setCachedMetadata, getCachedPrice, setCachedPrice]);

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
      setPartialResults([]);
      setProcessedNetworks(new Set());
      
      try {
        const wldPrice = await getWldUsdPrice();

        // Create Alchemy instances for all networks
        const alchemyInstances = alchemyNetworks.map(config => ({
          config,
          alchemy: new Alchemy({ apiKey, network: config.network })
        }));

        // Get global ETH price once
        const globalEthPrice = await getGlobalPrice('ETH', alchemyInstances[0].alchemy);

        // Process all networks in parallel
        const networkPromises = alchemyInstances.map(async ({ config, alchemy }) => {
          try {
            // Parallel balance and token balance calls
            const [nativeBalance, tokenBalances] = await Promise.all([
              alchemy.core.getBalance(walletAddress),
              alchemy.core.getTokenBalances(walletAddress)
            ]);

            const result: NetworkResult = {
              config,
              nativeBalance: BigInt(nativeBalance.toString()),
              tokenBalances,
              nativePrice: globalEthPrice
            };

            // Process this network's results
            const networkTokens = await processNetworkResult(result, wldPrice, alchemy);
            
            // Update processed networks
            setProcessedNetworks(prev => new Set([...prev, config.network]));
            
            // Add to partial results for progressive loading
            setPartialResults(prev => [...prev, ...networkTokens]);
            
            return networkTokens;
          } catch (error) {
            console.warn(`Failed to fetch data for ${config.label}`, error);
            return [];
          }
        });

        // Wait for all networks to complete
        const allNetworkResults = await Promise.all(networkPromises);
        
        // Flatten and sort final results
        const finalResults = allNetworkResults.flat().sort(
          (a, b) => (b.usdValueNumber ?? 0) - (a.usdValueNumber ?? 0)
        );
        
        setTokens(finalResults);
      } catch (e) {
        console.error(e);
        setError('Failed to load balances');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [walletAddress, alchemyNetworks, getGlobalPrice, processNetworkResult]);

  const totalValue = useMemo(() => {
    const currentTokens = tokens || partialResults;
    if (!currentTokens) return 0;
    return currentTokens.reduce((sum, t) => sum + (t.usdValueNumber ?? 0), 0);
  }, [tokens, partialResults]);

  const formattedTotal = useMemo(
    () =>
      totalValue.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [totalValue],
  );

  // Show partial results while loading
  const displayTokens = tokens || partialResults;
  const isPartiallyLoaded = loading && partialResults.length > 0;

  return (
    <div className="w-full space-y-4">
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 text-white">
        <h2 className="text-lg font-semibold mb-2">Portfolio Value</h2>
        <p className="text-3xl font-bold">${formattedTotal}</p>
        <p className="text-sm opacity-90 mt-1">
          Viewing:{' '}
          {queryAddress && ADDRESS_REGEX.test(queryAddress)
            ? shortenAddress(queryAddress)
            : walletAddress
              ? shortenAddress(walletAddress)
              : 'Unknown Wallet'}
        </p>
        {isPartiallyLoaded && (
          <p className="text-xs opacity-75 mt-1">
            Loading... {processedNetworks.size}/{alchemyNetworks.length} networks processed
          </p>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">Your Tokens</h3>
        {!walletAddress && (
          <p className="text-sm text-gray-500">Connect your wallet to view balances.</p>
        )}
        {loading && <p className="text-sm text-gray-500">Loading balances…</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!loading && walletAddress && displayTokens?.length === 0 && (
          <p className="text-sm text-gray-500">No balances found.</p>
        )}
        {displayTokens?.map((token, index) => (
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

'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Alchemy, Network, type TokenAddressRequest } from 'alchemy-sdk';
import { formatUnits } from 'viem';

// Types
type SimpleToken = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  amount: number; // human units
  usd?: number;
  network: string; // label
};

type PortfolioToken = {
  symbol: string;
  name: string;
  amount: string; // formatted human-readable
  amountNumber: number; // raw amount for calculations
  usdValue?: string; // formatted USD if price available
  network: string;
  usdValueNumber?: number;
  logo?: string | null;
  price?: number;
  contractAddress?: string;
};

type NetworkConfig = {
  network: Network;
  label: string;
  nativeSymbol: string;
};

type TokenMetadataCache = {
  symbol: string;
  name: string;
  decimals: number;
  logo: string | null;
  timestamp: number;
};

type BalanceCache = {
  nativeBalance: bigint;
  tokenBalances: TokenBalancesResponse;
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


type PortfolioDataContextType = {
  tokens: SimpleToken[];
  portfolioTokens: PortfolioToken[];
  loading: boolean;
  error: string | null;
  totalValue: number;
  availableWld: number;
  availableUsdc: number;
  refetch: () => void;
};

// Constants
const DEFAULT_NETWORKS = ['ETH_MAINNET', 'WORLDCHAIN_MAINNET', 'ARB_MAINNET', 'BASE_MAINNET', 'OPT_MAINNET'];

const NETWORK_PRIORITY: Record<string, number> = {
  'ETH_MAINNET': 1,
  'WORLDCHAIN_MAINNET': 2,
  'BASE_MAINNET': 3,
  'ARB_MAINNET': 4,
  'OPT_MAINNET': 5,
};

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

// Cache TTL constants
const PRICE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const METADATA_CACHE_TTL = 60 * 60 * 1000; // 1 hour
const BALANCE_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

// Smart loading thresholds
const MIN_BALANCE_THRESHOLD = 0.000001;
const MAX_TOKENS_PER_NETWORK = 100;

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

  return configs.sort((a, b) => {
    const priorityA = NETWORK_PRIORITY[a.network] || 999;
    const priorityB = NETWORK_PRIORITY[b.network] || 999;
    return priorityA - priorityB;
  });
}

// Create context
const PortfolioDataContext = createContext<PortfolioDataContextType | undefined>(undefined);

// Provider component
export function PortfolioDataProvider({ children }: { children: React.ReactNode }) {
  const { data } = useSession();
  const params = useSearchParams();
  const queryAddress = params.get('address');
  const walletAddress = (queryAddress && ADDRESS_REGEX.test(queryAddress) ? queryAddress : undefined) || (data?.user?.walletAddress as `0x${string}` | undefined);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokens, setTokens] = useState<SimpleToken[]>([]);
  const [portfolioTokens, setPortfolioTokens] = useState<PortfolioToken[]>([]);
  
  // Caches
  const metadataCache = useRef<Map<string, TokenMetadataCache>>(new Map());
  const priceCache = useRef<Map<string, PriceCacheEntry>>(new Map());
  const balanceCache = useRef<Map<string, BalanceCache>>(new Map());
  
  const alchemyNetworks = useMemo(parseNetworks, []);
  
  // Reuse Alchemy instances to avoid recreating them
  const alchemyInstances = useMemo(() => {
    const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
    if (!apiKey) return [];
    return alchemyNetworks.map(cfg => ({ cfg, alchemy: new Alchemy({ apiKey, network: cfg.network }) }));
  }, [alchemyNetworks]);

  // Cache management functions
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

  const getCachedBalance = useCallback((cacheKey: string): BalanceCache | null => {
    const cached = balanceCache.current.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < BALANCE_CACHE_TTL) {
      return cached;
    }
    return null;
  }, []);

  const setCachedBalance = useCallback((cacheKey: string, nativeBalance: bigint, tokenBalances: TokenBalancesResponse) => {
    balanceCache.current.set(cacheKey, { nativeBalance, tokenBalances, timestamp: Date.now() });
  }, []);

  // Batch global price fetcher for multiple symbols
  const getGlobalPrices = useCallback(async (symbols: string[], alchemy: Alchemy): Promise<Map<string, number>> => {
    const results = new Map<string, number>();
    const uncachedSymbols: string[] = [];
    
    // Check cache first
    for (const symbol of symbols) {
      const cacheKey = `global-${symbol}`;
      const cached = getCachedPrice(cacheKey);
      if (cached !== null) {
        results.set(symbol, cached);
      } else {
        uncachedSymbols.push(symbol);
      }
    }
    
    // Fetch uncached symbols in batch
    if (uncachedSymbols.length > 0) {
      try {
        const symbolPrices = await alchemy.prices.getTokenPriceBySymbol(uncachedSymbols);
        symbolPrices?.data?.forEach((entry) => {
          const priceEntry = entry.prices?.[0];
          if (priceEntry?.value) {
            const price = Number(priceEntry.value);
            const symbol = entry.symbol;
            if (symbol) {
              results.set(symbol, price);
              setCachedPrice(`global-${symbol}`, price);
            }
          }
        });
      } catch (error) {
        console.warn(`Failed to fetch global prices for ${uncachedSymbols.join(', ')}`, error);
      }
    }
    
    return results;
  }, [getCachedPrice, setCachedPrice]);

  // Convert SimpleToken to PortfolioToken
  const convertToPortfolioToken = useCallback((token: SimpleToken): PortfolioToken => {
    return {
      symbol: token.symbol,
      name: token.name,
      amount: token.amount.toLocaleString(undefined, { maximumFractionDigits: 6 }),
      amountNumber: token.amount,
      usdValue: token.usd !== undefined ? `$${token.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : undefined,
      network: token.network,
      usdValueNumber: token.usd,
      logo: null, // Will be handled by TokenIcon component
      price: token.usd ? token.usd / token.amount : undefined,
      contractAddress: token.address,
    };
  }, []);

  // Main data fetching function
  const fetchPortfolioData = useCallback(async () => {
    if (!walletAddress) return;
    
    const apiKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;
    if (!apiKey) {
      setError('Missing NEXT_PUBLIC_ALCHEMY_API_KEY.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Pre-fetch common global prices in batch
      const commonSymbols = ['ETH', 'WLD', 'USDC', 'USDT', 'DAI', 'WETH', 'STETH', 'CBETH', 'AERO', 'POOL'];
      const globalPrices = await getGlobalPrices(commonSymbols, alchemyInstances[0]?.alchemy);
      const globalEth = globalPrices.get('ETH');

      const perNetwork = await Promise.all(alchemyInstances.map(async ({ cfg, alchemy }) => {
        try {
          const balanceCacheKey = `${walletAddress}-${cfg.network}`;
          let nativeBal: bigint;
          let tokenRes: TokenBalancesResponse;

          // Check balance cache first
          const cachedBalance = getCachedBalance(balanceCacheKey);
          if (cachedBalance) {
            nativeBal = cachedBalance.nativeBalance;
            tokenRes = cachedBalance.tokenBalances;
          } else {
            const [nativeBalResult, tokenResResult] = await Promise.all([
              alchemy.core.getBalance(walletAddress),
              alchemy.core.getTokenBalances(walletAddress)
            ]);

            nativeBal = BigInt(nativeBalResult.toString());
            tokenRes = tokenResResult;

            // Cache the balance data
            setCachedBalance(balanceCacheKey, nativeBal, tokenRes);
          }

          const result: SimpleToken[] = [];
          
          // Process native balance
          const nativeBalBigInt = BigInt(nativeBal.toString());
          if (nativeBalBigInt > BigInt(0)) {
            const amount = Number(formatUnits(nativeBalBigInt, 18));
            if (amount >= MIN_BALANCE_THRESHOLD) {
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
          }

          // Process token balances
          const withBalance = tokenRes.tokenBalances.filter(tb => {
            try { return BigInt(tb.tokenBalance ?? '0') !== BigInt(0); } catch { return false; }
          }).slice(0, MAX_TOKENS_PER_NETWORK);

          // Fetch metadata in batches
          const metaBatchSize = 10;
          for (let i = 0; i < withBalance.length; i += metaBatchSize) {
            const slice = withBalance.slice(i, i + metaBatchSize);
            const metas = await Promise.all(
              slice.map(async (tb) => {
                try {
                  const address = tb.contractAddress.toLowerCase();
                  let metadata = getCachedMetadata(address);
                  
                  if (!metadata) {
                    const md = await alchemy.core.getTokenMetadata(tb.contractAddress as `0x${string}`);
                    metadata = {
                      symbol: md?.symbol || 'UNKNOWN',
                      name: md?.name || 'Unknown Token',
                      decimals: md?.decimals ?? 18,
                      logo: md?.logo || null,
                      timestamp: Date.now(),
                    };
                    setCachedMetadata(address, metadata);
                  }

                  const decimals = metadata.decimals;
                  const amount = Number(formatUnits(BigInt(tb.tokenBalance ?? '0'), Number(decimals)));
                  
                  return {
                    address: tb.contractAddress,
                    symbol: metadata.symbol,
                    name: metadata.name,
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

          // Fetch prices for top tokens
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

          // Derive prices for PoolTogether tokens based on underlying assets using pre-fetched prices
          for (const token of result) {
            if (!token.usd && token.symbol) {
              const symbol = token.symbol.toUpperCase();
              let underlyingPrice: number | undefined;
              
              // Map PoolTogether tokens to their underlying assets using pre-fetched prices
              if (symbol.includes('PRZWLD') || symbol.includes('PWLD')) {
                underlyingPrice = globalPrices.get('WLD');
              } else if (symbol.includes('PRZPOOL') || symbol.includes('PPOOL')) {
                underlyingPrice = globalPrices.get('POOL');
              } else if (symbol.includes('PRZUSDC') || symbol.includes('PUSDC')) {
                underlyingPrice = globalPrices.get('USDC');
              } else if (symbol.includes('PRZWETH') || symbol.includes('PWETH')) {
                underlyingPrice = globalPrices.get('WETH');
              } else if (symbol.includes('PRZDAI') || symbol.includes('PDAI')) {
                underlyingPrice = globalPrices.get('DAI');
              } else if (symbol.includes('PRZUSDT')) {
                underlyingPrice = globalPrices.get('USDT');
              } else if (symbol.includes('PRZSTETH') || symbol.includes('PRZWSTETH')) {
                underlyingPrice = globalPrices.get('STETH');
              } else if (symbol.includes('PRZCBETH')) {
                underlyingPrice = globalPrices.get('CBETH');
              } else if (symbol.includes('PRZAERO')) {
                underlyingPrice = globalPrices.get('AERO');
              } else if (symbol.includes('PRZWXDAI')) {
                underlyingPrice = globalPrices.get('DAI'); // WXDAI is typically pegged to DAI
              } else if (symbol.includes('USDC')) {
                underlyingPrice = globalPrices.get('USDC');
              } else if (symbol.includes('WETH')) {
                underlyingPrice = globalPrices.get('WETH');
              } else if (symbol.includes('DAI')) {
                underlyingPrice = globalPrices.get('DAI');
              } else if (symbol.includes('USDT')) {
                underlyingPrice = globalPrices.get('USDT');
              } else if (symbol.includes('STETH')) {
                underlyingPrice = globalPrices.get('STETH');
              } else if (symbol.includes('CBETH')) {
                underlyingPrice = globalPrices.get('CBETH');
              } else if (symbol.includes('AERO')) {
                underlyingPrice = globalPrices.get('AERO');
              } else if (symbol.includes('POOL')) {
                underlyingPrice = globalPrices.get('POOL');
              } else if (symbol.includes('WLD')) {
                underlyingPrice = globalPrices.get('WLD');
              }
              
              if (underlyingPrice !== undefined) {
                token.usd = underlyingPrice * token.amount;
              }
            }
          }

          return result;
        } catch {
          return [] as SimpleToken[];
        }
      }));

      const allTokens = perNetwork.flat();
      setTokens(allTokens);
      setPortfolioTokens(allTokens.map(convertToPortfolioToken));
    } catch {
      setError('Failed to analyze portfolio');
    } finally {
      setLoading(false);
    }
  }, [walletAddress, alchemyInstances, getGlobalPrices, getCachedBalance, setCachedBalance, getCachedMetadata, setCachedMetadata, convertToPortfolioToken]);

  // Refetch function
  const refetch = useCallback(() => {
    fetchPortfolioData();
  }, [fetchPortfolioData]);

  // Effect to fetch data when wallet address changes
  useEffect(() => {
    fetchPortfolioData();
  }, [fetchPortfolioData]);

  // Computed values
  const totalValue = useMemo(() => {
    return tokens.reduce((sum, t) => sum + (t.usd ?? 0), 0);
  }, [tokens]);

  const availableWld = useMemo(() => {
    return tokens
      .filter((t) => (t.symbol || '').toUpperCase() === 'WLD')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
  }, [tokens]);

  const availableUsdc = useMemo(() => {
    return tokens
      .filter((t) => (t.symbol || '').toUpperCase() === 'USDC')
      .reduce((sum, t) => sum + (t.amount || 0), 0);
  }, [tokens]);

  const value: PortfolioDataContextType = {
    tokens,
    portfolioTokens,
    loading,
    error,
    totalValue,
    availableWld,
    availableUsdc,
    refetch,
  };

  return (
    <PortfolioDataContext.Provider value={value}>
      {children}
    </PortfolioDataContext.Provider>
  );
}

// Hook to use the context
export function usePortfolioData() {
  const context = useContext(PortfolioDataContext);
  if (context === undefined) {
    throw new Error('usePortfolioData must be used within a PortfolioDataProvider');
  }
  return context;
}

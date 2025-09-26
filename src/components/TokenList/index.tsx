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

const DEFAULT_NETWORKS = ['ETH_MAINNET', 'WORLDCHAIN_MAINNET', 'ARB_MAINNET', 'BASE_MAINNET', 'OPT_MAINNET'];

// Cache TTL constants - optimized for maximum efficiency
const PRICE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes (increased for better caching)
const METADATA_CACHE_TTL = 60 * 60 * 1000; // 1 hour (increased for better caching)
const BALANCE_CACHE_TTL = 2 * 60 * 1000; // 2 minutes (balances change frequently)

// Smart loading thresholds
const MIN_BALANCE_THRESHOLD = 0.000001; // Skip very small balances
const MAX_TOKENS_PER_NETWORK = 20; // Limit tokens per network for performance
const NETWORK_TIMEOUT = 5000; // 5 second timeout per network


// Network priority for faster networks first
const NETWORK_PRIORITY: Record<string, number> = {
  'ETH_MAINNET': 1,
  'WORLDCHAIN_MAINNET': 2,
  'BASE_MAINNET': 3,
  'ARB_MAINNET': 4,
  'OPT_MAINNET': 5,
};

// Network icons mapping - hide chain icons for now
const NETWORK_ICONS: Record<string, string> = {
  'ETH_MAINNET': '🔷',
  'WORLDCHAIN_MAINNET': '', // Hide world chain icon
  'BASE_MAINNET': '🔵',
  'ARB_MAINNET': '🔺',
  'OPT_MAINNET': '🔴',
};

// Network names mapping for better display
const NETWORK_NAMES: Record<string, string> = {
  'ETH_MAINNET': 'Ethereum',
  'WORLDCHAIN_MAINNET': 'World Chain',
  'BASE_MAINNET': 'Base',
  'ARB_MAINNET': 'Arbitrum',
  'OPT_MAINNET': 'Optimism',
};

// Value threshold for hiding tokens
const HIDE_TOKEN_THRESHOLD = 0.5;

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

// Token icon component with fallback system
const TokenIcon = ({ logo, symbol, size = 24, className = "" }: { 
  logo?: string | null; 
  symbol: string; 
  size?: number; 
  className?: string; 
}) => {
  const [imageError, setImageError] = useState(false);
  const [currentProvider, setCurrentProvider] = useState(0);
  
  // Fallback icon providers for tokens without Alchemy logos
  const fallbackProviders = [
    // Native token mappings first (these never have contract addresses)
    (symbol: string) => {
      const nativeMappings: Record<string, string> = {
        'ETH': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
        'MATIC': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/polygon/info/logo.png',
        'WLD': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x163f8C2467924be0ae7B5347228CABF260318753/logo.png', // Worldcoin on Ethereum
        'BNB': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/info/logo.png',
        'AVAX': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png',
        'FTM': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/fantom/info/logo.png',
        'ONE': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/harmony/info/logo.png',
        'CRO': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/cronos/info/logo.png',
      };
      return nativeMappings[symbol.toUpperCase()] || null;
    },
    // Try by symbol first
    (symbol: string) => `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${symbol}/logo.png`,
    (symbol: string) => `https://tokens.build/icon/${symbol}.png`,
    (symbol: string) => `https://tokens.1inch.io/${symbol}.png`,
    // Try with cleaned symbol (remove special chars)
    (symbol: string) => {
      const cleanSymbol = symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
      return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${cleanSymbol}/logo.png`;
    },
    // Try common token mappings
    (symbol: string) => {
      const mappings: Record<string, string> = {
        'WETH': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        'USDC': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86a33E6441b8c4C8C0d4B0cF4B4d4F4B4d4F4B/logo.png',
        'USDT': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
        'DAI': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png',
        'LINK': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png',
        'UNI': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png',
        'WBTC': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png',
        'AAVE': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9/logo.png',
        'MKR': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2/logo.png',
        'YFI': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x0bc529c00C6401aEF6D220BE8c6Ea1667F6Ad93e/logo.png',
        'COMP': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xc00e94Cb662C3520282E6f5717214004A7f26888/logo.png',
        'CRV': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xD533a949740bb3306d119CC777fa900bA034cd52/logo.png',
        'SNX': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F/logo.png',
        'SUSHI': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B3595068778DD592e39A122f4f5a5cF09C90fE2/logo.png',
        '1INCH': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x111111111117dC0aa78b770fA6A738034120C302/logo.png',
        'BAL': 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xba100000625a3754423978a60c9317c58a424e3D/logo.png',
      };
      return mappings[symbol.toUpperCase()] || null;
    },
  ];
  
  // Get icon URL - try Alchemy first, then fallback providers
  const iconUrl = useMemo(() => {
    if (logo) {
      console.log(`✅ TokenIcon: Using Alchemy logo for ${symbol}:`, logo);
      return logo;
    }
    
    // Try fallback providers
    if (currentProvider < fallbackProviders.length) {
      const fallbackUrl = fallbackProviders[currentProvider](symbol);
      if (fallbackUrl) {
        console.log(`🔄 TokenIcon: Trying fallback provider ${currentProvider + 1} for ${symbol}:`, fallbackUrl);
        return fallbackUrl;
      } else {
        console.log(`⏭️ TokenIcon: Skipping fallback provider ${currentProvider + 1} for ${symbol} (no URL)`);
        return null;
      }
    }
    
    return null;
  }, [logo, symbol, currentProvider]);
  
  const handleImageError = useCallback(() => {
    if (logo) {
      // Alchemy logo failed, try fallback providers
      console.log(`💥 TokenIcon: Alchemy logo failed for ${symbol}, trying fallback providers`);
      setImageError(false);
      setCurrentProvider(0);
    } else if (currentProvider < fallbackProviders.length - 1) {
      // Try next fallback provider
      console.log(`⚠️ TokenIcon: Fallback provider ${currentProvider + 1} failed for ${symbol}, trying next`);
      setCurrentProvider(prev => prev + 1);
      setImageError(false);
    } else {
      // All providers failed
      console.log(`💥 TokenIcon: All ${fallbackProviders.length} providers failed for ${symbol}, showing initial fallback`);
      setImageError(true);
    }
  }, [logo, symbol, currentProvider]);
  
  if (imageError || !iconUrl) {
    console.log(`🔤 TokenIcon: Rendering initial fallback for ${symbol} with "${symbol.charAt(0)}" - logo:`, logo, 'error:', imageError);
    return (
      <div 
        className={`bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {symbol.charAt(0)}
      </div>
    );
  }

  return (
    <Image
      src={iconUrl}
      alt={`${symbol} logo`}
      width={size}
      height={size}
      className={`rounded-full object-cover border border-gray-200 ${className}`}
      onError={handleImageError}
    />
  );
};

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
  const balanceCache = useRef<Map<string, BalanceCache>>(new Map());
  
  // Progressive loading state
  const [partialResults, setPartialResults] = useState<PortfolioToken[]>([]);
  const [processedNetworks, setProcessedNetworks] = useState<Set<string>>(new Set());
  const [showAllTokens, setShowAllTokens] = useState(false);

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


  // Balance cache management
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

  // Smart network processing with optimizations
  const processNetworkResult = useCallback(async (
    result: NetworkResult,
    wldPrice: number | undefined,
    alchemy: Alchemy
  ): Promise<PortfolioToken[]> => {
    const { config, nativeBalance, tokenBalances, nativePrice } = result;
    const networkTokens: PortfolioToken[] = [];

    // Process native balance with threshold check
    if (nativeBalance > BigInt(0)) {
      const nativeAmount = Number(formatUnits(nativeBalance, 18));
      
      // Skip very small balances to reduce processing
      if (nativeAmount >= MIN_BALANCE_THRESHOLD) {
        const nativeUsd = nativePrice !== undefined ? nativeAmount * nativePrice : undefined;
        // Native tokens don't have logos from Alchemy, use fallback
        const nativeIconUrl = null;
        
        networkTokens.push({
                symbol: config.nativeSymbol,
                name: `${config.label} Native`,
                amount: nativeAmount.toLocaleString(undefined, {
                  maximumFractionDigits: 6,
                }),
          amountNumber: nativeAmount,
                network: config.label,
          usdValue: nativeUsd !== undefined
            ? `$${nativeUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : undefined,
                usdValueNumber: nativeUsd,
          logo: nativeIconUrl,
          price: nativePrice,
          contractAddress: 'native',
        });
      }
    }

    // Process token balances with smart filtering
    const tokensWithBalance = tokenBalances.tokenBalances
      .filter((balance: TokenBalance) => {
              try {
                return BigInt(balance.tokenBalance ?? '0') !== BigInt(0);
              } catch (err) {
                console.warn('Failed to parse token balance', err);
                return false;
              }
      })
      .slice(0, MAX_TOKENS_PER_NETWORK); // Limit tokens per network for performance

            if (tokensWithBalance.length === 0) {
      return networkTokens;
            }

    // Batch metadata requests for efficiency
            const metadataRequests = tokensWithBalance
      .map((token: TokenBalance) => token.contractAddress.toLowerCase())
      .filter((address: string) => !getCachedMetadata(address));

            if (metadataRequests.length > 0) {
              callCounter.current += metadataRequests.length;
              console.log(
        `API calls ${callCounter.current - metadataRequests.length + 1}-${callCounter.current}: getTokenMetadata(batch) for ${config.label}`
      );

      // Batch metadata requests with timeout
      const metadataPromises = metadataRequests.map(async (address: string) => {
        try {
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), NETWORK_TIMEOUT)
          );
          
          const metadataPromise = alchemy.core.getTokenMetadata(address as `0x${string}`);
          const metadata = await Promise.race([metadataPromise, timeoutPromise]) as {
            symbol?: string;
            name?: string;
            decimals?: number;
            logo?: string | null;
          } | null;
          
          console.log(`📋 Raw metadata for ${address}:`, metadata);
          
          const processedMetadata = {
            symbol: metadata?.symbol || 'UNKNOWN',
            name: metadata?.name || 'Unknown Token',
            decimals: metadata?.decimals ?? 18,
            logo: metadata?.logo || null,
          };
          
          console.log(`✅ Processed metadata for ${address}:`, processedMetadata);
          setCachedMetadata(address, processedMetadata);
                } catch (err) {
                  console.warn('Failed to fetch token metadata', err);
          // Set default metadata to avoid repeated requests
          setCachedMetadata(address, {
            symbol: 'UNKNOWN',
            name: 'Unknown Token',
            decimals: 18,
            logo: null,
          });
        }
      });

      await Promise.allSettled(metadataPromises); // Use allSettled to continue even if some fail
    }

    // Process token entries with smart filtering
            const tokenEntries = tokensWithBalance
      .map((token: TokenBalance) => {
        const cache = getCachedMetadata(token.contractAddress.toLowerCase());
                const decimals = cache?.decimals ?? 18;
                const raw = token.tokenBalance ?? '0';
                const amountNumber = Number(formatUnits(BigInt(raw), Number(decimals)));
        const symbol = cache?.symbol || 'UNKNOWN';
        // Token icon will come from Alchemy metadata
        const tokenIconUrl = undefined;
        
                return {
                  contractAddress: token.contractAddress,
                  amountNumber,
                  decimals,
          symbol,
                  name: cache?.name || 'Unknown Token',
          logo: tokenIconUrl,
          price: undefined, // Will be set later
                };
              })
      .filter((entry) => entry.amountNumber >= MIN_BALANCE_THRESHOLD) // Filter out tiny amounts
      .sort((a, b) => b.amountNumber - a.amountNumber); // Sort by amount for better UX

            if (tokenEntries.length === 0) {
      return networkTokens;
            }

    // Batch price requests for efficiency
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
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Price timeout')), NETWORK_TIMEOUT)
        );
        
        const pricePromise = alchemy.prices.getTokenPriceByAddress(uncachedPriceRequests);
        const priceResponse = await Promise.race([pricePromise, timeoutPromise]) as {
          data?: Array<{
            address: string;
            prices?: Array<{ value?: string }>;
          }>;
        } | null;
        
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
        amountNumber: entry.amountNumber,
        usdValue: usdValueNumber !== undefined
          ? `$${usdValueNumber.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : undefined,
                usdValueNumber,
                network: config.label,
                logo: entry.logo,
        price,
        contractAddress: entry.contractAddress,
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

        // Process all networks in parallel with smart caching
        const networkPromises = alchemyInstances.map(async ({ config, alchemy }) => {
          try {
            const balanceCacheKey = `${walletAddress}-${config.network}`;
            let nativeBalance: bigint;
            let tokenBalances: TokenBalancesResponse;

            // Check balance cache first
            const cachedBalance = getCachedBalance(balanceCacheKey);
            if (cachedBalance) {
              nativeBalance = cachedBalance.nativeBalance;
              tokenBalances = cachedBalance.tokenBalances;
            } else {
              // Parallel balance and token balance calls with timeout
              const balancePromises = [
                alchemy.core.getBalance(walletAddress),
                alchemy.core.getTokenBalances(walletAddress)
              ];

              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Network timeout')), NETWORK_TIMEOUT)
              );

              const [balanceResult, tokenResult] = await Promise.race([
                Promise.all(balancePromises),
                timeoutPromise
              ]) as [bigint, TokenBalancesResponse];

              nativeBalance = BigInt(balanceResult.toString());
              tokenBalances = tokenResult;

              // Cache the balance data
              setCachedBalance(balanceCacheKey, nativeBalance, tokenBalances);
            }

            const result: NetworkResult = {
              config,
              nativeBalance,
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

  // Categorize tokens by value
  const categorizedTokens = useMemo(() => {
    if (!displayTokens) return { mainTokens: [], hiddenTokens: [] };
    
    const mainTokens = displayTokens.filter(token => 
      (token.usdValueNumber ?? 0) >= HIDE_TOKEN_THRESHOLD
    );
    
    const hiddenTokens = displayTokens.filter(token => 
      (token.usdValueNumber ?? 0) < HIDE_TOKEN_THRESHOLD
    );
    
    return { mainTokens, hiddenTokens };
  }, [displayTokens]);

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
        
        {/* Table Header */}
        {categorizedTokens.mainTokens.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-3 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wide">
              <div>Asset</div>
              <div>Amount</div>
              <div>USD Value</div>
            </div>
            
            {/* Main Tokens */}
            {categorizedTokens.mainTokens.map((token, index) => (
              <div
                key={`${token.contractAddress}-${token.network}-${index}`}
                className="grid grid-cols-3 gap-4 px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
              >
                {/* Asset Column */}
                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <TokenIcon 
                      logo={token.logo} 
                      symbol={token.symbol} 
                      size={24}
                    />
                    {/* Chain Icon - only show if not empty */}
                    {(() => {
                      const networkKey = Object.entries(NETWORK_NAMES).find(([, name]) => name === token.network)?.[0];
                      const chainIcon = NETWORK_ICONS[networkKey || ''];
                      if (chainIcon) {
                        return (
                          <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-white rounded-full flex items-center justify-center text-xs border border-gray-200">
                            {chainIcon}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-800 truncate">{token.symbol}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {token.price ? `$${token.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : '—'}
                    </p>
                  </div>
                </div>
                
                {/* Amount Column */}
                <div className="flex items-center">
                  <p className="text-xs text-gray-600">
                    {token.amount}
                  </p>
              </div>
                
                {/* USD Value Column */}
                <div className="flex items-center">
                  <p className="text-xs font-medium text-gray-800">
                {token.usdValue ?? '—'}
              </p>
            </div>
          </div>
        ))}
            
            {/* Hidden Tokens Dropdown */}
            {categorizedTokens.hiddenTokens.length > 0 && (
              <div className="border-t border-gray-200">
                <button
                  onClick={() => setShowAllTokens(!showAllTokens)}
                  className="w-full px-4 py-3 text-left text-sm text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-between"
                >
                  <span>See All Tokens ({categorizedTokens.hiddenTokens.length})</span>
                  <span className={`transform transition-transform ${showAllTokens ? 'rotate-180' : ''}`}>
                    ▼
                  </span>
                </button>
                
                {showAllTokens && (
                  <div className="border-t border-gray-100">
                    {categorizedTokens.hiddenTokens.map((token, index) => (
                      <div
                        key={`hidden-${token.contractAddress}-${token.network}-${index}`}
                        className="grid grid-cols-3 gap-4 px-4 py-2 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors"
                      >
                        {/* Asset Column */}
                        <div className="flex items-center space-x-2">
                          <div className="relative">
                            <TokenIcon 
                              logo={token.logo} 
                              symbol={token.symbol} 
                              size={20}
                            />
                            {/* Chain Icon - only show if not empty */}
                            {(() => {
                              const networkKey = Object.entries(NETWORK_NAMES).find(([, name]) => name === token.network)?.[0];
                              const chainIcon = NETWORK_ICONS[networkKey || ''];
                              if (chainIcon) {
                                return (
                                  <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-white rounded-full flex items-center justify-center text-xs border border-gray-200">
                                    {chainIcon}
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-gray-600 truncate">{token.symbol}</p>
                            <p className="text-xs text-gray-400 truncate">
                              {token.price ? `$${token.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : '—'}
                            </p>
                          </div>
                        </div>
                        
                        {/* Amount Column */}
                        <div className="flex items-center">
                          <p className="text-xs text-gray-500">
                            {token.amount}
                          </p>
                        </div>
                        
                        {/* USD Value Column */}
                        <div className="flex items-center">
                          <p className="text-xs text-gray-500">
                            {token.usdValue ?? '<$0.01'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

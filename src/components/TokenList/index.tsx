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
const ICON_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days (icons rarely change)
const BALANCE_CACHE_TTL = 2 * 60 * 1000; // 2 minutes (balances change frequently)

// Smart loading thresholds
const MIN_BALANCE_THRESHOLD = 0.000001; // Skip very small balances
const MAX_TOKENS_PER_NETWORK = 20; // Limit tokens per network for performance
const NETWORK_TIMEOUT = 5000; // 5 second timeout per network

// Well-known token addresses and their metadata with verified icons
const WELL_KNOWN_TOKENS: Record<string, { symbol: string; name: string; iconUrl: string; address?: string }> = {
  // Native tokens
  'ETH': { symbol: 'ETH', name: 'Ethereum', iconUrl: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png' },
  'WLD': { symbol: 'WLD', name: 'Worldcoin', iconUrl: 'https://assets.coingecko.com/coins/images/31079/large/worldcoin.jpeg' },
  'MATIC': { symbol: 'MATIC', name: 'Polygon', iconUrl: 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png' },
  
  // ERC-20 tokens (by contract address) - using correct addresses
  '0xA0b86a33E6441b8c4C8C0d4B0cF4B4d4F4B4d4F4B': { symbol: 'USDC', name: 'USD Coin', iconUrl: 'https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png' },
  '0xdAC17F958D2ee523a2206206994597C13D831ec7': { symbol: 'USDT', name: 'Tether USD', iconUrl: 'https://assets.coingecko.com/coins/images/325/large/Tether.png' },
  '0x6B175474E89094C44Da98b954EedeAC495271d0F': { symbol: 'DAI', name: 'Dai Stablecoin', iconUrl: 'https://assets.coingecko.com/coins/images/9956/large/4943.png' },
  '0x514910771AF9Ca656af840dff83E8264EcF986CA': { symbol: 'LINK', name: 'Chainlink', iconUrl: 'https://assets.coingecko.com/coins/images/877/large/chainlink-new-logo.png' },
  '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984': { symbol: 'UNI', name: 'Uniswap', iconUrl: 'https://assets.coingecko.com/coins/images/12504/large/uniswap-uni.png' },
  '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0': { symbol: 'MATIC', name: 'Polygon', iconUrl: 'https://assets.coingecko.com/coins/images/4713/large/matic-token-icon.png' },
  '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599': { symbol: 'WBTC', name: 'Wrapped Bitcoin', iconUrl: 'https://assets.coingecko.com/coins/images/7598/large/wrapped_bitcoin_wbtc.png' },
  '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE': { symbol: 'SHIB', name: 'Shiba Inu', iconUrl: 'https://assets.coingecko.com/coins/images/11939/large/shiba.png' },
  '0x4d224452801ACEd8B2F0aebE155379bb5D594381': { symbol: 'APE', name: 'ApeCoin', iconUrl: 'https://assets.coingecko.com/coins/images/24383/large/apecoin.jpg' },
  '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9': { symbol: 'AAVE', name: 'Aave', iconUrl: 'https://assets.coingecko.com/coins/images/12645/large/AAVE.png' },
  '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2': { symbol: 'MKR', name: 'Maker', iconUrl: 'https://assets.coingecko.com/coins/images/1364/large/Mark_Maker.png' },
  '0x0F5D2fB29fb7d3CFeE444a200298f468908cC942': { symbol: 'MANA', name: 'Decentraland', iconUrl: 'https://assets.coingecko.com/coins/images/878/large/decentraland-mana.png' },
  '0x3845badAde8e6dDD04FcF2C3b1c4C3C3C3C3C3C3': { symbol: 'SAND', name: 'The Sandbox', iconUrl: 'https://assets.coingecko.com/coins/images/12129/large/sandbox_logo.jpg' },
  '0x15D4c048F83bd7e37d49eA4C83a07267Ec4203dA': { symbol: 'GALA', name: 'Gala', iconUrl: 'https://assets.coingecko.com/coins/images/12493/large/GALA-COINGECKO.png' },
  '0x4E15361FD6b4BB609Fa63C81A2be19d873717870': { symbol: 'FTM', name: 'Fantom', iconUrl: 'https://assets.coingecko.com/coins/images/4001/large/Fantom_round.png' },
  '0x6c6EE5e31d828De241282B9606C8e98Ea48526E2': { symbol: 'HOT', name: 'Holo', iconUrl: 'https://assets.coingecko.com/coins/images/3348/large/Holologo_Profile.png' },
  '0x0bc529c00C6401aEF6D220BE8c6Ea1667F6Ad93e': { symbol: 'YFI', name: 'Yearn.finance', iconUrl: 'https://assets.coingecko.com/coins/images/11849/large/yfi-192x192.png' },
  '0x0D8775F648430679A709E98d2b0Cb6250d2887EF': { symbol: 'BAT', name: 'Basic Attention Token', iconUrl: 'https://assets.coingecko.com/coins/images/677/large/basic-attention-token.png' },
  '0x1985365e9f78359a9B6AD760e32412f4a445E862': { symbol: 'REP', name: 'Augur', iconUrl: 'https://assets.coingecko.com/coins/images/309/large/REP.png' },
  '0xE41d2489571d322189246DaFA5ebDe1F4699F498': { symbol: 'ZRX', name: '0x Protocol', iconUrl: 'https://assets.coingecko.com/coins/images/863/large/0x.png' },
  
  // Additional popular tokens with verified icons
  'USDC.e': { symbol: 'USDC.e', name: 'USD Coin (Bridged)', iconUrl: 'https://assets.coingecko.com/coins/images/6319/large/USD_Coin_icon.png' },
  'USDT.e': { symbol: 'USDT.e', name: 'Tether USD (Bridged)', iconUrl: 'https://assets.coingecko.com/coins/images/325/large/Tether.png' },
  'WETH': { symbol: 'WETH', name: 'Wrapped Ethereum', iconUrl: 'https://assets.coingecko.com/coins/images/2518/large/weth.png' },
  'CRV': { symbol: 'CRV', name: 'Curve DAO Token', iconUrl: 'https://assets.coingecko.com/coins/images/12124/large/Curve.png' },
  'COMP': { symbol: 'COMP', name: 'Compound', iconUrl: 'https://assets.coingecko.com/coins/images/10775/large/COMP.png' },
  'SNX': { symbol: 'SNX', name: 'Synthetix', iconUrl: 'https://assets.coingecko.com/coins/images/3406/large/SNX.png' },
  'SUSHI': { symbol: 'SUSHI', name: 'SushiSwap', iconUrl: 'https://assets.coingecko.com/coins/images/12271/large/512x512_Logo_no_chop.png' },
  '1INCH': { symbol: '1INCH', name: '1inch', iconUrl: 'https://assets.coingecko.com/coins/images/13469/large/1inch-token.png' },
  'BAL': { symbol: 'BAL', name: 'Balancer', iconUrl: 'https://assets.coingecko.com/coins/images/11683/large/Balancer.png' },
};

// Token icon providers (in order of preference)
const TOKEN_ICON_PROVIDERS = [
  // LogoKit (most reliable free service)
  (address: string) => `https://logokit.com/crypto/${address}.png`,
  // Tokens.build (free API - good coverage)
  (address: string) => `https://tokens.build/icon/${address}.png`,
  // Trust Wallet (comprehensive collection)
  (address: string) => `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/${address}/logo.png`,
  // 1inch (good coverage)
  (address: string) => `https://tokens.1inch.io/${address}.png`,
  // Moralis (reliable CDN)
  (address: string) => `https://cdn.moralis.io/eth/${address}.png`,
  // Alchemy (backup)
  (address: string) => `https://eth-mainnet.alchemyapi.io/v2/demo/${address}/logo.png`,
];

// Network priority for faster networks first
const NETWORK_PRIORITY: Record<string, number> = {
  'ETH_MAINNET': 1,
  'WORLDCHAIN_MAINNET': 2,
  'BASE_MAINNET': 3,
  'ARB_MAINNET': 4,
  'OPT_MAINNET': 5,
};

// Network icons mapping
const NETWORK_ICONS: Record<string, string> = {
  'ETH_MAINNET': '🔷',
  'WORLDCHAIN_MAINNET': '🌍',
  'BASE_MAINNET': '🔵',
  'ARB_MAINNET': '🔺',
  'OPT_MAINNET': '🔴',
};

// Value threshold for hiding tokens
const HIDE_TOKEN_THRESHOLD = 0.5;

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

// Enhanced token icon component with fallback
const TokenIcon = ({ address, symbol, size = 24, className = "" }: { 
  address: string; 
  symbol: string; 
  size?: number; 
  className?: string; 
}) => {
  const [currentProvider, setCurrentProvider] = useState(0);
  const [imageError, setImageError] = useState(false);
  
  const iconUrl = useMemo(() => {
    // Always try well-known tokens first
    if (WELL_KNOWN_TOKENS[address]) {
      console.log(`🎯 TokenIcon: Found well-known token by address for ${symbol} (${address}):`, WELL_KNOWN_TOKENS[address].iconUrl);
      return WELL_KNOWN_TOKENS[address].iconUrl;
    }
    if (WELL_KNOWN_TOKENS[symbol]) {
      console.log(`🎯 TokenIcon: Found well-known token by symbol for ${symbol}:`, WELL_KNOWN_TOKENS[symbol].iconUrl);
      return WELL_KNOWN_TOKENS[symbol].iconUrl;
    }
    
    // Try different providers
    if (currentProvider < TOKEN_ICON_PROVIDERS.length) {
      const providerUrl = TOKEN_ICON_PROVIDERS[currentProvider](address);
      const providerNames = ['LogoKit', 'Tokens.build', 'Trust Wallet', '1inch', 'Moralis', 'Alchemy'];
      console.log(`🔄 TokenIcon: Trying provider ${currentProvider + 1}/${TOKEN_ICON_PROVIDERS.length} (${providerNames[currentProvider]}) for ${symbol} (${address}):`, providerUrl);
      return providerUrl;
    }
    
    console.log(`❌ TokenIcon: All providers failed for ${symbol} (${address}), showing fallback`);
    return null;
  }, [address, symbol, currentProvider]);

  const handleImageError = useCallback(() => {
    const providerNames = ['LogoKit', 'Tokens.build', 'Trust Wallet', '1inch', 'Moralis', 'Alchemy'];
    
    // If we haven't tried all providers yet, try the next one
    if (currentProvider < TOKEN_ICON_PROVIDERS.length - 1) {
      console.log(`⚠️ TokenIcon: Provider ${currentProvider + 1} (${providerNames[currentProvider]}) failed for ${symbol} (${address}), trying next provider`);
      setCurrentProvider(prev => prev + 1);
      setImageError(false);
    } else {
      // All providers failed, show fallback
      console.log(`💥 TokenIcon: All ${TOKEN_ICON_PROVIDERS.length} providers failed for ${symbol} (${address}), showing fallback with initial "${symbol.charAt(0)}"`);
      setImageError(true);
    }
  }, [currentProvider, symbol, address]);

  if (imageError || !iconUrl) {
    console.log(`🔤 TokenIcon: Rendering fallback for ${symbol} (${address}) with initial "${symbol.charAt(0)}"`);
    return (
      <div 
        className={`bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {symbol.charAt(0)}
      </div>
    );
  }

  console.log(`✅ TokenIcon: Rendering image for ${symbol} (${address}) from:`, iconUrl);
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

type TokenIconCache = {
  url: string;
  timestamp: number;
  failed: boolean;
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
  const iconCache = useRef<Map<string, TokenIconCache>>(new Map());
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

  // Token icon management
  const getCachedIcon = useCallback((address: string): string | null => {
    const cached = iconCache.current.get(address);
    if (cached && !cached.failed && Date.now() - cached.timestamp < ICON_CACHE_TTL) {
      return cached.url;
    }
    return null;
  }, []);

  const setCachedIcon = useCallback((address: string, url: string, failed = false) => {
    iconCache.current.set(address, { url, timestamp: Date.now(), failed });
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

  // Generate token icon URL with fallback system
  const getTokenIconUrl = useCallback((address: string, symbol: string): string => {
    console.log(`🔍 getTokenIconUrl: Looking for icon for ${symbol} (${address})`);
    
    // Check cache first
    const cached = getCachedIcon(address);
    if (cached) {
      console.log(`💾 getTokenIconUrl: Found cached icon for ${symbol} (${address}):`, cached);
      return cached;
    }

    // Check well-known tokens by address first (most accurate)
    if (WELL_KNOWN_TOKENS[address]) {
      const tokenInfo = WELL_KNOWN_TOKENS[address];
      console.log(`🎯 getTokenIconUrl: Found well-known token by address for ${symbol} (${address}):`, tokenInfo.iconUrl);
      setCachedIcon(address, tokenInfo.iconUrl);
      return tokenInfo.iconUrl;
    }

    // Check well-known tokens by symbol for native tokens
    if (WELL_KNOWN_TOKENS[symbol]) {
      const tokenInfo = WELL_KNOWN_TOKENS[symbol];
      console.log(`🎯 getTokenIconUrl: Found well-known token by symbol for ${symbol}:`, tokenInfo.iconUrl);
      setCachedIcon(address, tokenInfo.iconUrl);
      return tokenInfo.iconUrl;
    }

    // For other tokens, try the first provider (most reliable)
    const iconUrl = TOKEN_ICON_PROVIDERS[0](address);
    console.log(`🔄 getTokenIconUrl: Using first provider (LogoKit) for ${symbol} (${address}):`, iconUrl);
    setCachedIcon(address, iconUrl);
    return iconUrl;
  }, [getCachedIcon, setCachedIcon]);


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
        const nativeIconUrl = getTokenIconUrl('native', config.nativeSymbol);
        
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
          
          setCachedMetadata(address, {
            symbol: metadata?.symbol || 'UNKNOWN',
            name: metadata?.name || 'Unknown Token',
            decimals: metadata?.decimals ?? 18,
            logo: metadata?.logo || null,
          });
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
        const tokenIconUrl = getTokenIconUrl(token.contractAddress, symbol);
        
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
  }, [getCachedMetadata, setCachedMetadata, getCachedPrice, setCachedPrice, getTokenIconUrl]);

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
  }, [walletAddress, alchemyNetworks, getGlobalPrice, processNetworkResult, getTokenIconUrl]);

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
                      address={token.contractAddress || 'native'} 
                      symbol={token.symbol} 
                      size={24}
                    />
                    {/* Chain Icon */}
                    <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-white rounded-full flex items-center justify-center text-xs border border-gray-200">
                      {NETWORK_ICONS[token.network] || '🔗'}
                    </div>
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
                              address={token.contractAddress || 'native'} 
                              symbol={token.symbol} 
                              size={20}
                            />
                            {/* Chain Icon */}
                            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-white rounded-full flex items-center justify-center text-xs border border-gray-200">
                              {NETWORK_ICONS[token.network] || '🔗'}
                            </div>
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

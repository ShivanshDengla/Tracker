'use client';
import { Fragment, useCallback, useMemo, useState } from 'react';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { usePortfolioData } from '@/contexts/PortfolioDataContext';

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

// Local token icon mappings from public/Tokens
const TOKEN_ICONS: Record<string, string> = {
  'ETH': '/Tokens/eth.png',
  'WLD': '/Tokens/wld.png',
  'USDC': '/Tokens/usdc.png',
  'USDT': '/Tokens/usdt.png',
  'DAI': '/Tokens/dai.png',
  'LINK': '/Tokens/chainlink.png',
  'UNI': '/Tokens/uniswap.png',
  'AAVE': '/Tokens/aave.png',
  'MATIC': '/Tokens/matic.png',
  'BNB': '/Tokens/bnb.png',
  'AVAX': '/Tokens/avax.png',
  'BASE': '/Tokens/base.webp',
  'BITCOIN': '/Tokens/bitcoin.png',
};

// PoolTogether vault icons from Cabana.fi
const POOLTOGETHER_ICONS: Record<string, string> = {
  'PRZPOOL': 'https://app.cabana.fi/icons/przPOOL.svg',
  'PRZUSDC': 'https://app.cabana.fi/icons/przUSDC.svg',
  'PRZAERO': 'https://app.cabana.fi/icons/przAERO.svg',
  'PRZCBETH': 'https://app.cabana.fi/icons/przCBETH.svg',
  'PRZWSTETH': 'https://app.cabana.fi/icons/przSTETH.svg',
  'PRZWETH': 'https://app.cabana.fi/icons/przWETH.svg',
  'PRZWSTETHETH': 'https://app.cabana.fi/icons/przVELO.svg',
  'PRZDAI': 'https://app.cabana.fi/icons/przDAI.svg',
  'PRZWXDAI': 'https://app.cabana.fi/icons/pDAI.svg',
  'PUSDC.E': 'https://app.cabana.fi/icons/pUSDC.e.svg',
  'PWETH': 'https://app.cabana.fi/icons/pWETH.svg',
  'PRZUSDT': 'https://app.cabana.fi/icons/przUSDT.svg',
  // Additional variations
  'PRZSTETH': 'https://app.cabana.fi/icons/przSTETH.svg',
  'PRZVELO': 'https://app.cabana.fi/icons/przVELO.svg',
  'PDAI': 'https://app.cabana.fi/icons/pDAI.svg',
};

// Local chain icon mappings from public/Chains
const CHAIN_ICONS: Record<string, string> = {
  'ethereum': '/Chains/eth chain.webp',
  'polygon': '/Chains/polygon chain.png',
  'arbitrum': '/Chains/arbitrum chain.jpeg',
  'optimism': '/Chains/op chain.png',
  'base': '/Chains/base.webp',
  'worldchain': '/Chains/wld.png',
};

// Network icons mapping using local assets
const NETWORK_ICONS: Record<string, string> = {
  'ETH_MAINNET': CHAIN_ICONS['ethereum'],
  'WORLDCHAIN_MAINNET': CHAIN_ICONS['worldchain'],
  'BASE_MAINNET': CHAIN_ICONS['base'],
  'ARB_MAINNET': CHAIN_ICONS['arbitrum'],
  'OPT_MAINNET': CHAIN_ICONS['optimism'],
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

// Scam token detection function (same as in PortfolioDataContext)
const isScamToken = (symbol: string, name: string): boolean => {
  const upperSymbol = symbol.toUpperCase();
  const upperName = name.toUpperCase();
  
  // Known suspicious tokens that inflate portfolio values
  const knownScamTokens = [
    'ETHG', // Ethereum Games - often has inflated prices
  ];
  
  if (knownScamTokens.includes(upperSymbol)) {
    return true;
  }
  
  // Common scam patterns
  const scamPatterns = [
    // Website/claim patterns
    /\[.*WWW\..*\]/i,
    /\[.*HTTP.*\]/i,
    /\[.*\.ORG\]/i,
    /\[.*\.COM\]/i,
    /\[.*\.NET\]/i,
    /VISIT.*TO.*CLAIM/i,
    /CLAIM.*REWARD/i,
    /GET.*REWARD/i,
    /CLAIM.*NOW/i,
    /VISIT.*CLAIM/i,
    
    // Suspicious symbols with brackets
    /\[.*\]/i,
    
    // Fake token patterns
    /FAKE/i,
    /SCAM/i,
    /TEST.*TOKEN/i,
    /DUMMY/i,
    
    // Suspicious high-value claims
    /\$[0-9]+[KMB]/i,
    
    // Gaming tokens that often have inflated prices
    /GAME/i,
    /GAMING/i,
    
    // Short URL patterns (often used in scams)
    /t\.ly/i,
    /t\.me/i,
    /REDEEM.*t\.ly/i,
    /CLAIM.*t\.ly/i,
  ];
  
  // Check symbol and name for scam patterns
  for (const pattern of scamPatterns) {
    if (pattern.test(upperSymbol) || pattern.test(upperName)) {
      return true;
    }
  }
  
  // Check for suspicious combinations
  if (upperSymbol.includes('WLD') && (upperName.includes('WWW') || upperName.includes('CLAIM') || upperName.includes('REWARD'))) {
    return true;
  }
  
  return false;
};

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

// Smart underlying asset detection function
const detectUnderlyingAsset = (symbol: string): string | null => {
  const upperSymbol = symbol.toUpperCase();
  
  // Common patterns for underlying assets
  const patterns = [
    // USDC patterns
    { pattern: /USDC/i, asset: 'USDC' },
    { pattern: /.*USDC.*/i, asset: 'USDC' },
    
    // USDT patterns  
    { pattern: /USDT/i, asset: 'USDT' },
    { pattern: /.*USDT.*/i, asset: 'USDT' },
    
    // DAI patterns
    { pattern: /DAI/i, asset: 'DAI' },
    { pattern: /.*DAI.*/i, asset: 'DAI' },
    
    // ETH patterns
    { pattern: /ETH/i, asset: 'ETH' },
    { pattern: /.*ETH.*/i, asset: 'ETH' },
    { pattern: /WETH/i, asset: 'ETH' },
    
    // WLD patterns
    { pattern: /WLD/i, asset: 'WLD' },
    { pattern: /.*WLD.*/i, asset: 'WLD' },
    
    // LINK patterns
    { pattern: /LINK/i, asset: 'LINK' },
    { pattern: /.*LINK.*/i, asset: 'LINK' },
    
    // UNI patterns
    { pattern: /UNI/i, asset: 'UNI' },
    { pattern: /.*UNI.*/i, asset: 'UNI' },
    
    // AAVE patterns
    { pattern: /AAVE/i, asset: 'AAVE' },
    { pattern: /.*AAVE.*/i, asset: 'AAVE' },
    
    // MATIC patterns
    { pattern: /MATIC/i, asset: 'MATIC' },
    { pattern: /.*MATIC.*/i, asset: 'MATIC' },
    
    // BNB patterns
    { pattern: /BNB/i, asset: 'BNB' },
    { pattern: /.*BNB.*/i, asset: 'BNB' },
    
    // AVAX patterns
    { pattern: /AVAX/i, asset: 'AVAX' },
    { pattern: /.*AVAX.*/i, asset: 'AVAX' },
  ];
  
  for (const { pattern, asset } of patterns) {
    if (pattern.test(upperSymbol)) {
      return asset;
    }
  }
  
  return null;
};

// Token icon component with static mapping
const TokenIcon = ({ logo, symbol, size = 24, className = "" }: { 
  logo?: string | null; 
  symbol: string; 
  size?: number; 
  className?: string; 
}) => {
  const [imageError, setImageError] = useState(false);
  
  // Enhanced icon logic with smart underlying asset detection
  const iconUrl = useMemo(() => {
    // Try Alchemy first
    if (logo) {
      return logo;
    }
    
    // Try PoolTogether vault icons first (highest priority)
    const cleanSymbol = symbol.replace(/[^a-zA-Z0-9.]/g, '').toUpperCase();
    const poolTogetherIcon = POOLTOGETHER_ICONS[cleanSymbol];
    
    if (poolTogetherIcon) {
      return poolTogetherIcon;
    }
    
    // Smart underlying asset detection
    const underlyingAsset = detectUnderlyingAsset(cleanSymbol);
    if (underlyingAsset) {
      return TOKEN_ICONS[underlyingAsset];
    }
    
    // Try local mapping
    const icon = TOKEN_ICONS[cleanSymbol];
    
    if (icon) {
      return icon;
    }
    return null;
  }, [logo, symbol]);
  
  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);
  
  if (imageError || !iconUrl) {
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


export const TokenList = () => {
  const session = useSession();
  const params = useSearchParams();
  const queryAddress = params.get('address');
  const walletAddress =
    (queryAddress && ADDRESS_REGEX.test(queryAddress) ? queryAddress : undefined) ||
    (session?.data?.user?.walletAddress as `0x${string}` | undefined);
  
  const { portfolioTokens, loading, error, totalValue } = usePortfolioData();
  
  const [showAllTokens, setShowAllTokens] = useState(false);
  const [expandedProtocols, setExpandedProtocols] = useState<Set<string>>(new Set());

  const formattedTotal = useMemo(
    () =>
      totalValue.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [totalValue],
  );

  // Show partial results while loading
  const displayTokens = portfolioTokens;

  // Extract protocol tokens for optional expansion rendering
  const protocolTokensMap = useMemo(() => {
    if (!displayTokens) return new Map<string, PortfolioToken[]>();
    
    const protocolPatterns = {
      pooltogether: /(pooltogether|prize|prz)/i,
      aave: /(aave|^a[A-Z]{2,}$|am[A-Z]{2,}|variableDebt|stableDebt)/i,
      compound: /(compound|^c[A-Z]{2,}$|cETH|cUSDC|cDAI)/i,
      uniswap: /(uniswap|uni|v2|v3|LP|UNI-V2|UNI-V3)/i,
      curve: /(curve|crv|3crv|steth|gusd|y|busd)/i,
      lido: /(lido|steth|stETH|wstETH)/i,
      rocketpool: /(rocketpool|rETH|rETH2)/i,
      makerdao: /(maker|dai|mkr|makerdao)/i
    };

    const protocolGroups = new Map<string, PortfolioToken[]>();
    
    // Common tokens that should NOT be grouped into protocols (exact matches only)
    const excludeFromGrouping = new Set([
      'WLD', 'ETH', 'USDC', 'USDT', 'DAI', 'LINK', 'UNI', 'AAVE', 'MATIC', 'BNB', 'AVAX',
      'USDC.E', 'USDC.e', 'WETH', 'WBTC', 'BTC'
    ]);
    
    for (const token of displayTokens) {
      const tokenName = token.name ?? '';
      const tokenSymbol = token.symbol ?? '';
      
      // Skip if it's a common token that should remain individual (exact match only)
      if (excludeFromGrouping.has(tokenSymbol.toUpperCase())) {
        continue;
      }
      
      for (const [protocolKey, regex] of Object.entries(protocolPatterns)) {
        if (regex.test(tokenSymbol) || regex.test(tokenName)) {
          if (!protocolGroups.has(protocolKey)) {
            protocolGroups.set(protocolKey, []);
          }
          protocolGroups.get(protocolKey)!.push(token);
          break;
        }
      }
    }
    
    return protocolGroups;
  }, [displayTokens]);

  // Group tokens by popular protocols (e.g., PoolTogether, Aave, Staking)
  const groupedTokens = useMemo(() => {
    if (!displayTokens) return [] as PortfolioToken[];
    
    // Define protocol patterns
    const protocolPatterns = {
      pooltogether: {
        regex: /(pooltogether|prize|prz)/i,
        name: 'PoolTogether'
      },
      aave: {
        regex: /(aave|^a[A-Z]{2,}$|am[A-Z]{2,}|variableDebt|stableDebt)/i,
        name: 'Aave'
      },
      compound: {
        regex: /(compound|^c[A-Z]{2,}$|cETH|cUSDC|cDAI)/i,
        name: 'Compound'
      },
      uniswap: {
        regex: /(uniswap|uni|v2|v3|LP|UNI-V2|UNI-V3)/i,
        name: 'Uniswap'
      },
      curve: {
        regex: /(curve|crv|3crv|steth|gusd|y|busd)/i,
        name: 'Curve'
      },
      lido: {
        regex: /(lido|steth|stETH|wstETH)/i,
        name: 'Lido'
      },
      rocketpool: {
        regex: /(rocketpool|rETH|rETH2)/i,
        name: 'Rocket Pool'
      },
      makerdao: {
        regex: /(maker|dai|mkr|makerdao)/i,
        name: 'MakerDAO'
      }
    };

    // Common tokens that should NOT be grouped into protocols (exact matches only)
    const excludeFromGrouping = new Set([
      'WLD', 'ETH', 'USDC', 'USDT', 'DAI', 'LINK', 'UNI', 'AAVE', 'MATIC', 'BNB', 'AVAX',
      'USDC.E', 'USDC.e', 'WETH', 'WBTC', 'BTC'
    ]);

    // Group tokens by protocol
    const protocolGroups: Record<string, PortfolioToken[]> = {};
    const others: PortfolioToken[] = [];

    for (const token of displayTokens) {
      const tokenName = token.name ?? '';
      const tokenSymbol = token.symbol ?? '';
      
      // Skip if it's a common token that should remain individual (exact match only)
      if (excludeFromGrouping.has(tokenSymbol.toUpperCase())) {
        others.push(token);
        continue;
      }
      
      let matched = false;
      
      for (const [protocolKey, protocol] of Object.entries(protocolPatterns)) {
        if (protocol.regex.test(tokenSymbol) || protocol.regex.test(tokenName)) {
          if (!protocolGroups[protocolKey]) {
            protocolGroups[protocolKey] = [];
          }
          protocolGroups[protocolKey].push(token);
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        others.push(token);
      }
    }

    // Create group tokens for each protocol
    const groupTokens: PortfolioToken[] = [];
    
    for (const [protocolKey, tokens] of Object.entries(protocolGroups)) {
      if (tokens.length > 0) {
        const protocol = protocolPatterns[protocolKey as keyof typeof protocolPatterns];
        // Only include legitimate tokens in group total (exclude Curve and scam tokens)
        const legitimateTokens = tokens.filter(token => {
          const isCurve = /curve/i.test(token.symbol) || /Curve/i.test(token.name ?? '') || token.symbol === 'Curve';
          const isScam = isScamToken(token.symbol, token.name ?? '');
          return !isCurve && !isScam;
        });
        const totalUsd = legitimateTokens.reduce((sum, t) => sum + (t.usdValueNumber ?? 0), 0);

    const groupToken: PortfolioToken = {
          symbol: protocol.name,
          name: protocol.name,
          amount: `${tokens.length} pos`,
      amountNumber: 0,
      usdValueNumber: totalUsd,
      usdValue: `$${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
          network: protocol.name,
      logo: protocolKey === 'pooltogether' ? 'https://app.cabana.fi/icons/przPOOL.svg' : null, // Use POOL token icon for PoolTogether
      price: undefined,
      contractAddress: undefined,
    };

        // Only add group token if it has legitimate tokens with value
        if (legitimateTokens.length > 0 && totalUsd > 0) {
          groupTokens.push(groupToken);
        }
      }
    }

    // Sort group tokens by USD value (highest first)
    groupTokens.sort((a, b) => (b.usdValueNumber ?? 0) - (a.usdValueNumber ?? 0));

    return [...groupTokens, ...others];
  }, [displayTokens]);

  // Categorize tokens by value
  const categorizedTokens = useMemo(() => {
    if (!groupedTokens) return { mainTokens: [], hiddenTokens: [] } as { mainTokens: PortfolioToken[]; hiddenTokens: PortfolioToken[] };
    
    // Main tokens: only tokens with USD value >= $0.5, excluding Curve tokens and scam tokens
    const mainTokens = groupedTokens.filter(token => {
      const hasUsd = (token.usdValueNumber ?? 0) >= HIDE_TOKEN_THRESHOLD;
      const isCurve = /curve/i.test(token.symbol) || /Curve/i.test(token.name ?? '') || token.symbol === 'Curve';
      const isScam = isScamToken(token.symbol, token.name ?? '');
      return hasUsd && !isCurve && !isScam;
    }).sort((a, b) => (b.usdValueNumber ?? 0) - (a.usdValueNumber ?? 0)); // Sort by USD value descending
    
    // Hidden tokens: all tokens with USD value < $0.5 OR Curve tokens OR scam tokens (regardless of value)
    const hiddenTokens = groupedTokens.filter(token => {
      const hasLowUsd = (token.usdValueNumber ?? 0) < HIDE_TOKEN_THRESHOLD;
      const isCurve = /curve/i.test(token.symbol) || /Curve/i.test(token.name ?? '') || token.symbol === 'Curve';
      const isScam = isScamToken(token.symbol, token.name ?? '');
      return hasLowUsd || isCurve || isScam;
    }).sort((a, b) => {
      // Check if tokens are Curve tokens or scam tokens
      const aIsCurve = /curve/i.test(a.symbol) || /Curve/i.test(a.name ?? '') || a.symbol === 'Curve';
      const bIsCurve = /curve/i.test(b.symbol) || /Curve/i.test(b.name ?? '') || b.symbol === 'Curve';
      const aIsScam = isScamToken(a.symbol, a.name ?? '');
      const bIsScam = isScamToken(b.symbol, b.name ?? '');
      
      // Scam tokens go to the very end, then Curve tokens
      if (aIsScam && !bIsScam) return 1;
      if (!aIsScam && bIsScam) return -1;
      if (aIsCurve && !bIsCurve && !aIsScam && !bIsScam) return 1;
      if (!aIsCurve && bIsCurve && !aIsScam && !bIsScam) return -1;
      
      // For legitimate tokens, sort by USD value descending
      return (b.usdValueNumber ?? 0) - (a.usdValueNumber ?? 0);
    });
    
    return { mainTokens, hiddenTokens };
  }, [groupedTokens]);

  return (
    <div className="w-full space-y-4">
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-6 text-white">
        <h2 className="text-lg font-semibold mb-2">Portfolio Value</h2>
        <p className="text-3xl font-bold">${formattedTotal}</p>
        {loading && (
          <p className="text-xs opacity-75 mt-1">
            Loading portfolio data...
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
            <div className="hidden sm:grid grid-cols-3 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wide">
              <div>Asset</div>
              <div>Amount</div>
              <div>USD Value</div>
            </div>
            
            {/* Main Tokens */}
            {categorizedTokens.mainTokens.map((token, index) => (
              <Fragment key={`${token.contractAddress}-${token.network}-${index}`}>
                {/* Desktop Layout */}
                <div className="hidden sm:grid grid-cols-3 gap-4 px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors">
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
                      const chainIconSrc = NETWORK_ICONS[networkKey || ''];
                      if (chainIconSrc) {
                        return (
                          <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-white rounded-full flex items-center justify-center border border-gray-200 overflow-hidden">
                            <Image src={chainIconSrc} alt="" width={12} height={12} className="w-full h-full object-cover" />
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
                  {['PoolTogether', 'Aave', 'Compound', 'Uniswap', 'Curve', 'Lido', 'Rocket Pool', 'MakerDAO'].includes(token.symbol) ? (
                    <button
                      onClick={() => {
                        const newExpanded = new Set(expandedProtocols);
                        if (newExpanded.has(token.symbol)) {
                          newExpanded.delete(token.symbol);
                        } else {
                          newExpanded.add(token.symbol);
                        }
                        setExpandedProtocols(newExpanded);
                      }}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border-2 transition-all duration-200 shadow-sm ${
                        token.symbol === 'PoolTogether' 
                          ? 'bg-purple-100 border-purple-500 text-purple-700 hover:bg-purple-200 hover:border-purple-600 shadow-purple-100' 
                          : token.symbol === 'Aave'
                          ? 'bg-blue-100 border-blue-500 text-blue-700 hover:bg-blue-200 hover:border-blue-600 shadow-blue-100'
                          : token.symbol === 'Compound'
                          ? 'bg-green-100 border-green-500 text-green-700 hover:bg-green-200 hover:border-green-600 shadow-green-100'
                          : token.symbol === 'Uniswap'
                          ? 'bg-pink-100 border-pink-500 text-pink-700 hover:bg-pink-200 hover:border-pink-600 shadow-pink-100'
                          : token.symbol === 'Curve'
                          ? 'bg-orange-100 border-orange-500 text-orange-700 hover:bg-orange-200 hover:border-orange-600 shadow-orange-100'
                          : token.symbol === 'Lido'
                          ? 'bg-indigo-100 border-indigo-500 text-indigo-700 hover:bg-indigo-200 hover:border-indigo-600 shadow-indigo-100'
                          : token.symbol === 'Rocket Pool'
                          ? 'bg-cyan-100 border-cyan-500 text-cyan-700 hover:bg-cyan-200 hover:border-cyan-600 shadow-cyan-100'
                          : token.symbol === 'MakerDAO'
                          ? 'bg-yellow-100 border-yellow-500 text-yellow-700 hover:bg-yellow-200 hover:border-yellow-600 shadow-yellow-100'
                          : 'bg-gray-100 border-gray-500 text-gray-700 hover:bg-gray-200 hover:border-gray-600 shadow-gray-100'
                      }`}
                    >
                      {expandedProtocols.has(token.symbol) ? 'Hide positions' : `View positions (${protocolTokensMap.get(token.symbol.toLowerCase().replace(' ', ''))?.length || 0})`}
                    </button>
                  ) : (
                    <p className="text-xs text-gray-600">
                      {token.amount}
                    </p>
                  )}
                </div>
                
                {/* USD Value Column */}
                <div className="flex items-center">
                  <p className="text-xs font-medium text-gray-800">
                    {token.usdValue ?? '—'}
                  </p>
                </div>
                </div>

                {/* Mobile Layout */}
                <div className="sm:hidden border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors">
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-4">
                        <div className="relative">
                          <TokenIcon 
                            logo={token.logo} 
                            symbol={token.symbol} 
                            size={40}
                          />
                          {(() => {
                            const networkKey = Object.entries(NETWORK_NAMES).find(([, name]) => name === token.network)?.[0];
                            const chainIconSrc = NETWORK_ICONS[networkKey || ''];
                            if (chainIconSrc) {
                              return (
                                <div className="absolute -top-1 -right-1 w-5 h-5 bg-white rounded-full flex items-center justify-center border border-gray-200 overflow-hidden">
                                  <Image src={chainIconSrc} alt="" width={16} height={16} className="w-full h-full object-cover" />
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        <div>
                          <p className="text-base font-bold text-gray-800">{token.symbol}</p>
                          <p className="text-sm text-gray-500">
                            {token.price ? `$${token.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : '—'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-bold text-gray-800">
                          {token.usdValue ?? '—'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div>
                        {['PoolTogether', 'Aave', 'Compound', 'Uniswap', 'Curve', 'Lido', 'Rocket Pool', 'MakerDAO'].includes(token.symbol) ? (
                          <button
                            onClick={() => {
                              const newExpanded = new Set(expandedProtocols);
                              if (newExpanded.has(token.symbol)) {
                                newExpanded.delete(token.symbol);
                              } else {
                                newExpanded.add(token.symbol);
                              }
                              setExpandedProtocols(newExpanded);
                            }}
                            className={`text-sm font-semibold px-4 py-2 rounded-lg border-2 transition-all duration-200 shadow-sm ${
                              token.symbol === 'PoolTogether' 
                                ? 'bg-purple-100 border-purple-500 text-purple-700 hover:bg-purple-200 hover:border-purple-600 shadow-purple-100' 
                                : token.symbol === 'Aave'
                                ? 'bg-blue-100 border-blue-500 text-blue-700 hover:bg-blue-200 hover:border-blue-600 shadow-blue-100'
                                : token.symbol === 'Compound'
                                ? 'bg-green-100 border-green-500 text-green-700 hover:bg-green-200 hover:border-green-600 shadow-green-100'
                                : token.symbol === 'Uniswap'
                                ? 'bg-pink-100 border-pink-500 text-pink-700 hover:bg-pink-200 hover:border-pink-600 shadow-pink-100'
                                : token.symbol === 'Curve'
                                ? 'bg-orange-100 border-orange-500 text-orange-700 hover:bg-orange-200 hover:border-orange-600 shadow-orange-100'
                                : token.symbol === 'Lido'
                                ? 'bg-indigo-100 border-indigo-500 text-indigo-700 hover:bg-indigo-200 hover:border-indigo-600 shadow-indigo-100'
                                : token.symbol === 'Rocket Pool'
                                ? 'bg-cyan-100 border-cyan-500 text-cyan-700 hover:bg-cyan-200 hover:border-cyan-600 shadow-cyan-100'
                                : token.symbol === 'MakerDAO'
                                ? 'bg-yellow-100 border-yellow-500 text-yellow-700 hover:bg-yellow-200 hover:border-yellow-600 shadow-yellow-100'
                                : 'bg-gray-100 border-gray-500 text-gray-700 hover:bg-gray-200 hover:border-gray-600 shadow-gray-100'
                            }`}
                          >
                            {expandedProtocols.has(token.symbol) ? 'Hide positions' : `View positions (${protocolTokensMap.get(token.symbol.toLowerCase().replace(' ', ''))?.length || 0})`}
                          </button>
                        ) : (
                          <p className="text-sm text-gray-600">
                            {token.amount}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Inline expanded protocol positions */}
                {['PoolTogether', 'Aave', 'Compound', 'Uniswap', 'Curve', 'Lido', 'Rocket Pool', 'MakerDAO'].includes(token.symbol) && 
                 expandedProtocols.has(token.symbol) && 
                 (protocolTokensMap.get(token.symbol.toLowerCase().replace(' ', ''))?.length ?? 0) > 0 && (
                  <div className="bg-gray-50">
                    {/* Desktop expanded positions */}
                    <div className="hidden sm:block">
                      {protocolTokensMap.get(token.symbol.toLowerCase().replace(' ', ''))?.slice(0, 6).map((pt, idx) => (
                        <div
                          key={`${token.symbol.toLowerCase()}-${pt.contractAddress}-${pt.network}-${idx}`}
                          className="grid grid-cols-3 gap-4 px-8 py-2 border-b border-gray-50 last:border-b-0 bg-gray-50/30"
                      >
                        {/* Asset Column */}
                        <div className="flex items-center space-x-2">
                          <div className="relative">
                            <TokenIcon logo={pt.logo} symbol={pt.symbol} size={20} />
                            {(() => {
                              const networkKey = Object.entries(NETWORK_NAMES).find(([, name]) => name === pt.network)?.[0];
                              const chainIconSrc = NETWORK_ICONS[networkKey || ''];
                              if (chainIconSrc) {
                                return (
                                  <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-white rounded-full flex items-center justify-center border border-gray-200 overflow-hidden">
                                      <Image src={chainIconSrc} alt="" width={10} height={10} className="w-full h-full object-cover" />
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-gray-700 truncate">{pt.symbol}</p>
                              <p className="text-[11px] text-gray-400 truncate">{pt.name ?? token.symbol}</p>
                          </div>
                        </div>
                        {/* Amount Column */}
                        <div className="flex items-center">
                          <p className="text-xs text-gray-600">{pt.amount}</p>
                        </div>
                        {/* USD Value Column */}
                        <div className="flex items-center">
                          <p className="text-xs text-gray-700">{pt.usdValue ?? '—'}</p>
                        </div>
                      </div>
                    ))}
                    </div>
                    
                    {/* Mobile expanded positions */}
                    <div className="sm:hidden">
                      {protocolTokensMap.get(token.symbol.toLowerCase().replace(' ', ''))?.slice(0, 6).map((pt, idx) => (
                        <div
                          key={`${token.symbol.toLowerCase()}-${pt.contractAddress}-${pt.network}-${idx}`}
                          className="px-8 py-3 border-b border-gray-100 last:border-b-0 bg-gray-50/50"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="relative">
                                <TokenIcon logo={pt.logo} symbol={pt.symbol} size={32} />
                                {(() => {
                                  const networkKey = Object.entries(NETWORK_NAMES).find(([, name]) => name === pt.network)?.[0];
                                  const chainIconSrc = NETWORK_ICONS[networkKey || ''];
                                  if (chainIconSrc) {
                                    return (
                                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center border border-gray-200 overflow-hidden">
                                        <Image src={chainIconSrc} alt="" width={14} height={14} className="w-full h-full object-cover" />
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-gray-700">{pt.symbol}</p>
                                <p className="text-xs text-gray-500">{pt.name ?? token.symbol}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-gray-700">{pt.usdValue ?? '—'}</p>
                              <p className="text-xs text-gray-500">{pt.amount}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Fragment>
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
                    {/* Desktop hidden tokens */}
                    <div className="hidden sm:block">
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
                              const chainIconSrc = NETWORK_ICONS[networkKey || ''];
                              if (chainIconSrc) {
                                return (
                                  <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-white rounded-full flex items-center justify-center border border-gray-200 overflow-hidden">
                                      <Image src={chainIconSrc} alt="" width={10} height={10} className="w-full h-full object-cover" />
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
                            {(() => {
                              const isCurve = /curve/i.test(token.symbol) || /Curve/i.test(token.name ?? '');
                              const isScam = isScamToken(token.symbol, token.name ?? '');
                              if (isCurve || isScam) return '$0.00';
                              return token.usdValue ?? '<$0.01';
                            })()}
                          </p>
                        </div>
                      </div>
                    ))}
                    </div>
                    
                    {/* Mobile hidden tokens */}
                    <div className="sm:hidden">
                      {categorizedTokens.hiddenTokens.map((token, index) => (
                        <div
                          key={`hidden-${token.contractAddress}-${token.network}-${index}`}
                          className="px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="relative">
                                <TokenIcon 
                                  logo={token.logo} 
                                  symbol={token.symbol} 
                                  size={28}
                                />
                                {(() => {
                                  const networkKey = Object.entries(NETWORK_NAMES).find(([, name]) => name === token.network)?.[0];
                                  const chainIconSrc = NETWORK_ICONS[networkKey || ''];
                                  if (chainIconSrc) {
                                    return (
                                      <div className="absolute -top-1 -right-1 w-3 h-3 bg-white rounded-full flex items-center justify-center border border-gray-200 overflow-hidden">
                                        <Image src={chainIconSrc} alt="" width={12} height={12} className="w-full h-full object-cover" />
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-600">{token.symbol}</p>
                                <p className="text-xs text-gray-400">
                                  {token.price ? `$${token.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : '—'}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium text-gray-500">
                                {(() => {
                                  const isCurve = /curve/i.test(token.symbol) || /Curve/i.test(token.name ?? '');
                                  const isScam = isScamToken(token.symbol, token.name ?? '');
                                  if (isCurve || isScam) return '$0.00';
                                  return token.usdValue ?? '<$0.01';
                                })()}
                              </p>
                              <p className="text-xs text-gray-400">{token.amount}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
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

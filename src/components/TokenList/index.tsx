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

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

// Token icon component with static mapping
const TokenIcon = ({ logo, symbol, size = 24, className = "" }: { 
  logo?: string | null; 
  symbol: string; 
  size?: number; 
  className?: string; 
}) => {
  const [imageError, setImageError] = useState(false);
  
  // Simple local icon logic
  const iconUrl = useMemo(() => {
    // Try Alchemy first
    if (logo) {
      return logo;
    }
    
    // Try local mapping
    const cleanSymbol = symbol.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
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

const shortenAddress = (address: string, visibleChars = 4) => {
  if (!address || address.length <= visibleChars * 2 + 2) return address;
  return `${address.slice(0, visibleChars + 2)}…${address.slice(-visibleChars)}`;
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
  const [showPoolTogether, setShowPoolTogether] = useState(false);

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

  // Extract PoolTogether/prize tokens for optional expansion rendering
  const poolTokensList = useMemo(() => {
    if (!displayTokens) return [] as PortfolioToken[];
    const poolRegex = /(pooltogether|prize|prz)/i;
    return displayTokens.filter((t) => {
      const tokenName = (t.name ?? '');
      return poolRegex.test(t.symbol) || poolRegex.test(tokenName);
    });
  }, [displayTokens]);

  // Group tokens by popular protocols (e.g., PoolTogether)
  const groupedTokens = useMemo(() => {
    if (!displayTokens) return [] as PortfolioToken[];
    const poolRegex = /(pooltogether|prize|prz)/i;

    const poolTokens: PortfolioToken[] = [];
    const others: PortfolioToken[] = [];
    for (const t of displayTokens) {
      const tokenName: string = t.name ?? '';
      if (poolRegex.test(t.symbol) || poolRegex.test(tokenName)) {
        poolTokens.push(t);
      } else {
        others.push(t);
      }
    }

    if (poolTokens.length === 0) return displayTokens;

    const totalUsd = poolTokens.reduce((sum, t) => sum + (t.usdValueNumber ?? 0), 0);

    const groupToken: PortfolioToken = {
      symbol: 'PoolTogether',
      name: 'PoolTogether',
      amount: `${poolTokens.length} pos`,
      amountNumber: 0,
      usdValueNumber: totalUsd,
      usdValue: `$${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      network: 'PoolTogether',
      logo: null,
      price: undefined,
      contractAddress: undefined,
    };

    return [groupToken, ...others];
  }, [displayTokens]);

  // Categorize tokens by value
  const categorizedTokens = useMemo(() => {
    if (!groupedTokens) return { mainTokens: [], hiddenTokens: [] } as { mainTokens: PortfolioToken[]; hiddenTokens: PortfolioToken[] };
    
  // Show tokens with price OR tokens explicitly recognized (e.g., prize tokens) in main list
  const mainTokens = groupedTokens.filter(token => {
    const hasUsd = (token.usdValueNumber ?? 0) >= HIDE_TOKEN_THRESHOLD;
    const looksLikePrize = /prize|pool|prz/i.test(token.symbol) || /Prize|PoolTogether/i.test(token.name ?? '');
    return hasUsd || looksLikePrize;
  });
    
  const hiddenTokens = groupedTokens.filter(token => {
    const hasUsd = (token.usdValueNumber ?? 0) < HIDE_TOKEN_THRESHOLD;
    const looksLikePrize = /prize|pool|prz/i.test(token.symbol) || /Prize|PoolTogether/i.test(token.name ?? '');
    return hasUsd && !looksLikePrize;
  });
    
    return { mainTokens, hiddenTokens };
  }, [groupedTokens]);

  return (
    <div className="w-full space-y-4">
      <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl p-6 text-white">
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
            <div className="grid grid-cols-3 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wide">
              <div>Asset</div>
              <div>Amount</div>
              <div>USD Value</div>
            </div>
            
            {/* Main Tokens */}
            {categorizedTokens.mainTokens.map((token, index) => (
              <Fragment key={`${token.contractAddress}-${token.network}-${index}`}>
                <div
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
                  {token.symbol === 'PoolTogether' ? (
                    <button
                      onClick={() => setShowPoolTogether((v) => !v)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {showPoolTogether ? 'Hide positions' : `View positions (${poolTokensList.length})`}
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

                {/* Inline expanded PoolTogether positions */}
                {token.symbol === 'PoolTogether' && showPoolTogether && poolTokensList.length > 0 && (
                  <div className="bg-white">
                    {poolTokensList.slice(0, 6).map((pt, idx) => (
                      <div
                        key={`pt-${pt.contractAddress}-${pt.network}-${idx}`}
                        className="grid grid-cols-3 gap-4 px-6 py-2 border-b border-gray-50 last:border-b-0"
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
                            <p className="text-[11px] text-gray-400 truncate">{pt.name ?? 'PoolTogether'}</p>
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

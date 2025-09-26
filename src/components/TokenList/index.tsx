'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { createPublicClient, formatUnits, http } from 'viem';
import { worldchain, mainnet } from 'viem/chains';

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
];

type PortfolioToken = {
  symbol: string;
  name: string;
  amount: string; // formatted human-readable
  usdValue?: string; // formatted USD if price available
};

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

  const { wcClient, ethClient } = useMemo(() => {
    const wcClient = createPublicClient({
      chain: worldchain,
      transport: http(
        process.env.NEXT_PUBLIC_WORLDCHAIN_RPC ||
          'https://worldchain-mainnet.g.alchemy.com/public',
      ),
    });
    const ethClient = createPublicClient({
      chain: mainnet,
      transport: http(
        process.env.NEXT_PUBLIC_ETHEREUM_RPC ||
          'https://cloudflare-eth.com',
      ),
    });
    return { wcClient, ethClient };
  }, []);

  useEffect(() => {
    const run = async () => {
      if (!walletAddress) return;
      setLoading(true);
      setError(null);
      try {
        const results: PortfolioToken[] = [];

        // 1) Native balance on World Chain
        try {
          const native = await wcClient.getBalance({ address: walletAddress });
          const nativeAmount = Number(formatUnits(native, 18));
          results.push({
            symbol: 'ETH',
            name: 'World Chain Native',
            amount: nativeAmount.toLocaleString(undefined, { maximumFractionDigits: 6 }),
          });
        } catch (e) {
          console.warn('Failed to fetch native WC balance', e);
        }

        // 2) WLD balance
        const wldUsd = await getWldUsdPrice();
        const envWld = process.env.NEXT_PUBLIC_WLD_TOKEN_ADDRESS as `0x${string}` | undefined;
        if (envWld) {
          // Use configured WLD on World Chain
          try {
            const [rawBalance, decimals, name, symbol] = await Promise.all([
              wcClient.readContract({ address: envWld, abi: ERC20_ABI, functionName: 'balanceOf', args: [walletAddress] }),
              wcClient.readContract({ address: envWld, abi: ERC20_ABI, functionName: 'decimals' }),
              wcClient.readContract({ address: envWld, abi: ERC20_ABI, functionName: 'name' }),
              wcClient.readContract({ address: envWld, abi: ERC20_ABI, functionName: 'symbol' }),
            ]);
            const amount = formatUnits(rawBalance as bigint, Number(decimals));
            const usd = wldUsd !== undefined ? `$${(Number(amount) * wldUsd).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : undefined;
            results.push({
              symbol: symbol as string,
              name: name as string,
              amount: Number(amount).toLocaleString(undefined, { maximumFractionDigits: 6 }),
              usdValue: usd,
            });
          } catch (e) {
            console.warn('Failed to fetch WLD on WC', e);
          }
        } else {
          // Default to Ethereum mainnet WLD contract
          const WLD_ETH_MAINNET = '0x163f8c2467924be0ae7b5347228cabf260318753' as `0x${string}`;
          try {
            const [rawBalance, decimals, name, symbol] = await Promise.all([
              ethClient.readContract({ address: WLD_ETH_MAINNET, abi: ERC20_ABI, functionName: 'balanceOf', args: [walletAddress] }),
              ethClient.readContract({ address: WLD_ETH_MAINNET, abi: ERC20_ABI, functionName: 'decimals' }),
              ethClient.readContract({ address: WLD_ETH_MAINNET, abi: ERC20_ABI, functionName: 'name' }),
              ethClient.readContract({ address: WLD_ETH_MAINNET, abi: ERC20_ABI, functionName: 'symbol' }),
            ]);
            const amount = formatUnits(rawBalance as bigint, Number(decimals));
            const usd = wldUsd !== undefined ? `$${(Number(amount) * wldUsd).toLocaleString(undefined, { maximumFractionDigits: 2 })}` : undefined;
            results.push({
              symbol: symbol as string,
              name: name as string,
              amount: Number(amount).toLocaleString(undefined, { maximumFractionDigits: 6 }),
              usdValue: usd,
            });
          } catch (e) {
            console.warn('Failed to fetch WLD on ETH mainnet', e);
          }
        }

        // 3) USDC on World Chain if configured
        const envUsdc = process.env.NEXT_PUBLIC_USDC_TOKEN_ADDRESS as `0x${string}` | undefined;
        if (envUsdc) {
          try {
            const [rawBalance, decimals, name, symbol] = await Promise.all([
              wcClient.readContract({ address: envUsdc, abi: ERC20_ABI, functionName: 'balanceOf', args: [walletAddress] }),
              wcClient.readContract({ address: envUsdc, abi: ERC20_ABI, functionName: 'decimals' }),
              wcClient.readContract({ address: envUsdc, abi: ERC20_ABI, functionName: 'name' }),
              wcClient.readContract({ address: envUsdc, abi: ERC20_ABI, functionName: 'symbol' }),
            ]);
            const amount = formatUnits(rawBalance as bigint, Number(decimals));
            const usd = `$${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
            results.push({
              symbol: symbol as string,
              name: name as string,
              amount: Number(amount).toLocaleString(undefined, { maximumFractionDigits: 6 }),
              usdValue: usd,
            });
          } catch (e) {
            console.warn('Failed to fetch USDC on WC', e);
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
  }, [walletAddress, wcClient, ethClient]);

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

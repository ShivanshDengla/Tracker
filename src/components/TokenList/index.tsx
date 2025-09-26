'use client';
import { useSession } from 'next-auth/react';

interface Token {
  symbol: string;
  name: string;
  amount: string;
  usdValue: string;
  icon?: string;
}

/**
 * TokenList component displays the user's token portfolio
 * Shows WLD and other tokens with their amounts and USD values
 */
export const TokenList = () => {
  const session = useSession();

  // Mock data for demonstration - in real app, this would come from blockchain API
  const mockTokens: Token[] = [
    {
      symbol: 'WLD',
      name: 'Worldcoin',
      amount: '1,250.50',
      usdValue: '$2,501.00',
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      amount: '500.00',
      usdValue: '$500.00',
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      amount: '0.5',
      usdValue: '$1,200.00',
    },
    {
      symbol: 'BTC',
      name: 'Bitcoin',
      amount: '0.01',
      usdValue: '$650.00',
    },
  ];

  const totalValue = mockTokens.reduce((sum, token) => {
    const value = parseFloat(token.usdValue.replace('$', '').replace(',', ''));
    return sum + value;
  }, 0);

  return (
    <div className="w-full space-y-4">
      {/* Portfolio Summary */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 text-white">
        <h2 className="text-lg font-semibold mb-2">Portfolio Value</h2>
        <p className="text-3xl font-bold">${totalValue.toLocaleString()}</p>
        <p className="text-sm opacity-90 mt-1">
          Connected to: {session?.data?.user?.username || 'Unknown User'}
        </p>
      </div>

      {/* Token List */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">Your Tokens</h3>
        {mockTokens.map((token, index) => (
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
              <p className="text-sm text-gray-500">{token.usdValue}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Add Token Button */}
      <button className="w-full p-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors">
        + Add Token
      </button>
    </div>
  );
};

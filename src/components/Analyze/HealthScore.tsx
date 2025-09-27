'use client';

import { useCallback } from 'react';
import { usePortfolioData } from '@/contexts/PortfolioDataContext';

export function HealthScore() {
  const { tokens, loading, error, availableWld, availableUsdc } = usePortfolioData();

  const openPoolTogether = useCallback(() => {
    const appId = 'app_85f4c411dc00aadabc96cce7b3a77219';
    const url = `https://world.org/mini-app?app_id=${encodeURIComponent(appId)}`;
    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  }, []);

  const openUno = useCallback(() => {
    const appId = 'app_a4f7f3e62c1de0b9490a5260cb390b56';
    const url = `https://world.org/mini-app?app_id=${encodeURIComponent(appId)}`;
    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  }, []);

  const openAddMoney = useCallback(() => {
    const appId = 'app_e7d27c5ce2234e00558776f227f791ef';
    const url = `https://world.org/mini-app?app_id=${encodeURIComponent(appId)}`;
    if (typeof window !== 'undefined') {
      window.location.href = url;
    }
  }, []);

  return (
    <div className="space-y-4">
      {/* Suggested Actions Header */}
      <div className="px-1">
        <h2 className="text-xl font-bold text-gray-800 mb-2">Suggested Actions</h2>
        <p className="text-sm text-gray-600">
          Optimize your portfolio with these recommended actions
        </p>
      </div>

      {tokens.length === 0 && !loading && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Connect a wallet on the Tracker tab to see suggestions.</p>
      )}
      {loading && <p className="text-sm text-zinc-600 dark:text-zinc-400">Analyzing portfolio…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {tokens && tokens.length > 0 && (
        <>
          {/* PoolTogether WLD Deposit */}
          {availableWld > 0 && (
            <section className="rounded-2xl border-2 border-purple-300 p-4 sm:p-5 bg-gradient-to-r from-purple-50 to-purple-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  <img 
                    src="https://app.cabana.fi/icons/przPOOL.svg" 
                    alt="POOL" 
                    className="w-6 h-6 object-cover"
                  />
                </div>
                <h3 className="text-lg font-semibold text-purple-800">PoolTogether Deposit</h3>
              </div>
              <p className="text-sm text-purple-700 mb-4">
                You have <span className="font-bold">{availableWld.toLocaleString(undefined, { maximumFractionDigits: 4 })} WLD</span> which can be deposited to PoolTogether to potentially save and win prizes!
              </p>
              <button
                type="button"
                onClick={openPoolTogether}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 text-white px-6 py-4 text-base font-semibold shadow-lg hover:bg-purple-700 transition-all duration-200 transform hover:scale-105 border-2 border-purple-700"
              >
                🎯 Deposit WLD in PoolTogether
              </button>
            </section>
          )}

          {/* UNO USDC to WLD Conversion */}
          {availableUsdc > 0 && (
            <section className="rounded-2xl border-2 border-blue-300 p-4 sm:p-5 bg-gradient-to-r from-blue-50 to-blue-100">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  <img 
                    src="/uno.png" 
                    alt="UNO" 
                    className="w-6 h-6 object-cover"
                  />
                </div>
                <h3 className="text-lg font-semibold text-blue-800">Convert USDC to WLD</h3>
              </div>
              <p className="text-sm text-blue-700 mb-4">
                You have <span className="font-bold">{availableUsdc.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC</span> which can be converted to WLD to use in apps using UNO!
              </p>
              <button
                type="button"
                onClick={openUno}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 text-white px-6 py-4 text-base font-semibold shadow-lg hover:bg-blue-700 transition-all duration-200 transform hover:scale-105 border-2 border-blue-700"
              >
                💱 Swap with UNO
              </button>
            </section>
          )}

          {/* Add Money */}
          <section className="rounded-2xl border-2 border-green-300 p-4 sm:p-5 bg-gradient-to-r from-green-50 to-green-100">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-green-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                <img 
                  src="/add-money.png" 
                  alt="Add Money" 
                  className="w-6 h-6 object-cover"
                />
              </div>
              <h3 className="text-lg font-semibold text-green-800">Add More WLD</h3>
            </div>
            <p className="text-sm text-green-700 mb-4">
              Add more money to your WLD wallet using Add Money to fund your World App wallet directly from exchanges!
            </p>
            <button
              type="button"
              onClick={openAddMoney}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 text-white px-6 py-4 text-base font-semibold shadow-lg hover:bg-green-700 transition-all duration-200 transform hover:scale-105 border-2 border-green-700"
            >
              💰 Add Money to Wallet
            </button>
          </section>
        </>
      )}
    </div>
  );
}



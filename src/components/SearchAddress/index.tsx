'use client';
import { useEffect, useMemo, useState } from 'react';
import { Wallet } from 'iconoir-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePortfolioData } from '@/contexts/PortfolioDataContext';

const useDebounce = <T,>(value: T, delay: number) => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debounced;
};

/**
 * SearchAddress component provides a search box for entering wallet addresses
 * Currently a dummy implementation for portfolio tracking
 */
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export const SearchAddress = () => {
  const router = useRouter();
  const params = useSearchParams();
  const initialAddress = params.get('address') || '';
  const [searchValue, setSearchValue] = useState(initialAddress);
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isAddressChanging, setIsAddressChanging] = useState(false);
  const [selectedHistoryAddress, setSelectedHistoryAddress] = useState<string | null>(null);
  const [isFromHistory, setIsFromHistory] = useState(false);
  // removed isEditing mode; keep input simple and always editable
  
  const { loading } = usePortfolioData();

  const debouncedValue = useDebounce(searchValue, 400);

  const isValidAddress = useMemo(() => {
    if (!searchValue) return false;
    return ADDRESS_REGEX.test(searchValue.trim());
  }, [searchValue]);

  useEffect(() => {
    setSearchValue(initialAddress);
    setSelectedHistoryAddress(null); // Reset selection when URL changes
    setIsFromHistory(false); // Reset history flag when URL changes
  }, [initialAddress]);

  useEffect(() => {
    if (!debouncedValue || !isValidAddress || isFromHistory) return;
    
    // Check if the address is different from current URL address
    const currentAddress = params.get('address');
    if (currentAddress !== debouncedValue.trim()) {
      setIsAddressChanging(true);
    }
    
    const next = new URLSearchParams(params.toString());
    next.set('address', debouncedValue);
    router.push(`?${next.toString()}`);
    // persist to history
    try {
      const key = 'tracker_address_history';
      const current: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      const addr = debouncedValue.trim();
      if (ADDRESS_REGEX.test(addr)) {
        const updated = [addr, ...current.filter(a => a.toLowerCase() !== addr.toLowerCase())].slice(0, 10);
        localStorage.setItem(key, JSON.stringify(updated));
        setHistory(updated);
      }
    } catch {}
  }, [debouncedValue, router, params, isValidAddress, isFromHistory]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidAddress) return;
    
    // Check if the address is different from current URL address
    const currentAddress = params.get('address');
    if (currentAddress !== searchValue.trim()) {
      setIsAddressChanging(true);
    }
    
    const next = new URLSearchParams(params.toString());
    next.set('address', searchValue);
    router.push(`?${next.toString()}`);
  };

  // load history on mount
  useEffect(() => {
    try {
      const key = 'tracker_address_history';
      const current: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      setHistory(current);
    } catch {}
  }, []);

  // Reset loading state when portfolio data finishes loading
  useEffect(() => {
    if (!loading && isAddressChanging) {
      setIsAddressChanging(false);
      setSelectedHistoryAddress(null);
      setIsFromHistory(false);
    }
  }, [loading, isAddressChanging]);

  const handlePickHistory = (addr: string) => {
    // Immediate visual feedback
    setSelectedHistoryAddress(addr);
    setSearchValue(addr);
    setIsFromHistory(true); // Mark as coming from history to prevent debounced effect
    
    // Check if the address is different from current URL address
    const currentAddress = params.get('address');
    if (currentAddress !== addr) {
      setIsAddressChanging(true);
    }
    
    // Immediately trigger search without waiting for debounce
    const next = new URLSearchParams(params.toString());
    next.set('address', addr);
    router.push(`?${next.toString()}`);
    setShowHistory(false);
    
    // Also update history immediately
    try {
      const key = 'tracker_address_history';
      const current: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      const updated = [addr, ...current.filter(a => a.toLowerCase() !== addr.toLowerCase())].slice(0, 10);
      localStorage.setItem(key, JSON.stringify(updated));
      setHistory(updated);
    } catch {}
  };

  const handleDeleteHistory = (addr: string) => {
    try {
      const key = 'tracker_address_history';
      const updated = history.filter(a => a.toLowerCase() !== addr.toLowerCase());
      localStorage.setItem(key, JSON.stringify(updated));
      setHistory(updated);
    } catch {}
  };


  const shorten = (addr: string, n = 4) => {
    if (!addr) return '';
    return `${addr.slice(0, n + 2)}…${addr.slice(-n)}`;
  };

  return (
    <div className="w-full">
      <div className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4" onFocus={() => setShowHistory(true)} onBlur={(e) => {
        // Don't hide history if clicking on history items
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setTimeout(() => setShowHistory(false), 150);
        }
      }}>
        <label htmlFor="address" className="block text-xs font-semibold text-gray-600 mb-2">
          Wallet address
        </label>
        <div className="flex items-center gap-3 rounded-xl border border-blue-500 bg-white px-3 py-2 focus-within:border-blue-600 transition-all">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-600 flex-shrink-0">
            <Wallet width={20} height={20} />
          </div>
          <input
            id="address"
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value.replace(/\s/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isValidAddress) {
                handleSearch(e);
              }
            }}
            placeholder="Enter address to search"
            className="flex-1 border-none bg-transparent text-sm font-medium text-gray-800 placeholder:text-gray-400 focus:outline-none min-w-0"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>
        <div className="mt-1 min-h-[1rem]">
          {!isValidAddress && searchValue ? (
            <p className="text-xs text-red-500">Enter a valid EVM address.</p>
          ) : selectedHistoryAddress ? (
            <p className="text-xs text-green-600 flex items-center gap-1">
              <div className="w-3 h-3 border-2 border-green-600 border-t-transparent rounded-full animate-spin"></div>
              Switching to {shorten(selectedHistoryAddress)}...
            </p>
          ) : (isAddressChanging && loading) ? (
            <p className="text-xs text-blue-600 flex items-center gap-1">
              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              Fetching portfolio data...
            </p>
          ) : null}
        </div>
      </div>
      {showHistory && history.length > 0 && (
        <div className="mt-3 bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-50 border-b border-gray-200">
            Recent addresses
          </div>
          <ul className="max-h-48 overflow-auto divide-y divide-gray-100">
            {history.map((addr) => (
              <li key={addr} className={`flex items-center justify-between px-4 py-2 transition-colors ${
                selectedHistoryAddress === addr 
                  ? 'bg-blue-50 border-l-4 border-blue-500' 
                  : 'hover:bg-gray-50'
              }`}>
                <button
                  type="button"
                  className={`text-xs font-mono text-left mr-2 transition-colors ${
                    selectedHistoryAddress === addr 
                      ? 'text-blue-800 font-semibold' 
                      : 'text-blue-700 hover:text-blue-900'
                  }`}
                  onClick={() => handlePickHistory(addr)}
                  title={addr}
                  disabled={selectedHistoryAddress === addr}
                >
                  {shorten(addr)}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteHistory(addr)}
                  className="text-xs text-red-600 hover:underline bg-red-50 px-2 py-1 rounded transition-colors hover:bg-red-100"
                  disabled={selectedHistoryAddress === addr}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

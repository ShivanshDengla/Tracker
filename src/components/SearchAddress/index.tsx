'use client';
import { useEffect, useMemo, useState } from 'react';
import { Copy, Wallet } from 'iconoir-react';
import { useRouter, useSearchParams } from 'next/navigation';

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
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  // removed isEditing mode; keep input simple and always editable

  const debouncedValue = useDebounce(searchValue, 400);

  const isValidAddress = useMemo(() => {
    if (!searchValue) return false;
    return ADDRESS_REGEX.test(searchValue.trim());
  }, [searchValue]);

  useEffect(() => {
    setSearchValue(initialAddress);
  }, [initialAddress]);

  useEffect(() => {
    if (!debouncedValue || !isValidAddress) return;
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
  }, [debouncedValue, router, params, isValidAddress]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidAddress) return;
    const next = new URLSearchParams(params.toString());
    next.set('address', searchValue);
    router.push(`?${next.toString()}`);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setSearchValue(text.trim());
    } catch (error) {
      console.error('Failed to read from clipboard', error);
    }
  };

  const handleClear = () => {
    setSearchValue('');
  };

  // load history on mount
  useEffect(() => {
    try {
      const key = 'tracker_address_history';
      const current: string[] = JSON.parse(localStorage.getItem(key) || '[]');
      setHistory(current);
    } catch {}
  }, []);

  const handlePickHistory = (addr: string) => {
    setSearchValue(addr);
    const next = new URLSearchParams(params.toString());
    next.set('address', addr);
    router.push(`?${next.toString()}`);
    setShowHistory(false);
  };

  const handleDeleteHistory = (addr: string) => {
    try {
      const key = 'tracker_address_history';
      const updated = history.filter(a => a.toLowerCase() !== addr.toLowerCase());
      localStorage.setItem(key, JSON.stringify(updated));
      setHistory(updated);
    } catch {}
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(searchValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy address', error);
    }
  };

  const shorten = (addr: string, n = 4) => {
    if (!addr) return '';
    return `${addr.slice(0, n + 2)}…${addr.slice(-n)}`;
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSearch} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4" onFocus={() => setShowHistory(true)} onBlur={() => setTimeout(() => setShowHistory(false), 120)}>
        <label htmlFor="address" className="block text-xs font-semibold text-gray-600 mb-2">
          Wallet address
        </label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-3 rounded-xl border border-blue-500 bg-white px-3 py-2 focus-within:border-blue-600 transition-all">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <Wallet width={20} height={20} />
            </div>
            <input
              id="address"
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value.replace(/\s/g, ''))}
              placeholder="Enter or paste any EVM address"
              className="flex-1 border-none bg-transparent text-sm font-medium text-gray-800 placeholder:text-gray-400 focus:outline-none"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {searchValue ? (
              <button
                type="button"
                onClick={handleClear}
                className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors shadow-sm"
              >
                Clear
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePaste}
                className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors shadow-sm"
              >
                Paste
              </button>
            )}
            {searchValue && (
              <button
                type="button"
                onClick={handleCopy}
                title="Copy address"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-blue-200 hover:text-blue-500 transition-colors"
              >
                <Copy width={18} height={18} />
              </button>
            )}
            <button
              type="submit"
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 shadow-sm disabled:cursor-not-allowed disabled:bg-blue-200"
              disabled={!isValidAddress}
            >
              Search
            </button>
          </div>
        </div>
        <div className="mt-1 min-h-[1rem]">
          {!isValidAddress && searchValue ? (
            <p className="text-xs text-red-500">Enter a valid EVM address.</p>
          ) : copied && searchValue ? (
            <p className="text-xs text-green-600">Address copied to clipboard!</p>
          ) : null}
        </div>
      </form>
      {showHistory && history.length > 0 && (
        <div className="mt-3 bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-2 text-xs font-semibold text-gray-600 bg-gray-50 border-b border-gray-200">
            Recent addresses
          </div>
          <ul className="max-h-48 overflow-auto divide-y divide-gray-100">
            {history.map((addr) => (
              <li key={addr} className="flex items-center justify-between px-4 py-2 hover:bg-gray-50">
                <button
                  type="button"
                  className="text-xs font-mono text-blue-700 text-left mr-2"
                  onClick={() => handlePickHistory(addr)}
                  title={addr}
                >
                  {shorten(addr)}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteHistory(addr)}
                  className="text-xs text-red-600 hover:underline bg-red-50 px-2 py-1 rounded"
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

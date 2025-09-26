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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(searchValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy address', error);
    }
  };

  // no masked display; show full value to avoid confusion

  return (
    <div className="w-full">
      <form onSubmit={handleSearch} className="bg-white border border-gray-200 shadow-sm rounded-2xl p-4">
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
              placeholder="Enter or paste any EVM address (0x...)"
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
                className="rounded-lg bg-red-100 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-200 transition-colors shadow-sm"
              >
                Clear
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePaste}
                className="rounded-lg bg-blue-100 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-200 transition-colors shadow-sm"
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
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 shadow-sm disabled:cursor-not-allowed disabled:bg-blue-200"
              disabled={!isValidAddress}
            >
              Search
            </button>
          </div>
        </div>
        <div className="mt-2 min-h-[1.25rem]">
          {!isValidAddress && searchValue ? (
            <p className="text-xs text-red-500">Enter a valid EVM address.</p>
          ) : copied && searchValue ? (
            <p className="text-xs text-green-600">Address copied to clipboard!</p>
          ) : null}
        </div>
      </form>
    </div>
  );
};

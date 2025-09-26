'use client';
import { useEffect, useMemo, useState } from 'react';
import { Copy, Search, Wallet } from 'iconoir-react';
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
  const [isEditing, setIsEditing] = useState(false);

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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(searchValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy address', error);
    }
  };

  const displayValue = useMemo(() => {
    if (!searchValue) return '';
    if (!isValidAddress) return searchValue;
    return `${searchValue.slice(0, 6)}…${searchValue.slice(-4)}`;
  }, [isValidAddress, searchValue]);

  return (
    <div className="w-full">
      <form
        onSubmit={handleSearch}
        className="flex flex-col gap-3 sm:flex-row sm:items-center bg-white border border-gray-200 shadow-sm rounded-2xl p-3 sm:p-4"
      >
        <div className="flex flex-1 items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 focus-within:border-blue-500 focus-within:bg-white transition-all">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <Wallet width={22} height={22} />
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width={18} height={18} />
            <input
              type="text"
              value={isEditing ? searchValue : displayValue}
              onFocus={() => setIsEditing(true)}
              onBlur={() => setIsEditing(false)}
              onChange={(e) => {
                const value = e.target.value.replace(/\s/g, '');
                setSearchValue(value);
              }}
              placeholder="Enter or paste any wallet address"
              className="w-full border-none bg-transparent pl-9 pr-20 text-base font-medium text-gray-800 placeholder:text-gray-400 focus:outline-none"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              readOnly={!isEditing}
            />
            <div className="absolute inset-y-0 right-0 flex items-center gap-2 pr-2">
              <button
                type="button"
                onClick={handlePaste}
                className="rounded-lg border border-blue-200 bg-white px-3 py-1 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors shadow-sm"
              >
                Paste
              </button>
              {searchValue && (
                <button
                  type="button"
                  onClick={handleCopy}
                  title="Copy address"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:border-blue-200 hover:text-blue-500 transition-colors"
                >
                  <Copy width={18} height={18} />
                </button>
              )}
            </div>
          </div>
        </div>
        <button
          type="submit"
          className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-700 shadow-sm disabled:cursor-not-allowed disabled:bg-blue-200"
          disabled={!isValidAddress}
        >
          Search
        </button>
      </form>
      {!isValidAddress && searchValue && (
        <p className="mt-2 text-sm text-red-500">Enter a valid EVM address.</p>
      )}
      {copied && searchValue && (
        <p className="mt-2 text-sm text-green-600">Address copied to clipboard!</p>
      )}
    </div>
  );
};

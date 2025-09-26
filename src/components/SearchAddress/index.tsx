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
        <div className="flex flex-1 items-center gap-3 rounded-xl border border-blue-500 bg-white px-3 py-2 focus-within:border-blue-500 focus-within:bg-white transition-all">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <Wallet width={22} height={22} />
          </div>
          <div className="relative flex-1">
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
              className="w-full border-none bg-transparent pl-3 pr-20 text-sm font-medium text-gray-800 placeholder:text-gray-400 focus:outline-none"
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              readOnly={!isEditing}
            />
            <div className="absolute inset-y-0 right-0 flex items-center gap-2 pr-2">
              {searchValue ? (
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded-lg bg-red-100 px-3 py-1 text-sm font-medium text-red-700 hover:bg-red-200 transition-colors shadow-sm"
                >
                  Clear
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePaste}
                  className="rounded-lg bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-200 transition-colors shadow-sm"
                >
                  Paste
                </button>
              )}
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
        <div className="flex items-center gap-2">
          {searchValue && (
            <button
              type="button"
              onClick={handlePaste}
              className="rounded-lg bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-200 transition-colors shadow-sm"
            >
              Paste
            </button>
          )}
          <button
            type="submit"
            className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-700 shadow-sm disabled:cursor-not-allowed disabled:bg-blue-200"
            disabled={!isValidAddress}
          >
            Search
          </button>
        </div>
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

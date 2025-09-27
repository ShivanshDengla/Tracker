'use client';
import { useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export const SelectedWallet = () => {
  const { data } = useSession();
  const params = useSearchParams();
  const router = useRouter();

  const activeAddress = useMemo(() => {
    const q = params.get('address');
    if (q && ADDRESS_REGEX.test(q)) return q as `0x${string}`;
    return (data?.user?.walletAddress as `0x${string}` | undefined) ?? undefined;
  }, [params, data]);

  const isMyWallet = useMemo(() => {
    const myAddr = data?.user?.walletAddress as `0x${string}` | undefined;
    return myAddr && activeAddress && myAddr.toLowerCase() === activeAddress.toLowerCase();
  }, [activeAddress, data]);

  const shorten = (addr?: string, n = 4) => {
    if (!addr) return '—';
    return `${addr.slice(0, n + 2)}…${addr.slice(-n)}`;
  };

  const handleMyWallet = () => {
    const next = new URLSearchParams(params.toString());
    const my = data?.user?.walletAddress as `0x${string}` | undefined;
    if (my) {
      next.set('address', my);
    } else {
      next.delete('address');
    }
    router.push(`?${next.toString()}`);
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2 flex items-center justify-between">
      <div className="min-w-0">
        <div className="text-xs text-zinc-500">Viewing wallet</div>
        <div className="text-sm font-mono text-zinc-800 truncate max-w-[240px]">
          {shorten(activeAddress)}
        </div>
      </div>
      <button
        type="button"
        onClick={handleMyWallet}
        className="text-xs px-2 py-1 rounded-md border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 bg-blue-50"
        disabled={isMyWallet}
        title={isMyWallet ? 'Already showing your wallet' : 'Switch to my wallet'}
      >
        Switch to My Wallet
      </button>
    </div>
  );
};

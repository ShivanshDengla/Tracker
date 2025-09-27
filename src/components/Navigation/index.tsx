'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { HomeSimpleDoor, GraphUp } from 'iconoir-react';
import { clsx } from 'clsx';

export const Navigation = () => {
  const pathname = usePathname();
  const params = useSearchParams();

  const isTracker = pathname === '/' || pathname?.startsWith('/home');
  const isAnalyze = pathname?.startsWith('/analyze');

  return (
    <nav
      className="w-full bg-transparent"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 8px)' }}
      aria-label="Bottom navigation"
    >
      <div className="mx-auto max-w-screen-sm grid grid-cols-2 gap-1 py-3 px-4">
        <Link
          href={{ pathname: '/home', query: params?.toString() ? Object.fromEntries(params!.entries()) : undefined }}
          className={clsx(
            'flex flex-col items-center justify-center gap-1 rounded-lg py-2 px-3 transition-all duration-200',
            isTracker ? 'text-white font-semibold bg-green-600 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
          )}
          aria-current={isTracker ? 'page' : undefined}
        >
          <HomeSimpleDoor
            width={24}
            height={24}
            className={clsx(
              'stroke-current',
              isTracker ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'
            )}
          />
          <span className="text-xs font-medium">Tracker</span>
        </Link>

        <Link
          href={{ pathname: '/analyze', query: params?.toString() ? Object.fromEntries(params!.entries()) : undefined }}
          className={clsx(
            'flex flex-col items-center justify-center gap-1 rounded-lg py-2 px-3 transition-all duration-200',
            isAnalyze ? 'text-white font-semibold bg-red-600 shadow-sm' : 'text-zinc-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
          )}
          aria-current={isAnalyze ? 'page' : undefined}
        >
          <GraphUp
            width={24}
            height={24}
            className={clsx(
              'stroke-current',
              isAnalyze ? 'text-white' : 'text-zinc-500 dark:text-zinc-400'
            )}
          />
          <span className="text-xs font-medium">Analyze</span>
        </Link>
      </div>
    </nav>
  );
};

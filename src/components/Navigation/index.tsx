'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HomeSimpleDoor, GraphUp } from 'iconoir-react';
import { clsx } from 'clsx';

export const Navigation = () => {
  const pathname = usePathname();

  const isTracker = pathname === '/' || pathname?.startsWith('/home');
  const isAnalyze = pathname?.startsWith('/analyze');

  return (
    <nav
      className="w-full border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 6px)' }}
    >
      <div className="mx-auto max-w-screen-sm grid grid-cols-2 gap-1 py-2 px-4">
        <Link
          href="/home"
          className={clsx(
            'flex flex-col items-center justify-center gap-1 rounded-md py-2',
            isTracker ? 'text-black dark:text-white font-semibold' : 'text-zinc-500 dark:text-zinc-400'
          )}
          aria-current={isTracker ? 'page' : undefined}
        >
          <HomeSimpleDoor
            width={24}
            height={24}
            className={clsx(isTracker ? 'stroke-current' : 'stroke-current')}
          />
          <span className="text-xs">Tracker</span>
        </Link>

        <Link
          href="/analyze"
          className={clsx(
            'flex flex-col items-center justify-center gap-1 rounded-md py-2',
            isAnalyze ? 'text-black dark:text-white font-semibold' : 'text-zinc-500 dark:text-zinc-400'
          )}
          aria-current={isAnalyze ? 'page' : undefined}
        >
          <GraphUp
            width={24}
            height={24}
            className={clsx(isAnalyze ? 'stroke-current' : 'stroke-current')}
          />
          <span className="text-xs">Analyze</span>
        </Link>
      </div>
    </nav>
  );
};

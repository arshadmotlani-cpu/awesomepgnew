'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/src/capital/lib/utils';

/** URL toggle: ?includeSold=1 — default OFF */
export function IncludeSoldToggle({ className }: { className?: string }) {
  const params = useSearchParams();
  const includeSold = params.get('includeSold') === '1';

  const href = (() => {
    const next = new URLSearchParams(params.toString());
    if (includeSold) next.delete('includeSold');
    else next.set('includeSold', '1');
    const q = next.toString();
    return q ? `?${q}` : '?';
  })();

  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-ac-text-secondary transition hover:border-white/20 hover:text-ac-text',
        className,
      )}
    >
      <span
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded border text-[10px]',
          includeSold
            ? 'border-ac-accent bg-ac-accent/20 text-ac-accent'
            : 'border-white/20',
        )}
        aria-hidden
      >
        {includeSold ? '✓' : ''}
      </span>
      Include Sold Vehicles
    </Link>
  );
}

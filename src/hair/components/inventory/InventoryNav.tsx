'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/src/hair/lib/utils';

const TABS = [
  { href: '/inventory/stock', label: 'Stock' },
  { href: '/inventory/on-floor', label: 'On Floor' },
  { href: '/inventory/movements', label: 'Movements' },
] as const;

export function InventoryNav() {
  const pathname = usePathname();

  return (
    <nav className="fyh-glass -mx-1 overflow-x-auto p-1" aria-label="Inventory sections">
      <div className="flex min-w-max gap-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'rounded-lg px-3 py-2 text-xs font-medium uppercase tracking-wide transition-colors',
                active
                  ? 'bg-fyh-forest/25 text-fyh-accent'
                  : 'text-fyh-text-muted hover:bg-white/5 hover:text-fyh-text',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

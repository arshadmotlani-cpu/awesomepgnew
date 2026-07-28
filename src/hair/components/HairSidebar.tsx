'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserRound } from 'lucide-react';
import { visibleHairNavItems } from '@/src/hair/lib/nav';
import { cn } from '@/src/hair/lib/utils';

export function HairSidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const navItems = visibleHairNavItems();

  return (
    <aside
      className={cn(
        'hidden w-64 shrink-0 border-r border-[color:var(--fyh-border)] bg-fyh-elevated/80 backdrop-blur-xl md:flex md:flex-col',
        className,
      )}
    >
      <div className="flex h-16 items-center gap-3 border-b border-[color:var(--fyh-border)] px-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-fyh-accent/40 bg-fyh-forest/30 text-fyh-accent">
          <UserRound className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="fyh-display truncate text-base font-semibold tracking-tight">For Your Hair</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-fyh-text-muted">
            Luxury Salon ERP
          </p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                active
                  ? 'bg-fyh-forest/25 text-fyh-accent'
                  : 'text-fyh-text-secondary hover:bg-white/5 hover:text-fyh-text',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[color:var(--fyh-border)] p-3">
        <Link
          href="/profile"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-fyh-text-secondary hover:bg-white/5 hover:text-fyh-text"
        >
          <UserRound className="h-4 w-4" />
          Profile
        </Link>
      </div>
    </aside>
  );
}

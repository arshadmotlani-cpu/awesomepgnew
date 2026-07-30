'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, UserRound } from 'lucide-react';
import { useState } from 'react';
import { FyhSidebarBrand } from '@/src/components/brand/fyh/FyhSidebarBrand';
import { visibleHairNavEntries, type HairNavGroup, type HairNavLink } from '@/src/hair/lib/nav';
import { cn } from '@/src/hair/lib/utils';

function NavLink({ item }: { item: HairNavLink }) {
  const pathname = usePathname();
  const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.8125rem] transition-colors',
        active
          ? 'bg-fyh-forest/25 text-fyh-accent'
          : 'text-fyh-text-secondary hover:bg-white/5 hover:text-fyh-text',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
    </Link>
  );
}

function NavGroup({ group }: { group: HairNavGroup }) {
  const pathname = usePathname();
  const childActive = group.children.some(
    (c) => pathname === c.href || pathname.startsWith(`${c.href}/`),
  );
  const [open, setOpen] = useState(group.defaultExpanded ?? childActive);
  const Icon = group.icon;

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.8125rem] transition-colors',
          childActive
            ? 'text-fyh-accent'
            : 'text-fyh-text-secondary hover:bg-white/5 hover:text-fyh-text',
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="ml-3 space-y-0.5 border-l border-[color:var(--fyh-border)] pl-2">
          {group.children.map((c) => {
            const active = pathname === c.href;
            return (
              <Link
                key={c.href}
                href={c.href}
                className={cn(
                  'block rounded-lg px-2 py-1.5 text-xs transition-colors',
                  active
                    ? 'bg-fyh-forest/20 text-fyh-accent'
                    : 'text-fyh-text-muted hover:text-fyh-text',
                )}
              >
                {c.label}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function HairSidebar({
  entries,
  className,
}: {
  entries?: ReturnType<typeof visibleHairNavEntries>;
  className?: string;
}) {
  const navEntries = entries ?? visibleHairNavEntries();

  return (
    <aside
      className={cn(
        'hidden w-64 shrink-0 border-r border-[color:var(--fyh-border-strong)] bg-fyh-elevated/95 backdrop-blur-xl md:flex md:flex-col',
        className,
      )}
    >
      <FyhSidebarBrand />
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navEntries.map((entry) =>
          entry.type === 'link' ? (
            <NavLink key={entry.href} item={entry} />
          ) : (
            <NavGroup key={entry.id} group={entry} />
          ),
        )}
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

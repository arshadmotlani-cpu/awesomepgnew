'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Car, FileBarChart, LayoutDashboard, Settings } from 'lucide-react';
import { CapitalOsLogoLockup } from '@/src/components/brand/capital-os/CapitalOsLogoLockup';
import { cn } from '@/src/capital/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/assets', label: 'Vehicles', icon: Car },
  { href: '/reports', label: 'Reports', icon: FileBarChart },
  { href: '/settings', label: 'Settings', icon: Settings },
] as const;

export function CapitalSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-white/8 bg-ac-elevated/80 backdrop-blur-xl md:flex md:flex-col">
      <div className="flex h-14 items-center border-b border-white/8 px-4">
        <CapitalOsLogoLockup markSize={32} />
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-ac-accent/10 text-ac-accent'
                  : 'text-ac-text-secondary hover:bg-white/5 hover:text-ac-text',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

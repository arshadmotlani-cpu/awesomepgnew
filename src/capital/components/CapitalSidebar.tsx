'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Banknote,
  BookOpen,
  Car,
  FileBarChart,
  FileText,
  History,
  LayoutDashboard,
  LineChart,
  Receipt,
  Search,
  Settings,
  TrendingUp,
} from 'lucide-react';
import { CapitalBrandLogo } from '@/src/capital/components/CapitalBrandLogo';
import { cn } from '@/src/capital/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/assets', label: 'Assets', icon: Car },
  { href: '/expenses', label: 'Expenses', icon: Receipt },
  { href: '/payments', label: 'Payments', icon: Banknote },
  { href: '/capital', label: 'Capital', icon: TrendingUp },
  { href: '/ledger', label: 'Ledger', icon: BookOpen },
  { href: '/documents', label: 'Documents', icon: FileText },
  { href: '/reports', label: 'Reports', icon: FileBarChart },
  { href: '/analytics', label: 'Analytics', icon: LineChart },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/activity', label: 'Activity', icon: History },
  { href: '/search', label: 'Search', icon: Search },
] as const;

export function CapitalSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-white/8 bg-ac-elevated/80 backdrop-blur-xl md:flex md:flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-white/8 px-4">
        <CapitalBrandLogo size={32} className="shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">Automotive Capital</p>
          <p className="text-[10px] text-ac-text-muted">Investment OS</p>
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

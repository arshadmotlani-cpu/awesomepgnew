import type { LucideIcon } from 'lucide-react';
import {
  Banknote,
  Building2,
  ChartLine,
  CreditCard,
  LayoutDashboard,
  Link2,
  PieChart,
  Receipt,
  Settings,
  TrendingUp,
  Wallet,
} from 'lucide-react';

export type OwnerNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type OwnerNavGroup = {
  id: string;
  title: string;
  items: OwnerNavItem[];
};

export const ownerNavGroups: OwnerNavGroup[] = [
  {
    id: 'overview',
    title: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/net-worth', label: 'Net Worth', icon: PieChart },
    ],
  },
  {
    id: 'wealth',
    title: 'Wealth',
    items: [
      { href: '/assets', label: 'Assets', icon: Building2 },
      { href: '/liabilities', label: 'Liabilities', icon: CreditCard },
      { href: '/accounts', label: 'Accounts', icon: Wallet },
      { href: '/investments', label: 'Investments', icon: TrendingUp },
    ],
  },
  {
    id: 'cashflow',
    title: 'Cash flow',
    items: [
      { href: '/cashflow', label: 'Cashflow', icon: Banknote },
      { href: '/expenses', label: 'Expenses', icon: Receipt },
    ],
  },
  {
    id: 'analysis',
    title: 'Analysis',
    items: [
      { href: '/wealth', label: 'Wealth metrics', icon: ChartLine },
      { href: '/integrations', label: 'Integrations', icon: Link2 },
    ],
  },
  {
    id: 'system',
    title: 'System',
    items: [{ href: '/settings', label: 'Settings', icon: Settings }],
  },
];

/** Flat list for route matching and legacy consumers. */
export const ownerNavItems = ownerNavGroups.flatMap((g) => g.items);

export function ownerSectionLabelForPath(pathname: string): string {
  const normalized = pathname.replace(/\/$/, '') || '/dashboard';
  const exact = ownerNavItems.find((i) => i.href === normalized);
  if (exact) return exact.label;

  const prefix = ownerNavItems.find(
    (i) => i.href !== '/dashboard' && normalized.startsWith(i.href),
  );
  return prefix?.label ?? 'Owner OS';
}

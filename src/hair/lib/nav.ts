import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  ClipboardList,
  Heart,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingBag,
  Sparkles,
  Users,
  Warehouse,
} from 'lucide-react';

export type HairNavLink = {
  type: 'link';
  href: string;
  label: string;
  icon: LucideIcon;
  hidden?: boolean;
};

export type HairNavGroup = {
  type: 'group';
  id: string;
  label: string;
  icon: LucideIcon;
  defaultExpanded?: boolean;
  children: Array<{ href: string; label: string }>;
};

export type HairNavEntry = HairNavLink | HairNavGroup;

export const HAIR_NAV_ENTRIES: HairNavEntry[] = [
  { type: 'link', href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { type: 'link', href: '/customers', label: 'Customers', icon: Users },
  { type: 'link', href: '/appointments', label: 'Appointments', icon: CalendarDays },
  { type: 'link', href: '/billing', label: 'Billing', icon: Receipt },
  { type: 'link', href: '/quick-sale', label: 'Quick Sale', icon: Receipt, hidden: true },
  { type: 'link', href: '/services', label: 'Services', icon: Sparkles },
  { type: 'link', href: '/products', label: 'Products', icon: ShoppingBag },
  { type: 'link', href: '/staff', label: 'Staff', icon: ClipboardList },
  { type: 'link', href: '/inventory', label: 'Inventory', icon: Warehouse },
  { type: 'link', href: '/loyalty', label: 'Loyalty', icon: Heart },
  {
    type: 'group',
    id: 'reports',
    label: 'Reports',
    icon: Package,
    defaultExpanded: false,
    children: [
      { href: '/reports', label: 'Overview' },
      { href: '/reports/revenue/daily', label: 'Revenue · Daily' },
      { href: '/reports/revenue/monthly', label: 'Revenue · Monthly' },
      { href: '/reports/revenue/yearly', label: 'Revenue · Yearly' },
      { href: '/reports/staff/service', label: 'Staff · Service revenue' },
      { href: '/reports/staff/product', label: 'Staff · Product revenue' },
      { href: '/reports/staff/package', label: 'Staff · Package revenue' },
      { href: '/reports/staff/membership', label: 'Staff · Membership revenue' },
      { href: '/reports/inventory/products', label: 'Inventory · Products' },
      { href: '/reports/inventory/stock', label: 'Inventory · Stock movement' },
      { href: '/reports/inventory/low-stock', label: 'Inventory · Low stock' },
      { href: '/reports/customers/loyalty', label: 'Customers · Loyalty' },
      { href: '/reports/customers/memberships', label: 'Customers · Memberships' },
      { href: '/reports/customers/packages', label: 'Customers · Packages' },
      { href: '/reports/finance/gst', label: 'Finance · GST' },
      { href: '/reports/finance/payments', label: 'Finance · Payments' },
      { href: '/reports/finance/discounts', label: 'Finance · Discounts' },
    ],
  },
  { type: 'link', href: '/settings', label: 'Settings', icon: Settings },
];

/** @deprecated use HAIR_NAV_ENTRIES */
export const HAIR_NAV_ITEMS = HAIR_NAV_ENTRIES.filter(
  (e): e is HairNavLink => e.type === 'link',
);

export function visibleHairNavEntries(): HairNavEntry[] {
  return HAIR_NAV_ENTRIES.filter((e) => e.type !== 'link' || !e.hidden);
}

export function visibleHairNavItems(): HairNavLink[] {
  return HAIR_NAV_ENTRIES.filter(
    (e): e is HairNavLink => e.type === 'link' && !e.hidden,
  );
}

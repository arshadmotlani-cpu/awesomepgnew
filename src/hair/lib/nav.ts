import {
  hasPermission,
  type HairPagePermission,
  type PermissionAdmin,
} from '@/src/hair/lib/auth/permissionTypes';
export type HairNavIconKey =
  | 'layout-dashboard'
  | 'users'
  | 'calendar-days'
  | 'receipt'
  | 'sparkles'
  | 'shopping-bag'
  | 'clipboard-list'
  | 'warehouse'
  | 'heart'
  | 'package'
  | 'sliders-horizontal'
  | 'settings';

export type HairNavLink = {
  type: 'link';
  href: string;
  label: string;
  iconKey: HairNavIconKey;
  hidden?: boolean;
  permission?: HairPagePermission;
};

export type HairNavGroup = {
  type: 'group';
  id: string;
  label: string;
  iconKey: HairNavIconKey;
  defaultExpanded?: boolean;
  permission?: HairPagePermission;
  children: Array<{ href: string; label: string }>;
};

export type HairNavEntry = HairNavLink | HairNavGroup;

export const HAIR_NAV_ENTRIES: HairNavEntry[] = [
  {
    type: 'group',
    id: 'dashboard',
    label: 'Dashboard',
    iconKey: 'layout-dashboard',
    defaultExpanded: true,
    permission: 'page:dashboard',
    children: [
      { href: '/dashboard/revenue', label: 'Revenue Dashboard' },
      { href: '/dashboard/staff-performance', label: 'Staff Performance' },
    ],
  },
  {
    type: 'link',
    href: '/customers',
    label: 'Customers',
    iconKey: 'users',
    permission: 'page:customers',
  },
  {
    type: 'link',
    href: '/appointments',
    label: 'Appointments',
    iconKey: 'calendar-days',
    permission: 'page:appointments',
  },
  {
    type: 'group',
    id: 'billing',
    label: 'Billing',
    iconKey: 'receipt',
    defaultExpanded: true,
    permission: 'page:billing',
    children: [
      { href: '/billing/invoices', label: 'Invoices' },
    ],
  },
  {
    type: 'link',
    href: '/quick-sale',
    label: 'Quick Sale',
    iconKey: 'receipt',
    hidden: true,
    permission: 'page:quick_sale',
  },
  { type: 'link', href: '/staff', label: 'Staff', iconKey: 'clipboard-list' },
  {
    type: 'link',
    href: '/inventory',
    label: 'Inventory',
    iconKey: 'warehouse',
    permission: 'page:inventory',
  },
  { type: 'link', href: '/loyalty', label: 'Loyalty', iconKey: 'heart' },
  {
    type: 'group',
    id: 'reports',
    label: 'Reports',
    iconKey: 'package',
    defaultExpanded: false,
    permission: 'page:reports',
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
  {
    type: 'group',
    id: 'configuration',
    label: 'Configuration',
    iconKey: 'sliders-horizontal',
    defaultExpanded: false,
    children: [
      { href: '/services', label: 'Services' },
      { href: '/products', label: 'Products' },
      { href: '/packages', label: 'Packages' },
      { href: '/memberships', label: 'Memberships' },
    ],
  },
  {
    type: 'link',
    href: '/settings',
    label: 'Settings',
    iconKey: 'settings',
    permission: 'page:settings',
  },
];

export function filterNavByPermissions(
  admin: PermissionAdmin,
  entries: HairNavEntry[] = HAIR_NAV_ENTRIES,
): HairNavEntry[] {
  return entries.filter((entry) => {
    if (entry.type === 'link') {
      if (entry.hidden) return false;
      if (!entry.permission) return true;
      return hasPermission(admin, entry.permission);
    }
    if (!entry.permission) return true;
    return hasPermission(admin, entry.permission);
  });
}

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

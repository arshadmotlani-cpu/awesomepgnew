import type { LucideIcon } from 'lucide-react';
import {
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  ShoppingBag,
  Sparkles,
  Users,
  Warehouse,
} from 'lucide-react';

export type HairNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** When true, route stays registered but is hidden from the sidebar. */
  hidden?: boolean;
};

/**
 * Salon ERP sidebar order.
 * Inventory + Reports stay in the list (routes exist) but are hidden until implemented.
 */
export const HAIR_NAV_ITEMS: HairNavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/customers', label: 'Customers', icon: Users },
  { href: '/appointments', label: 'Appointments', icon: CalendarDays },
  { href: '/billing', label: 'Billing', icon: Receipt },
  { href: '/services', label: 'Services', icon: Sparkles },
  { href: '/products', label: 'Products', icon: ShoppingBag },
  { href: '/staff', label: 'Staff', icon: ClipboardList },
  { href: '/settings', label: 'Settings', icon: Settings },
  { href: '/inventory', label: 'Inventory', icon: Warehouse, hidden: true },
  { href: '/reports', label: 'Reports', icon: Package, hidden: true },
];

export function visibleHairNavItems(): HairNavItem[] {
  return HAIR_NAV_ITEMS.filter((item) => !item.hidden);
}

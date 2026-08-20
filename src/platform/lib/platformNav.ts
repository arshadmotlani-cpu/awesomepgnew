import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  Building2,
  CreditCard,
  LayoutDashboard,
  MapPin,
  Package,
  Rocket,
  Shield,
  Users,
} from 'lucide-react';

export type PlatformNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  matchPrefix?: boolean;
};

export type PlatformNavGroup = {
  id: string;
  title: string;
  items: PlatformNavItem[];
};

export const platformNavGroups: PlatformNavGroup[] = [
  {
    id: 'overview',
    title: 'Overview',
    items: [
      { href: '/platform/admin', label: 'Dashboard', icon: LayoutDashboard, matchPrefix: false },
    ],
  },
  {
    id: 'customers',
    title: 'Customers',
    items: [
      { href: '/platform/admin/organizations', label: 'Organizations', icon: Building2 },
      { href: '/platform/admin/locations', label: 'Locations', icon: MapPin },
      { href: '/platform/admin/users', label: 'Users', icon: Users },
    ],
  },
  {
    id: 'revenue',
    title: 'Revenue',
    items: [
      { href: '/platform/admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
      { href: '/platform/admin/plans', label: 'Plans', icon: Package },
    ],
  },
  {
    id: 'operations',
    title: 'Operations',
    items: [
      { href: '/platform/admin/onboarding', label: 'Onboarding', icon: Rocket },
      { href: '/platform/admin/activity', label: 'Activity', icon: Activity },
    ],
  },
  {
    id: 'platform',
    title: 'Platform',
    items: [
      {
        href: '/platform/admin/users?filter=platform_admin',
        label: 'Platform Administrators',
        icon: Shield,
      },
    ],
  },
];

export function isPlatformNavActive(activePath: string, href: string, matchPrefix = true): boolean {
  const [path, query] = href.split('?');
  if (query) {
    return activePath === href || activePath.startsWith(`${path}?`);
  }
  if (path === '/platform/admin') {
    return activePath === '/platform/admin';
  }
  if (!matchPrefix) return activePath === path;
  return activePath === path || activePath.startsWith(`${path}/`);
}

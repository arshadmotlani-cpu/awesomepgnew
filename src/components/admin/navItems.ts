import type { ComponentType, SVGProps } from 'react';
import {
  IconBed,
  IconBell,
  IconBuilding,
  IconCard,
  IconChart,
  IconCheckCircle,
  IconClipboard,
  IconDashboard,
  IconDocument,
  IconDoor,
  IconSettings,
  IconUsers,
} from './icons';
import { ADMIN_MODULES, SIDEBAR_MODULES, type AdminModule } from '@/src/lib/admin/navigation';
import type { AdminNavBadges } from '@/src/services/adminNavBadges';

const MODULE_ICONS: Record<AdminModule, ComponentType<SVGProps<SVGSVGElement>>> = {
  overview: IconDashboard,
  revenue: IconCard,
  collections: IconClipboard,
  invoices: IconDocument,
  deposits: IconCard,
  checkoutSettlements: IconDoor,
  operations: IconBed,
  analytics: IconChart,
  system: IconSettings,
  residents: IconUsers,
  kyc: IconCheckCircle,
  pgs: IconBuilding,
  panel: IconSettings,
};

export type NavSection = {
  title: string;
  items: Array<{
    href: string;
    label: string;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    module?: AdminModule;
    badgeKey?: keyof AdminNavBadges;
  }>;
};

/** Sidebar mirrors SaaS module architecture exactly. */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Platform',
    items: [
      ...SIDEBAR_MODULES.filter((mod) => mod.id !== 'operations').map((mod) => ({
        href: mod.href,
        label: mod.label,
        icon: MODULE_ICONS[mod.id],
        module: mod.id,
      })),
      {
        href: '/admin/operations/residents',
        label: ADMIN_MODULES.operations.label,
        icon: MODULE_ICONS.operations,
        module: 'operations' as const,
      },
      {
        href: '/admin/operations/payment-reviews',
        label: 'Payment reviews',
        icon: IconCard,
        badgeKey: 'payments' as const,
      },
      {
        href: '/admin/notifications',
        label: 'Notifications',
        icon: IconBell,
        badgeKey: 'notifications' as const,
      },
    ],
  },
  {
    title: 'Settings',
    items: [
      { href: '/admin/pricing', label: 'Pricing', icon: IconCard },
      { href: '/admin/settings', label: 'Settings', icon: IconSettings },
      { href: '/admin/guide', label: 'Help guide', icon: IconClipboard },
    ],
  },
];

export const TOPBAR_ICONS = {};

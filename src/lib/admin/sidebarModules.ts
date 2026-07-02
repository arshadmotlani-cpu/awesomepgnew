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
} from '@/src/components/admin/icons';
import { ADMIN_MODULES, type AdminModule } from '@/src/lib/admin/navigation';
import type { AdminNavBadges } from '@/src/services/adminNavBadges';

/** Every reorderable sidebar entry — SSOT for module keys. */
export type SidebarModuleKey =
  | Exclude<AdminModule, 'collections'>
  | 'billing'
  | 'payment_reviews'
  | 'notifications'
  | 'pricing'
  | 'settings'
  | 'help_guide';

export type SidebarModuleDef = {
  key: SidebarModuleKey;
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  module?: AdminModule;
  badgeKey?: keyof AdminNavBadges;
};

const MODULE_ICONS: Record<AdminModule, ComponentType<SVGProps<SVGSVGElement>>> = {
  overview: IconDashboard,
  revenue: IconCard,
  collections: IconClipboard,
  invoices: IconDocument,
  deposits: IconCard,
  refunds: IconDoor,
  checkoutSettlements: IconDoor,
  operations: IconBed,
  analytics: IconChart,
  system: IconSettings,
  residents: IconUsers,
  kyc: IconCheckCircle,
  pgs: IconBuilding,
  panel: IconSettings,
};

export const DEFAULT_SIDEBAR_MODULE_KEYS: SidebarModuleKey[] = [
  'overview',
  'operations',
  'billing',
  'revenue',
  'invoices',
  'deposits',
  'refunds',
  'pgs',
  'residents',
  'kyc',
  'analytics',
  'system',
  'panel',
  'pricing',
  'settings',
  'help_guide',
];

export const SIDEBAR_MODULE_REGISTRY: Record<SidebarModuleKey, SidebarModuleDef> = {
  overview: {
    key: 'overview',
    label: ADMIN_MODULES.overview.label,
    href: ADMIN_MODULES.overview.href,
    icon: MODULE_ICONS.overview,
    module: 'overview',
  },
  revenue: {
    key: 'revenue',
    label: ADMIN_MODULES.revenue.label,
    href: ADMIN_MODULES.revenue.href,
    icon: MODULE_ICONS.revenue,
    module: 'revenue',
  },
  billing: {
    key: 'billing',
    label: 'Billing Center',
    href: '/admin/billing',
    icon: MODULE_ICONS.collections,
    module: 'collections',
  },
  invoices: {
    key: 'invoices',
    label: ADMIN_MODULES.invoices.label,
    href: ADMIN_MODULES.invoices.href,
    icon: MODULE_ICONS.invoices,
    module: 'invoices',
  },
  deposits: {
    key: 'deposits',
    label: ADMIN_MODULES.deposits.label,
    href: ADMIN_MODULES.deposits.href,
    icon: MODULE_ICONS.deposits,
    module: 'deposits',
  },
  refunds: {
    key: 'refunds',
    label: ADMIN_MODULES.refunds.label,
    href: ADMIN_MODULES.refunds.href,
    icon: MODULE_ICONS.refunds,
    module: 'refunds',
  },
  checkoutSettlements: {
    key: 'checkoutSettlements',
    label: ADMIN_MODULES.checkoutSettlements.label,
    href: ADMIN_MODULES.checkoutSettlements.href,
    icon: MODULE_ICONS.checkoutSettlements,
    module: 'checkoutSettlements',
  },
  pgs: {
    key: 'pgs',
    label: ADMIN_MODULES.pgs.label,
    href: ADMIN_MODULES.pgs.href,
    icon: MODULE_ICONS.pgs,
    module: 'pgs',
  },
  residents: {
    key: 'residents',
    label: ADMIN_MODULES.residents.label,
    href: ADMIN_MODULES.residents.href,
    icon: MODULE_ICONS.residents,
    module: 'residents',
  },
  kyc: {
    key: 'kyc',
    label: ADMIN_MODULES.kyc.label,
    href: '/admin/residents/kyc',
    icon: MODULE_ICONS.kyc,
    module: 'kyc',
  },
  analytics: {
    key: 'analytics',
    label: ADMIN_MODULES.analytics.label,
    href: ADMIN_MODULES.analytics.href,
    icon: MODULE_ICONS.analytics,
    module: 'analytics',
  },
  system: {
    key: 'system',
    label: ADMIN_MODULES.system.label,
    href: ADMIN_MODULES.system.href,
    icon: MODULE_ICONS.system,
    module: 'system',
  },
  panel: {
    key: 'panel',
    label: ADMIN_MODULES.panel.label,
    href: ADMIN_MODULES.panel.href,
    icon: MODULE_ICONS.panel,
    module: 'panel',
  },
  operations: {
    key: 'operations',
    label: ADMIN_MODULES.operations.label,
    href: ADMIN_MODULES.operations.href,
    icon: MODULE_ICONS.operations,
    module: 'operations',
    badgeKey: 'operations',
  },
  payment_reviews: {
    key: 'payment_reviews',
    label: 'Payment Reviews',
    href: '/admin/operations?filter=payment_proof',
    icon: IconCard,
    badgeKey: 'payments',
  },
  notifications: {
    key: 'notifications',
    label: 'Notifications',
    href: '/admin/notifications',
    icon: IconBell,
    badgeKey: 'notifications',
  },
  pricing: {
    key: 'pricing',
    label: 'Pricing',
    href: '/admin/pricing',
    icon: IconCard,
  },
  settings: {
    key: 'settings',
    label: 'Settings',
    href: '/admin/settings',
    icon: IconSettings,
  },
  help_guide: {
    key: 'help_guide',
    label: 'Help guide',
    href: '/admin/guide',
    icon: IconClipboard,
  },
};

export function isSidebarModuleKey(key: string): key is SidebarModuleKey {
  return key in SIDEBAR_MODULE_REGISTRY;
}

export type SidebarLayoutItem = SidebarModuleDef & {
  sortOrder: number;
  hidden: boolean;
  pinned: boolean;
};

export type SidebarLayoutEntryInput = {
  moduleKey: SidebarModuleKey;
  sortOrder: number;
  hidden: boolean;
  pinned: boolean;
};

export function buildDefaultLayoutEntries(): SidebarLayoutEntryInput[] {
  return DEFAULT_SIDEBAR_MODULE_KEYS.map((moduleKey, index) => ({
    moduleKey,
    sortOrder: index,
    hidden: false,
    pinned: false,
  }));
}

export function sortSidebarLayoutItems(items: SidebarLayoutItem[]): SidebarLayoutItem[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
}

export function toRenderableSidebarItems(items: SidebarLayoutItem[]): SidebarLayoutItem[] {
  return sortSidebarLayoutItems(items).filter((item) => !item.hidden);
}

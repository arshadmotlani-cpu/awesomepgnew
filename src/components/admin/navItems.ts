import type { ComponentType, SVGProps } from 'react';
import {
  IconBuilding,
  IconCard,
  IconChart,
  IconClipboard,
  IconDashboard,
  IconSettings,
  IconUsers,
} from './icons';
import { SIDEBAR_MODULES, type AdminModule } from '@/src/lib/admin/navigation';

const MODULE_ICONS: Record<AdminModule, ComponentType<SVGProps<SVGSVGElement>>> = {
  overview: IconDashboard,
  revenue: IconCard,
  collections: IconClipboard,
  operations: IconUsers,
  analytics: IconChart,
  system: IconSettings,
  pgs: IconBuilding,
};

export type NavSection = {
  title: string;
  items: Array<{
    href: string;
    label: string;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    module?: AdminModule;
  }>;
};

/** Sidebar mirrors SaaS module architecture exactly. */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Platform',
    items: SIDEBAR_MODULES.map((mod) => ({
      href: mod.href,
      label: mod.label,
      icon: MODULE_ICONS[mod.id],
      module: mod.id,
    })),
  },
  {
    title: 'Settings',
    items: [
      { href: '/admin/settings', label: 'Settings', icon: IconSettings },
      { href: '/admin/guide', label: 'Help guide', icon: IconClipboard },
    ],
  },
];

export const TOPBAR_ICONS = {};

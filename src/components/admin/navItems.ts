import type { ComponentType, SVGProps } from 'react';
import {
  IconBuilding,
  IconCard,
  IconChart,
  IconClipboard,
  IconDashboard,
  IconDoor,
  IconSettings,
  IconUsers,
} from './icons';

export type NavSection = {
  title: string;
  items: Array<{
    href: string;
    label: string;
    icon: ComponentType<SVGProps<SVGSVGElement>>;
  }>;
};

/** Primary nav — Action Center first; legacy pages under More. */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Operate',
    items: [
      { href: '/admin/actions', label: 'Action Center', icon: IconDashboard },
      { href: '/admin/pgs', label: 'PGs', icon: IconBuilding },
      { href: '/admin/residents', label: 'Residents', icon: IconUsers },
    ],
  },
  {
    title: 'More',
    items: [
      { href: '/admin/overview', label: 'Revenue overview', icon: IconChart },
      { href: '/admin/bookings', label: 'Bookings', icon: IconClipboard },
      { href: '/admin/kyc', label: 'KYC review', icon: IconUsers },
      { href: '/admin/payments', label: 'Collections', icon: IconCard },
      { href: '/admin/rent', label: 'Rent invoices', icon: IconClipboard },
      { href: '/admin/electricity', label: 'Electricity bills', icon: IconChart },
      { href: '/admin/deposits', label: 'Deposits', icon: IconCard },
      { href: '/admin/vacating', label: 'Vacating', icon: IconDoor },
    ],
  },
  {
    title: 'Settings',
    items: [
      { href: '/admin/settings', label: 'Settings', icon: IconSettings },
      { href: '/admin/guide', label: 'Help guide', icon: IconClipboard },
      { href: '/admin/health', label: 'Diagnostics', icon: IconSettings },
    ],
  },
];

export const TOPBAR_ICONS = {};

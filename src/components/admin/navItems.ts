import type { ComponentType, SVGProps } from 'react';
import {
  IconBed,
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

/**
 * Admin nav aligned with the PG workflow:
 *   PG listings (edit page) → Listing · Rooms & electricity · Collections
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'PG management',
    items: [
      { href: '/admin', label: 'Overview', icon: IconDashboard },
      { href: '/admin/pgs', label: 'PG listings', icon: IconBuilding },
    ],
  },
  {
    title: 'Tenants',
    items: [
      { href: '/admin/residents', label: 'Residents', icon: IconUsers },
      { href: '/admin/bookings', label: 'Bookings', icon: IconClipboard },
      { href: '/admin/bookings/new', label: 'Assign tenant', icon: IconUsers },
      { href: '/admin/kyc', label: 'KYC review', icon: IconUsers },
    ],
  },
  {
    title: 'Billing & collections',
    items: [
      { href: '/admin/payments', label: 'Collections (all PGs)', icon: IconCard },
      { href: '/admin/rent', label: 'Rent invoices', icon: IconClipboard },
      { href: '/admin/electricity', label: 'Electricity bills', icon: IconChart },
      { href: '/admin/emails', label: 'Email log', icon: IconClipboard },
      { href: '/admin/playstation', label: 'PS4 memberships', icon: IconCard },
      { href: '/admin/deposits', label: 'Deposits', icon: IconCard },
      { href: '/admin/vacating', label: 'Vacating', icon: IconDoor },
    ],
  },
  {
    title: 'Settings',
    items: [
      { href: '/admin/guide', label: 'Help guide', icon: IconClipboard },
      { href: '/admin/settings', label: 'Settings', icon: IconSettings },
    ],
  },
];

export const TOPBAR_ICONS = {};

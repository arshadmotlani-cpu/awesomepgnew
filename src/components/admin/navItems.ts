import type { ComponentType, SVGProps } from 'react';
import {
  IconBed,
  IconBell,
  IconBuilding,
  IconCard,
  IconChart,
  IconClipboard,
  IconDashboard,
  IconDoor,
  IconLayers,
  IconDatabase,
  IconSettings,
  IconTag,
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

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { href: '/admin', label: 'Dashboard', icon: IconDashboard },
      { href: '/admin/dashboard', label: 'PG control', icon: IconBuilding },
      { href: '/admin/occupancy', label: 'Occupancy', icon: IconChart },
    ],
  },
  {
    title: 'Inventory',
    items: [
      { href: '/admin/pgs', label: 'PGs', icon: IconBuilding },
      { href: '/admin/floors', label: 'Floors', icon: IconLayers },
      { href: '/admin/rooms', label: 'Rooms', icon: IconDoor },
      { href: '/admin/beds', label: 'Beds', icon: IconBed },
      { href: '/admin/pricing', label: 'Pricing', icon: IconTag },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/admin/residents', label: 'Residents', icon: IconUsers },
      { href: '/admin/kyc', label: 'KYC review', icon: IconUsers },
      { href: '/admin/bookings', label: 'Bookings', icon: IconClipboard },
      { href: '/admin/extensions', label: 'Extensions', icon: IconLayers },
      { href: '/admin/payments', label: 'Payments', icon: IconCard },
    ],
  },
  {
    title: 'Resident billing',
    items: [
      { href: '/admin/rent', label: 'Rent', icon: IconClipboard },
      { href: '/admin/electricity', label: 'Electricity', icon: IconChart },
      { href: '/admin/vacating', label: 'Vacating', icon: IconDoor },
      { href: '/admin/deposits', label: 'Deposits', icon: IconCard },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/admin/system', label: 'System status', icon: IconDatabase },
      { href: '/admin/monitoring', label: 'Monitoring', icon: IconChart },
      { href: '/admin/health', label: 'Self-healing', icon: IconBell },
      { href: '/admin/deployments', label: 'Deploy watchdog', icon: IconClipboard },
      { href: '/admin/settings', label: 'Settings', icon: IconSettings },
    ],
  },
];

// Used by IconBell-style elements that aren't part of the nav but live in the
// topbar — kept here so the icon-set import is concentrated in one place.
export const TOPBAR_ICONS = { IconBell };

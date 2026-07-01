import type { ResidentTab } from '@/src/lib/accountNavigation';
import { residentTabHref } from '@/src/lib/accountNavigation';

export type ResidentTabMeta = {
  tab: ResidentTab;
  label: string;
  title: string;
  subtitle: string;
};

/** Desktop pill nav — all resident tabs. */
export const RESIDENT_DESKTOP_NAV: ResidentTabMeta[] = [
  {
    tab: 'home',
    label: 'My Stay',
    title: 'My Stay',
    subtitle: 'Your booking, room, and what matters today.',
  },
  {
    tab: 'wallet',
    label: 'Wallet',
    title: 'Wallet',
    subtitle: 'Deposit balance, ledger, and refund.',
  },
  {
    tab: 'payments',
    label: 'Bills',
    title: 'Bills',
    subtitle: 'Rent, electricity, and payment history.',
  },
  {
    tab: 'room',
    label: 'Booking',
    title: 'Current booking',
    subtitle: 'Bed, rent, and stay details.',
  },
  {
    tab: 'requests',
    label: 'Requests',
    title: 'Requests',
    subtitle: 'Maintenance, complaints, and PG requests.',
  },
  {
    tab: 'notifications',
    label: 'Notifications',
    title: 'Notifications',
    subtitle: 'Email updates from Awesome PG.',
  },
  {
    tab: 'vacating',
    label: 'Vacating',
    title: 'Move-out',
    subtitle: 'Notice period, checkout, and deposit refund.',
  },
  {
    tab: 'referrals',
    label: 'Referrals',
    title: 'Referrals',
    subtitle: 'Invite friends and track rewards.',
  },
  {
    tab: 'concierge',
    label: 'Concierge',
    title: 'Concierge',
    subtitle: 'Ask Roachie or reach the PG team.',
  },
];

/** Mobile bottom nav (max 5). */
export const RESIDENT_MOBILE_PRIMARY_TABS: ResidentTab[] = [
  'home',
  'wallet',
  'payments',
  'requests',
  'concierge',
];

/** Mobile secondary strip — tabs not in bottom nav. */
export const RESIDENT_MOBILE_SECONDARY_TABS: ResidentTabMeta[] = RESIDENT_DESKTOP_NAV.filter(
  (t) => !RESIDENT_MOBILE_PRIMARY_TABS.includes(t.tab),
);

export function residentTabMeta(tab: ResidentTab): ResidentTabMeta {
  return RESIDENT_DESKTOP_NAV.find((t) => t.tab === tab) ?? RESIDENT_DESKTOP_NAV[0]!;
}

export function residentAccountSettingsHref(): string {
  return '/account/profile?section=profile&settings=1';
}

export function residentBookingsHref(): string {
  return '/account/bookings';
}

export function residentBackToHubHref(tab: ResidentTab = 'home'): string {
  return residentTabHref(tab);
}

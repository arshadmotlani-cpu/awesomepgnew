import type { ResidentTab } from '@/src/lib/accountNavigation';
import { residentTabHref } from '@/src/lib/accountNavigation';

export type ResidentTabMeta = {
  tab: ResidentTab;
  label: string;
  title: string;
  subtitle: string;
};

/** V2 desktop + mobile nav — five tabs only. */
export const RESIDENT_DESKTOP_NAV: ResidentTabMeta[] = [
  {
    tab: 'profile',
    label: 'Profile',
    title: 'Profile',
    subtitle: 'Your stay, wallet, and account details.',
  },
  {
    tab: 'payments',
    label: 'Payments',
    title: 'Payments',
    subtitle: 'Bills due and payment history.',
  },
  {
    tab: 'requests',
    label: 'Requests',
    title: 'Requests',
    subtitle: 'Maintenance, room change, move-out, and support.',
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
    title: 'AI Concierge',
    subtitle: 'Ask Roachie or reach the PG team.',
  },
];

/** @deprecated V2 uses same 5 tabs on mobile — kept for import compatibility. */
export const RESIDENT_MOBILE_PRIMARY_TABS: ResidentTab[] = RESIDENT_DESKTOP_NAV.map((t) => t.tab);

/** @deprecated No secondary strip in V2. */
export const RESIDENT_MOBILE_SECONDARY_TABS: ResidentTabMeta[] = [];

export function residentTabMeta(tab: ResidentTab): ResidentTabMeta {
  return RESIDENT_DESKTOP_NAV.find((t) => t.tab === tab) ?? RESIDENT_DESKTOP_NAV[0]!;
}

/** Profile edit lives inside Profile tab — no separate settings route. */
export function residentAccountSettingsHref(): string {
  return residentTabHref('profile', { sub: 'overview', edit: '1' });
}

export function residentBookingsHref(): string {
  return '/account/bookings';
}

export function residentBackToHubHref(tab: ResidentTab = 'profile'): string {
  return residentTabHref(tab);
}

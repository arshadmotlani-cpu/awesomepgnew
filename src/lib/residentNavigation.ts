import type { ResidentTab } from '@/src/lib/accountNavigation';
import { accountProfileHref, residentStayHref, residentTabHref } from '@/src/lib/accountNavigation';

export type ResidentTabMeta = {
  tab: ResidentTab;
  label: string;
  title: string;
  subtitle: string;
};

/** Account feature nav — Profile and My Stay live in the site header. */
export const RESIDENT_DESKTOP_NAV: ResidentTabMeta[] = [
  {
    tab: 'requests',
    label: 'Requests',
    title: 'Requests',
    subtitle: 'Maintenance, room change, move-out, and support.',
  },
  {
    tab: 'invoices',
    label: 'Invoices',
    title: 'Invoices',
    subtitle: 'Paid invoices, downloads, and billing history.',
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

/** @deprecated V2 uses same tabs on mobile — kept for import compatibility. */
export const RESIDENT_MOBILE_PRIMARY_TABS: ResidentTab[] = RESIDENT_DESKTOP_NAV.map((t) => t.tab);

/** @deprecated No secondary strip in V2. */
export const RESIDENT_MOBILE_SECONDARY_TABS: ResidentTabMeta[] = [];

export function residentTabMeta(tab: ResidentTab): ResidentTabMeta {
  return RESIDENT_DESKTOP_NAV.find((t) => t.tab === tab) ?? RESIDENT_DESKTOP_NAV[0]!;
}

export function residentAccountSettingsHref(): string {
  return accountProfileHref('profile', { edit: '1' });
}

export function residentBookingsHref(): string {
  return '/account/bookings';
}

export function residentMyStayHref(): string {
  return residentStayHref('payments');
}

export function residentProfilePageHref(): string {
  return '/account/profile';
}

export function residentBackToHubHref(tab: ResidentTab = 'requests'): string {
  return residentTabHref(tab);
}

export type AccountSection = 'profile' | 'identity' | 'resident';

export type ResidentTab =
  | 'home'
  | 'wallet'
  | 'payments'
  | 'requests'
  | 'room'
  | 'vacating'
  | 'notifications'
  | 'referrals'
  | 'concierge';

export function parseAccountSection(raw: string | undefined): AccountSection {
  if (raw === 'identity' || raw === 'resident') return raw;
  return 'profile';
}

export function parseResidentTab(raw: string | undefined): ResidentTab {
  const tabs: ResidentTab[] = [
    'home',
    'wallet',
    'payments',
    'requests',
    'room',
    'vacating',
    'notifications',
    'referrals',
    'concierge',
  ];
  if (raw && tabs.includes(raw as ResidentTab)) return raw as ResidentTab;
  return 'home';
}

export function accountProfileHref(
  section: AccountSection = 'profile',
  extra?: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  if (section !== 'profile') params.set('section', section);
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value) params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `/account/profile?${qs}` : '/account/profile';
}

export function residentTabHref(tab: ResidentTab): string {
  return accountProfileHref('resident', { tab });
}

/** Back link target for resident billing sub-pages. */
export const ACCOUNT_RESIDENT_HREF = accountProfileHref('resident');

/** Mobile bottom nav tabs (max 5 per spec). */
export const RESIDENT_BOTTOM_NAV: { tab: ResidentTab; label: string; icon: string }[] = [
  { tab: 'home', label: 'My Stay', icon: '🏠' },
  { tab: 'wallet', label: 'Wallet', icon: '💳' },
  { tab: 'payments', label: 'Bills', icon: '💰' },
  { tab: 'requests', label: 'Requests', icon: '📋' },
  { tab: 'concierge', label: 'Concierge', icon: '💬' },
];

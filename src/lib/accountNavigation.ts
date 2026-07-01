export type AccountSection = 'profile' | 'identity' | 'resident';

/** V2 resident hub tabs — five items only. */
export type ResidentTab = 'profile' | 'payments' | 'requests' | 'referrals' | 'concierge';

/** @deprecated Legacy tab keys — mapped to V2 in parseResidentTab. */
export type LegacyResidentTab =
  | 'home'
  | 'wallet'
  | 'room'
  | 'vacating'
  | 'notifications';

export type ResidentProfileSub = 'overview' | 'wallet';
export type ResidentPaymentsSub = 'due' | 'invoices';

const V2_TABS: ResidentTab[] = ['profile', 'payments', 'requests', 'referrals', 'concierge'];

/** Map legacy tab query params to V2 tabs. */
const LEGACY_TAB_MAP: Record<string, ResidentTab> = {
  home: 'profile',
  wallet: 'profile',
  room: 'profile',
  vacating: 'requests',
  notifications: 'profile',
  payments: 'payments',
  requests: 'requests',
  referrals: 'referrals',
  concierge: 'concierge',
  profile: 'profile',
};

/** Map legacy tabs to profile/payments sub-nav. */
export function legacySubFromTab(raw: string | undefined): {
  profileSub?: ResidentProfileSub;
  paymentsSub?: ResidentPaymentsSub;
  requestsCategory?: string;
} {
  if (raw === 'wallet') return { profileSub: 'wallet' };
  if (raw === 'home' || raw === 'room' || raw === 'notifications') return { profileSub: 'overview' };
  if (raw === 'vacating') return { requestsCategory: 'move_out' };
  if (raw === 'payments') return { paymentsSub: 'due' };
  return {};
}

export function parseAccountSection(raw: string | undefined): AccountSection {
  if (raw === 'identity' || raw === 'resident') return raw;
  return 'profile';
}

export function parseResidentTab(raw: string | undefined): ResidentTab {
  if (raw && V2_TABS.includes(raw as ResidentTab)) return raw as ResidentTab;
  if (raw && raw in LEGACY_TAB_MAP) return LEGACY_TAB_MAP[raw]!;
  return 'profile';
}

export function parseResidentProfileSub(raw: string | undefined): ResidentProfileSub {
  if (raw === 'wallet') return 'wallet';
  return 'overview';
}

export function parseResidentPaymentsSub(raw: string | undefined): ResidentPaymentsSub {
  if (raw === 'invoices') return 'invoices';
  return 'due';
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

export function residentTabHref(
  tab: ResidentTab,
  extra?: Record<string, string | undefined>,
): string {
  return accountProfileHref('resident', { tab, ...extra });
}

/** Resolve legacy tab names (home, wallet, vacating, etc.) to V2 URLs. */
export function legacyResidentTabHref(
  tab: ResidentTab | LegacyResidentTab | 'payments',
): string {
  const v2 = parseResidentTab(tab);
  const legacy = legacySubFromTab(tab);
  if (v2 === 'profile') {
    return residentProfileHref(legacy.profileSub ?? 'overview');
  }
  if (v2 === 'payments') {
    return residentPaymentsHref(legacy.paymentsSub ?? 'due');
  }
  if (v2 === 'requests' && legacy.requestsCategory) {
    return residentTabHref('requests', { category: legacy.requestsCategory });
  }
  return residentTabHref(v2);
}

export function residentProfileHref(sub: ResidentProfileSub = 'overview'): string {
  return residentTabHref('profile', { sub });
}

export function residentPaymentsHref(sub: ResidentPaymentsSub = 'due'): string {
  return residentTabHref('payments', { sub });
}

/** Back link target for resident billing sub-pages. */
export const ACCOUNT_RESIDENT_HREF = residentProfileHref('overview');


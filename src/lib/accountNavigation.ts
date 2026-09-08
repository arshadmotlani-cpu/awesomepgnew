export type AccountSection = 'profile' | 'identity' | 'resident';

/** Profile account features — not My Stay. */
export type ResidentTab = 'referrals' | 'concierge';

/** My Stay primary navigation. */
export type ResidentStaySub = 'overview' | 'payments' | 'requests' | 'wallet';

/** Payments sub-navigation inside My Stay. */
export type ResidentPaymentsSub = 'due' | 'invoices' | 'history';

/** @deprecated Legacy tab keys — mapped in parseResidentTab / legacyResidentTabHref. */
export type LegacyResidentTab =
  | 'home'
  | 'wallet'
  | 'room'
  | 'vacating'
  | 'notifications'
  | 'profile'
  | 'payments'
  | 'requests'
  | 'invoices';

/** @deprecated Mapped to ResidentStaySub via legacyStaySubFromTab. */
export type ResidentProfileSub = 'overview' | 'wallet';

const ACCOUNT_FEATURE_TABS: ResidentTab[] = ['referrals', 'concierge'];

const LEGACY_TAB_MAP: Record<string, ResidentTab | 'stay' | 'profile'> = {
  home: 'stay',
  wallet: 'stay',
  room: 'stay',
  notifications: 'stay',
  payments: 'stay',
  requests: 'stay',
  invoices: 'stay',
  profile: 'profile',
  vacating: 'stay',
  referrals: 'referrals',
  concierge: 'concierge',
};

/** Map legacy tab query params to My Stay / payments sub-nav. */
export function legacySubFromTab(raw: string | undefined): {
  staySub?: ResidentStaySub;
  profileSub?: ResidentProfileSub;
  paymentsSub?: ResidentPaymentsSub;
  requestsCategory?: string;
} {
  if (raw === 'wallet') return { staySub: 'wallet', profileSub: 'wallet' };
  if (raw === 'home' || raw === 'room' || raw === 'notifications') {
    return { staySub: 'overview', profileSub: 'overview' };
  }
  if (raw === 'vacating') return { staySub: 'requests', requestsCategory: 'move_out' };
  if (raw === 'requests') return { staySub: 'requests' };
  if (raw === 'invoices') return { staySub: 'payments', paymentsSub: 'invoices' };
  if (raw === 'payments') return { staySub: 'payments', paymentsSub: 'due' };
  if (raw === 'due') return { staySub: 'payments', paymentsSub: 'due' };
  return {};
}

export function legacyStaySubFromTab(raw: string | undefined): ResidentStaySub | undefined {
  return legacySubFromTab(raw).staySub;
}

export function parseAccountSection(raw: string | undefined): AccountSection {
  if (raw === 'identity' || raw === 'resident') return raw;
  return 'profile';
}

export function parseResidentTab(raw: string | undefined): ResidentTab {
  if (raw && ACCOUNT_FEATURE_TABS.includes(raw as ResidentTab)) return raw as ResidentTab;
  const mapped = raw ? LEGACY_TAB_MAP[raw] : undefined;
  if (mapped === 'referrals' || mapped === 'concierge') return mapped;
  return 'referrals';
}

export function parseResidentStaySub(raw: string | undefined): ResidentStaySub {
  if (raw === 'overview' || raw === 'payments' || raw === 'requests' || raw === 'wallet') return raw;
  if (raw === 'home' || raw === 'room') return 'overview';
  if (raw === 'due') return 'payments';
  return 'payments';
}

export function parseResidentPaymentsSub(raw: string | undefined): ResidentPaymentsSub {
  if (raw === 'invoices') return 'invoices';
  if (raw === 'history') return 'history';
  if (raw === 'due') return 'due';
  return 'due';
}

/** @deprecated Use parseResidentStaySub. */
export function parseResidentProfileSub(raw: string | undefined): ResidentProfileSub {
  const stay = parseResidentStaySub(raw);
  if (stay === 'wallet') return 'wallet';
  return 'overview';
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

export function residentStayHref(
  sub: ResidentStaySub = 'payments',
  paymentsSub?: ResidentPaymentsSub,
): string {
  if (sub === 'payments') {
    const pay = paymentsSub ?? 'due';
    if (pay === 'due') return '/account/resident';
    return `/account/resident?sub=payments&pay=${pay}`;
  }
  return `/account/resident?sub=${sub}`;
}

export function residentPaymentsHref(sub: ResidentPaymentsSub = 'due'): string {
  return residentStayHref('payments', sub);
}

export function residentTabHref(
  tab: ResidentTab | 'requests',
  extra?: Record<string, string | undefined>,
): string {
  if (tab === 'requests') {
    const category = extra?.category;
    return category
      ? `/account/resident?sub=requests&category=${encodeURIComponent(category)}`
      : '/account/resident?sub=requests';
  }
  return accountProfileHref('resident', { tab, ...extra });
}

/** Resolve legacy tab names (home, wallet, vacating, etc.) to current URLs. */
export function legacyResidentTabHref(
  tab: ResidentTab | LegacyResidentTab | 'payments',
): string {
  const legacy = legacySubFromTab(tab);
  if (legacy.requestsCategory) {
    return residentTabHref('requests', { category: legacy.requestsCategory });
  }
  if (tab === 'profile') return '/account/profile';
  if (tab === 'requests') return residentStayHref('requests');
  if (tab === 'invoices' || legacy.paymentsSub === 'invoices') {
    return residentPaymentsHref('invoices');
  }
  if (tab === 'payments' || legacy.paymentsSub === 'due') {
    return residentPaymentsHref(legacy.paymentsSub ?? 'due');
  }
  const mapped = LEGACY_TAB_MAP[tab];
  if (mapped === 'stay') {
    return residentStayHref(legacy.staySub ?? 'overview');
  }
  if (mapped === 'profile') return '/account/profile';
  if (mapped === 'referrals' || mapped === 'concierge') {
    return residentTabHref(mapped);
  }
  return residentTabHref(parseResidentTab(tab));
}

/** @deprecated Use residentStayHref. */
export function residentProfileHref(sub: ResidentProfileSub = 'overview'): string {
  if (sub === 'wallet') return residentStayHref('wallet');
  return residentStayHref('overview');
}

/** Default My Stay entry — Payments → Due/Bills. */
export const ACCOUNT_RESIDENT_HREF = residentStayHref('payments');

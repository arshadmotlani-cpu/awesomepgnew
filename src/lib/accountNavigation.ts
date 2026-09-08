export type AccountSection = 'profile' | 'identity' | 'resident';

/** Account feature tabs (Requests, Invoices, etc.) — not My Stay. */
export type ResidentTab = 'requests' | 'invoices' | 'referrals' | 'concierge';

/** My Stay sub-navigation. */
export type ResidentStaySub = 'payments' | 'overview' | 'wallet' | 'due';

/** @deprecated Legacy tab keys — mapped in parseResidentTab / legacyResidentTabHref. */
export type LegacyResidentTab =
  | 'home'
  | 'wallet'
  | 'room'
  | 'vacating'
  | 'notifications'
  | 'profile'
  | 'payments';

/** @deprecated Mapped to ResidentStaySub via legacyStaySubFromTab. */
export type ResidentProfileSub = 'overview' | 'wallet';

/** @deprecated Mapped to ResidentStaySub or invoices tab. */
export type ResidentPaymentsSub = 'due' | 'invoices';

const ACCOUNT_FEATURE_TABS: ResidentTab[] = ['requests', 'invoices', 'referrals', 'concierge'];

const LEGACY_TAB_MAP: Record<string, ResidentTab | 'stay' | 'profile'> = {
  home: 'stay',
  wallet: 'stay',
  room: 'stay',
  notifications: 'stay',
  payments: 'stay',
  profile: 'profile',
  vacating: 'requests',
  requests: 'requests',
  invoices: 'invoices',
  referrals: 'referrals',
  concierge: 'concierge',
};

/** Map legacy tab query params to My Stay sub-nav or account tabs. */
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
  if (raw === 'vacating') return { requestsCategory: 'move_out' };
  if (raw === 'payments') return { staySub: 'payments', paymentsSub: 'due' };
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
  if (mapped === 'requests' || mapped === 'invoices' || mapped === 'referrals' || mapped === 'concierge') {
    return mapped;
  }
  return 'requests';
}

export function parseResidentStaySub(raw: string | undefined): ResidentStaySub {
  if (raw === 'overview' || raw === 'wallet' || raw === 'due') return raw;
  if (raw === 'home' || raw === 'room') return 'overview';
  return 'payments';
}

/** @deprecated Use parseResidentStaySub. */
export function parseResidentProfileSub(raw: string | undefined): ResidentProfileSub {
  const stay = parseResidentStaySub(raw);
  if (stay === 'wallet') return 'wallet';
  return 'overview';
}

/** @deprecated Use parseResidentStaySub or invoices tab. */
export function parseResidentPaymentsSub(raw: string | undefined): ResidentPaymentsSub {
  if (raw === 'invoices') return 'invoices';
  if (raw === 'due') return 'due';
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

export function residentStayHref(sub: ResidentStaySub = 'payments'): string {
  if (sub === 'payments') return '/account/resident';
  return `/account/resident?sub=${sub}`;
}

export function residentTabHref(
  tab: ResidentTab,
  extra?: Record<string, string | undefined>,
): string {
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
  if (tab === 'payments' || legacy.paymentsSub === 'invoices') {
    if (legacy.paymentsSub === 'invoices') return residentTabHref('invoices');
    return residentStayHref(legacy.staySub ?? 'payments');
  }
  const mapped = LEGACY_TAB_MAP[tab];
  if (mapped === 'stay') {
    return residentStayHref(legacy.staySub ?? 'overview');
  }
  if (mapped === 'profile') return '/account/profile';
  if (mapped === 'requests' || mapped === 'invoices' || mapped === 'referrals' || mapped === 'concierge') {
    return residentTabHref(mapped);
  }
  return residentTabHref(parseResidentTab(tab));
}

/** @deprecated Use residentStayHref. */
export function residentProfileHref(sub: ResidentProfileSub = 'overview'): string {
  if (sub === 'wallet') return residentStayHref('wallet');
  return residentStayHref('overview');
}

/** @deprecated Use residentStayHref or residentTabHref('invoices'). */
export function residentPaymentsHref(sub: ResidentPaymentsSub = 'due'): string {
  if (sub === 'invoices') return residentTabHref('invoices');
  if (sub === 'due') return residentStayHref('due');
  return residentStayHref('payments');
}

/** Default My Stay entry — payments first. */
export const ACCOUNT_RESIDENT_HREF = residentStayHref('payments');

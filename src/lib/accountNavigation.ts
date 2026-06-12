export type AccountSection = 'profile' | 'identity' | 'resident';

export function parseAccountSection(raw: string | undefined): AccountSection {
  if (raw === 'identity' || raw === 'resident') return raw;
  return 'profile';
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

/** Back link target for resident billing sub-pages. */
export const ACCOUNT_RESIDENT_HREF = accountProfileHref('resident');

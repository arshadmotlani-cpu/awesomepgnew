'use client';

import Link from 'next/link';
import type { AccountSection } from '@/src/lib/accountNavigation';
import { accountProfileHref } from '@/src/lib/accountNavigation';

type Props = {
  active: AccountSection;
  showResident: boolean;
  bookingCode?: string;
};

const TAB_CLASS =
  'rounded-lg px-3 py-2 text-sm font-medium transition-colors';
const ACTIVE = 'bg-apg-orange/15 text-apg-orange ring-1 ring-apg-orange/30';
const INACTIVE =
  'text-apg-silver hover:bg-white/5 hover:text-white';

export function AccountSectionNav({ active, showResident, bookingCode }: Props) {
  const identityHref = accountProfileHref('identity', { booking: bookingCode });

  return (
    <nav
      className="mt-6 flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1"
      aria-label="Account sections"
    >
      <Link
        href={accountProfileHref('profile')}
        className={`${TAB_CLASS} ${active === 'profile' ? ACTIVE : INACTIVE}`}
        aria-current={active === 'profile' ? 'page' : undefined}
      >
        Profile
      </Link>
      <Link
        href={identityHref}
        className={`${TAB_CLASS} ${active === 'identity' ? ACTIVE : INACTIVE}`}
        aria-current={active === 'identity' ? 'page' : undefined}
      >
        Identity (KYC)
      </Link>
      {showResident ? (
        <Link
          href={accountProfileHref('resident')}
          className={`${TAB_CLASS} ${active === 'resident' ? ACTIVE : INACTIVE}`}
          aria-current={active === 'resident' ? 'page' : undefined}
        >
          Resident area
        </Link>
      ) : null}
    </nav>
  );
}

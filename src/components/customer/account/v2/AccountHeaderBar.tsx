'use client';

import Link from 'next/link';
import { LogoutButton } from '@/src/components/auth/LogoutButton';
import { ACCOUNT_LINK_ON_DARK } from '@/src/components/customer/accountStyles';

type Props = {
  fullName: string;
  phoneDisplay: string;
  residentStatusLabel: string;
};

export function AccountHeaderBar({ fullName, phoneDisplay, residentStatusLabel }: Props) {
  return (
    <header
      id="account-header"
      className="rounded-2xl border border-white/10 apg-glass-light p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-apg-muted">
            My Account
          </p>
          <p className="mt-1 text-sm text-apg-silver">
            Signed in as{' '}
            <span className="font-semibold text-white">{fullName}</span>
            {' · '}
            {phoneDisplay}
          </p>
          <p className="mt-1 text-sm text-apg-silver">
            Resident status:{' '}
            <span className="font-semibold text-apg-orange">{residentStatusLabel}</span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href="#profile"
            className="rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white hover:border-apg-orange/40"
          >
            Edit profile
          </Link>
          <LogoutButton scope="customer" tone="dark" />
        </div>
      </div>
    </header>
  );
}

export function AccountPasswordNote() {
  return (
    <p className="text-xs text-apg-muted">
      Password reset is only used when you forget login credentials.{' '}
      <Link href="/account/change-password" className={ACCOUNT_LINK_ON_DARK}>
        Change password
      </Link>
    </p>
  );
}

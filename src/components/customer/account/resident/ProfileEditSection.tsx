'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ProfileForm } from '@/src/components/customer/ProfileForm';
import { ResidentActiveSessionsPanel } from '@/src/components/customer/account/resident/ResidentActiveSessionsPanel';
import { ApgCard } from '@/src/components/customer/design-system';
import { accountProfileHref } from '@/src/lib/accountNavigation';

type Props = {
  fullName: string;
  email: string;
  phoneLocal: string;
  phoneDisplay: string;
  defaultExpanded?: boolean;
};

export function ProfileEditSection({
  fullName,
  email,
  phoneLocal,
  phoneDisplay,
  defaultExpanded = false,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <ApgCard tier="resident">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-white">{fullName || 'Your name'}</p>
          <p className="mt-0.5 truncate text-sm text-apg-silver">{email}</p>
          <p className="text-sm text-apg-silver">{phoneDisplay}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex min-h-[44px] shrink-0 items-center rounded-xl border border-white/20 bg-white/10 px-4 text-sm font-semibold text-white transition hover:border-apg-orange/40"
          aria-expanded={expanded}
        >
          {expanded ? 'Close' : 'Edit Profile'}
        </button>
      </div>

      {expanded ? (
        <div className="mt-4 border-t border-white/10 pt-4">
          <ProfileForm
            variant="dark"
            defaultValues={{ fullName, email, phone: phoneLocal }}
          />
          <p className="mt-4 text-xs text-apg-silver">
            <Link href={accountProfileHref('identity')} className="text-apg-cyan hover:text-apg-orange">
              Identity check (KYC) →
            </Link>
          </p>
        </div>
      ) : null}

      <ResidentActiveSessionsPanel />
    </ApgCard>
  );
}

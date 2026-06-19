'use client';

import { ApgCard } from '@/src/components/customer/design-system';
import { CountUpNumber } from '@/src/components/customer/design-system';

export function ReferralsPanel() {
  return (
    <ApgCard tier="account" className="p-6 text-center">
      <span className="text-4xl" aria-hidden>
        🎯
      </span>
      <h3 className="mt-4 text-lg font-semibold text-zinc-900">Referrals launching soon</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">
        Share Awesome PG with friends and earn rewards when they move in. Referral codes and
        earnings tracking are coming to Resident Hub.
      </p>
      <div className="mx-auto mt-6 flex max-w-xs flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 px-6 py-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Preview progress
        </p>
        <p className="text-2xl font-bold text-zinc-900">
          <CountUpNumber value={0} /> / 3 referrals
        </p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200">
          <div className="h-full w-0 rounded-full bg-apg-orange" />
        </div>
      </div>
    </ApgCard>
  );
}

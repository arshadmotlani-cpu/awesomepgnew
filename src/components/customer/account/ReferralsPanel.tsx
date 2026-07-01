'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';
import { siteWhatsAppUrl } from '@/src/lib/siteContact';
import { clientAppAbsoluteUrl } from '@/src/lib/url';
import { paiseToInr } from '@/src/lib/format';
import { primaryBtn, secondaryBtn } from '@/src/lib/design-system/tokens';
import type { getReferralSummaryForCustomer } from '@/src/services/referrals';

type ReferralSummary = Awaited<ReturnType<typeof getReferralSummaryForCustomer>>;

type Props = {
  customerId: string;
  customerName: string;
  referralSummary: ReferralSummary;
};

export function ReferralsPanel({ customerId, customerName, referralSummary }: Props) {
  const code = referralSummary.code;
  const shareUrl = useMemo(
    () => clientAppAbsoluteUrl(`/pgs?ref=${code}`),
    [code],
  );

  const shareMessage = `${customerName.split(' ')[0]} invited you to Awesome PG — premium beds, transparent billing. Book with code ${code}: ${shareUrl}`;

  const totalEarnings =
    referralSummary.lockedPaise +
    referralSummary.availablePaise +
    referralSummary.withdrawnPaise;

  return (
    <ApgCard tier="resident" className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white">Refer friends, earn rewards</h3>
        <p className="mt-2 text-sm text-apg-silver">
          Your code works forever. Each new email can use it once — friends get 5% off their first
          month&apos;s rent; you earn 5% in your wallet after they move in.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-apg-silver">Your code</p>
        <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-white">{code}</p>
        <p className="mt-3 break-all text-xs text-apg-silver">{shareUrl}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={primaryBtn}
            onClick={() => {
              void navigator.clipboard.writeText(`${shareUrl}\nCode: ${code}`);
            }}
          >
            Copy link
          </button>
          <a
            href={siteWhatsAppUrl(shareMessage)}
            target="_blank"
            rel="noopener noreferrer"
            className={secondaryBtn}
          >
            Share on WhatsApp
          </a>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <dt className="text-[10px] uppercase text-apg-silver">Total earned</dt>
          <dd className="text-sm font-bold tabular-nums text-white">{paiseToInr(totalEarnings)}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase text-apg-silver">Locked</dt>
          <dd className="text-sm font-bold tabular-nums text-amber-200">
            {paiseToInr(referralSummary.lockedPaise)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase text-apg-silver">Available</dt>
          <dd className="text-sm font-bold tabular-nums text-emerald-300">
            {paiseToInr(referralSummary.availablePaise)}
          </dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase text-apg-silver">Withdrawn</dt>
          <dd className="text-sm font-bold tabular-nums text-white">
            {paiseToInr(referralSummary.withdrawnPaise)}
          </dd>
        </div>
      </dl>

      <p className="text-xs text-apg-silver">
        Referral earnings can be withdrawn after you permanently vacate.{' '}
        <Link href="/about" className="text-apg-cyan hover:text-apg-orange">
          Learn more →
        </Link>
      </p>
    </ApgCard>
  );
}

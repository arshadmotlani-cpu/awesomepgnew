'use client';

import { useMemo } from 'react';
import { ApgCard } from '@/src/components/customer/design-system';
import { siteWhatsAppUrl } from '@/src/lib/siteContact';
import { clientAppAbsoluteUrl } from '@/src/lib/url';

type Props = {
  customerId: string;
  customerName: string;
};

export function ReferralsPanel({ customerId, customerName }: Props) {
  const code = useMemo(
    () => customerId.replace(/-/g, '').slice(0, 8).toUpperCase(),
    [customerId],
  );
  const shareUrl = useMemo(
    () => clientAppAbsoluteUrl(`/pgs?ref=${code}`),
    [code],
  );

  const shareMessage = `${customerName.split(' ')[0]} invited you to Awesome PG — premium beds, transparent billing. Book with code ${code}: ${shareUrl}`;

  return (
    <ApgCard tier="account" className="p-6">
      <h3 className="text-lg font-semibold text-zinc-900">Refer friends, earn rewards</h3>
      <p className="mt-2 text-sm text-zinc-600">
        Share your link. When a friend books and moves in, rewards are tracked by our team (payout
        notifications by email).
      </p>
      <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Your code</p>
        <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-zinc-900">{code}</p>
        <p className="mt-3 break-all text-xs text-zinc-600">{shareUrl}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="min-h-[44px] rounded-lg bg-apg-orange px-4 text-sm font-semibold text-white"
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
            className="inline-flex min-h-[44px] items-center rounded-lg border border-zinc-300 px-4 text-sm font-semibold text-zinc-800"
          >
            Share on WhatsApp
          </a>
        </div>
      </div>
      <p className="mt-4 text-xs text-zinc-500">
        Referral ledger syncs with admin — earnings appear in email when processed.
      </p>
    </ApgCard>
  );
}

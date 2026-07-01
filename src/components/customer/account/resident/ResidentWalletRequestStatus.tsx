'use client';

import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';
import { StatusChip } from '@/src/components/customer/design-system';
import { accountProfileHref } from '@/src/lib/accountNavigation';
import type { ActiveRequestItem } from '@/src/lib/residents/requestCenter';

const DEPOSIT_REQUEST_TYPES = new Set(['deposit_refund', 'deposit_due_extension']);

export function ResidentWalletRequestStatus({
  requests,
}: {
  requests: ActiveRequestItem[];
}) {
  const depositRequests = requests.filter((r) => DEPOSIT_REQUEST_TYPES.has(r.type));
  if (depositRequests.length === 0) return null;

  return (
    <ApgCard tier="account" className="p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Deposit request status</h2>
      <p className="mt-1 text-xs text-zinc-600">Track refund and deposit-related requests.</p>
      <ul className="mt-3 space-y-2">
        {depositRequests.map((r) => (
          <li key={r.id}>
            <Link
              href={accountProfileHref('resident', { tab: 'requests', request: r.id })}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 hover:border-indigo-200"
            >
              <span className="text-sm font-medium text-zinc-900">{r.typeLabel}</span>
              <StatusChip status={r.status} />
            </Link>
          </li>
        ))}
      </ul>
    </ApgCard>
  );
}

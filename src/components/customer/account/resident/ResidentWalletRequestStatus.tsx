'use client';

import { ApgCard } from '@/src/components/customer/design-system';
import { StatusChip, StatusTimeline } from '@/src/components/customer/design-system';
import { formatDate } from '@/src/lib/format';
import {
  nextStepForRequest,
  REQUEST_TIMELINE_STAGES,
  requestStatusToTimelineIndex,
  type ActiveRequestItem,
} from '@/src/lib/residents/requestCenter';

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
      <h2 className="text-sm font-semibold text-zinc-900">Refund request status</h2>
      <p className="mt-1 text-xs text-zinc-600">
        Pending, under review, approved, rejected, or completed — tracked here in your Wallet.
      </p>
      <ul className="mt-4 space-y-4">
        {depositRequests.map((r) => {
          const stepIndex = requestStatusToTimelineIndex(r.status);
          return (
            <li key={r.id} className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-semibold text-zinc-900">{r.typeLabel}</span>
                <StatusChip status={r.status} />
              </div>
              <p className="mt-1 text-xs text-zinc-500">Submitted {formatDate(r.createdAt)}</p>
              <p className="mt-2 text-sm text-zinc-700">{nextStepForRequest(r.status, r.type)}</p>
              {r.adminNotes ? (
                <p className="mt-2 text-xs text-zinc-500">Office note: {r.adminNotes}</p>
              ) : null}
              <div className="mt-4">
                <StatusTimeline
                  stages={REQUEST_TIMELINE_STAGES}
                  activeIndex={stepIndex}
                  orientation="horizontal"
                />
              </div>
            </li>
          );
        })}
      </ul>
    </ApgCard>
  );
}

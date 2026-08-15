'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ApgCard } from '@/src/components/customer/design-system';
import {
  cancelApprovedVacatingAction,
  cancelPendingVacatingAction,
} from '@/app/(customer)/account/resident/vacating-date-change-actions';

export function ResidentCancelMoveOutCard({
  requestId,
  vacatingStatus,
}: {
  requestId: string;
  vacatingStatus: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (vacatingStatus !== 'pending' && vacatingStatus !== 'approved') return null;

  if (confirming) {
    return (
      <ApgCard tier="resident" className="space-y-4 border-rose-500/20">
        <h2 className="text-sm font-semibold text-white">Cancel move-out request?</h2>
        <p className="text-sm text-apg-silver">
          Your current move-out request will be cancelled. Your stay will continue as normal. If you
          decide to leave later, you can submit a new move-out request.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setConfirming(false);
              setError(null);
            }}
            className="rounded-lg border border-white/20 px-4 py-2 text-xs font-medium text-white hover:bg-white/5 disabled:opacity-50"
          >
            Keep request
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                const res =
                  vacatingStatus === 'approved'
                    ? await cancelApprovedVacatingAction(requestId)
                    : await cancelPendingVacatingAction(requestId);
                if (!res.ok) {
                  setError(res.error ?? 'Could not cancel move-out.');
                  return;
                }
                setConfirming(false);
                router.refresh();
              })
            }
            className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
          >
            {pending ? 'Cancelling…' : 'Cancel move-out'}
          </button>
        </div>
        {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      </ApgCard>
    );
  }

  return (
    <ApgCard tier="resident" className="space-y-3">
      <h2 className="text-sm font-semibold text-white">Cancel move-out request</h2>
      <p className="text-sm text-apg-silver">
        Changed your plans? You can cancel your current move-out request and continue your stay.
      </p>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-white/20 px-4 py-2 text-xs font-medium text-white hover:bg-white/5"
      >
        Cancel move-out request
      </button>
    </ApgCard>
  );
}

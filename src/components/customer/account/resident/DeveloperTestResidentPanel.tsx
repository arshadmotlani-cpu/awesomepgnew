'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  archiveCheckoutSettlementAction,
  reopenRefundSettlementAction,
  resetRejectedVacatingAction,
  setDevDurationModeAction,
  simulateApprovedVacatingAction,
  simulateKycPendingAction,
  simulateKycRejectedAction,
  type DevTestActionState,
} from '@/app/(customer)/account/profile/developer-test-actions';
import type { DevResidentDurationMode } from '@/src/lib/auth/developerTestResident.shared';
import { accountProfileHref } from '@/src/lib/accountNavigation';

type Props = {
  bookingId: string | null;
  actualDurationMode: string | null;
  simulatedDurationMode: DevResidentDurationMode | null;
};

const DURATION_OPTIONS: Array<{ id: DevResidentDurationMode | 'actual'; label: string }> = [
  { id: 'actual', label: 'Actual booking' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'daily', label: 'Daily' },
];

function DevActionButton({
  label,
  description,
  disabled,
  onClick,
}: {
  label: string;
  description: string;
  disabled?: boolean;
  onClick: () => Promise<DevTestActionState>;
}) {
  const [pending, startTransition] = useTransition();
  const [flash, setFlash] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-violet-200/60 bg-white/5 p-3">
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => {
          startTransition(async () => {
            const result = await onClick();
            setFlash(result.ok ? (result.message ?? 'Done') : (result.error ?? 'Failed'));
          });
        }}
        className="text-left text-sm font-semibold text-violet-100 hover:text-white disabled:opacity-50"
      >
        {pending ? 'Working…' : label}
      </button>
      <p className="mt-1 text-xs text-violet-200/80">{description}</p>
      {flash ? <p className="mt-2 text-xs text-emerald-300">{flash}</p> : null}
    </div>
  );
}

/** Hidden developer shortcuts — only rendered when server confirms developer test mode. */
export function DeveloperTestResidentPanel({
  bookingId,
  actualDurationMode,
  simulatedDurationMode,
}: Props) {
  const router = useRouter();
  const [durationPending, startDurationTransition] = useTransition();

  const activeMode = simulatedDurationMode ?? 'actual';

  return (
    <details className="mb-4 rounded-xl border border-violet-400/40 bg-violet-950/40 p-4 text-violet-50">
      <summary className="cursor-pointer text-sm font-semibold text-violet-100">
        Developer test shortcuts
      </summary>

      <div className="mt-4 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">
            Simulate stay type
          </p>
          <p className="mt-1 text-xs text-violet-200/90">
            Actual: {actualDurationMode ?? '—'}
            {simulatedDurationMode ? ` · UI override: ${simulatedDurationMode}` : null}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                disabled={durationPending}
                onClick={() => {
                  startDurationTransition(async () => {
                    await setDevDurationModeAction(opt.id);
                    router.refresh();
                  });
                }}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  activeMode === opt.id
                    ? 'border-violet-200 bg-violet-500/30 text-white'
                    : 'border-violet-400/40 text-violet-100 hover:bg-violet-500/20'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <DevActionButton
            label="Reopen refund request"
            description="Reset checkout settlement to awaiting resident details."
            disabled={!bookingId}
            onClick={() => reopenRefundSettlementAction(bookingId!)}
          />
          <DevActionButton
            label="Archive active checkout"
            description="Archive in-progress settlement so you can start fresh."
            disabled={!bookingId}
            onClick={() => archiveCheckoutSettlementAction(bookingId!)}
          />
          <DevActionButton
            label="Simulate move-out approved"
            description="Approve or create a vacating notice on your booking."
            disabled={!bookingId}
            onClick={() => simulateApprovedVacatingAction(bookingId!)}
          />
          <DevActionButton
            label="Clear rejected move-out"
            description="Remove rejected vacating rows blocking resubmission history."
            disabled={!bookingId}
            onClick={() => resetRejectedVacatingAction(bookingId!)}
          />
          <DevActionButton
            label="Simulate KYC pending"
            description="Set your KYC status to pending."
            onClick={() => simulateKycPendingAction()}
          />
          <DevActionButton
            label="Simulate KYC rejected"
            description="Mark KYC rejected so you can test resubmission."
            onClick={() => simulateKycRejectedAction()}
          />
        </div>

        <div className="flex flex-wrap gap-2 text-xs">
          <a
            href={accountProfileHref('identity')}
            className="rounded-lg border border-violet-400/40 px-3 py-2 font-semibold text-violet-100 hover:bg-violet-500/20"
          >
            Open KYC
          </a>
          {bookingId ? (
            <a
              href={`/account/resident/request-vacating/${bookingId}`}
              className="rounded-lg border border-violet-400/40 px-3 py-2 font-semibold text-violet-100 hover:bg-violet-500/20"
            >
              Move-out form
            </a>
          ) : null}
        </div>
      </div>
    </details>
  );
}

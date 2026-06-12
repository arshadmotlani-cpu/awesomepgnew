'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import {
  submitAdminVacatingAction,
  type MapActionState,
} from '@/app/(admin)/admin/pgs/[pgId]/map/actions';
import { paiseToInr } from '@/src/lib/format';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';

export function AdminVacatingSubmitForm({
  pgId,
  bookingId,
  monthlyRentPaise,
  hasExistingVacating,
}: {
  pgId: string;
  bookingId: string;
  monthlyRentPaise: number;
  hasExistingVacating: boolean;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(submitAdminVacatingAction, {
    ok: false,
  } satisfies MapActionState);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  if (hasExistingVacating) return null;

  const penalty = Math.floor(monthlyRentPaise / 30) * 5;

  return (
    <form action={action} className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="pgId" value={pgId} />
      <p className="text-xs font-semibold uppercase tracking-wide text-apg-orange">
        File vacating notice
      </p>
      <label className="block text-sm">
        <span className="text-apg-silver">Vacating date</span>
        <input
          type="date"
          name="vacatingDate"
          required
          className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 px-3 py-2 text-sm"
        />
      </label>
      <label className="block text-sm">
        <span className="text-apg-silver">Notes (optional)</span>
        <textarea
          name="notes"
          rows={2}
          className="apg-admin-field mt-1 w-full rounded-lg border border-white/10 px-3 py-2 text-sm"
        />
      </label>
      <label className="flex items-start gap-2 text-xs text-apg-silver">
        <input type="checkbox" name="waiveDeduction" className="mt-0.5" />
        <span>
          No deposit deduction (waive the fixed {paiseToInr(penalty)} penalty even if notice is
          under {VACATING_NOTICE_MIN_DAYS} days)
        </span>
      </label>
      <label className="flex items-start gap-2 text-xs text-apg-silver">
        <input type="checkbox" name="openBedForBooking" defaultChecked className="mt-0.5" />
        <span>
          Open bed on website from vacating date — pre-bookable while tenant is still in notice
          (auto-approves vacating)
        </span>
      </label>
      {state.error ? <p className="text-xs text-rose-300">{state.error}</p> : null}
      {state.ok ? <p className="text-xs text-emerald-300">Vacating saved.</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-[#FF5A1F] px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Add to vacating queue'}
      </button>
    </form>
  );
}

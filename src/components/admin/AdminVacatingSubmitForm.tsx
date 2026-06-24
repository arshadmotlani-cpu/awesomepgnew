'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useMemo, useState } from 'react';
import { AdminConfirmSubmit } from '@/src/components/admin/AdminConfirmSubmit';
import {
  submitAdminVacatingAction,
  type MapActionState,
} from '@/app/(admin)/admin/pgs/[pgId]/map/actions';
import { defaultVacatingDate } from '@/src/lib/dateDefaults';
import { isOpenEndedStayEnd, todayString } from '@/src/lib/dates';
import { paiseToInr } from '@/src/lib/format';
import { VACATING_NOTICE_MIN_DAYS, computeNoticeDeduction } from '@/src/services/billing';

function resolveDefaultVacatingDate(expectedCheckoutDate?: string | null): string {
  if (expectedCheckoutDate && !isOpenEndedStayEnd(expectedCheckoutDate)) {
    return expectedCheckoutDate >= todayString() ? expectedCheckoutDate : todayString();
  }
  return defaultVacatingDate();
}

export function AdminVacatingSubmitForm({
  pgId,
  bookingId,
  monthlyRentPaise,
  hasExistingVacating,
  expectedCheckoutDate,
}: {
  pgId: string;
  bookingId: string;
  monthlyRentPaise: number;
  hasExistingVacating: boolean;
  expectedCheckoutDate?: string | null;
}) {
  const router = useRouter();
  const formId = useId().replace(/:/g, '');
  const initialVacatingDate = useMemo(
    () => resolveDefaultVacatingDate(expectedCheckoutDate),
    [expectedCheckoutDate],
  );
  const [vacatingDate, setVacatingDate] = useState(initialVacatingDate);
  const [state, action, pending] = useActionState(submitAdminVacatingAction, {
    ok: false,
  } satisfies MapActionState);

  useEffect(() => {
    setVacatingDate(initialVacatingDate);
  }, [initialVacatingDate]);

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  if (hasExistingVacating) return null;

  const penalty = computeNoticeDeduction(monthlyRentPaise, {
    noticeGivenDate: todayString(),
    vacatingDate,
  });

  return (
    <form
      id={formId}
      action={action}
      className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4"
    >
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
          min={todayString()}
          value={vacatingDate}
          onChange={(e) => setVacatingDate(e.target.value)}
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
      <AdminConfirmSubmit
        formId={formId}
        title="Add vacating notice?"
        description="Starts the notice workflow. If auto-approve is checked, the bed opens for website pre-booking from the vacating date. Use Cancel notice later if this was a mistake — do not click Complete unless the tenant has left."
        confirmLabel="Add to vacating queue"
        pending={pending}
        className="w-full rounded-lg bg-[#FF5A1F] px-3 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
      >
        {pending ? 'Saving…' : 'Add to vacating queue'}
      </AdminConfirmSubmit>
    </form>
  );
}

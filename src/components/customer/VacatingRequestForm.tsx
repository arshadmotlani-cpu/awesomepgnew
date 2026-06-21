'use client';

import { useActionState, useMemo, useState } from 'react';
import {
  submitVacatingAction,
  type VacatingActionState,
} from '@/app/(customer)/account/resident/actions';
import { defaultVacatingDate } from '@/src/lib/dateDefaults';
import { isOpenEndedStayEnd, todayString } from '@/src/lib/dates';
import { paiseToInr } from '@/src/lib/format';
import { estimateVacateDepositPreview } from '@/src/lib/vacating/depositRefundEligibility';
import { ACCOUNT_SURFACE_PRIMARY_BTN } from '@/src/components/customer/accountStyles';

const idleState: VacatingActionState = { status: 'idle' };

export function VacatingRequestForm({
  bookingId,
  depositHeldPaise,
  monthlyRentPaise,
  expectedCheckoutDate,
}: {
  bookingId: string;
  depositHeldPaise: number;
  monthlyRentPaise: number;
  expectedCheckoutDate?: string | null;
}) {
  const initialDate =
    expectedCheckoutDate && !isOpenEndedStayEnd(expectedCheckoutDate)
      ? expectedCheckoutDate >= todayString()
        ? expectedCheckoutDate
        : todayString()
      : defaultVacatingDate();
  const [state, action, pending] = useActionState(submitVacatingAction, idleState);
  const [vacatingDate, setVacatingDate] = useState(initialDate);

  const preview = useMemo(
    () =>
      /^\d{4}-\d{2}-\d{2}$/.test(vacatingDate)
        ? estimateVacateDepositPreview({
            depositHeldPaise,
            monthlyRentPaise,
            vacatingDate,
          })
        : null,
    [depositHeldPaise, monthlyRentPaise, vacatingDate],
  );

  return (
    <form
      action={action}
      data-roachie-focus="vacating"
      className="apg-account-surface space-y-4 rounded-xl border border-zinc-200 p-5 shadow-sm"
    >
      <input type="hidden" name="bookingId" value={bookingId} />

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-600">
          Vacate date
        </span>
        <input
          type="date"
          name="vacatingDate"
          required
          min={todayString()}
          value={vacatingDate}
          onChange={(e) => setVacatingDate(e.target.value)}
          className="apg-admin-field mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </label>

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
        <p className="font-medium text-zinc-900">Important information</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed">
          <li>Electricity will be calculated on the day of vacating.</li>
          <li>Final settlement will be completed after vacating.</li>
          <li>
            Deposit refund cannot be requested until your vacate date arrives and your vacate
            request is approved.
          </li>
        </ul>
      </div>

      {preview?.earlyVacate ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-medium">Early vacate policy applies</p>
          <p className="mt-1 text-xs">
            Applicable deductions will be calculated from your deposit. Estimates below are
            informational only — final settlement happens after admin approval.
          </p>
          <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
            <div>
              <dt className="text-amber-800">Current deposit held</dt>
              <dd className="font-semibold">{paiseToInr(depositHeldPaise)}</dd>
            </div>
            <div>
              <dt className="text-amber-800">Estimated deduction</dt>
              <dd className="font-semibold">{paiseToInr(preview.estimatedDeductionPaise)}</dd>
            </div>
            <div>
              <dt className="text-amber-800">Estimated refundable balance</dt>
              <dd className="font-semibold">{paiseToInr(preview.estimatedRefundablePaise)}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-600">
          Notes (optional)
        </span>
        <textarea
          name="notes"
          rows={2}
          className="apg-admin-field mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="Anything the office should know about your move-out"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className={`w-full ${ACCOUNT_SURFACE_PRIMARY_BTN}`}
      >
        {pending ? 'Submitting…' : 'Submit vacate request'}
      </button>

      {state.status === 'error' ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

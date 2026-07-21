'use client';

import { useActionState, useMemo, useState } from 'react';
import {
  submitVacatingAction,
  type VacatingActionState,
} from '@/app/(customer)/account/resident/actions';
import { NoticeSettlementPanel } from '@/src/components/shared/NoticeDeductionBreakdown';
import { useNoticeDeductionPreview } from '@/src/components/shared/useNoticeDeductionPreview';
import { toNoticeSettlementDisplay } from '@/src/lib/vacating/noticeDeductionPresentation';
import {
  ACCOUNT_SURFACE,
  ACCOUNT_SURFACE_PRIMARY_BTN,
} from '@/src/components/customer/accountStyles';
import { defaultVacatingDate } from '@/src/lib/dateDefaults';
import { isOpenEndedStayEnd, todayString } from '@/src/lib/dates';
import { paiseToInr } from '@/src/lib/format';
import { previewNoticeDeductionForCustomerAction } from '@/src/lib/vacating/previewNoticeDeductionAction';
import { estimateVacateDepositPreview } from '@/src/lib/vacating/depositRefundEligibility';
import { VACATING_CHECKOUT_DEADLINE_COPY } from '@/src/lib/residents/stayBillingRules';

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

  const { breakdown, loading } = useNoticeDeductionPreview(
    previewNoticeDeductionForCustomerAction,
    { bookingId, vacatingDate, monthlyRentPaise },
  );

  const preview = useMemo(
    () =>
      /^\d{4}-\d{2}-\d{2}$/.test(vacatingDate)
        ? estimateVacateDepositPreview({
            depositHeldPaise,
            monthlyRentPaise,
            vacatingDate,
            noticeBreakdown: breakdown ? toNoticeSettlementDisplay(breakdown) : null,
          })
        : null,
    [breakdown, depositHeldPaise, monthlyRentPaise, vacatingDate],
  );

  return (
    <form
      action={action}
      data-roachie-focus="vacating"
      className={`${ACCOUNT_SURFACE} space-y-4 p-5`}
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
          className="apg-admin-field mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-[#FF5A1F] focus:outline-none focus:ring-1 focus:ring-[#FF5A1F]"
        />
      </label>

      <div className={`${ACCOUNT_SURFACE} p-4 text-sm text-zinc-700`}>
        <p className="font-medium text-zinc-900">Important information</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed">
          <li>{VACATING_CHECKOUT_DEADLINE_COPY}</li>
          <li>Electricity will be calculated on the day of vacating.</li>
          <li>Final settlement will be completed after vacating.</li>
          <li>
            Deposit refund cannot be requested until your vacate date arrives and your vacate
            request is approved.
          </li>
        </ul>
      </div>

      {loading ? (
        <p className="text-xs text-zinc-500">Calculating notice breakdown…</p>
      ) : null}

      {preview?.noticeBreakdown ? (
        <NoticeSettlementPanel settlement={preview.noticeBreakdown} variant="resident" />
      ) : preview?.earlyVacate ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950">
          <p className="font-medium">Early vacate policy applies</p>
          <p className="mt-1 text-xs">
            A notice deduction may apply. Final settlement happens after admin approval.
          </p>
        </div>
      ) : null}

      {(preview?.earlyVacate || preview?.noticeBreakdown) && (
        <dl className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-zinc-600">Current deposit held</dt>
            <dd className="font-semibold text-zinc-900">{paiseToInr(depositHeldPaise)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-600">Estimated refundable balance</dt>
            <dd className="font-semibold text-emerald-700">
              {paiseToInr(preview.estimatedRefundablePaise)}
            </dd>
          </div>
        </dl>
      )}

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-600">
          Notes (optional)
        </span>
        <textarea
          name="notes"
          rows={2}
          className="apg-admin-field mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-[#FF5A1F] focus:outline-none focus:ring-1 focus:ring-[#FF5A1F]"
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
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

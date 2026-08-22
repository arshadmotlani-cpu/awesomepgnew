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
import { ApgCard } from '@/src/components/customer/design-system';
import { defaultVacatingDate } from '@/src/lib/dateDefaults';
import { isOpenEndedStayEnd, todayString } from '@/src/lib/dates';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { previewNoticeDeductionForCustomerAction } from '@/src/lib/vacating/previewNoticeDeductionAction';
import { estimateVacateDepositPreview } from '@/src/lib/vacating/depositRefundEligibility';
import { buildVacatingDateConfirmation } from '@/src/lib/vacating/vacatingBedSemantics';
import { VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';
import { primaryBtn } from '@/src/lib/design-system/tokens';

const idleState: VacatingActionState = { status: 'idle' };

export function VacatingRequestForm({
  bookingId,
  depositHeldPaise,
  monthlyRentPaise,
  expectedCheckoutDate,
  variant = 'standalone',
  onBack,
}: {
  bookingId: string;
  depositHeldPaise: number;
  monthlyRentPaise: number;
  expectedCheckoutDate?: string | null;
  variant?: 'standalone' | 'resident';
  onBack?: () => void;
}) {
  const resident = variant === 'resident';
  const initialDate =
    expectedCheckoutDate && !isOpenEndedStayEnd(expectedCheckoutDate)
      ? expectedCheckoutDate >= todayString()
        ? expectedCheckoutDate
        : todayString()
      : defaultVacatingDate();
  const [state, action, pending] = useActionState(submitVacatingAction, idleState);
  const [vacatingDate, setVacatingDate] = useState(initialDate);
  const noticeSubmittedDate = todayString();

  const { breakdown, loading } = useNoticeDeductionPreview(
    previewNoticeDeductionForCustomerAction,
    { bookingId, vacatingDate, monthlyRentPaise, noticeGivenDate: noticeSubmittedDate },
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

  const dateConfirmation = useMemo(
    () =>
      /^\d{4}-\d{2}-\d{2}$/.test(vacatingDate)
        ? buildVacatingDateConfirmation(vacatingDate)
        : null,
    [vacatingDate],
  );

  const noticeDisplay = preview?.noticeBreakdown ?? (breakdown ? toNoticeSettlementDisplay(breakdown) : null);

  const shellClass = resident
    ? 'space-y-4'
    : `${ACCOUNT_SURFACE} space-y-4 p-5`;

  const fieldClass = resident
    ? 'mt-1 block w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:border-apg-orange focus:outline-none focus:ring-1 focus:ring-apg-orange'
    : 'apg-admin-field mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-[#FF5A1F] focus:outline-none focus:ring-1 focus:ring-[#FF5A1F]';

  const labelClass = resident
    ? 'text-xs font-medium uppercase tracking-wide text-apg-silver'
    : 'text-xs font-medium uppercase tracking-wide text-zinc-600';

  const content = (
    <form action={action} data-roachie-focus="vacating" className={shellClass}>
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-medium text-apg-orange hover:underline"
        >
          ← Back to requests
        </button>
      ) : null}

      {resident ? (
        <ApgCard tier="resident" className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-apg-orange">Move-out</p>
          <h2 className="text-lg font-semibold text-white">Select your move-out date</h2>
          <p className="text-sm text-apg-silver">
            Choose your final stay date. Estimates update as you pick a date.
          </p>
        </ApgCard>
      ) : null}

      <input type="hidden" name="bookingId" value={bookingId} />

      <label className="block">
        <span className={labelClass}>Move-out date</span>
        <input
          type="date"
          name="vacatingDate"
          required
          min={todayString()}
          value={vacatingDate}
          onChange={(e) => setVacatingDate(e.target.value)}
          className={fieldClass}
        />
      </label>

      {dateConfirmation ? (
        <div
          className={
            resident
              ? 'rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-sky-100'
              : 'rounded-xl border border-sky-200 bg-sky-50/90 p-4 text-sm text-sky-950'
          }
        >
          <p className={resident ? 'font-semibold text-sky-50' : 'font-semibold text-sky-900'}>
            Your move-out dates
          </p>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed">
            {dateConfirmation.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {loading ? (
        <p className={`text-xs ${resident ? 'text-apg-silver' : 'text-zinc-500'}`}>
          Calculating settlement estimate…
        </p>
      ) : null}

      {!loading && noticeDisplay ? (
        <ApgCard tier="resident" className="space-y-3">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-apg-silver">Notice submitted</dt>
              <dd className="font-semibold text-white">{formatDate(noticeSubmittedDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-apg-silver">Requested move-out</dt>
              <dd className="font-semibold text-white">{formatDate(vacatingDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-apg-silver">Notice period required</dt>
              <dd className="font-semibold text-white">{VACATING_NOTICE_MIN_DAYS} days</dd>
            </div>
            <div>
              <dt className="text-xs text-apg-silver">Monthly rent (reference)</dt>
              <dd className="font-semibold text-white">{paiseToInr(monthlyRentPaise)}</dd>
            </div>
          </dl>
          <NoticeSettlementPanel settlement={noticeDisplay} variant="resident" />
        </ApgCard>
      ) : null}

      {preview ? (
        <ApgCard tier="resident">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-apg-silver">Deposit held</dt>
              <dd className="font-semibold text-white">{paiseToInr(depositHeldPaise)}</dd>
            </div>
            <div>
              <dt className="text-xs text-apg-silver">Estimated refundable amount</dt>
              <dd className="font-semibold text-emerald-400">
                {paiseToInr(preview.estimatedRefundablePaise)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-[11px] text-apg-silver">
            Includes deposit after notice deductions. Unused prepaid rent is credited to your wallet
            after admin approval.
          </p>
        </ApgCard>
      ) : null}

      <div
        className={
          resident
            ? 'rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-apg-silver'
            : `${ACCOUNT_SURFACE} p-4 text-sm text-zinc-700`
        }
      >
        <p className={resident ? 'font-medium text-white' : 'font-medium text-zinc-900'}>
          Important information
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed">
          <li>The date you select is your last paid night — not the day the bed becomes free.</li>
          <li>Electricity will be calculated on the day of vacating.</li>
          <li>Final settlement will be completed after vacating.</li>
          <li>
            Deposit refund cannot be requested until your vacate date arrives and your move-out
            request is approved.
          </li>
        </ul>
      </div>

      <label className="block">
        <span className={labelClass}>Notes (optional)</span>
        <textarea
          name="notes"
          rows={2}
          className={fieldClass}
          placeholder="Anything the office should know about your move-out"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className={resident ? `w-full ${primaryBtn}` : `w-full ${ACCOUNT_SURFACE_PRIMARY_BTN}`}
      >
        {pending ? 'Submitting…' : 'Submit move-out request'}
      </button>

      {state.status === 'error' ? (
        <p
          className={
            resident
              ? 'rounded-lg bg-rose-950/40 px-3 py-2 text-sm text-rose-200'
              : 'rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700'
          }
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );

  return content;
}

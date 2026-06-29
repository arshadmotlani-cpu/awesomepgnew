'use client';

import Link from 'next/link';
import { ApgCard } from '@/src/components/customer/design-system';
import { StatusTimeline } from '@/src/components/customer/design-system';
import { CancelVacatingForm } from '@/src/components/customer/CancelVacatingForm';
import {
  buildVacatingSettlementLines,
  vacatingNextStep,
  vacatingStageIndex,
  vacatingStatusLabel,
  VACATING_JOURNEY_STAGES,
} from '@/src/lib/residents/vacatingJourney';
import {
  currentStageLabel,
  estimateRefundPaise,
  expectedCompletionLabel,
} from '@/src/lib/residents/vacatingPresentation';
import { isFixedStayDurationMode } from '@/src/lib/checkout/checkoutWorkflow';
import { getDepositRefundEligibility } from '@/src/lib/vacating/depositRefundEligibility';
import { accountProfileHref } from '@/src/lib/accountNavigation';
import type { VacatingForBookingRow } from '@/src/db/queries/customer';
import { formatDate, paiseToInr } from '@/src/lib/format';

const PRIMARY_BTN =
  'flex w-full min-h-[52px] items-center justify-center rounded-xl bg-[#FF5A1F] px-6 py-3.5 text-base font-semibold text-white hover:brightness-110';

const SECONDARY_BTN =
  'flex w-full min-h-[52px] items-center justify-center rounded-xl border border-zinc-300 bg-white px-6 py-3.5 text-base font-semibold text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50';

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  approved: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
  none: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
};

type Props = {
  bookingId: string;
  bookingCode: string;
  roomLabel: string;
  vacating: VacatingForBookingRow | null;
  checkoutStatus: string | null;
  checkoutSettlement?: { status: string; rejectionReason?: string | null } | null;
  depositHeldPaise: number;
  durationMode?: string;
  expectedCheckoutDate?: string | null;
  bookingStatus?: string;
  bookingCreatedAt?: Date;
  monthlyRentPaise?: number;
};

export function VacatingHome({
  bookingId,
  bookingCode,
  roomLabel,
  vacating,
  checkoutStatus,
  checkoutSettlement = null,
  depositHeldPaise,
  durationMode = 'monthly',
  expectedCheckoutDate = null,
  bookingStatus = 'confirmed',
  bookingCreatedAt,
  monthlyRentPaise = 0,
}: Props) {
  const fixedStay = isFixedStayDurationMode(durationMode);
  const refundHref = accountProfileHref('resident', {
    tab: 'requests',
    make: '1',
    category: 'deposit_refund',
  });

  const refundEligibility = getDepositRefundEligibility({
    vacating,
    booking:
      bookingCreatedAt != null
        ? {
            status: bookingStatus,
            durationMode,
            expectedCheckoutDate,
            createdAt: bookingCreatedAt,
          }
        : null,
    settlement: checkoutSettlement,
    monthlyRentPaise,
  });

  if (fixedStay) {
    const checkoutDate = expectedCheckoutDate;
    return (
      <div className="space-y-4 pb-2">
        <ApgCard tier="account" className="overflow-hidden p-0">
          <div className="border-b border-emerald-200/60 bg-gradient-to-br from-emerald-50/80 via-white to-white px-5 py-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Fixed-stay checkout
            </p>
            <h2 className="mt-2 text-xl font-bold text-zinc-900">Request your deposit refund</h2>
            <p className="mt-1 text-sm text-zinc-600">
              No move-out approval is needed. Submit your refund when you are leaving — including
              early checkout after speaking with management.
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              {roomLabel} · Booking {bookingCode}
              {checkoutDate ? ` · Checkout ${formatDate(checkoutDate)}` : null}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-px bg-zinc-100">
            <div className="bg-white px-4 py-3">
              <dt className="text-[10px] font-medium uppercase text-zinc-500">Deposit held</dt>
              <dd className="mt-1 text-lg font-bold tabular-nums text-emerald-700">
                {paiseToInr(depositHeldPaise)}
              </dd>
            </div>
            {checkoutDate ? (
              <div className="bg-white px-4 py-3">
                <dt className="text-[10px] font-medium uppercase text-zinc-500">Scheduled checkout</dt>
                <dd className="mt-1 text-sm font-medium text-zinc-900">{formatDate(checkoutDate)}</dd>
              </div>
            ) : null}
          </dl>
        </ApgCard>

        <ApgCard tier="account" className="p-5">
          <h3 className="text-sm font-semibold text-zinc-900">Refund request</h3>
          <p className="mt-1 text-xs text-zinc-600">
            You will need your final AC meter photo (if applicable) and a UPI QR code or UPI ID.
          </p>
          {refundEligibility.unlockState === 'rejected' && refundEligibility.lockReason ? (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {refundEligibility.lockReason}
            </p>
          ) : null}
          {refundEligibility.canRequestRefund ? (
            <Link href={refundHref} className={`${PRIMARY_BTN} mt-4`}>
              Request refund
            </Link>
          ) : (
            <>
              <button type="button" disabled className={`${SECONDARY_BTN} mt-4`}>
                Request refund
              </button>
              {refundEligibility.lockReason ? (
                <p className="mt-2 text-xs text-zinc-500">{refundEligibility.lockReason}</p>
              ) : null}
            </>
          )}
        </ApgCard>
      </div>
    );
  }

  const activeIndex = vacatingStageIndex(
    vacating?.status ?? null,
    checkoutStatus,
    vacating?.vacatingDate ?? null,
  );
  const nextStep = vacatingNextStep({
    vacating,
    checkoutStatus,
    estimatedFinalRefundPaise: estimateRefundPaise(depositHeldPaise, vacating),
  });
  const settlementLines = buildVacatingSettlementLines(vacating);
  const refundEstimate = estimateRefundPaise(depositHeldPaise, vacating);
  const completionLabel = expectedCompletionLabel({ vacating, checkoutStatus });
  const stageLabel = currentStageLabel(
    vacating?.status ?? null,
    checkoutStatus,
    vacating?.vacatingDate ?? null,
  );
  const isRejected = vacating?.status === 'rejected';
  const isActiveVacating =
    vacating != null && ['pending', 'approved'].includes(vacating.status);

  const timelineStages = VACATING_JOURNEY_STAGES.map((s) => ({
    id: s.id,
    label: s.label,
  }));

  return (
    <div className="space-y-4 pb-2">
      <ApgCard tier="account" className="overflow-hidden p-0">
        <div className="border-b border-indigo-200/60 bg-gradient-to-br from-indigo-50/80 via-white to-white px-5 py-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                Current stage · {stageLabel}
              </p>
              <h2 className="mt-2 text-xl font-bold text-zinc-900">{nextStep.headline}</h2>
              <p className="mt-1 text-sm text-zinc-600">{nextStep.detail}</p>
              <p className="mt-2 text-xs text-zinc-500">
                {roomLabel} · Booking {bookingCode}
              </p>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                STATUS_TONE[vacating?.status ?? 'none'] ?? STATUS_TONE.none
              }`}
            >
              {vacatingStatusLabel(vacating?.status ?? null)}
            </span>
          </div>
        </div>
        {(refundEstimate != null || completionLabel) && (
          <dl className="grid grid-cols-2 gap-px bg-zinc-100">
            {refundEstimate != null ? (
              <div className="bg-white px-4 py-3">
                <dt className="text-[10px] font-medium uppercase text-zinc-500">Refund estimate</dt>
                <dd className="mt-1 text-lg font-bold tabular-nums text-emerald-700">
                  {paiseToInr(refundEstimate)}
                </dd>
              </div>
            ) : null}
            {completionLabel ? (
              <div className={`bg-white px-4 py-3 ${refundEstimate == null ? 'col-span-2' : ''}`}>
                <dt className="text-[10px] font-medium uppercase text-zinc-500">Expected completion</dt>
                <dd className="mt-1 text-sm font-medium text-zinc-900">{completionLabel}</dd>
              </div>
            ) : null}
          </dl>
        )}
      </ApgCard>

      {!vacating ? (
        <Link href={`/account/resident/request-vacating/${bookingId}`} className={PRIMARY_BTN}>
          Request move-out
        </Link>
      ) : isRejected ? (
        <>
          <ApgCard tier="account" className="border-rose-200 bg-rose-50/60 p-5">
            <p className="text-sm font-semibold text-rose-900">Move-out request not approved.</p>
            {vacating.notes?.trim() ? (
              <p className="mt-2 text-sm text-rose-800">
                Reason: <span className="font-medium">{vacating.notes.trim()}</span>
              </p>
            ) : null}
            <p className="mt-2 text-xs text-rose-700">
              Submit a new move-out request when you are ready.
            </p>
          </ApgCard>
          <Link href={`/account/resident/request-vacating/${bookingId}`} className={PRIMARY_BTN}>
            Submit new move-out request
          </Link>
        </>
      ) : (
        <>
          <ApgCard tier="account" className="p-5">
            <h3 className="text-sm font-semibold text-zinc-900">Your move-out timeline</h3>
            <p className="mt-1 text-xs text-zinc-600">
              {VACATING_JOURNEY_STAGES[activeIndex]?.residentHint ??
                'Track each step until your refund is sent.'}
            </p>
            <div className="mt-4">
              <StatusTimeline
                stages={timelineStages}
                activeIndex={activeIndex}
                orientation="vertical"
              />
            </div>
          </ApgCard>

          <ApgCard tier="account" className="p-5">
            <h3 className="text-sm font-semibold text-zinc-900">Move-out details</h3>
            <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-zinc-600">Request submitted</dt>
                <dd className="font-medium text-zinc-900">{formatDate(vacating.noticeGivenDate)}</dd>
              </div>
              <div>
                <dt className="text-zinc-600">Move-out date</dt>
                <dd className="font-medium text-zinc-900">{formatDate(vacating.vacatingDate)}</dd>
              </div>
              {vacating.deductionPaise > 0 && vacating.status !== 'completed' ? (
                <div className="sm:col-span-2">
                  <dt className="text-zinc-600">Expected notice deduction</dt>
                  <dd className="font-medium text-rose-700">{paiseToInr(vacating.deductionPaise)}</dd>
                </div>
              ) : null}
              {vacating.status === 'completed' && vacating.deductionPaise > 0 ? (
                <div>
                  <dt className="text-zinc-600">Deduction</dt>
                  <dd className="font-medium text-rose-700">{paiseToInr(vacating.deductionPaise)}</dd>
                </div>
              ) : null}
              {vacating.status === 'completed' ? (
                <div>
                  <dt className="text-zinc-600">Refund sent</dt>
                  <dd className="font-medium text-emerald-700">
                    {paiseToInr(vacating.depositRefundPaise)}
                  </dd>
                </div>
              ) : null}
            </dl>
          </ApgCard>

          <ApgCard tier="account" className="p-5">
            <h3 className="text-sm font-semibold text-zinc-900">Deposit refund</h3>
            <p className="mt-1 text-xs text-zinc-600">
              Deposit held · {paiseToInr(depositHeldPaise)}. After admin approves your move-out and
              your move-out date arrives, submit your refund details here.
            </p>
            {refundEligibility.unlockState === 'rejected' && refundEligibility.lockReason ? (
              <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                {refundEligibility.lockReason}
              </p>
            ) : null}
            {refundEligibility.canRequestRefund ? (
              <Link href={refundHref} className={`${PRIMARY_BTN} mt-4`}>
                Request refund
              </Link>
            ) : (
              <>
                <button type="button" disabled className={`${SECONDARY_BTN} mt-4`}>
                  Request refund
                </button>
                {refundEligibility.lockReason ? (
                  <p className="mt-2 text-xs text-zinc-500">{refundEligibility.lockReason}</p>
                ) : null}
              </>
            )}
          </ApgCard>

          {settlementLines.length > 0 ? (
            <ApgCard tier="account" className="p-5">
              <h3 className="text-sm font-semibold text-zinc-900">Final settlement</h3>
              <ul className="mt-3 space-y-2">
                {settlementLines.map((line) => (
                  <li key={line.label} className="flex items-center justify-between text-sm">
                    <span className="text-zinc-700">{line.label}</span>
                    <span
                      className={`tabular-nums font-semibold ${
                        line.tone === 'deduction'
                          ? 'text-rose-700'
                          : line.tone === 'credit'
                            ? 'text-emerald-700'
                            : 'text-zinc-900'
                      }`}
                    >
                      {line.tone === 'deduction' ? '−' : line.tone === 'credit' ? '+' : ''}
                      {paiseToInr(line.amountPaise)}
                    </span>
                  </li>
                ))}
              </ul>
            </ApgCard>
          ) : null}

          {isActiveVacating && vacating.status === 'pending' ? (
            <CancelVacatingForm requestId={vacating.id} bookingId={bookingId} />
          ) : null}
        </>
      )}
    </div>
  );
}

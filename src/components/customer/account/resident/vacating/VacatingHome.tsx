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
import type { VacatingForBookingRow } from '@/src/db/queries/customer';
import { formatDate, paiseToInr } from '@/src/lib/format';

const PRIMARY_BTN =
  'flex w-full min-h-[52px] items-center justify-center rounded-xl bg-[#FF5A1F] px-6 py-3.5 text-base font-semibold text-white hover:brightness-110';

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
};

export function VacatingHome({
  bookingId,
  bookingCode,
  roomLabel,
  vacating,
  checkoutStatus,
}: Props) {
  const activeIndex = vacatingStageIndex(vacating?.status ?? null, checkoutStatus);
  const nextStep = vacatingNextStep({ vacating, checkoutStatus });
  const settlementLines = buildVacatingSettlementLines(vacating);

  const timelineStages = VACATING_JOURNEY_STAGES.map((s) => ({
    id: s.id,
    label: s.label,
  }));

  return (
    <div className="space-y-4 pb-2">
      <ApgCard tier="account" className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Move-out</p>
            <h2 className="mt-1 text-lg font-semibold text-zinc-900">{nextStep.headline}</h2>
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
      </ApgCard>

      {!vacating ? (
        <>
          <Link
            href={`/account/resident/request-vacating/${bookingId}`}
            className={PRIMARY_BTN}
          >
            Request vacate
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
            <h3 className="text-sm font-semibold text-zinc-900">Notice details</h3>
            <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-zinc-600">Notice submitted</dt>
                <dd className="font-medium text-zinc-900">{formatDate(vacating.noticeGivenDate)}</dd>
              </div>
              <div>
                <dt className="text-zinc-600">Move-out date</dt>
                <dd className="font-medium text-zinc-900">{formatDate(vacating.vacatingDate)}</dd>
              </div>
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

          {settlementLines.length > 0 ? (
            <ApgCard tier="account" className="p-5">
              <h3 className="text-sm font-semibold text-zinc-900">Refund breakdown</h3>
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

          {vacating.status === 'pending' ? (
            <CancelVacatingForm requestId={vacating.id} bookingId={bookingId} />
          ) : null}
        </>
      )}
    </div>
  );
}

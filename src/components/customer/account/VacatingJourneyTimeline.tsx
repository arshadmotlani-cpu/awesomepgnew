'use client';

import { StatusTimeline, type TimelineStage } from '@/src/components/customer/design-system';
import { ApgCard } from '@/src/components/customer/design-system';
import { paiseToInr } from '@/src/lib/format';

const VACATING_STAGES: TimelineStage[] = [
  { id: 'request', label: 'Request vacating' },
  { id: 'notice', label: 'Notice period review' },
  { id: 'electricity', label: 'Electricity settlement' },
  { id: 'deposit', label: 'Deposit settlement' },
  { id: 'refund_review', label: 'Refund review' },
  { id: 'refund_paid', label: 'Refund paid' },
  { id: 'completed', label: 'Completed' },
];

type SettlementLine = {
  label: string;
  amountPaise: number;
  tone?: 'deduction' | 'credit' | 'neutral';
};

type Props = {
  vacatingStatus: string | null;
  checkoutStatus: string | null;
  settlementLines?: SettlementLine[];
};

function vacatingStageIndex(vacatingStatus: string | null, checkoutStatus: string | null): number {
  if (checkoutStatus === 'completed' || checkoutStatus === 'archived') return 6;
  if (checkoutStatus === 'refund_paid') return 5;
  if (checkoutStatus === 'refund_pending' || checkoutStatus === 'awaiting_admin_review') return 4;
  if (checkoutStatus === 'awaiting_resident_details') return 3;
  if (vacatingStatus === 'approved') return 2;
  if (vacatingStatus === 'pending') return 1;
  if (vacatingStatus === 'completed') return 6;
  return 0;
}

export function VacatingJourneyTimeline({
  vacatingStatus,
  checkoutStatus,
  settlementLines = [],
}: Props) {
  const activeIndex = vacatingStageIndex(vacatingStatus, checkoutStatus);

  return (
    <ApgCard tier="account" className="p-5">
      <h3 className="text-base font-semibold text-zinc-900">Vacating journey</h3>
      <p className="mt-1 text-sm text-zinc-600">
        Transparent settlement at every stage — no surprises on your refund.
      </p>
      <div className="mt-5">
        <StatusTimeline
          stages={VACATING_STAGES}
          activeIndex={activeIndex}
          orientation="vertical"
        />
      </div>
      {settlementLines.length > 0 ? (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Settlement breakdown
          </p>
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
        </div>
      ) : null}
    </ApgCard>
  );
}

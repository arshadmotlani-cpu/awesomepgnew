'use client';

import Link from 'next/link';

const SECONDARY =
  'inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/10 px-5 py-3 text-sm font-semibold text-sky-100 hover:bg-sky-500/20';

export type BillingGenerationStatus = {
  billingMonth: string;
  monthLabel: string;
  rent: {
    statusLabel: string;
    generatedCount: number;
    pendingCount: number;
    candidateCount: number;
  };
  electricity: {
    statusLabel: string;
    roomsNeedingBillCount: number;
    roomsWaitingMeterCount: number;
  };
};

type Props = {
  billingMonth: string;
  generationStatus: BillingGenerationStatus;
};

function monthInputValue(billingMonth: string): string {
  return billingMonth.slice(0, 7);
}

export function BillingPrimaryActions({ billingMonth, generationStatus }: Props) {
  const monthValue = monthInputValue(billingMonth);
  const { rent, electricity, monthLabel } = generationStatus;
  const rentNeedsAttention = rent.pendingCount > 0;
  const rentAllGenerated =
    rent.pendingCount === 0 && rent.generatedCount > 0 && rent.candidateCount > 0;

  return (
    <section className="mb-6 rounded-2xl border border-white/10 bg-[#1A1F27] p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-white">Billing Center</h2>
      <p className="mt-1 text-sm text-apg-silver">
        Rent bills generate automatically on the 1st. Electricity bills need meter readings from
        operations.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-[#12161C] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white">Rent</h3>
              <p className="mt-0.5 text-xs text-apg-silver">{monthLabel}</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-apg-silver">
              {rent.statusLabel}
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-2">
              <dt className="text-[10px] uppercase text-apg-silver">Generated</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-white">
                {rent.generatedCount}
              </dd>
            </div>
            <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-2">
              <dt className="text-[10px] uppercase text-apg-silver">Pending</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-white">
                {rent.pendingCount}
              </dd>
            </div>
            <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-2">
              <dt className="text-[10px] uppercase text-apg-silver">Residents</dt>
              <dd className="mt-0.5 text-sm font-semibold tabular-nums text-white">
                {rent.candidateCount}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-apg-silver">
            Rent bills are generated automatically on the 1st of each month.
          </p>
          {rentAllGenerated ? (
            <p className="mt-3 text-xs font-medium text-emerald-200">✓ All rent bills generated</p>
          ) : null}
          {rentNeedsAttention ? (
            <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2">
              <p className="text-xs font-medium text-amber-100">
                ⚠ {rent.pendingCount} rent bill{rent.pendingCount === 1 ? '' : 's'} need attention
              </p>
              <Link
                href={`/admin/billing?tab=failures&month=${monthValue}`}
                className="mt-2 inline-flex text-xs font-semibold text-[#FF5A1F] hover:underline"
              >
                Review →
              </Link>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-white/10 bg-[#12161C] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white">
                Electricity
              </h3>
              <p className="mt-0.5 text-xs text-apg-silver">{monthLabel}</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-apg-silver">
              PG-scoped
            </span>
          </div>
          <p className="mt-3 text-xs text-apg-silver">
            Select a PG to view billing status. Meter readings and generation are scoped to one PG
            at a time — never all PGs together.
          </p>
          {electricity.roomsWaitingMeterCount > 0 ? (
            <p className="mt-2 text-xs text-amber-200">
              Across all PGs, {electricity.roomsWaitingMeterCount} AC room
              {electricity.roomsWaitingMeterCount === 1 ? '' : 's'} still lack a bill for this month
              (open electricity billing to work PG by PG).
            </p>
          ) : (
            <p className="mt-2 text-xs text-emerald-200">
              No AC rooms are missing electricity bills for this month.
            </p>
          )}
          <Link
            href={`/admin/billing/electricity/generate?month=${monthValue}`}
            className={`${SECONDARY} mt-4`}
          >
            Open Electricity Billing →
          </Link>
        </div>
      </div>
    </section>
  );
}

import { paiseToInr } from '@/src/lib/format';
import type { ResidentFinancialSummary } from '@/src/lib/billing/residentFinancialTypes';

type Props = {
  summary: ResidentFinancialSummary;
};

function CategoryBlock({
  label,
  category,
  refundablePaise,
}: {
  label: string;
  category: { requiredPaise: number; paidPaise: number; outstandingPaise: number };
  refundablePaise?: number;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/80 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">{label}</p>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-zinc-500">Required</dt>
          <dd className="font-medium text-zinc-900">{paiseToInr(category.requiredPaise)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Paid</dt>
          <dd className="font-medium text-emerald-700">{paiseToInr(category.paidPaise)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Outstanding</dt>
          <dd
            className={
              category.outstandingPaise > 0
                ? 'font-semibold text-rose-700'
                : 'font-medium text-zinc-700'
            }
          >
            {paiseToInr(category.outstandingPaise)}
          </dd>
        </div>
      </dl>
      {refundablePaise != null && refundablePaise > 0 ? (
        <p className="mt-2 text-[11px] text-indigo-700">
          Refundable balance: {paiseToInr(refundablePaise)}
        </p>
      ) : null}
    </div>
  );
}

/** Resident-facing financial summary — same SSOT figures as admin profile. */
export function ResidentFinancialSummaryPanel({ summary }: Props) {
  return (
    <section className="rounded-xl border border-indigo-200 bg-white p-4 shadow-sm ring-1 ring-indigo-100">
      <header className="mb-4">
        <h2 className="text-sm font-semibold text-zinc-900">Financial summary</h2>
        <p className="mt-0.5 text-xs text-zinc-600">
          Same totals as your PG admin sees · Required · Paid · Outstanding
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <CategoryBlock label="Rent" category={summary.rent} />
        <CategoryBlock
          label="Deposit"
          category={summary.deposit}
          refundablePaise={summary.deposit.refundablePaise}
        />
        <CategoryBlock label="Electricity" category={summary.electricity} />
        {summary.other.outstandingPaise > 0 ? (
          <CategoryBlock label="Other charges" category={summary.other} />
        ) : null}
      </div>
      <div className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
        <p className="text-xs text-indigo-800">
          Grand outstanding:{' '}
          <span className="text-base font-bold text-indigo-950">
            {paiseToInr(summary.totals.outstandingPaise)}
          </span>
        </p>
      </div>
    </section>
  );
}

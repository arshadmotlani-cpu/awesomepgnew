import { ApgCard } from '@/src/components/customer/design-system';
import { BillingRulesCallout } from '@/src/components/customer/account/v2/BillingRulesCallout';
import { paiseToInr } from '@/src/lib/format';
import type { ResidentFinancialSummary } from '@/src/lib/billing/residentFinancialTypes';

type Props = {
  summary: ResidentFinancialSummary;
  pgName: string | null;
  roomNumber: string | null;
};

export function BillingOverviewModule({ summary, pgName, roomNumber }: Props) {
  return (
    <section id="billing" className="scroll-mt-24">
      <ApgCard tier="account" className="p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-zinc-900">Current Bill Summary</h2>
        {pgName ? (
          <p className="mt-1 text-sm text-zinc-600">
            {pgName}
            {roomNumber ? ` · Room ${roomNumber}` : ''}
          </p>
        ) : null}

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <dt className="text-xs font-semibold uppercase text-zinc-500">Rent</dt>
            <dd className="mt-1 text-lg font-bold text-zinc-900">
              {paiseToInr(summary.rent.outstandingPaise)}
              <span className="ml-1 text-xs font-normal text-zinc-500">due</span>
            </dd>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Paid {paiseToInr(summary.rent.paidPaise)} of {paiseToInr(summary.rent.requiredPaise)}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <dt className="text-xs font-semibold uppercase text-zinc-500">Electricity</dt>
            <dd className="mt-1 text-lg font-bold text-zinc-900">
              {paiseToInr(summary.electricity.outstandingPaise)}
              <span className="ml-1 text-xs font-normal text-zinc-500">due</span>
            </dd>
            <p className="mt-0.5 text-[11px] text-zinc-500">
              Meter or average billing · synced with admin
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
            <dt className="text-xs font-semibold uppercase text-zinc-500">Deposit</dt>
            <dd className="mt-1 text-lg font-bold text-zinc-900">
              {paiseToInr(summary.deposit.paidPaise)}
              <span className="ml-1 text-xs font-normal text-zinc-500">held</span>
            </dd>
            {summary.deposit.refundablePaise > 0 ? (
              <p className="mt-0.5 text-[11px] text-indigo-700">
                Refundable: {paiseToInr(summary.deposit.refundablePaise)}
              </p>
            ) : null}
          </div>
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 sm:col-span-2">
            <dt className="text-xs font-semibold uppercase text-indigo-700">Total Due</dt>
            <dd className="mt-1 text-2xl font-bold text-indigo-950">
              {paiseToInr(summary.totals.outstandingPaise)}
            </dd>
          </div>
        </dl>

        <div className="mt-5">
          <BillingRulesCallout compact />
        </div>
      </ApgCard>
    </section>
  );
}

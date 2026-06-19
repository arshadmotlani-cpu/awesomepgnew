import Link from 'next/link';
import { formatDate, paiseToInr } from '@/src/lib/format';
import { ACCOUNT_LINK_IN_SURFACE, ACCOUNT_SURFACE } from '@/src/components/customer/accountStyles';
import { GlossaryTip } from '@/src/components/customer/account/resident/GlossaryTip';
import type { ResidentFinancialSummary } from '@/src/lib/billing/residentFinancialTypes';

function identityLabel(kycStatus: string, documentsSubmitted: boolean): string {
  if (kycStatus === 'approved') return 'Verified';
  if (kycStatus === 'rejected') return 'Needs resubmit';
  if (documentsSubmitted) return 'Under review';
  return 'Not complete';
}

function identityTone(kycStatus: string, documentsSubmitted: boolean): string {
  if (kycStatus === 'approved') return 'text-emerald-700 bg-emerald-50 ring-emerald-200';
  if (kycStatus === 'rejected') return 'text-rose-700 bg-rose-50 ring-rose-200';
  if (documentsSubmitted) return 'text-amber-700 bg-amber-50 ring-amber-200';
  return 'text-zinc-700 bg-zinc-100 ring-zinc-200';
}

export function ResidentHomeSummary({
  pgName,
  roomNumber,
  bedCode,
  bookingCode,
  checkInDate,
  expectedCheckoutDate,
  monthlyRentPaise,
  financialSummary,
  kycStatus,
  documentsSubmitted,
  openRequestCount,
}: {
  pgName: string;
  roomNumber: string;
  bedCode: string;
  bookingCode: string;
  checkInDate: string;
  expectedCheckoutDate: string | null;
  monthlyRentPaise: number;
  financialSummary: ResidentFinancialSummary;
  kycStatus: string;
  documentsSubmitted: boolean;
  openRequestCount: number;
}) {
  const amountDue = financialSummary.totals.outstandingPaise;
  const idLabel = identityLabel(kycStatus, documentsSubmitted);

  return (
    <section className={`${ACCOUNT_SURFACE} p-5`}>
      <header className="mb-4">
        <h2 className="text-base font-semibold text-zinc-900">Your stay</h2>
        <p className="mt-1 text-sm text-zinc-600">
          {pgName} · Room {roomNumber} · Bed {bedCode}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Booking{' '}
          <Link href={`/booking/${bookingCode}`} className={`font-mono ${ACCOUNT_LINK_IN_SURFACE}`}>
            {bookingCode}
          </Link>
          {' · '}Moved in {formatDate(checkInDate)}
          {expectedCheckoutDate ? ` · Leaving ${formatDate(expectedCheckoutDate)}` : ' · No end date'}
          {' · '}Rent {paiseToInr(monthlyRentPaise)}/month
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Amount due"
          value={paiseToInr(amountDue)}
          accent={amountDue > 0 ? 'due' : undefined}
        />
        <SummaryCard
          label="Rent due"
          value={paiseToInr(financialSummary.rent.outstandingPaise)}
        />
        <SummaryCard
          label="Identity"
          value={idLabel}
          badgeClass={identityTone(kycStatus, documentsSubmitted)}
        />
        <SummaryCard
          label="Open requests"
          value={openRequestCount === 0 ? 'None' : String(openRequestCount)}
        />
      </dl>

      {financialSummary.deposit.refundablePaise > 0 ? (
        <p className="mt-3 text-xs text-zinc-600">
          <GlossaryTip term="Money held from your security deposit that can come back to you after checkout.">
            Refundable deposit
          </GlossaryTip>
          : {paiseToInr(financialSummary.deposit.refundablePaise)}
        </p>
      ) : null}
    </section>
  );
}

function SummaryCard({
  label,
  value,
  accent,
  badgeClass,
}: {
  label: string;
  value: string;
  accent?: 'due';
  badgeClass?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1">
        {badgeClass ? (
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${badgeClass}`}
          >
            {value}
          </span>
        ) : (
          <span
            className={
              'text-base font-semibold tabular-nums ' +
              (accent === 'due' ? 'text-[#FF5A1F]' : 'text-zinc-900')
            }
          >
            {value}
          </span>
        )}
      </dd>
    </div>
  );
}

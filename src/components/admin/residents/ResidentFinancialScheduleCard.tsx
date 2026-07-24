import { formatDate, paiseToInr } from '@/src/lib/format';
import { adminStayTypeLabel, isMonthlyStayType } from '@/src/lib/stayType';
import type { ResidentBillingFormDefaults, ResidentLastInvoiceSnapshot } from '@/src/services/residentBillingProfiles';
import type { MonthlyBillingSnapshot } from '@/src/lib/billing/monthlyBillingSnapshot';
import type { DepositSummary } from '@/src/services/deposits';
import type { ResidentFinancialSummary } from '@/src/lib/billing/residentFinancialTypes';

const SURFACE = 'rounded-2xl border border-white/10 bg-[#1A1F27] p-5';

export function ResidentFinancialScheduleCard({
  billingDefaults,
  billingSnapshot,
  financialSummary,
  depositSummary,
  moveInDate,
  stayType,
  durationMode,
  expectedCheckoutDate,
}: {
  billingDefaults: ResidentBillingFormDefaults | null;
  billingSnapshot?: MonthlyBillingSnapshot | null;
  financialSummary: ResidentFinancialSummary | null;
  depositSummary: DepositSummary | null;
  moveInDate: string;
  stayType?: string | null;
  durationMode?: string | null;
  expectedCheckoutDate?: string | null;
}) {
  const monthlyStay = isMonthlyStayType(stayType ?? durationMode);
  const depositRequired = financialSummary?.deposit.requiredPaise ?? 0;
  const depositPaid = depositSummary?.collectedPaise ?? financialSummary?.deposit.paidPaise ?? 0;
  const depositOutstanding = financialSummary?.deposit.outstandingPaise ?? 0;

  return (
    <section className={SURFACE}>
      <p className="text-xs font-medium uppercase tracking-wide text-apg-silver">Financial summary</p>
      <p className="mt-1 text-xs text-apg-silver">
        {monthlyStay
          ? 'Rent schedule, deposits, and recent billing — one place without switching screens.'
          : 'Fixed-date stay — upfront rent and deposit only. No monthly rent cycle.'}
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label="Stay type"
          value={adminStayTypeLabel({ stayType, durationMode })}
        />
        <Stat label="Check-in" value={formatDate(moveInDate)} />
        {monthlyStay ? (
          <>
            <Stat
              label="Next rent due"
              value={formatDate(
                billingSnapshot?.nextRentDueDate ??
                  billingDefaults?.nextRentDueDate ??
                  moveInDate,
              )}
              accent
            />
            <Stat
              label="Billing cycle"
              value={billingSnapshot?.billingCycleLabel ?? 'Monthly'}
            />
            <Stat
              label="Paid until"
              value={
                billingSnapshot?.paidUntilDate
                  ? formatDate(billingSnapshot.paidUntilDate)
                  : '—'
              }
            />
            <Stat
              label="Rent due day"
              value={
                billingSnapshot?.billingCycleLabel ??
                (billingDefaults ? `${billingDefaults.billingDay} of each month` : '—')
              }
            />
            <Stat
              label="Billing period"
              value={billingSnapshot?.billingPeriodLabel ?? '—'}
            />
            {billingDefaults?.lastInvoice ? (
              <LastInvoiceStat invoice={billingDefaults.lastInvoice} />
            ) : (
              <Stat label="Last invoice" value="—" />
            )}
          </>
        ) : (
          <>
            <Stat
              label="Check-out"
              value={expectedCheckoutDate ? formatDate(expectedCheckoutDate) : '—'}
              accent
            />
            <Stat label="Billing cycle" value="Fixed stay (no recurring rent)" />
          </>
        )}
        <Stat label="Deposit required" value={depositRequired > 0 ? paiseToInr(depositRequired) : '—'} />
        <Stat label="Deposit paid" value={depositPaid > 0 ? paiseToInr(depositPaid) : '—'} />
        <Stat
          label="Deposit outstanding"
          value={depositOutstanding > 0 ? paiseToInr(depositOutstanding) : paiseToInr(0)}
          warn={depositOutstanding > 0}
        />
      </dl>
    </section>
  );
}

function LastInvoiceStat({ invoice }: { invoice: ResidentLastInvoiceSnapshot }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#12161C] px-3 py-2">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">Last invoice</dt>
      <dd className="mt-1 space-y-0.5 text-sm font-semibold text-white">
        <p>{formatDate(invoice.invoiceDate)}</p>
        <p className="text-xs font-medium text-apg-silver">
          {invoice.statusLabel} · {paiseToInr(invoice.amountPaise)}
        </p>
      </dd>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#12161C] px-3 py-2">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-apg-silver">{label}</dt>
      <dd
        className={`mt-1 text-sm font-semibold ${
          warn ? 'text-amber-200' : accent ? 'text-emerald-300' : 'text-white'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

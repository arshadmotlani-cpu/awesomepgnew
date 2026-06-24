import { formatDate, paiseToInr } from '@/src/lib/format';
import { adminStayTypeLabel, isMonthlyStayType } from '@/src/lib/stayType';
import type { ResidentBillingFormDefaults } from '@/src/services/residentBillingProfiles';
import type { DepositSummary } from '@/src/services/deposits';
import type { ResidentFinancialSummary } from '@/src/lib/billing/residentFinancialTypes';

const SURFACE = 'rounded-2xl border border-white/10 bg-[#1A1F27] p-5';

export function ResidentFinancialScheduleCard({
  billingDefaults,
  financialSummary,
  depositSummary,
  moveInDate,
  stayType,
  durationMode,
  expectedCheckoutDate,
}: {
  billingDefaults: ResidentBillingFormDefaults | null;
  financialSummary: ResidentFinancialSummary | null;
  depositSummary: DepositSummary | null;
  moveInDate: string;
  stayType?: string | null;
  durationMode?: string | null;
  expectedCheckoutDate?: string | null;
}) {
  const monthlyStay = isMonthlyStayType(stayType ?? durationMode);
  const firstRentItem = financialSummary?.rent.items[0];
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
              label="Current rent due date"
              value={billingDefaults?.dueDate ? formatDate(billingDefaults.dueDate) : '—'}
              accent
            />
            <Stat label="Billing cycle" value="Monthly" />
            <Stat
              label="Rent due day"
              value={billingDefaults ? `${billingDefaults.billingDay} of each month` : '—'}
            />
            <Stat
              label="Last invoice date"
              value={
                firstRentItem?.generatedAt
                  ? formatDate(firstRentItem.generatedAt.slice(0, 10))
                  : '—'
              }
            />
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

import Link from 'next/link';
import type { BillingCycleReconciliation } from '@/src/services/billingCycleReconciliation';

export function BillingCycleStatusBanner({
  reconciliation,
}: {
  reconciliation: BillingCycleReconciliation;
}) {
  const success = reconciliation.status === 'success';
  const month = reconciliation.billingMonth.slice(0, 7);

  return (
    <Link
      href={`/admin/billing?tab=dashboard&month=${month}`}
      className={
        success
          ? 'mb-8 block rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-4 transition hover:border-emerald-400/60'
          : 'mb-8 block rounded-2xl border border-rose-500/40 bg-rose-500/10 px-5 py-4 transition hover:border-rose-400/60'
      }
    >
      <p className={success ? 'font-semibold text-emerald-100' : 'font-semibold text-rose-100'}>
        {reconciliation.headline}
      </p>
      <p className="mt-1 text-sm text-apg-silver">
        {reconciliation.monthLabel} · {reconciliation.metrics.rentResidentsBilled} rent +{' '}
        {reconciliation.metrics.electricityResidentsBilled} electricity residents billed ·{' '}
        {reconciliation.metrics.rentWaitingPayment +
          reconciliation.metrics.electricityWaitingPayment +
          reconciliation.metrics.waitingAdminReview}{' '}
        open billing items · Tap for full reconciliation
      </p>
    </Link>
  );
}

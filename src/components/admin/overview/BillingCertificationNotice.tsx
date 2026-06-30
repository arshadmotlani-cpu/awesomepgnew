import Link from 'next/link';
import type { BillingCycleReconciliation } from '@/src/services/billingCycleReconciliation';

/** Non-blocking billing certification strip on Overview — never crashes the page. */
export function BillingCertificationNotice({
  reconciliation,
  error,
}: {
  reconciliation?: BillingCycleReconciliation | null;
  error?: string;
}) {
  if (error) {
    return (
      <div className="mb-8 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4">
        <p className="font-semibold text-amber-100">Billing certification unavailable</p>
        <p className="mt-1 text-sm text-amber-200/90">{error}</p>
        <p className="mt-2 text-xs text-apg-silver">
          Overview and Operations continue to work. Open{' '}
          <Link href="/admin/billing" className="text-[#FF5A1F] hover:underline">
            Billing Centre
          </Link>{' '}
          for financial detail.
        </p>
      </div>
    );
  }

  if (!reconciliation) return null;

  const success = reconciliation.status === 'success';

  return (
    <Link
      href="/admin/billing?tab=dashboard"
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
        {reconciliation.metrics.electricityResidentsBilled} electricity billed · Tap for Billing
        Centre
      </p>
    </Link>
  );
}

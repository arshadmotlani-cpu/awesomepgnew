import Link from 'next/link';
import type { BillingCycleReconciliation } from '@/src/services/billingCycleReconciliation';

/** Compact actionable billing strip on Overview — hidden when nothing needs action. */
export function BillingCertificationNotice({
  reconciliation,
  error,
}: {
  reconciliation?: BillingCycleReconciliation | null;
  error?: string;
}) {
  if (error) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5">
        <p className="text-sm font-medium text-amber-100">Billing certification unavailable</p>
        <p className="mt-0.5 text-xs text-amber-200/90">{error}</p>
        <p className="mt-1 text-xs text-apg-silver">
          Open{' '}
          <Link href="/admin/billing" className="text-[#FF5A1F] hover:underline">
            Billing Centre
          </Link>{' '}
          for financial detail.
        </p>
      </div>
    );
  }

  if (!reconciliation || reconciliation.actionableIssueCount === 0) return null;

  return (
    <Link
      href={reconciliation.actionableReviewHref}
      className="flex items-center justify-between gap-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm transition hover:border-rose-400/60"
    >
      <span className="font-medium text-rose-100">
        ⚠ {reconciliation.actionableHeadline}
      </span>
      <span className="shrink-0 font-medium text-[#FF5A1F]">Review →</span>
    </Link>
  );
}

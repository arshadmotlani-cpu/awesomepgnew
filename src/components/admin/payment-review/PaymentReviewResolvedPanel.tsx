import Link from 'next/link';
import { operationsFilterHref } from '@/src/lib/operations/operationsFilterLinks';

const COPY = {
  already_processed: {
    title: 'Payment approved',
    body: 'This payment has already been reviewed. Continue to any section from the sidebar.',
  },
  not_found: {
    title: 'Review no longer pending',
    body: 'This payment is no longer awaiting review. Continue to any section from the sidebar.',
  },
  access_denied: {
    title: 'Access denied',
    body: 'You do not have access to this payment review.',
  },
} as const;

export function PaymentReviewResolvedPanel({
  reason,
}: {
  reason: 'already_processed' | 'not_found' | 'access_denied';
}) {
  const copy = COPY[reason];
  const tone =
    reason === 'access_denied'
      ? 'border-rose-500/25 bg-rose-500/5 text-rose-200'
      : 'border-emerald-500/25 bg-emerald-500/5 text-emerald-100';

  return (
    <div
      data-payment-review-resolved
      data-navigation-blocked="false"
      className={`rounded-2xl border px-5 py-6 text-sm ${tone}`}
    >
      <p className="font-semibold text-white">{copy.title}</p>
      <p className="mt-2 text-apg-silver">{copy.body}</p>
      <Link
        href={operationsFilterHref('waiting_for_approval')}
        className="mt-4 inline-flex rounded-lg border border-white/10 px-3.5 py-2 text-sm font-medium text-white hover:bg-white/5"
      >
        Back to operations
      </Link>
    </div>
  );
}

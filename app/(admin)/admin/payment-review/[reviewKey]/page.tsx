import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PaymentReviewWorkspace } from '@/src/components/admin/payment-review/PaymentReviewWorkspace';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { operationsFilterHref } from '@/src/lib/operations/operationsFilterLinks';
import { loadPaymentReviewWorkspace } from '@/src/services/paymentReviewWorkspace';
import styles from '../payment-review.module.css';

export const dynamic = 'force-dynamic';

export default async function PaymentReviewPage(props: PageProps<'/admin/payment-review/[reviewKey]'>) {
  const { reviewKey: rawKey } = await props.params;
  const reviewKey = decodeURIComponent(rawKey);
  const session = await requireAdminSession(`/admin/payment-review/${encodeURIComponent(reviewKey)}`);

  let result;
  try {
    result = await loadPaymentReviewWorkspace(session, reviewKey);
  } catch {
    return (
      <>
        <ModuleBreadcrumbs
          items={[
            { label: 'Overview', href: moduleHref('overview') },
            { label: ADMIN_MODULES.operations.label, href: operationsFilterHref('waiting_for_approval') },
            { label: 'Payment review' },
          ]}
        />
        <div data-payment-review-workspace className={styles.workspace}>
          <div className="rounded-2xl border border-rose-500/25 bg-rose-500/5 px-5 py-6 text-sm text-rose-200">
            <p className="font-semibold text-white">Payment review could not load</p>
            <p className="mt-2 text-apg-silver">
              The queue item is still available. Reload this page. If approval already succeeded,
              check Booking financials before approving again.
            </p>
          </div>
        </div>
      </>
    );
  }

  if (!result.ok) {
    if (result.reason === 'already_processed') {
      redirect(operationsFilterHref('waiting_for_approval'));
    }
    redirect(operationsFilterHref('waiting_for_approval'));
  }

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.operations.label, href: operationsFilterHref('waiting_for_approval') },
          { label: 'Payment review' },
        ]}
      />
      <div data-payment-review-workspace className={styles.workspace}>
        <AdminSectionErrorBoundary title="Payment review">
          <PaymentReviewWorkspace data={result.data} />
        </AdminSectionErrorBoundary>
      </div>
    </>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PaymentReviewWorkspace } from '@/src/components/admin/payment-review/PaymentReviewWorkspace';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { operationsFilterHref } from '@/src/lib/operations/operationsFilterLinks';
import { loadPaymentReviewWorkspace } from '@/src/services/paymentReviewWorkspace';

export const dynamic = 'force-dynamic';

export default async function PaymentReviewPage(props: PageProps<'/admin/payment-review/[reviewKey]'>) {
  const { reviewKey: rawKey } = await props.params;
  const reviewKey = decodeURIComponent(rawKey);
  const session = await requireAdminSession(`/admin/payment-review/${encodeURIComponent(reviewKey)}`);

  const result = await loadPaymentReviewWorkspace(session, reviewKey);

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
      <AdminSectionErrorBoundary title="Payment review">
        <PaymentReviewWorkspace data={result.data} />
      </AdminSectionErrorBoundary>
    </>
  );
}

import Link from 'next/link';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OperationsPaymentReviewsPanel } from '@/src/components/admin/operations/OperationsPaymentReviewsPanel';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { OPS_ORANGE } from '@/src/components/admin/residentOps/residentOpsUi';
import { requireAdminPermission, requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { listPendingPaymentReviews } from '@/src/services/paymentProofQueue';

export const dynamic = 'force-dynamic';

export default async function OperationsPaymentReviewsPage() {
  await ensureAdminPageNotificationsSeen(
    '/admin/operations/payment-reviews',
    '/admin/operations/payment-reviews',
  );
  await requireAdminSession('/admin/operations/payment-reviews');
  const session = await requireAdminPermission('payments:write');
  const items = await listPendingPaymentReviews(session);

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.operations.label, href: ADMIN_MODULES.operations.href },
          { label: 'Payment reviews' },
        ]}
      />
      <PageHeader
        title="Payment reviews"
        description="Single operations queue for every payment screenshot — booking, rent, deposit, electricity, and more."
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-apg-silver">
          {items.length === 0
            ? 'No proofs waiting — residents appear here after uploading payment screenshots.'
            : `${items.length} payment proof${items.length === 1 ? '' : 's'} awaiting review.`}
        </p>
        <Link
          href="/admin/operations"
          className="text-sm font-medium hover:underline"
          style={{ color: OPS_ORANGE }}
        >
          ← Back to resident operations
        </Link>
      </div>

      <div className="mt-6">
        <AdminSectionErrorBoundary title="Payment reviews">
          <OperationsPaymentReviewsPanel items={items} />
        </AdminSectionErrorBoundary>
      </div>
    </>
  );
}

import { redirect } from 'next/navigation';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OperationsMasterQueue } from '@/src/components/admin/operations/OperationsMasterQueue';
import { OperationsPaymentReviewsPanel } from '@/src/components/admin/operations/OperationsPaymentReviewsPanel';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { requireAdminSession } from '@/src/lib/auth/guards';
import {
  loadUnifiedOperationsQueue,
  parseUnifiedOpsFilter,
} from '@/src/services/unifiedOperationsQueue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const params = await searchParams;
  const filter = parseUnifiedOpsFilter(params.filter);
  const session = await requireAdminSession('/admin/operations');
  await ensureAdminPageNotificationsSeen('/admin/operations', '/admin/operations');

  const data = await loadUnifiedOperationsQueue(session, filter);
  const showPaymentPanel =
    filter === 'payment_proof' || filter === 'waiting_for_admin_review';

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.operations.label },
        ]}
      />

      <AdminSectionErrorBoundary title="Operations">
        {showPaymentPanel ? (
          <section className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-white">Payment screenshots</h2>
            {data.paymentReviews.length > 0 ? (
              <OperationsPaymentReviewsPanel items={data.paymentReviews} />
            ) : (
              <p className="rounded-xl border border-white/10 bg-[#1A1F27] px-4 py-8 text-center text-sm text-apg-silver">
                No payment proofs waiting for review.
              </p>
            )}
          </section>
        ) : null}
        <OperationsMasterQueue data={data} />
      </AdminSectionErrorBoundary>
    </>
  );
}

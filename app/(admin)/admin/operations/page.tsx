import { redirect } from 'next/navigation';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OperationsMasterQueue } from '@/src/components/admin/operations/OperationsMasterQueue';
import { OperationsPaymentReviewsPanel } from '@/src/components/admin/operations/OperationsPaymentReviewsPanel';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { resolveOperationsFocusParam } from '@/src/lib/approvals/approvalDeepLinks';
import {
  defaultOperationsFilter,
  operationsFilterHref,
  parseOperationsFilter,
} from '@/src/lib/operations/operationsFilterLinks';
import {
  loadUnifiedOperationsQueue,
} from '@/src/services/unifiedOperationsQueue';
import { PAYMENT_ALREADY_APPROVED_MESSAGE } from '@/src/lib/operations/paymentReviewMessages';
import {
  listPaymentProofRejectionsForEntity,
  listRecentPaymentProofRejectionsForAdmin,
  reviewKindToEntityType,
} from '@/src/services/paymentProofRejectionService';
import { OperationsRejectedPaymentsSection } from '@/src/components/admin/operations/OperationsRejectedPaymentsSection';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; focus?: string; key?: string }>;
}) {
  const params = await searchParams;
  const session = await requireAdminSession('/admin/operations');
  await ensureAdminPageNotificationsSeen('/admin/operations', '/admin/operations');

  const filter = parseOperationsFilter(params.filter);
  const focus = resolveOperationsFocusParam(params);

  if (!filter) {
    const preview = await loadUnifiedOperationsQueue(session, 'waiting_for_approval', focus);
    const counts = Object.fromEntries(
      preview.filterCounts.map((c) => [c.id, c.count]),
    ) as Record<(typeof preview.filterCounts)[number]['id'], number>;
    redirect(operationsFilterHref(defaultOperationsFilter(counts)));
  }

  const data = await loadUnifiedOperationsQueue(session, filter, focus);

  const focusReview =
    filter === 'waiting_for_approval' && focus
      ? data.paymentReviews.find((p) => p.key === focus) ?? null
      : null;

  const staleFocusReview =
    filter === 'waiting_for_approval' && focus && !focusReview;

  const rejectionHistory = focusReview
    ? await listPaymentProofRejectionsForEntity(
        reviewKindToEntityType(focusReview.kind),
        focusReview.entityId,
      )
    : [];

  const recentRejections =
    filter === 'waiting_for_approval'
      ? await listRecentPaymentProofRejectionsForAdmin(session, 40)
      : [];

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.operations.label },
        ]}
      />

      <AdminSectionErrorBoundary title="Operations">
        {staleFocusReview ? (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {PAYMENT_ALREADY_APPROVED_MESSAGE}
          </div>
        ) : null}
        {filter === 'waiting_for_approval' && focusReview ? (
          <section className="mb-8">
            <OperationsPaymentReviewsPanel
              items={[focusReview]}
              reviewMode={false}
              rejectionHistory={rejectionHistory}
            />
          </section>
        ) : null}
        <OperationsMasterQueue
          data={data}
          isSuperAdmin={session.role === 'super_admin'}
          recentRejections={recentRejections}
        />
      </AdminSectionErrorBoundary>
    </>
  );
}

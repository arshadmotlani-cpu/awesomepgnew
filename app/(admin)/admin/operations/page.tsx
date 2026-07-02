import { redirect } from 'next/navigation';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OperationsMasterQueue } from '@/src/components/admin/operations/OperationsMasterQueue';
import { OperationsPaymentReviewsPanel } from '@/src/components/admin/operations/OperationsPaymentReviewsPanel';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { requireAdminSession } from '@/src/lib/auth/guards';
import {
  defaultOperationsFilter,
  operationsFilterHref,
  parseOperationsFilter,
} from '@/src/lib/operations/operationsFilterLinks';
import {
  loadUnifiedOperationsQueue,
} from '@/src/services/unifiedOperationsQueue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; focus?: string }>;
}) {
  const params = await searchParams;
  const session = await requireAdminSession('/admin/operations');
  await ensureAdminPageNotificationsSeen('/admin/operations', '/admin/operations');

  let filter = parseOperationsFilter(params.filter);
  const focus = params.focus?.trim() ?? null;

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
      : filter === 'waiting_for_approval'
        ? data.paymentReviews[0] ?? null
        : null;

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.operations.label },
        ]}
      />

      <AdminSectionErrorBoundary title="Operations">
        {filter === 'waiting_for_approval' && focusReview ? (
          <section className="mb-8">
            <OperationsPaymentReviewsPanel items={[focusReview]} reviewMode={false} />
          </section>
        ) : null}
        <OperationsMasterQueue data={data} isSuperAdmin={session.role === 'super_admin'} />
      </AdminSectionErrorBoundary>
    </>
  );
}

import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { DbStatusBanner } from '@/src/components/admin/DbStatusBanner';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { PageHeader } from '@/src/components/admin/PageHeader';
import { ResidentOperationsAdvancedTools } from '@/src/components/admin/residentOps/ResidentOperationsAdvancedTools';
import { ResidentOperationsAttentionCenter } from '@/src/components/admin/residentOps/ResidentOperationsAttentionCenter';
import { ResidentOperationsQueue } from '@/src/components/admin/residentOps/ResidentOperationsQueue';
import { ResidentOperationsTimeline } from '@/src/components/admin/residentOps/ResidentOperationsTimeline';
import { ResidentOperationsTodayWork } from '@/src/components/admin/residentOps/ResidentOperationsTodayWork';
import { getOccupancyByPg } from '@/src/db/queries/admin';
import { requireAdminSession } from '@/src/lib/auth/guards';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { resolveBillingMonth } from '@/src/lib/dateDefaults';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import {
  filterQueueByBucket,
  type AttentionBucketId,
} from '@/src/lib/residents/residentOperationsDashboard';
import { loadOverviewContext } from '@/src/services/overviewData';
import { loadResidentOperationsDashboard } from '@/src/services/residentOperationsDashboard';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VALID_FILTERS: AttentionBucketId[] = [
  'rent_overdue',
  'payment_proof',
  'kyc_pending',
  'bed_unassigned',
  'move_out',
  'deposit_refund',
  'requests_pending',
];

function parseFilter(value: string | undefined): AttentionBucketId | null {
  if (!value) return null;
  return VALID_FILTERS.includes(value as AttentionBucketId)
    ? (value as AttentionBucketId)
    : null;
}

export default async function OperationsModulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; filter?: string; resident?: string }>;
}) {
  const params = await searchParams;
  const billingMonth = resolveBillingMonth(params.month);
  const activeFilter = parseFilter(params.filter);
  const selectedResidentId = params.resident ?? null;

  await ensureAdminPageNotificationsSeen('/admin/operations', '/admin/operations');
  const session = await requireAdminSession('/admin/operations');

  const [dashboard, overviewCtx, occupancy] = await Promise.all([
    loadResidentOperationsDashboard(session),
    loadOverviewContext(session, billingMonth),
    getOccupancyByPg().catch(() => ({ ok: false as const, error: '' })),
  ]);

  const filteredQueue = filterQueueByBucket(dashboard.queue, activeFilter);
  const selectedResident = selectedResidentId
    ? (dashboard.residentsById.get(selectedResidentId) ?? null)
    : null;

  const filterQuery = activeFilter ? `filter=${activeFilter}&` : '';
  const clearTimelineHref = activeFilter
    ? `/admin/operations?filter=${activeFilter}#queue`
    : '/admin/operations#queue';

  if (!overviewCtx.ok) {
    return (
      <>
        <PageHeader title="Resident operations" />
        <DbStatusBanner error={overviewCtx.error} />
      </>
    );
  }

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview', billingMonth) },
          { label: ADMIN_MODULES.operations.label },
        ]}
      />
      <PageHeader
        title="Resident operations"
        description="Which residents need your attention right now — one queue, one next action."
      />

      <div className="mt-8">
        <AdminSectionErrorBoundary title="Attention command center">
          <ResidentOperationsAttentionCenter
            buckets={dashboard.buckets}
            activeFilter={activeFilter}
          />
        </AdminSectionErrorBoundary>

        <AdminSectionErrorBoundary title="Priority action queue">
          <ResidentOperationsQueue
            items={filteredQueue}
            selectedResidentId={selectedResidentId}
            filterQuery={filterQuery}
          />
        </AdminSectionErrorBoundary>

        <AdminSectionErrorBoundary title="Today's work">
          <ResidentOperationsTodayWork items={dashboard.todayWork} />
        </AdminSectionErrorBoundary>

        <AdminSectionErrorBoundary title="Resident timeline">
          <ResidentOperationsTimeline resident={selectedResident} clearHref={clearTimelineHref} />
        </AdminSectionErrorBoundary>

        <AdminSectionErrorBoundary title="Advanced tools">
          <ResidentOperationsAdvancedTools
            session={session}
            billingMonth={billingMonth}
            operations={overviewCtx.data.operations}
            actionItems={overviewCtx.data.actionItems}
            occupancy={occupancy.ok ? occupancy.data : []}
          />
        </AdminSectionErrorBoundary>
      </div>
    </>
  );
}

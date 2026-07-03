import { redirect } from 'next/navigation';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OperationsMasterQueue } from '@/src/components/admin/operations/OperationsMasterQueue';
import { PendingReservationsPanel } from '@/src/components/admin/operations/PendingReservationsPanel';
import { WaitingForApprovalWorkspace } from '@/src/components/admin/operations/WaitingForApprovalWorkspace';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import {
  parseOperationsApprovalSearchParams,
  shouldShowWaitingForApprovalTab,
} from '@/src/lib/admin/approvalDeepLinks';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { requireAdminSession } from '@/src/lib/auth/guards';
import type { ApprovalSectionId } from '@/src/services/adminApprovalQueue';
import {
  loadUnifiedOperationsQueue,
  parseUnifiedOpsFilter,
} from '@/src/services/unifiedOperationsQueue';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filter = parseUnifiedOpsFilter(typeof params.filter === 'string' ? params.filter : undefined);
  const approvalParams = parseOperationsApprovalSearchParams(params);
  const session = await requireAdminSession('/admin/operations');
  await ensureAdminPageNotificationsSeen('/admin/operations', '/admin/operations');

  const data = await loadUnifiedOperationsQueue(session, filter);
  const showWaitingWorkspace = shouldShowWaitingForApprovalTab(
    approvalParams,
    data.approvalQueue.totalCount,
  );

  let initialSection: ApprovalSectionId | null = approvalParams.section;
  let initialItemKey = approvalParams.item;
  if (!initialSection && initialItemKey) {
    const match = data.approvalQueue.sections.find((section) =>
      section.items.some((item) => item.key === initialItemKey),
    );
    initialSection = match?.id ?? null;
  }

  if (
    approvalParams.filter === 'payment_proof' ||
    approvalParams.filter === 'waiting_for_admin_review' ||
    approvalParams.filter === 'booking_approval'
  ) {
    redirect(
      `/admin/operations?tab=waiting${
        approvalParams.filter === 'booking_approval' ? '&section=booking' : ''
      }`,
    );
  }

  return (
    <>
      <ModuleBreadcrumbs
        items={[
          { label: 'Overview', href: moduleHref('overview') },
          { label: ADMIN_MODULES.operations.label },
        ]}
      />

      <AdminSectionErrorBoundary title="Operations">
        {showWaitingWorkspace ? (
          <div className="mb-8 space-y-6">
            <WaitingForApprovalWorkspace
              queue={data.approvalQueue}
              initialSection={initialSection}
              initialItemKey={initialItemKey}
              openDialogInitially={approvalParams.dialog}
            />
            <PendingReservationsPanel rows={data.pendingReservations} />
          </div>
        ) : (
          <PendingReservationsPanel rows={data.pendingReservations} />
        )}
        <OperationsMasterQueue data={data} />
      </AdminSectionErrorBoundary>
    </>
  );
}

import { redirect } from 'next/navigation';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import { OperationsMasterQueue } from '@/src/components/admin/operations/OperationsMasterQueue';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { resolveOperationsFocusParam } from '@/src/lib/approvals/approvalDeepLinks';
import { paymentReviewWorkspaceHref } from '@/src/lib/operations/paymentReviewLinks';
import { requireAdminSession } from '@/src/lib/auth/guards';
import {
  defaultOperationsFilter,
  operationsFilterHref,
  parseOperationsFilter,
} from '@/src/lib/operations/operationsFilterLinks';
import { loadUnifiedOperationsQueue, emptyUnifiedOperationsQueue } from '@/src/services/unifiedOperationsQueue';
import { loadMoveOutPipelineBundle } from '@/src/services/moveOutPipelineService';
import { toClientMoveOutPipelineItem } from '@/src/lib/moveOut/moveOutPipeline';
import type { MoveOutPipelineItemClient } from '@/src/lib/moveOut/moveOutPipeline';
import { loadPendingVacatingApprovalPreviews } from '@/src/lib/vacating/loadAdminVacatingPageData';
import type { VacatingApprovalPreview } from '@/src/lib/vacating/approvalPreview';
import { listRecentPaymentProofRejectionsForAdmin } from '@/src/services/paymentProofRejectionService';

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

  if (filter === 'waiting_for_approval' && focus) {
    redirect(paymentReviewWorkspaceHref(focus));
  }

  if (!filter) {
    let preview;
    try {
      preview = await loadUnifiedOperationsQueue(session, 'waiting_for_approval', focus);
    } catch (err) {
      console.error('[operations] queue preview failed', err);
      preview = emptyUnifiedOperationsQueue('waiting_for_approval');
    }
    const counts = Object.fromEntries(
      preview.filterCounts.map((c) => [c.id, c.count]),
    ) as Record<(typeof preview.filterCounts)[number]['id'], number>;
    redirect(operationsFilterHref(defaultOperationsFilter(counts)));
  }

  let data;
  try {
    data = await loadUnifiedOperationsQueue(session, filter, focus);
  } catch (err) {
    console.error('[operations] queue load failed', err);
    data = emptyUnifiedOperationsQueue(filter);
  }

  const recentRejections =
    filter === 'waiting_for_approval'
      ? await listRecentPaymentProofRejectionsForAdmin(session, 40)
      : [];

  let moveOutPipelineActiveItems: MoveOutPipelineItemClient[] | undefined;
  let approvalPreviewByRequestId: Record<string, VacatingApprovalPreview> | undefined;
  if (filter === 'vacating_requests') {
    try {
      const bundle = await loadMoveOutPipelineBundle(session);
      approvalPreviewByRequestId = await loadPendingVacatingApprovalPreviews({
        vacatingRows: bundle.vacatingRows,
        depositHeldByBooking: bundle.depositHeldByBooking,
      });
      moveOutPipelineActiveItems = bundle.activeItems.map((item) => {
        const client = toClientMoveOutPipelineItem(item);
        const preview = approvalPreviewByRequestId![item.vacatingRequestId];
        if (preview?.estimatedSettlement) {
          return {
            ...client,
            estimatedRefundPaise: preview.estimatedSettlement.estimatedRefundPaise,
          };
        }
        return client;
      });
    } catch (err) {
      console.error('[operations] move-out pipeline load failed', err);
      moveOutPipelineActiveItems = [];
      approvalPreviewByRequestId = {};
    }
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
        <OperationsMasterQueue
          data={data}
          isSuperAdmin={session.role === 'super_admin'}
          recentRejections={recentRejections}
          moveOutPipelineActiveItems={moveOutPipelineActiveItems}
          approvalPreviewByRequestId={approvalPreviewByRequestId}
        />
      </AdminSectionErrorBoundary>
    </>
  );
}

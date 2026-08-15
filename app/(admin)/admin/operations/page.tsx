import { redirect } from 'next/navigation';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import {
  OperationsAttentionBoard,
  buildOperationsAttentionCards,
} from '@/src/components/admin/operations/OperationsAttentionBoard';
import { OperationsActivityFeed } from '@/src/components/admin/operations/OperationsActivityFeed';
import { OperationsMasterQueue } from '@/src/components/admin/operations/OperationsMasterQueue';
import { ADMIN_MODULES, moduleHref } from '@/src/lib/admin/navigation';
import { ensureAdminPageNotificationsSeen } from '@/src/lib/admin/notificationRead';
import { resolveOperationsFocusParam } from '@/src/lib/approvals/approvalDeepLinks';
import {
  emptyOperationsDateChangeBundle,
  loadOperationsDateChangeBundle,
} from '@/src/lib/operations/loadOperationsDateChangeBundle';
import type { OperationsActivityItem } from '@/src/lib/operations/loadOperationsActivityFeed';
import {
  groupOperationsActivityByDay,
  loadOperationsActivityFeed,
} from '@/src/lib/operations/loadOperationsActivityFeed';
import { paymentReviewWorkspaceHref } from '@/src/lib/operations/paymentReviewLinks';
import { requireAdminSession } from '@/src/lib/auth/guards';
import {
  operationsFilterHref,
  parseOperationsFilter,
} from '@/src/lib/operations/operationsFilterLinks';
import {
  loadUnifiedOperationsQueue,
  emptyUnifiedOperationsQueue,
} from '@/src/services/unifiedOperationsQueue';
import { loadMoveOutPipelineBundle } from '@/src/services/moveOutPipelineService';
import { toClientMoveOutPipelineItem } from '@/src/lib/moveOut/moveOutPipeline';
import type { MoveOutPipelineItemClient } from '@/src/lib/moveOut/moveOutPipeline';
import { loadPendingVacatingApprovalPreviews } from '@/src/lib/vacating/loadAdminVacatingPageData';
import type { VacatingApprovalPreview } from '@/src/lib/vacating/approvalPreview';
import { listRecentPaymentProofRejectionsForAdmin } from '@/src/services/paymentProofRejectionService';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function parseDateChangeFocusId(focus: string | null): string | null {
  if (!focus?.startsWith('date_change:')) return null;
  return focus.slice('date_change:'.length).trim() || null;
}

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; focus?: string; key?: string }>;
}) {
  const params = await searchParams;
  const session = await requireAdminSession('/admin/operations');
  await ensureAdminPageNotificationsSeen(
    '/admin/operations',
    '/admin/operations',
    params.focus ?? params.key,
  );

  const filter = parseOperationsFilter(params.filter);
  const focus = resolveOperationsFocusParam(params);

  if (focus?.startsWith('date_change:') && filter !== 'vacating_requests') {
    redirect(operationsFilterHref('vacating_requests', focus));
  }

  if (filter === 'waiting_for_approval' && focus && !focus.startsWith('date_change:')) {
    redirect(paymentReviewWorkspaceHref(focus));
  }

  if (!filter) {
    redirect(operationsFilterHref('waiting_for_approval'));
  }

  let data;
  try {
    data = await loadUnifiedOperationsQueue(session, filter, focus);
  } catch (err) {
    console.error('[operations] queue load failed', err);
    data = emptyUnifiedOperationsQueue(filter);
  }

  let dateChangeBundle = emptyOperationsDateChangeBundle();
  let activityGroups: Array<{ dayLabel: string; items: OperationsActivityItem[] }> = [];
  try {
    dateChangeBundle = await loadOperationsDateChangeBundle(session);
  } catch (err) {
    console.error('[operations] date-change bundle failed', err);
  }
  try {
    const activityItems = await loadOperationsActivityFeed(session);
    activityGroups = groupOperationsActivityByDay(activityItems);
  } catch (err) {
    console.error('[operations] activity feed failed', err);
  }
  const attentionCards = buildOperationsAttentionCards(
    data.filterCounts,
    dateChangeBundle.dateChangeCount,
  );
  const focusRequestId = parseDateChangeFocusId(focus);

  let recentRejections: Awaited<ReturnType<typeof listRecentPaymentProofRejectionsForAdmin>> = [];
  if (filter === 'waiting_for_approval') {
    try {
      recentRejections = await listRecentPaymentProofRejectionsForAdmin(session, 40);
    } catch (err) {
      console.error('[operations] payment rejection history failed', err);
    }
  }

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
        <div className="space-y-8">
          <OperationsAttentionBoard
            totalCount={data.totalCount}
            cards={attentionCards}
            pendingDateChanges={dateChangeBundle.pendingDateChanges}
            dateChangeContextByRequestId={dateChangeBundle.dateChangeContextByRequestId}
            statementDocumentByRequestId={dateChangeBundle.statementDocumentByRequestId}
            focusRequestId={focusRequestId}
            hideDateChangePanels={filter === 'vacating_requests'}
          />
          <OperationsActivityFeed groups={activityGroups} />
          <OperationsMasterQueue
            data={data}
            isSuperAdmin={session.role === 'super_admin'}
            recentRejections={recentRejections}
            moveOutPipelineActiveItems={moveOutPipelineActiveItems}
            approvalPreviewByRequestId={approvalPreviewByRequestId}
            dateChangeBundle={dateChangeBundle}
            focusRequestId={focusRequestId}
          />
        </div>
      </AdminSectionErrorBoundary>
    </>
  );
}

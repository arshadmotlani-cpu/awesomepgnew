import { redirect } from 'next/navigation';
import { AdminSectionErrorBoundary } from '@/src/components/admin/AdminSectionErrorBoundary';
import { ModuleBreadcrumbs } from '@/src/components/admin/ModuleBreadcrumbs';
import {
  OperationsAttentionBoard,
} from '@/src/components/admin/operations/OperationsAttentionBoard';
import { buildOperationsAttentionCards } from '@/src/lib/operations/operationsAttentionCards';
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
import { logger } from '@/src/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function logOperationsLoaderError(
  loader: string,
  filter: string,
  focus: string | null,
  err: unknown,
): void {
  const error = err instanceof Error ? err : new Error(String(err));
  logger.error('operations page loader failed', {
    loader,
    filter,
    focus,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
    errorName: error.name,
    errorMessage: error.message,
    stack: error.stack,
  });
}

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
    logOperationsLoaderError('unifiedQueue', filter, focus, err);
    data = emptyUnifiedOperationsQueue(filter);
  }

  let dateChangeBundle = emptyOperationsDateChangeBundle();
  let activityGroups: Array<{ dayLabel: string; items: OperationsActivityItem[] }> = [];
  try {
    dateChangeBundle = await loadOperationsDateChangeBundle(session);
  } catch (err) {
    logOperationsLoaderError('dateChangeBundle', filter, focus, err);
  }
  try {
    const activityItems = await loadOperationsActivityFeed(session);
    activityGroups = groupOperationsActivityByDay(activityItems);
  } catch (err) {
    logOperationsLoaderError('activityFeed', filter, focus, err);
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
      logOperationsLoaderError('paymentRejections', filter, focus, err);
    }
  }

  let moveOutPipelineActiveItems: MoveOutPipelineItemClient[] | undefined;
  let approvalPreviewByRequestId: Record<string, VacatingApprovalPreview> | undefined;
  if (filter === 'vacating_requests') {
    // Pipeline rows and settlement previews are loaded separately so a preview
    // failure (e.g. legacy timestamp string) cannot blank the pending queue while
    // the Move-out count chip still shows 1.
    try {
      const bundle = await loadMoveOutPipelineBundle(session);
      moveOutPipelineActiveItems = bundle.activeItems.map((item) =>
        toClientMoveOutPipelineItem(item),
      );
      try {
        approvalPreviewByRequestId = await loadPendingVacatingApprovalPreviews({
          vacatingRows: bundle.vacatingRows,
          depositHeldByBooking: bundle.depositHeldByBooking,
        });
        moveOutPipelineActiveItems = moveOutPipelineActiveItems.map((client) => {
          const preview = approvalPreviewByRequestId![client.vacatingRequestId];
          if (preview?.estimatedSettlement) {
            return {
              ...client,
              estimatedRefundPaise: preview.estimatedSettlement.estimatedRefundPaise,
            };
          }
          return client;
        });
      } catch (err) {
        logOperationsLoaderError('moveOutApprovalPreviews', filter, focus, err);
        approvalPreviewByRequestId = {};
      }
    } catch (err) {
      logOperationsLoaderError('moveOutPipeline', filter, focus, err);
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
          <OperationsMasterQueue
            data={data}
            isSuperAdmin={session.role === 'super_admin'}
            recentRejections={recentRejections}
            moveOutPipelineActiveItems={moveOutPipelineActiveItems}
            approvalPreviewByRequestId={approvalPreviewByRequestId}
            dateChangeBundle={dateChangeBundle}
            focusRequestId={focusRequestId}
          />
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
        </div>
      </AdminSectionErrorBoundary>
    </>
  );
}

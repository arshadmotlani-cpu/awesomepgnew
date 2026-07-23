import type { AdminVacatingRow } from '@/src/db/queries/admin';
import { listAdminVacatingRequests } from '@/src/db/queries/admin';
import type { AdminSession } from '@/src/lib/auth/session';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import type { MoveOutAdvancedToolsRow } from '@/src/lib/moveOut/moveOutAdvancedToolsProps';
import { toMoveOutAdvancedToolsRowAsync } from '@/src/lib/moveOut/moveOutAdvancedToolsProps';
import { toClientMoveOutPipelineItem, type MoveOutPipelineItemClient } from '@/src/lib/moveOut/moveOutPipeline';
import {
  buildMoveOutCommandStats,
  type MoveOutCommandStats,
} from '@/src/lib/moveOut/moveOutPipelineUi';
import { loadMoveOutPipelineBundle } from '@/src/services/moveOutPipelineService';
import { listPendingVacatingDateChanges } from '@/src/services/vacatingDateChange';
import type { VacatingDateChangeRequest } from '@/src/db/schema/vacatingDateChangeRequests';
import type { VacatingApprovalPreview } from '@/src/lib/vacating/approvalPreview';
import type { VacatingDateChangeBookingContext } from '@/src/components/admin/vacating/VacatingDateChangeApprovalPanel';

export type VacatingRowLoadError = {
  vacatingRequestId: string;
  bookingCode: string;
  message: string;
};

export type AdminVacatingPageData = {
  vacatingRows: AdminVacatingRow[];
  settlements: Awaited<ReturnType<typeof loadMoveOutPipelineBundle>>['settlements'];
  settlementHrefByRequest: Record<string, string>;
  depositHeldByBooking: Record<string, number>;
  advancedToolRows: MoveOutAdvancedToolsRow[];
  activeItems: MoveOutPipelineItemClient[];
  completedRecently: MoveOutPipelineItemClient[];
  commandStats: MoveOutCommandStats;
  rowErrors: VacatingRowLoadError[];
  settlementsLoadError: string | null;
  pendingDateChanges: VacatingDateChangeRequest[];
  approvalPreviewByRequestId: Record<string, VacatingApprovalPreview>;
  dateChangeBookingContextByRequestId: Record<string, VacatingDateChangeBookingContext>;
};

/** Resilient loader — one corrupt vacating row must not crash `/admin/vacating`. */
export async function loadAdminVacatingPageData(session: AdminSession): Promise<{
  vacatingRes: Awaited<ReturnType<typeof listAdminVacatingRequests>>;
  data: AdminVacatingPageData | null;
}> {
  let bundle: Awaited<ReturnType<typeof loadMoveOutPipelineBundle>> | null = null;
  let settlementsLoadError: string | null = null;

  try {
    bundle = await loadMoveOutPipelineBundle(session);
  } catch (err) {
    settlementsLoadError = err instanceof Error ? err.message : String(err);
    console.error('[admin/vacating] move-out pipeline bundle failed', err);
  }

  const vacatingRes = await listAdminVacatingRequests();
  if (!vacatingRes.ok) {
    return { vacatingRes, data: null };
  }

  const pendingDateChanges = await listPendingVacatingDateChanges(50);

  if (!bundle) {
    return { vacatingRes, data: null };
  }

  const settlementHrefByRequest = Object.fromEntries(
    bundle.settlements.map((s) => [s.vacatingRequestId, `/admin/checkout-settlements/${s.id}`]),
  );

  const rowErrors: VacatingRowLoadError[] = [];
  const advancedToolRows: MoveOutAdvancedToolsRow[] = [];

  for (const v of bundle.vacatingRows) {
    const held = guardDepositPaise(bundle.depositHeldByBooking[v.bookingId] ?? 0);
    try {
      advancedToolRows.push(await toMoveOutAdvancedToolsRowAsync(v, held));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[admin/vacating] row skipped', v.id, v.bookingCode, err);
      rowErrors.push({
        vacatingRequestId: v.id,
        bookingCode: v.bookingCode,
        message,
      });
    }
  }

  const activeItems: MoveOutPipelineItemClient[] = [];
  for (const item of bundle.activeItems) {
    try {
      activeItems.push(toClientMoveOutPipelineItem(item));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[admin/vacating] pipeline item skipped', item.vacatingRequestId, err);
      rowErrors.push({
        vacatingRequestId: item.vacatingRequestId,
        bookingCode: item.bookingCode,
        message,
      });
    }
  }

  const completedRecently: MoveOutPipelineItemClient[] = [];
  for (const item of bundle.pipeline.filter((i) => i.stage === 'bed_released').slice(0, 8)) {
    try {
      completedRecently.push(toClientMoveOutPipelineItem(item));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[admin/vacating] completed item skipped', item.vacatingRequestId, err);
      rowErrors.push({
        vacatingRequestId: item.vacatingRequestId,
        bookingCode: item.bookingCode,
        message,
      });
    }
  }

  const clientPipeline = bundle.pipeline
    .map((item) => {
      try {
        return toClientMoveOutPipelineItem(item);
      } catch {
        return null;
      }
    })
    .filter((item): item is MoveOutPipelineItemClient => item != null);

  const approvalPreviewByRequestId = Object.fromEntries(
    advancedToolRows
      .filter((row) => row.approvalPreview)
      .map((row) => [row.id, row.approvalPreview!]),
  );

  const vacatingById = new Map(bundle.vacatingRows.map((v) => [v.id, v]));
  const dateChangeBookingContextByRequestId: Record<string, VacatingDateChangeBookingContext> = {};
  for (const change of pendingDateChanges) {
    const v = vacatingById.get(change.vacatingRequestId);
    if (!v) continue;
    dateChangeBookingContextByRequestId[change.vacatingRequestId] = {
      vacatingRequestId: change.vacatingRequestId,
      bookingId: change.bookingId,
      customerName: v.customerFullName,
      customerPhone: v.customerPhone,
      bookingCode: v.bookingCode,
      pgName: v.pgName,
      roomNumber: v.roomNumber,
      bedCode: v.bedCode,
      noticeGivenDate: String(v.noticeGivenDate),
      vacatingDate: String(change.requestedVacatingDate),
    };
  }

  return {
    vacatingRes,
    data: {
      vacatingRows: bundle.vacatingRows,
      settlements: bundle.settlements,
      settlementHrefByRequest,
      depositHeldByBooking: bundle.depositHeldByBooking,
      advancedToolRows,
      activeItems,
      completedRecently,
      commandStats: buildMoveOutCommandStats(clientPipeline),
      rowErrors,
      settlementsLoadError,
      pendingDateChanges,
      approvalPreviewByRequestId,
      dateChangeBookingContextByRequestId,
    },
  };
}

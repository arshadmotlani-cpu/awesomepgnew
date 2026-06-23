import type { AdminVacatingRow } from '@/src/db/queries/admin';
import { listAdminVacatingRequests } from '@/src/db/queries/admin';
import type { AdminSession } from '@/src/lib/auth/session';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import type { MoveOutAdvancedToolsRow } from '@/src/lib/moveOut/moveOutAdvancedToolsProps';
import { toMoveOutAdvancedToolsRow } from '@/src/lib/moveOut/moveOutAdvancedToolsProps';
import {
  activePipelineItems,
  buildMoveOutCommandStats,
  buildMoveOutPipeline,
  toClientMoveOutPipelineItem,
  type MoveOutCommandStats,
  type MoveOutPipelineItemClient,
} from '@/src/lib/moveOut/moveOutPipeline';
import {
  listPipelineCheckoutSettlements,
  type CheckoutSettlementRow,
} from '@/src/services/checkoutSettlement';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

export type VacatingRowLoadError = {
  vacatingRequestId: string;
  bookingCode: string;
  message: string;
};

export type AdminVacatingPageData = {
  vacatingRows: AdminVacatingRow[];
  settlements: CheckoutSettlementRow[];
  settlementHrefByRequest: Record<string, string>;
  depositHeldByBooking: Record<string, number>;
  advancedToolRows: MoveOutAdvancedToolsRow[];
  activeItems: MoveOutPipelineItemClient[];
  completedRecently: MoveOutPipelineItemClient[];
  commandStats: MoveOutCommandStats;
  rowErrors: VacatingRowLoadError[];
  settlementsLoadError: string | null;
};

function vacatingPipelineInput(
  v: AdminVacatingRow,
  depositHeldByBooking: Record<string, number>,
) {
  return {
    id: v.id,
    bookingId: v.bookingId,
    bookingCode: v.bookingCode,
    customerId: v.customerId,
    customerFullName: v.customerFullName,
    customerPhone: v.customerPhone,
    pgName: v.pgName,
    bedCode: v.bedCode,
    roomNumber: v.roomNumber,
    noticeGivenDate: v.noticeGivenDate,
    vacatingDate: v.vacatingDate,
    noticeCompliant: v.noticeCompliant,
    status: v.status,
    resolvedAt: v.resolvedAt,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    deductionPaise: guardDepositPaise(v.deductionPaise),
    depositHeldPaise: guardDepositPaise(depositHeldByBooking[v.bookingId] ?? 0),
  };
}

/** Resilient loader — one corrupt vacating row must not crash `/admin/vacating`. */
export async function loadAdminVacatingPageData(session: AdminSession): Promise<{
  vacatingRes: Awaited<ReturnType<typeof listAdminVacatingRequests>>;
  data: AdminVacatingPageData | null;
}> {
  let settlements: CheckoutSettlementRow[] = [];
  let settlementsLoadError: string | null = null;
  try {
    settlements = await listPipelineCheckoutSettlements(session);
  } catch (err) {
    settlementsLoadError = err instanceof Error ? err.message : String(err);
    console.error('[admin/vacating] checkout settlements failed', err);
  }

  const vacatingRes = await listAdminVacatingRequests();
  if (!vacatingRes.ok) {
    return { vacatingRes, data: null };
  }

  const settlementHrefByRequest = Object.fromEntries(
    settlements.map((s) => [s.vacatingRequestId, `/admin/checkout-settlements/${s.id}`]),
  );

  const bookingIds = [...new Set(vacatingRes.data.map((v) => v.bookingId))];
  const depositHeldByBooking: Record<string, number> = {};
  for (const bookingId of bookingIds) {
    try {
      const summary = await getDepositSummaryForBooking(bookingId);
      depositHeldByBooking[bookingId] = guardDepositPaise(summary?.refundableBalancePaise ?? 0);
    } catch (err) {
      console.error('[admin/vacating] deposit summary failed', bookingId, err);
      depositHeldByBooking[bookingId] = 0;
    }
  }

  const rowErrors: VacatingRowLoadError[] = [];
  const advancedToolRows: MoveOutAdvancedToolsRow[] = [];
  const pipelineVacatingRows = [];

  for (const v of vacatingRes.data) {
    const held = guardDepositPaise(depositHeldByBooking[v.bookingId] ?? 0);
    try {
      advancedToolRows.push(toMoveOutAdvancedToolsRow(v, held));
      pipelineVacatingRows.push(vacatingPipelineInput(v, depositHeldByBooking));
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

  const pipeline = buildMoveOutPipeline({
    vacatingRows: pipelineVacatingRows,
    settlements: settlements.map((s) => ({
      id: s.id,
      vacatingRequestId: s.vacatingRequestId,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      approvedAt: s.approvedAt,
      refundPaidAt: s.refundPaidAt,
    })),
  });

  const activeItems: MoveOutPipelineItemClient[] = [];
  for (const item of activePipelineItems(pipeline)) {
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
  for (const item of pipeline.filter((i) => i.stage === 'bed_released').slice(0, 8)) {
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

  return {
    vacatingRes,
    data: {
      vacatingRows: vacatingRes.data,
      settlements,
      settlementHrefByRequest,
      depositHeldByBooking,
      advancedToolRows,
      activeItems,
      completedRecently,
      commandStats: buildMoveOutCommandStats(pipeline),
      rowErrors,
      settlementsLoadError,
    },
  };
}

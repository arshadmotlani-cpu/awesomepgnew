/**
 * Move-out pipeline SSOT — Overview, Operations, Vacating, Checkout, and action sync
 * must all read counts and rows from this service.
 */
import { listAdminVacatingRequests, type AdminVacatingRow } from '@/src/db/queries/admin';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import type { AdminSession } from '@/src/lib/auth/session';
import { diffDays, todayString } from '@/src/lib/dates';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import {
  activePipelineItems,
  buildMoveOutPipeline,
  checkoutSettlementPipelineItems,
  monthlyMoveOutApprovalItems,
  type MoveOutPipelineItem,
} from '@/src/lib/moveOut/moveOutPipeline';
import {
  computeMoveOutPipelineCounts,
  type MoveOutPipelineCounts,
} from '@/src/lib/moveOut/moveOutPipelineCounts';
import {
  formatPgDisplayName,
  isWithinDays,
  vacatingPriority,
  type OpsPriority,
} from '@/src/lib/operationsCenterRules';
import {
  listPipelineCheckoutSettlements,
  syncMissingCheckoutSettlements,
  type CheckoutSettlementRow,
} from '@/src/services/checkoutSettlement';
import { getDepositSummaryForBooking } from '@/src/services/deposits';

export type MoveOutNoticeCardItem = {
  id: string;
  residentName: string;
  bedCode: string;
  roomNumber: string;
  pgName: string;
  vacatingDate: string;
  daysRemaining: number;
  priority: OpsPriority;
};

export type MoveOutPipelineSnapshot = {
  activeItems: MoveOutPipelineItem[];
  approvalItems: MoveOutPipelineItem[];
  settlementItems: MoveOutPipelineItem[];
  moveOutNoticeItems: MoveOutNoticeCardItem[];
  bedsReleasingItems: Array<Omit<MoveOutNoticeCardItem, 'residentName'>>;
  counts: MoveOutPipelineCounts;
  activeVacatingRequestIds: string[];
};

export type MoveOutPipelineBundle = MoveOutPipelineSnapshot & {
  vacatingRows: AdminVacatingRow[];
  settlements: CheckoutSettlementRow[];
  depositHeldByBooking: Record<string, number>;
  pipeline: MoveOutPipelineItem[];
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
    noticeRentCoveredDays: v.noticeRentCoveredDays ?? 0,
    noticeChargeableDays: v.noticeChargeableDays ?? 0,
    durationMode: v.durationMode,
    stayType: v.stayType,
  };
}

function toNoticeCardItem(item: MoveOutPipelineItem, today: string): MoveOutNoticeCardItem {
  const daysRemaining = diffDays(today, item.vacatingDate);
  return {
    id: item.vacatingRequestId,
    residentName: item.customerFullName,
    bedCode: item.bedCode,
    roomNumber: item.roomNumber,
    pgName: formatPgDisplayName(item.pgName),
    vacatingDate: item.vacatingDate,
    daysRemaining,
    priority: vacatingPriority(daysRemaining),
  };
}

function sessionCanSeeVacatingRow(session: AdminSession, row: AdminVacatingRow): boolean {
  if (!row.pgId) return session.role === 'super_admin';
  return adminCanAccessPg(session, row.pgId);
}

function snapshotFromPipeline(
  pipeline: MoveOutPipelineItem[],
  today: string,
): MoveOutPipelineSnapshot {
  const activeItems = activePipelineItems(pipeline);
  const approvalItems = monthlyMoveOutApprovalItems(activeItems);
  const settlementItems = checkoutSettlementPipelineItems(activeItems);
  const moveOutNoticeItems = approvalItems.map((item) => toNoticeCardItem(item, today));
  const bedsReleasingFiltered = activeItems
    .filter(
      (item) =>
        item.workflowKind === 'monthly' &&
        item.vacatingStatus === 'approved' &&
        isWithinDays(item.vacatingDate, today, 30),
    )
    .map((item) => toNoticeCardItem(item, today));
  const counts = computeMoveOutPipelineCounts(activeItems, today);

  return {
    activeItems,
    approvalItems,
    settlementItems,
    moveOutNoticeItems,
    bedsReleasingItems: bedsReleasingFiltered.map(({ residentName: _n, ...rest }) => rest),
    counts,
    activeVacatingRequestIds: activeItems.map((i) => i.vacatingRequestId),
  };
}

/** Full pipeline load — used by Vacating page and SSOT counters. */
export async function loadMoveOutPipelineBundle(
  session: AdminSession,
  opts?: { syncSettlements?: boolean },
): Promise<MoveOutPipelineBundle> {
  const today = todayString();

  if (opts?.syncSettlements !== false) {
    await syncMissingCheckoutSettlements().catch(() => undefined);
  }

  const [vacatingRes, settlements] = await Promise.all([
    listAdminVacatingRequests(),
    listPipelineCheckoutSettlements(session),
  ]);

  const vacatingRows =
    vacatingRes.ok
      ? vacatingRes.data.filter((row) => sessionCanSeeVacatingRow(session, row))
      : [];

  const bookingIds = [...new Set(vacatingRows.map((v) => v.bookingId))];
  const depositHeldByBooking: Record<string, number> = {};
  for (const bookingId of bookingIds) {
    try {
      const summary = await getDepositSummaryForBooking(bookingId);
      depositHeldByBooking[bookingId] = guardDepositPaise(summary?.refundableBalancePaise ?? 0);
    } catch {
      depositHeldByBooking[bookingId] = 0;
    }
  }

  const pipeline = buildMoveOutPipeline({
    vacatingRows: vacatingRows.map((v) => vacatingPipelineInput(v, depositHeldByBooking)),
    settlements: settlements.map((s) => ({
      id: s.id,
      vacatingRequestId: s.vacatingRequestId,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      approvedAt: s.approvedAt,
      refundPaidAt: s.refundPaidAt,
      noticeDeductionPaise: s.noticeDeductionPaise,
      electricitySharePaise: s.electricitySharePaise,
      electricityDeductFromDeposit: s.electricityDeductFromDeposit,
      finalRefundPaise: s.finalRefundPaise,
      totalRefundPaise: s.totalRefundPaise,
      settlementEngineVersion: s.settlementEngineVersion,
      amountsLocked: s.amountsLocked,
    })),
  });

  const snapshot = snapshotFromPipeline(pipeline, today);

  return {
    ...snapshot,
    vacatingRows,
    settlements,
    depositHeldByBooking,
    pipeline,
  };
}

export async function getMoveOutPipelineSnapshot(
  session: AdminSession,
): Promise<MoveOutPipelineSnapshot> {
  const bundle = await loadMoveOutPipelineBundle(session, { syncSettlements: false });
  return {
    activeItems: bundle.activeItems,
    approvalItems: bundle.approvalItems,
    settlementItems: bundle.settlementItems,
    moveOutNoticeItems: bundle.moveOutNoticeItems,
    bedsReleasingItems: bundle.bedsReleasingItems,
    counts: bundle.counts,
    activeVacatingRequestIds: bundle.activeVacatingRequestIds,
  };
}

export async function getMoveOutPipelineCounts(
  session: AdminSession,
): Promise<MoveOutPipelineCounts> {
  const snapshot = await getMoveOutPipelineSnapshot(session);
  return snapshot.counts;
}

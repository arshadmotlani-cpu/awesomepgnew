import { bookingFinancialWorkspaceSectionHref } from '@/src/lib/bookings/bookingFinancialLinks';
import type { CheckoutWorkflowKind } from '@/src/lib/checkout/checkoutWorkflow';
import { checkoutWorkflowKind } from '@/src/lib/checkout/checkoutWorkflow';
import {
  coerceDateSafe,
  normalizeIsoDateOnly,
  timestampMsSafe,
  toIsoTimestampSafe,
} from '@/src/lib/dates';
import { computeCheckoutRefundPreview } from '@/src/lib/billing/checkoutRefundPreview';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import type { CheckoutSettlementStatus } from '@/src/db/schema/enums';
import type { MoveOutUrgency, VacatingBedStatus } from '@/src/lib/vacating/moveOutPreviewUtils';
import { moveOutDaysRemaining, moveOutUrgency } from '@/src/lib/vacating/moveOutPreviewUtils';

export const MOVE_OUT_STAGES = [
  { id: 'requested', label: 'Requested move-out' },
  { id: 'notice_verified', label: 'Notice verified' },
  { id: 'room_inspection', label: 'Room inspection' },
  { id: 'charges_calculated', label: 'Charges calculated' },
  { id: 'deposit_approved', label: 'Deposit approved' },
  { id: 'refund_processed', label: 'Refund processed' },
  { id: 'bed_released', label: 'Bed released' },
] as const;

export type MoveOutStageId = (typeof MOVE_OUT_STAGES)[number]['id'];

export type MoveOutPipelineItem = {
  id: string;
  vacatingRequestId: string;
  bookingId: string;
  bookingCode: string;
  customerId: string;
  customerFullName: string;
  customerPhone: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  vacatingDate: string;
  noticeGivenDate: string;
  noticeCompliant: boolean;
  vacatingStatus: 'pending' | 'approved' | 'completed' | 'rejected';
  settlementId: string | null;
  settlementStatus: CheckoutSettlementStatus | null;
  stage: MoveOutStageId;
  stageIndex: number;
  stageLabel: string;
  nextAction: string;
  continueHref: string | null;
  continueKind: 'approve' | 'settlement' | 'view';
  sortPriority: number;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deductionPaise: number;
  electricityDeductionPaise: number;
  depositHeldPaise: number;
  estimatedRefundPaise: number;
  noticeRentCoveredDays: number;
  noticeChargeableDays: number;
  daysRemaining: number;
  urgency: MoveOutUrgency;
  bedStatus: VacatingBedStatus;
  stageTimestamps: Partial<Record<MoveOutStageId, Date>>;
  durationMode: string;
  workflowKind: CheckoutWorkflowKind;
};

/** JSON-safe shape for client components (no Date instances). */
export type MoveOutPipelineItemClient = Omit<
  MoveOutPipelineItem,
  'createdAt' | 'updatedAt' | 'resolvedAt' | 'stageTimestamps'
> & {
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  stageTimestamps: Partial<Record<MoveOutStageId, string>>;
};

export function toClientMoveOutPipelineItem(item: MoveOutPipelineItem): MoveOutPipelineItemClient {
  const stageTimestamps: Partial<Record<MoveOutStageId, string>> = {};
  for (const [key, value] of Object.entries(item.stageTimestamps) as Array<
    [MoveOutStageId, Date | undefined]
  >) {
    const iso = toIsoTimestampSafe(value);
    if (iso) stageTimestamps[key] = iso;
  }
  return {
    ...item,
    deductionPaise: guardDepositPaise(item.deductionPaise),
    electricityDeductionPaise: guardDepositPaise(item.electricityDeductionPaise),
    depositHeldPaise: guardDepositPaise(item.depositHeldPaise),
    estimatedRefundPaise: guardDepositPaise(item.estimatedRefundPaise),
    createdAt: toIsoTimestampSafe(item.createdAt) ?? '',
    updatedAt: toIsoTimestampSafe(item.updatedAt) ?? '',
    resolvedAt: toIsoTimestampSafe(item.resolvedAt),
    stageTimestamps,
  };
}

type VacatingInput = {
  id: string;
  bookingId: string;
  bookingCode: string;
  customerId: string;
  customerFullName: string;
  customerPhone: string;
  pgName: string;
  bedCode: string;
  roomNumber: string;
  noticeGivenDate: string;
  vacatingDate: string;
  noticeCompliant: boolean;
  status: 'pending' | 'approved' | 'completed' | 'rejected';
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deductionPaise: number;
  depositHeldPaise: number;
  noticeRentCoveredDays?: number;
  noticeChargeableDays?: number;
  durationMode?: string;
  stayType?: string;
};

type SettlementInput = {
  id: string;
  vacatingRequestId: string;
  status: CheckoutSettlementStatus;
  createdAt: Date;
  updatedAt: Date;
  approvedAt: Date | null;
  refundPaidAt: Date | null;
  noticeDeductionPaise?: number;
  electricitySharePaise?: number;
  electricityDeductFromDeposit?: boolean;
  finalRefundPaise?: number | null;
  totalRefundPaise?: number | null;
  settlementEngineVersion?: number | null;
  amountsLocked?: boolean;
};

function computeEstimatedRefundPaise(
  vacating: VacatingInput,
  settlement: SettlementInput | null,
): number {
  if (
    settlement &&
    (settlement.status === 'completed' ||
      settlement.status === 'refund_paid' ||
      settlement.status === 'refund_pending') &&
    settlement.finalRefundPaise != null
  ) {
    return guardDepositPaise(settlement.finalRefundPaise);
  }

  if (
    settlement &&
    (settlement.settlementEngineVersion ?? 0) >= 2 &&
    settlement.totalRefundPaise != null
  ) {
    return guardDepositPaise(settlement.totalRefundPaise);
  }

  return computeCheckoutRefundPreview({
    depositHeldPaise: vacating.depositHeldPaise,
    noticeDeductionPaise: settlement?.noticeDeductionPaise ?? vacating.deductionPaise,
    electricitySharePaise: settlement?.electricitySharePaise,
    electricityDeductFromDeposit: settlement?.electricityDeductFromDeposit,
    finalRefundPaise: settlement?.finalRefundPaise,
    amountsLocked: settlement?.amountsLocked,
  }).finalRefundPaise;
}

const STAGE_INDEX: Record<MoveOutStageId, number> = {
  requested: 0,
  notice_verified: 1,
  room_inspection: 2,
  charges_calculated: 3,
  deposit_approved: 4,
  refund_processed: 5,
  bed_released: 6,
};

/** Lower = staff should act sooner. */
const STAFF_SORT_PRIORITY: Record<MoveOutStageId, number> = {
  requested: 0,
  charges_calculated: 1,
  deposit_approved: 2,
  notice_verified: 3,
  room_inspection: 4,
  refund_processed: 5,
  bed_released: 6,
};

export function deriveMoveOutStage(
  vacating: VacatingInput,
  settlement: SettlementInput | null,
): Pick<
  MoveOutPipelineItem,
  'stage' | 'stageIndex' | 'stageLabel' | 'nextAction' | 'continueHref' | 'continueKind' | 'sortPriority'
> {
  const settlementId = settlement?.id ?? null;
  const settlementStatus = settlement?.status ?? null;
  const workspaceCheckout = bookingFinancialWorkspaceSectionHref(vacating.bookingId, 'checkout');
  const workspaceMoveOut = bookingFinancialWorkspaceSectionHref(vacating.bookingId, 'move-out');
  const workspaceRefund = bookingFinancialWorkspaceSectionHref(vacating.bookingId, 'refund');
  const settlementContinue =
    settlementStatus === 'refund_pending'
      ? workspaceRefund
      : settlementId
        ? workspaceCheckout
        : vacating.status === 'pending'
          ? workspaceMoveOut
          : workspaceCheckout;
  const workflow = checkoutWorkflowKind({
    durationMode: vacating.durationMode,
    stayType: vacating.stayType,
  });

  if (workflow === 'fixed_stay') {
    if (
      vacating.status === 'completed' ||
      settlementStatus === 'completed' ||
      settlementStatus === 'refund_paid'
    ) {
      return stageMeta('bed_released', 'Checkout complete', settlementContinue, 'view');
    }
    if (settlementStatus === 'refund_pending') {
      return stageMeta(
        'deposit_approved',
        'Send refund to resident, then mark paid',
        settlementContinue,
        'settlement',
      );
    }
    if (settlementStatus === 'awaiting_admin_review') {
      return stageMeta(
        'charges_calculated',
        'Review electricity and charges, approve refund',
        settlementContinue,
        'settlement',
      );
    }
    if (settlementStatus === 'awaiting_resident_details' || !settlementId) {
      return stageMeta(
        'room_inspection',
        'Waiting for resident refund request (meter photo + UPI)',
        settlementContinue ?? '/admin/checkout-settlements',
        'settlement',
      );
    }
    return stageMeta(
      'room_inspection',
      'Open checkout settlement',
      settlementContinue ?? '/admin/checkout-settlements',
      'settlement',
    );
  }

  if (vacating.status === 'rejected') {
    return stageMeta('requested', 'Declined — no action needed', null, 'view');
  }

  if (
    vacating.status === 'completed' ||
    settlementStatus === 'completed' ||
    settlementStatus === 'refund_paid'
  ) {
    return stageMeta('bed_released', 'Move-out complete', settlementContinue, 'view');
  }

  if (settlementStatus === 'refund_pending') {
    return stageMeta(
      'deposit_approved',
      'Send refund to resident, then mark paid',
      settlementContinue,
      'settlement',
    );
  }

  if (settlementStatus === 'awaiting_admin_review') {
    return stageMeta(
      'charges_calculated',
      'Review electricity and charges, approve refund',
      settlementContinue,
      'settlement',
    );
  }

  if (settlementStatus === 'awaiting_resident_details') {
    return stageMeta(
      'room_inspection',
      'Waiting for resident meter photo and UPI details',
      settlementContinue,
      'settlement',
    );
  }

  if (vacating.status === 'approved') {
    return stageMeta(
      'notice_verified',
      'Move-out approved — resident refund unlocks on vacate date',
      null,
      'view',
    );
  }

  if (vacating.status === 'pending') {
    return stageMeta('requested', 'Verify notice period and approve move-out', workspaceMoveOut, 'approve');
  }

  return stageMeta('bed_released', 'Move-out complete', settlementContinue, 'view');
}

function stageMeta(
  stage: MoveOutStageId,
  nextAction: string,
  continueHref: string | null,
  continueKind: MoveOutPipelineItem['continueKind'],
): Pick<
  MoveOutPipelineItem,
  'stage' | 'stageIndex' | 'stageLabel' | 'nextAction' | 'continueHref' | 'continueKind' | 'sortPriority'
> {
  const stageDef = MOVE_OUT_STAGES.find((s) => s.id === stage)!;
  return {
    stage,
    stageIndex: STAGE_INDEX[stage],
    stageLabel: stageDef.label,
    nextAction,
    continueHref,
    continueKind,
    sortPriority: STAFF_SORT_PRIORITY[stage],
  };
}

function vacatingTimestamps(v: VacatingInput) {
  const createdAt = coerceDateSafe(v.createdAt) ?? new Date(0);
  const updatedAt = coerceDateSafe(v.updatedAt) ?? createdAt;
  const resolvedAt = v.resolvedAt ? coerceDateSafe(v.resolvedAt) : null;
  return { createdAt, updatedAt, resolvedAt };
}

function settlementTimestamps(settlement: SettlementInput | null) {
  if (!settlement) return null;
  return {
    ...settlement,
    createdAt: coerceDateSafe(settlement.createdAt) ?? new Date(0),
    updatedAt: coerceDateSafe(settlement.updatedAt) ?? new Date(0),
    approvedAt: settlement.approvedAt ? coerceDateSafe(settlement.approvedAt) : null,
    refundPaidAt: settlement.refundPaidAt ? coerceDateSafe(settlement.refundPaidAt) : null,
  };
}
function buildStageTimestamps(
  vacating: VacatingInput,
  settlement: SettlementInput | null,
): Partial<Record<MoveOutStageId, Date>> {
  const { createdAt, updatedAt, resolvedAt } = vacatingTimestamps(vacating);
  const settled = settlementTimestamps(settlement);
  const ts: Partial<Record<MoveOutStageId, Date>> = {
    requested: createdAt,
  };

  if (vacating.status === 'approved' || vacating.status === 'completed') {
    ts.notice_verified = settled?.createdAt ?? updatedAt;
  }

  if (settled) {
    ts.room_inspection = settled.createdAt;

    if (
      settled.status === 'awaiting_admin_review' ||
      settled.status === 'refund_pending' ||
      settled.status === 'refund_paid' ||
      settled.status === 'completed'
    ) {
      ts.charges_calculated = settled.updatedAt;
    }

    if (settled.approvedAt) {
      ts.deposit_approved = settled.approvedAt;
    }

    if (settled.refundPaidAt) {
      ts.refund_processed = settled.refundPaidAt;
    }
  }

  if (vacating.status === 'completed' && resolvedAt) {
    ts.bed_released = resolvedAt;
  }

  return ts;
}

function deriveBedStatus(vacating: VacatingInput): VacatingBedStatus {
  if (vacating.status === 'completed') return 'Available';
  if (vacating.status === 'approved') return 'Scheduled for Release';
  return 'Occupied';
}

export function buildMoveOutPipeline(input: {
  vacatingRows: VacatingInput[];
  settlements: SettlementInput[];
}): MoveOutPipelineItem[] {
  const settlementByVacating = new Map(
    input.settlements.map((s) => [s.vacatingRequestId, s]),
  );

  const items: MoveOutPipelineItem[] = [];

  for (const v of input.vacatingRows) {
    if (v.status === 'rejected') continue;

    const settlement = settlementTimestamps(settlementByVacating.get(v.id) ?? null);
    const derived = deriveMoveOutStage(v, settlement);
    const depositHeldPaise = guardDepositPaise(v.depositHeldPaise);
    const deductionPaise = guardDepositPaise(
      settlement?.noticeDeductionPaise ?? v.deductionPaise,
    );
    const electricityDeductionPaise =
      settlement?.electricityDeductFromDeposit === false
        ? 0
        : guardDepositPaise(settlement?.electricitySharePaise ?? 0);
    const estimatedRefundPaise = computeEstimatedRefundPaise(v, settlement);
    const daysRemaining = moveOutDaysRemaining(v.vacatingDate);
    const { createdAt, updatedAt, resolvedAt } = vacatingTimestamps(v);
    const workflowKind = checkoutWorkflowKind({
      durationMode: v.durationMode,
      stayType: v.stayType,
    });

    items.push({
      id: v.id,
      vacatingRequestId: v.id,
      bookingId: v.bookingId,
      bookingCode: v.bookingCode,
      customerId: v.customerId,
      customerFullName: v.customerFullName,
      customerPhone: v.customerPhone,
      pgName: v.pgName,
      roomNumber: v.roomNumber,
      bedCode: v.bedCode,
      vacatingDate: normalizeIsoDateOnly(v.vacatingDate),
      noticeGivenDate: normalizeIsoDateOnly(v.noticeGivenDate),
      noticeCompliant: v.noticeCompliant,
      vacatingStatus: v.status,
      settlementId: settlement?.id ?? null,
      settlementStatus: settlement?.status ?? null,
      resolvedAt,
      createdAt,
      updatedAt,
      deductionPaise,
      electricityDeductionPaise,
      depositHeldPaise,
      estimatedRefundPaise,
      noticeRentCoveredDays: v.noticeRentCoveredDays ?? 0,
      noticeChargeableDays: v.noticeChargeableDays ?? 0,
      daysRemaining,
      urgency: moveOutUrgency(daysRemaining),
      bedStatus: deriveBedStatus(v),
      stageTimestamps: buildStageTimestamps(v, settlement),
      durationMode: v.durationMode ?? 'monthly',
      workflowKind,
      ...derived,
    });
  }

  return items.sort(sortPipeline);
}

function pipelineDateKey(value: string): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return '9999-12-31';
}

function sortPipeline(a: MoveOutPipelineItem, b: MoveOutPipelineItem): number {
  const completedA = a.stage === 'bed_released' ? 1 : 0;
  const completedB = b.stage === 'bed_released' ? 1 : 0;
  if (completedA !== completedB) return completedA - completedB;

  const dateCmp = pipelineDateKey(a.vacatingDate).localeCompare(pipelineDateKey(b.vacatingDate));
  if (dateCmp !== 0) return dateCmp;

  if (a.sortPriority !== b.sortPriority) return a.sortPriority - b.sortPriority;
  return timestampMsSafe(a.createdAt) - timestampMsSafe(b.createdAt);
}

export function activePipelineItems(items: MoveOutPipelineItem[]): MoveOutPipelineItem[] {
  return items.filter((i) => i.stage !== 'bed_released');
}

/** Monthly move-out requests awaiting admin approve / reject only. */
export function monthlyMoveOutApprovalItems(items: MoveOutPipelineItem[]): MoveOutPipelineItem[] {
  return items.filter(
    (i) => i.workflowKind === 'monthly' && i.vacatingStatus === 'pending' && i.stage === 'requested',
  );
}

/** Active checkout settlements — after resident submits refund details. */
export function checkoutSettlementPipelineItems(
  items: MoveOutPipelineItem[],
): MoveOutPipelineItem[] {
  return items.filter((i) => {
    if (i.stage === 'bed_released') return false;
    const status = i.settlementStatus;
    return (
      status === 'awaiting_admin_review' ||
      status === 'awaiting_resident_details' ||
      status === 'refund_pending'
    );
  });
}

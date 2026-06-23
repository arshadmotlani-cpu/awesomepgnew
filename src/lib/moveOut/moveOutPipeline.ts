import { formatDate, normalizeIsoDateOnly, toIsoTimestampSafe } from '@/src/lib/dates';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import type { CheckoutSettlementStatus } from '@/src/db/schema/enums';
import type { MoveOutUrgency, VacatingBedStatus } from '@/src/lib/vacating/approvalPreview';
import { moveOutDaysRemaining, moveOutUrgency } from '@/src/lib/vacating/approvalPreview';

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
  depositHeldPaise: number;
  estimatedRefundPaise: number;
  daysRemaining: number;
  urgency: MoveOutUrgency;
  bedStatus: VacatingBedStatus;
  stageTimestamps: Partial<Record<MoveOutStageId, Date>>;
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
    depositHeldPaise: guardDepositPaise(item.depositHeldPaise),
    estimatedRefundPaise: guardDepositPaise(item.estimatedRefundPaise),
    createdAt: toIsoTimestampSafe(item.createdAt) ?? '',
    updatedAt: toIsoTimestampSafe(item.updatedAt) ?? '',
    resolvedAt: toIsoTimestampSafe(item.resolvedAt),
    stageTimestamps,
  };
}

export type MoveOutCommandStats = {
  awaitingInspection: number;
  awaitingCharges: number;
  awaitingRefund: number;
  readyToClose: number;
  completedThisMonth: number;
};

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
};

type SettlementInput = {
  id: string;
  vacatingRequestId: string;
  status: CheckoutSettlementStatus;
  createdAt: Date;
  updatedAt: Date;
  approvedAt: Date | null;
  refundPaidAt: Date | null;
};

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

function settlementHash(status: CheckoutSettlementStatus | null): string | null {
  if (status === 'awaiting_admin_review') return '#approve-settlement';
  if (status === 'refund_pending') return '#mark-refund-paid';
  return null;
}

export function deriveMoveOutStage(
  vacating: VacatingInput,
  settlement: SettlementInput | null,
): Pick<
  MoveOutPipelineItem,
  'stage' | 'stageIndex' | 'stageLabel' | 'nextAction' | 'continueHref' | 'continueKind' | 'sortPriority'
> {
  const settlementId = settlement?.id ?? null;
  const settlementStatus = settlement?.status ?? null;
  const baseHref = settlementId ? `/admin/checkout-settlements/${settlementId}` : null;
  const hash = settlementHash(settlementStatus);
  const settlementContinue = baseHref ? `${baseHref}${hash ?? ''}` : null;

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
      settlementId
        ? 'Open checkout — resident may still be submitting details'
        : 'Checkout not ready yet — sync or open settlements',
      settlementContinue ?? '/admin/checkout-settlements',
      'settlement',
    );
  }

  if (vacating.status === 'pending') {
    return stageMeta('requested', 'Verify notice period and approve move-out', null, 'approve');
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

function buildStageTimestamps(
  vacating: VacatingInput,
  settlement: SettlementInput | null,
): Partial<Record<MoveOutStageId, Date>> {
  const ts: Partial<Record<MoveOutStageId, Date>> = {
    requested: vacating.createdAt,
  };

  if (vacating.status === 'approved' || vacating.status === 'completed') {
    ts.notice_verified = settlement?.createdAt ?? vacating.updatedAt;
  }

  if (settlement) {
    ts.room_inspection = settlement.createdAt;

    if (
      settlement.status === 'awaiting_admin_review' ||
      settlement.status === 'refund_pending' ||
      settlement.status === 'refund_paid' ||
      settlement.status === 'completed'
    ) {
      ts.charges_calculated = settlement.updatedAt;
    }

    if (settlement.approvedAt) {
      ts.deposit_approved = settlement.approvedAt;
    }

    if (settlement.refundPaidAt) {
      ts.refund_processed = settlement.refundPaidAt;
    }
  }

  if (vacating.status === 'completed' && vacating.resolvedAt) {
    ts.bed_released = vacating.resolvedAt;
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

    const settlement = settlementByVacating.get(v.id) ?? null;
    const derived = deriveMoveOutStage(v, settlement);
    const depositHeldPaise = guardDepositPaise(v.depositHeldPaise);
    const deductionPaise = guardDepositPaise(v.deductionPaise);
    const estimatedRefundPaise = Math.max(0, depositHeldPaise - deductionPaise);
    const daysRemaining = moveOutDaysRemaining(v.vacatingDate);

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
      resolvedAt: v.resolvedAt,
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
      deductionPaise,
      depositHeldPaise,
      estimatedRefundPaise,
      daysRemaining,
      urgency: moveOutUrgency(daysRemaining),
      bedStatus: deriveBedStatus(v),
      stageTimestamps: buildStageTimestamps(v, settlement),
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
  return a.createdAt.getTime() - b.createdAt.getTime();
}

export function buildMoveOutCommandStats(items: MoveOutPipelineItem[]): MoveOutCommandStats {
  const monthStart = formatDate(new Date()).slice(0, 7);

  let awaitingInspection = 0;
  let awaitingCharges = 0;
  let awaitingRefund = 0;
  let readyToClose = 0;
  let completedThisMonth = 0;

  for (const item of items) {
    if (item.stage === 'room_inspection') awaitingInspection += 1;
    if (item.stage === 'charges_calculated') awaitingCharges += 1;
    if (item.stage === 'deposit_approved') awaitingRefund += 1;
    if (item.stage === 'requested') readyToClose += 1;

    if (item.stage === 'bed_released' && item.resolvedAt) {
      try {
        const resolvedMonth = formatDate(item.resolvedAt).slice(0, 7);
        if (resolvedMonth === monthStart) completedThisMonth += 1;
      } catch {
        /* ignore invalid resolvedAt */
      }
    }
  }

  return {
    awaitingInspection,
    awaitingCharges,
    awaitingRefund,
    readyToClose,
    completedThisMonth,
  };
}

export function activePipelineItems(items: MoveOutPipelineItem[]): MoveOutPipelineItem[] {
  return items.filter((i) => i.stage !== 'bed_released');
}

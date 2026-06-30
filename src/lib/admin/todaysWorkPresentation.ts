import type { CheckoutSettlementRow } from '@/src/services/checkoutSettlement';
import type { ResidentsQueueRow } from '@/src/lib/residents/residentOperationsResidentsView';

export type WorkPriorityBand =
  | 'waiting_admin'
  | 'needs_calculation'
  | 'needs_approval'
  | 'waiting_resident'
  | 'completed_today';

export type WorkflowChecklistItem = {
  label: string;
  done: boolean;
  who: 'resident' | 'admin';
};

export type TodaysWorkCard = {
  id: string;
  customerId: string;
  workflowLabel: string;
  residentName: string;
  pgName: string | null;
  roomBed: string | null;
  nextStep: string;
  continueLabel: string;
  continueHref: string;
  priority: WorkPriorityBand;
  prioritySort: number;
  statusTone: 'orange' | 'blue' | 'green' | 'red' | 'neutral';
  statusLabel: string;
  estimatedMinutes: number;
  residentChecks: WorkflowChecklistItem[];
  adminChecks: WorkflowChecklistItem[];
  summaryLines: string[];
  waitingOnResident: boolean;
};

const PRIORITY_SORT: Record<WorkPriorityBand, number> = {
  waiting_admin: 0,
  needs_calculation: 1,
  needs_approval: 2,
  waiting_resident: 3,
  completed_today: 4,
};

const BAND_LABEL: Record<WorkPriorityBand, string> = {
  waiting_admin: 'Needs your action',
  needs_calculation: 'Calculate electricity',
  needs_approval: 'Ready to approve',
  waiting_resident: 'Waiting for resident',
  completed_today: 'Done today',
};

function parseSettlementId(href: string): string | null {
  const m = /\/admin\/checkout-settlements\/([0-9a-f-]{36})/i.exec(href);
  return m?.[1] ?? null;
}

function roomBedLabel(row: ResidentsQueueRow): string | null {
  if (!row.roomNumber && !row.bedCode) return null;
  const parts = [
    row.pgName,
    row.roomNumber ? `Room ${row.roomNumber}` : null,
    row.bedCode ? `Bed ${row.bedCode}` : null,
  ].filter(Boolean);
  return parts.join(' · ') || null;
}

function workflowLabel(row: ResidentsQueueRow): string {
  switch (row.category) {
    case 'move_out':
      return 'Move-out';
    case 'bed_assignment':
      return 'Bed assignment';
    case 'kyc':
      return 'ID verification';
    case 'payment_proof':
      return 'Payment review';
    case 'rent_overdue':
      return 'Rent overdue';
    case 'rent_due':
      return 'Rent due';
    case 'electricity_due':
      return 'Electricity due';
    case 'refund':
      return 'Refund';
    case 'resident_request':
      return 'Resident request';
    default:
      return 'Resident';
  }
}

function deriveMoveOutPriority(
  settlement: CheckoutSettlementRow | undefined,
): { priority: WorkPriorityBand; adminChecks: WorkflowChecklistItem[]; residentChecks: WorkflowChecklistItem[] } {
  const residentChecks: WorkflowChecklistItem[] = [
    {
      label: 'Meter photo',
      done: Boolean(settlement?.electricityMeterPhotoUrl) || Boolean(settlement?.electricityUseAverage),
      who: 'resident',
    },
    {
      label: 'Refund QR / UPI',
      done: Boolean(settlement?.payoutQrUrl?.trim()) || Boolean(settlement?.payoutUpiId?.trim()),
      who: 'resident',
    },
  ];

  if (!settlement || settlement.status === 'awaiting_resident_details') {
    return { priority: 'waiting_resident', adminChecks: [], residentChecks };
  }

  const electricityDone =
    (settlement.electricitySharePaise ?? 0) > 0 ||
    settlement.electricityUseAverage ||
    settlement.electricityCalculationMethod !== 'meter_reading' ||
    settlement.meterPhotoMissing;

  const adminChecks: WorkflowChecklistItem[] = [
    {
      label: 'Calculate electricity',
      done: electricityDone,
      who: 'admin',
    },
    {
      label: 'Approve checkout',
      done: settlement.status === 'approved' || settlement.status === 'refund_pending' || settlement.status === 'refund_paid' || settlement.status === 'completed',
      who: 'admin',
    },
  ];

  if (settlement.status === 'awaiting_admin_review' && !electricityDone) {
    return { priority: 'needs_calculation', adminChecks, residentChecks };
  }

  if (settlement.status === 'awaiting_admin_review') {
    return { priority: 'needs_approval', adminChecks, residentChecks };
  }

  if (settlement.status === 'refund_pending') {
    return { priority: 'waiting_admin', adminChecks, residentChecks };
  }

  return { priority: 'waiting_admin', adminChecks, residentChecks };
}

function derivePriority(
  row: ResidentsQueueRow,
  settlement: CheckoutSettlementRow | undefined,
): {
  priority: WorkPriorityBand;
  statusTone: TodaysWorkCard['statusTone'];
  statusLabel: string;
  estimatedMinutes: number;
  residentChecks: WorkflowChecklistItem[];
  adminChecks: WorkflowChecklistItem[];
  waitingOnResident: boolean;
} {
  if (row.category === 'move_out') {
    const move = deriveMoveOutPriority(settlement);
    const waitingOnResident = move.priority === 'waiting_resident';
    return {
      ...move,
      statusTone: waitingOnResident ? 'blue' : move.priority === 'needs_approval' ? 'orange' : 'orange',
      statusLabel: waitingOnResident ? 'Waiting for resident' : BAND_LABEL[move.priority],
      estimatedMinutes: waitingOnResident ? 0 : move.priority === 'needs_calculation' ? 2 : 3,
      waitingOnResident,
    };
  }

  if (row.nextAction.toLowerCase().includes('waiting for resident')) {
    return {
      priority: 'waiting_resident',
      statusTone: 'blue',
      statusLabel: 'Waiting for resident',
      estimatedMinutes: 0,
      residentChecks: [],
      adminChecks: [],
      waitingOnResident: true,
    };
  }

  if (row.category === 'payment_proof') {
    return {
      priority: 'needs_approval',
      statusTone: 'orange',
      statusLabel: 'Waiting for admin review',
      estimatedMinutes: 1,
      residentChecks: [{ label: 'Payment screenshot uploaded', done: true, who: 'resident' }],
      adminChecks: [{ label: 'Approve or reject payment', done: false, who: 'admin' }],
      waitingOnResident: false,
    };
  }

  if (row.category === 'rent_due' || row.category === 'electricity_due') {
    return {
      priority: 'waiting_resident',
      statusTone: 'blue',
      statusLabel: 'Waiting for payment',
      estimatedMinutes: 0,
      residentChecks: [
        { label: 'Pay invoice', done: false, who: 'resident' },
        { label: 'Upload payment screenshot', done: false, who: 'resident' },
      ],
      adminChecks: [],
      waitingOnResident: true,
    };
  }

  const estimatedMinutes =
    row.category === 'kyc' ? 2 : row.category === 'bed_assignment' ? 2 : 3;

  return {
    priority: 'waiting_admin',
    statusTone: 'orange',
    statusLabel: 'Needs your action',
    estimatedMinutes,
    residentChecks: [],
    adminChecks: [],
    waitingOnResident: false,
  };
}

function plainNextStep(row: ResidentsQueueRow, priority: WorkPriorityBand): string {
  if (priority === 'waiting_resident') {
    return 'Nothing for you right now — resident must finish their part.';
  }
  if (priority === 'needs_calculation') return 'Calculate electricity';
  if (priority === 'needs_approval') return 'Review refund and complete checkout';
  if (row.category === 'bed_assignment') return 'Assign a bed';
  if (row.category === 'kyc') return 'Review ID documents';
  if (row.category === 'payment_proof') return 'Verify payment screenshot';
  if (row.category === 'rent_due' || row.category === 'electricity_due') {
    return 'Waiting for resident to pay and upload screenshot';
  }
  if (row.category === 'rent_overdue') return 'Follow up on overdue payment';
  return row.nextAction.replace(/settlement/gi, 'checkout').replace(/SSOT|pipeline/gi, '').trim();
}

function summaryForSettlement(settlement: CheckoutSettlementRow | undefined): string[] {
  if (!settlement) return [];
  const lines: string[] = [];
  if (settlement.status === 'awaiting_admin_review' && (settlement.electricitySharePaise ?? 0) > 0) {
    lines.push(`Electricity ₹${((settlement.electricitySharePaise ?? 0) / 100).toFixed(0)}`);
  }
  if (settlement.depositRequiredPaise) {
    lines.push(`Deposit held ₹${(settlement.depositRequiredPaise / 100).toFixed(0)}`);
  }
  return lines;
}

export function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function buildTodaysWorkCards(
  queue: ResidentsQueueRow[],
  settlements: CheckoutSettlementRow[],
): TodaysWorkCard[] {
  const settlementByCustomer = new Map<string, CheckoutSettlementRow>();
  for (const s of settlements) {
    const existing = settlementByCustomer.get(s.customerId);
    if (!existing || s.updatedAt > existing.updatedAt) {
      settlementByCustomer.set(s.customerId, s);
    }
  }

  const cards = queue.map((row) => {
    const settlementId = parseSettlementId(row.primaryHref);
    const settlement =
      (settlementId ? settlements.find((s) => s.id === settlementId) : undefined) ??
      settlementByCustomer.get(row.customerId);

    const derived = derivePriority(row, settlement);
    const priority = derived.priority;

    const residentSubmitted =
      settlement?.status === 'awaiting_admin_review' || settlement?.status === 'refund_pending';

    const summaryLines = [
      ...summaryForSettlement(settlement),
      ...(residentSubmitted && settlement
        ? [
            settlement.electricityMeterPhotoUrl || settlement.electricityUseAverage
              ? 'Resident submitted meter photo'
              : null,
            settlement.payoutQrUrl || settlement.payoutUpiId
              ? 'Resident submitted refund details'
              : null,
          ].filter((x): x is string => Boolean(x))
        : []),
    ];

    return {
      id: row.id,
      customerId: row.customerId,
      workflowLabel: workflowLabel(row),
      residentName: row.residentName,
      pgName: row.pgName,
      roomBed: roomBedLabel(row),
      nextStep: plainNextStep(row, priority),
      continueLabel: row.primaryActionLabel || 'Continue',
      continueHref: row.primaryHref,
      priority,
      prioritySort: PRIORITY_SORT[priority],
      statusTone: derived.statusTone,
      statusLabel: derived.statusLabel,
      estimatedMinutes: derived.estimatedMinutes,
      residentChecks: derived.residentChecks,
      adminChecks: derived.adminChecks,
      summaryLines,
      waitingOnResident: derived.waitingOnResident,
    } satisfies TodaysWorkCard;
  });

  return cards.sort((a, b) => {
    if (a.prioritySort !== b.prioritySort) return a.prioritySort - b.prioritySort;
    return b.estimatedMinutes - a.estimatedMinutes;
  });
}

export function estimateTotalMinutes(cards: TodaysWorkCard[]): number {
  return cards.reduce((sum, c) => sum + c.estimatedMinutes, 0);
}

export function countNeedsAttention(
  cards: TodaysWorkCard[],
  opts?: { hasUnpaidInvoices?: boolean; pendingBillingCount?: number },
): number {
  const cardAttention = cards.filter(
    (c) => c.priority !== 'waiting_resident' && c.priority !== 'completed_today',
  ).length;
  if (opts?.hasUnpaidInvoices) {
    return Math.max(cardAttention, opts.pendingBillingCount ?? 1);
  }
  return cardAttention;
}

export function groupCardsByBand(cards: TodaysWorkCard[]): Array<{ band: WorkPriorityBand; label: string; cards: TodaysWorkCard[] }> {
  const order: WorkPriorityBand[] = [
    'waiting_admin',
    'needs_calculation',
    'needs_approval',
    'waiting_resident',
    'completed_today',
  ];
  return order
    .map((band) => ({
      band,
      label: BAND_LABEL[band],
      cards: cards.filter((c) => c.priority === band),
    }))
    .filter((g) => g.cards.length > 0);
}

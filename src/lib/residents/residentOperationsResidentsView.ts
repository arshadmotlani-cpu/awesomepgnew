import { formatDate } from '@/src/lib/dates';
import type { CollectionQueueItem } from '@/src/lib/billing/collectionsQueue';
import { isResidentBedAssignmentEligible } from '@/src/lib/residentBedAssignment';
import type {
  AttentionBucketId,
  ResidentOpsQueueCategory,
  ResidentOpsQueueItem,
} from '@/src/lib/residents/residentOperationsDashboard';
import type { PendingPaymentReviewItem } from '@/src/lib/operations/paymentReviewTypes';
import type { ResidentListRow } from '@/src/services/residentAdmin';
import type { CheckoutSettlementRow } from '@/src/services/checkoutSettlement';

export type ResidentsCommandFilter =
  | 'bed_assignment'
  | 'kyc'
  | 'payment_proof'
  | 'move_out'
  | 'overdue'
  | 'blocked';

export type ResidentsCommandCard = {
  id: ResidentsCommandFilter;
  label: string;
  count: number;
};

export type ResidentsQueueRow = {
  id: string;
  customerId: string;
  residentName: string;
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  currentState: string;
  nextAction: string;
  owner: string;
  ageLabel: string;
  ageSortHours: number;
  primaryActionLabel: string;
  primaryHref: string;
  filterTags: ResidentsCommandFilter[];
  bookingId: string | null;
  kycSubmissionId: string | null;
  vacatingRequestId: string | null;
  category: ResidentOpsQueueCategory;
};

export type JourneyStageId =
  | 'applicant'
  | 'verified'
  | 'assigned'
  | 'living'
  | 'move_out_requested'
  | 'settlement_pending'
  | 'completed';

export type JourneyStageCount = {
  id: JourneyStageId;
  label: string;
  count: number;
};

export type BlockedResidentRow = {
  id: string;
  customerId: string;
  residentName: string;
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  reason: string;
  blockedSinceLabel: string;
  primaryActionLabel: string;
  primaryHref: string;
};

export type OperationalActivityRow = {
  id: string;
  label: string;
  detail: string | null;
  occurredAt: Date;
};

const H5_CATEGORY_ORDER: Record<ResidentOpsQueueCategory, number> = {
  payment_proof: 0,
  kyc: 1,
  bed_assignment: 2,
  move_out: 3,
  rent_overdue: 4,
  refund: 5,
  resident_request: 6,
};

const OWNER_BY_CATEGORY: Record<ResidentOpsQueueCategory, string> = {
  payment_proof: 'Billing',
  kyc: 'KYC desk',
  bed_assignment: 'Front desk',
  move_out: 'Move-out',
  rent_overdue: 'Collections',
  refund: 'Finance',
  resident_request: 'Operations',
};

const FILTER_BY_BUCKET: Partial<Record<AttentionBucketId, ResidentsCommandFilter>> = {
  bed_unassigned: 'bed_assignment',
  kyc_pending: 'kyc',
  payment_proof: 'payment_proof',
  move_out: 'move_out',
  rent_overdue: 'overdue',
};

const JOURNEY_STAGES: JourneyStageCount[] = [
  { id: 'applicant', label: 'Applicant', count: 0 },
  { id: 'verified', label: 'Verified', count: 0 },
  { id: 'assigned', label: 'Assigned', count: 0 },
  { id: 'living', label: 'Living', count: 0 },
  { id: 'move_out_requested', label: 'Move-out requested', count: 0 },
  { id: 'settlement_pending', label: 'Settlement pending', count: 0 },
  { id: 'completed', label: 'Completed', count: 0 },
];

function formatAgeLabel(hours: number): string {
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${Math.max(1, Math.round(hours))}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

function hoursSince(date: Date | null | undefined): number {
  if (!date) return 0;
  return Math.max(0, (Date.now() - date.getTime()) / 3_600_000);
}

function queueFilterTags(item: ResidentOpsQueueItem): ResidentsCommandFilter[] {
  const tag = FILTER_BY_BUCKET[item.filterBucket];
  return tag ? [tag] : [];
}

function currentStateLabel(item: ResidentOpsQueueItem): string {
  switch (item.category) {
    case 'payment_proof':
      return 'Payment proof submitted';
    case 'kyc':
      return 'KYC pending review';
    case 'bed_assignment':
      return 'Awaiting bed assignment';
    case 'move_out':
      return item.tenancyStatus === 'vacating' ? 'Move-out in progress' : 'Move-out notice';
    case 'rent_overdue':
      return 'Rent overdue';
    case 'refund':
      return 'Refund pending';
    case 'resident_request':
      return 'Resident request open';
    default:
      return item.issue;
  }
}

function enrichQueueAge(
  item: ResidentOpsQueueItem,
  paymentProofAges: Map<string, Date>,
): { ageLabel: string; ageSortHours: number } {
  if (item.category === 'payment_proof') {
    const proofKey = item.id.replace(/^pay-/, '');
    const submittedAt = paymentProofAges.get(proofKey);
    if (submittedAt) {
      const hours = hoursSince(submittedAt);
      return { ageLabel: formatAgeLabel(hours), ageSortHours: hours };
    }
  }
  if (item.category === 'rent_overdue') {
    const daysMatch = item.issue.match(/(\d+) day/);
    const days = daysMatch ? Number(daysMatch[1]) : 1;
    return { ageLabel: `${days}d overdue`, ageSortHours: days * 24 };
  }
  if (item.category === 'move_out' && item.sortPriority > 0) {
    return {
      ageLabel: `${item.sortPriority}d until leave`,
      ageSortHours: item.sortPriority * 24,
    };
  }
  return { ageLabel: 'Today', ageSortHours: 12 };
}

function dedupeQueueRows(rows: ResidentsQueueRow[]): ResidentsQueueRow[] {
  const byResident = new Map<string, ResidentsQueueRow>();
  const withoutCustomer: ResidentsQueueRow[] = [];

  for (const row of rows) {
    if (!row.customerId) {
      withoutCustomer.push(row);
      continue;
    }
    const existing = byResident.get(row.customerId);
    if (!existing) {
      byResident.set(row.customerId, row);
      continue;
    }
    const rowRank = H5_CATEGORY_ORDER[row.category];
    const existingRank = H5_CATEGORY_ORDER[existing.category];
    if (rowRank < existingRank || (rowRank === existingRank && row.ageSortHours > existing.ageSortHours)) {
      const mergedTags = [...new Set([...row.filterTags, ...existing.filterTags])];
      byResident.set(row.customerId, { ...row, filterTags: mergedTags });
    } else {
      const mergedTags = [...new Set([...existing.filterTags, ...row.filterTags])];
      existing.filterTags = mergedTags;
    }
  }

  return [...withoutCustomer, ...byResident.values()].sort((a, b) => {
    const c = H5_CATEGORY_ORDER[a.category] - H5_CATEGORY_ORDER[b.category];
    if (c !== 0) return c;
    return b.ageSortHours - a.ageSortHours;
  });
}

function deriveJourneyStage(
  resident: ResidentListRow,
  settlementCustomerIds: Set<string>,
  vacatingPendingIds: Set<string>,
): JourneyStageId {
  if (resident.tenancyStatus === 'vacated') return 'completed';
  if (settlementCustomerIds.has(resident.id)) return 'settlement_pending';
  if (resident.tenancyStatus === 'vacating' || vacatingPendingIds.has(resident.id)) {
    return 'move_out_requested';
  }
  if (resident.tenancyStatus === 'active') return 'living';
  if (resident.bedId && resident.tenancyStatus === 'unassigned') return 'assigned';
  if (resident.kycStatus === 'approved') return 'verified';
  if (resident.bookingId || resident.onboardingBookingId) return 'applicant';
  return 'applicant';
}

function detectBlockedResidents(input: {
  allResidents: ResidentListRow[];
  queue: ResidentOpsQueueItem[];
  checkoutRefunds: CheckoutSettlementRow[];
  rentOverdue: CollectionQueueItem[];
}): BlockedResidentRow[] {
  const rows: BlockedResidentRow[] = [];
  const seen = new Set<string>();

  function push(row: BlockedResidentRow) {
    if (seen.has(row.customerId)) return;
    seen.add(row.customerId);
    rows.push(row);
  }

  for (const r of input.allResidents) {
    if (r.tenancyStatus === 'blocked') {
      push({
        id: `blocked-status-${r.id}`,
        customerId: r.id,
        residentName: r.fullName,
        pgName: r.pgName,
        roomNumber: r.roomNumber,
        bedCode: r.bedCode,
        reason: 'Resident account blocked — admin action required',
        blockedSinceLabel: formatDate(r.createdAt),
        primaryActionLabel: 'Open profile',
        primaryHref: `/admin/residents/${r.id}`,
      });
    }

    if (isResidentBedAssignmentEligible(r)) {
      push({
        id: `blocked-bed-${r.id}`,
        customerId: r.id,
        residentName: r.fullName,
        pgName: r.pgName,
        roomNumber: r.roomNumber,
        bedCode: r.bedCode,
        reason: 'KYC approved and payment cleared — bed not assigned yet',
        blockedSinceLabel: 'Waiting on bed assignment',
        primaryActionLabel: 'Assign bed',
        primaryHref: `/admin/beds?customerId=${r.id}`,
      });
    }

    if (
      r.onboardingPaymentApproved &&
      r.onboardingBookingStatus === 'pending_approval' &&
      !r.bedId &&
      !isResidentBedAssignmentEligible(r)
    ) {
      push({
        id: `blocked-booking-${r.id}`,
        customerId: r.id,
        residentName: r.fullName,
        pgName: r.pgName,
        roomNumber: r.roomNumber,
        bedCode: r.bedCode,
        reason: 'Payment approved — booking confirmation still pending',
        blockedSinceLabel: 'After payment approval',
        primaryActionLabel: 'Open booking',
        primaryHref: r.onboardingBookingId
          ? `/admin/bookings/${r.onboardingBookingId}`
          : `/admin/residents/${r.id}`,
      });
    }
  }

  for (const s of input.checkoutRefunds) {
    push({
      id: `blocked-refund-${s.id}`,
      customerId: s.customerId,
      residentName: s.customerName,
      pgName: s.pgName,
      roomNumber: s.roomNumber,
      bedCode: s.bedCode,
      reason: 'Move-out approved — checkout refund not sent yet',
      blockedSinceLabel: 'Settlement pending',
      primaryActionLabel: 'Process refund',
      primaryHref: `/admin/checkout-settlements/${s.id}#mark-refund-paid`,
    });
  }

  for (const q of input.queue.filter((x) => x.category === 'refund')) {
    if (!q.customerId) continue;
    push({
      id: `blocked-queue-${q.id}`,
      customerId: q.customerId,
      residentName: q.residentName,
      pgName: q.pgName,
      roomNumber: q.roomNumber,
      bedCode: q.bedCode,
      reason: q.issue,
      blockedSinceLabel: 'Deposit / refund queue',
      primaryActionLabel: q.primaryActionLabel,
      primaryHref: q.primaryHref,
    });
  }

  for (const r of input.rentOverdue.filter((x) => x.daysOverdue >= 14)) {
    push({
      id: `blocked-rent-${r.customerId}`,
      customerId: r.customerId,
      residentName: r.customerFullName,
      pgName: r.pgName,
      roomNumber: r.roomNumber,
      bedCode: r.bedCode ?? null,
      reason: `Rent overdue ${r.daysOverdue} days — collections blocked on other actions`,
      blockedSinceLabel: `${r.daysOverdue}d overdue`,
      primaryActionLabel: 'Collect payment',
      primaryHref: `/admin/residents/${r.customerId}`,
    });
  }

  return rows;
}

const ACTIVITY_LABELS: Record<string, string> = {
  payment_succeeded: 'Payment approved',
  partial_deposit_approved: 'Partial deposit approved',
  approve: 'KYC approved',
  reject: 'KYC rejected',
  completed: 'Move-out completed',
  external_refund: 'Refund processed',
  extension_paid: 'Extension payment recorded',
  deposit_wallet_rebuilt: 'Deposit wallet updated',
  checkout_settlement_repair_executed: 'Checkout settlement updated',
};

function labelOperationalActivity(entity: string, action: string): string | null {
  const key = action;
  if (ACTIVITY_LABELS[key]) return ACTIVITY_LABELS[key]!;
  if (entity === 'vacating_request' && action === 'approve') return 'Move-out approved';
  if (entity === 'vacating_request' && action === 'submit') return 'Move-out requested';
  if (entity === 'booking' && action === 'create') return 'Booking created';
  if (entity === 'rent_invoice' && action === 'recalculate_pending') return 'Rent invoice updated';
  if (entity === 'customer' && action.includes('assign')) return 'Bed assigned';
  if (action.includes('payment')) return 'Payment event';
  if (entity === 'kyc_submission') return action === 'submit' ? 'KYC submitted' : `KYC ${action}`;
  return null;
}

export function buildResidentOperationsResidentsView(input: {
  queue: ResidentOpsQueueItem[];
  allResidents: ResidentListRow[];
  paymentProofs: PendingPaymentReviewItem[];
  paymentProofAges?: Map<string, Date>;
  checkoutRefunds: CheckoutSettlementRow[];
  rentOverdue: CollectionQueueItem[];
  vacatingPendingCustomerIds: string[];
  recentAudit: Array<{
    id: string;
    entity: string;
    action: string;
    createdAt: Date;
    diff: unknown;
  }>;
}): {
  commandCards: ResidentsCommandCard[];
  queue: ResidentsQueueRow[];
  journeyCounts: JourneyStageCount[];
  blockedResidents: BlockedResidentRow[];
  recentActivity: OperationalActivityRow[];
} {
  const blockedResidents = detectBlockedResidents(input);

  const queueRows = input.queue.map((item) => {
    const age = enrichQueueAge(item, input.paymentProofAges ?? new Map());
    return {
      id: item.id,
      customerId: item.customerId,
      residentName: item.residentName,
      pgName: item.pgName,
      roomNumber: item.roomNumber,
      bedCode: item.bedCode,
      currentState: currentStateLabel(item),
      nextAction: item.nextAction,
      owner: OWNER_BY_CATEGORY[item.category],
      ageLabel: age.ageLabel,
      ageSortHours: age.ageSortHours,
      primaryActionLabel: item.primaryActionLabel,
      primaryHref: item.primaryHref,
      filterTags: queueFilterTags(item),
      bookingId: item.bookingId,
      kycSubmissionId: item.kycSubmissionId,
      vacatingRequestId: item.vacatingRequestId ?? null,
      category: item.category,
    } satisfies ResidentsQueueRow;
  });

  const dedupedQueue = dedupeQueueRows(queueRows);

  const commandCards: ResidentsCommandCard[] = [
    {
      id: 'bed_assignment',
      label: 'Waiting bed assignment',
      count: dedupedQueue.filter((q) => q.filterTags.includes('bed_assignment')).length,
    },
    {
      id: 'kyc',
      label: 'Pending KYC',
      count: dedupedQueue.filter((q) => q.filterTags.includes('kyc')).length,
    },
    {
      id: 'payment_proof',
      label: 'Payment proofs awaiting review',
      count: input.paymentProofs.length,
    },
    {
      id: 'move_out',
      label: 'Move-outs awaiting action',
      count: dedupedQueue.filter((q) => q.filterTags.includes('move_out')).length,
    },
    {
      id: 'overdue',
      label: 'Overdue residents',
      count: dedupedQueue.filter((q) => q.filterTags.includes('overdue')).length,
    },
    {
      id: 'blocked',
      label: 'Blocked residents',
      count: blockedResidents.length,
    },
  ];

  const settlementIds = new Set(input.checkoutRefunds.map((s) => s.customerId));
  const vacatingPendingIds = new Set(input.vacatingPendingCustomerIds);
  const journeyCounts = JOURNEY_STAGES.map((stage) => ({ ...stage, count: 0 }));
  for (const resident of input.allResidents) {
    const stage = deriveJourneyStage(
      resident,
      settlementIds,
      vacatingPendingIds,
    );
    const bucket = journeyCounts.find((j) => j.id === stage);
    if (bucket) bucket.count += 1;
  }

  const recentActivity: OperationalActivityRow[] = [];
  for (const row of input.recentAudit) {
    const label = labelOperationalActivity(row.entity, row.action);
    if (!label) continue;
    recentActivity.push({
      id: row.id,
      label,
      detail: `${row.entity.replace(/_/g, ' ')} · ${row.action.replace(/_/g, ' ')}`,
      occurredAt: row.createdAt,
    });
    if (recentActivity.length >= 20) break;
  }

  return {
    commandCards,
    queue: dedupedQueue,
    journeyCounts,
    blockedResidents,
    recentActivity,
  };
}

export function filterResidentsQueue(
  queue: ResidentsQueueRow[],
  filter: ResidentsCommandFilter | null,
  blockedResidents: BlockedResidentRow[],
): ResidentsQueueRow[] {
  if (!filter) return queue;
  if (filter === 'blocked') {
    return blockedResidents.map((b) => ({
      id: b.id,
      customerId: b.customerId,
      residentName: b.residentName,
      pgName: b.pgName,
      roomNumber: b.roomNumber,
      bedCode: b.bedCode,
      currentState: 'Blocked',
      nextAction: b.reason,
      owner: 'Operations',
      ageLabel: b.blockedSinceLabel,
      ageSortHours: 0,
      primaryActionLabel: b.primaryActionLabel,
      primaryHref: b.primaryHref,
      filterTags: ['blocked'],
      bookingId: null,
      kycSubmissionId: null,
      category: 'resident_request',
    }));
  }
  return queue.filter((row) => row.filterTags.includes(filter));
}

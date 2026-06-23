import { formatDate as formatDisplayDate } from '@/src/lib/format';
import { diffDays, formatDate } from '@/src/lib/dates';
import type { CollectionQueueItem } from '@/src/lib/billing/collectionsQueue';
import type { KycSubmissionListRow } from '@/src/services/kyc';
import type { PendingPaymentReviewItem } from '@/src/services/paymentProofQueue';
import type { ResidentListRow } from '@/src/services/residentAdmin';
import type { CheckoutSettlementRow } from '@/src/services/checkoutSettlement';

export type AttentionBucketId =
  | 'rent_overdue'
  | 'payment_proof'
  | 'kyc_pending'
  | 'bed_unassigned'
  | 'move_out'
  | 'deposit_refund'
  | 'requests_pending';

export type ResidentOpsQueueCategory =
  | 'refund'
  | 'kyc'
  | 'bed_assignment'
  | 'payment_proof'
  | 'resident_request'
  | 'rent_overdue'
  | 'move_out';

export type ResidentOpsQueueItem = {
  id: string;
  category: ResidentOpsQueueCategory;
  filterBucket: AttentionBucketId;
  customerId: string;
  residentName: string;
  pgName: string | null;
  roomNumber: string | null;
  bedCode: string | null;
  issue: string;
  nextAction: string;
  primaryActionLabel: string;
  primaryHref: string;
  sortPriority: number;
  bookingId: string | null;
  kycSubmissionId: string | null;
  tenancyStatus: ResidentListRow['tenancyStatus'] | null;
  kycStatus: ResidentListRow['kycStatus'] | null;
};

export type AttentionBucket = {
  id: AttentionBucketId;
  label: string;
  count: number;
};

export type TodayWorkItem = {
  id: string;
  label: string;
  count: number;
  href: string;
};

export type ResidentLifecycleStage =
  | 'lead'
  | 'applied'
  | 'verified'
  | 'assigned'
  | 'moved_in'
  | 'vacating'
  | 'completed';

export const LIFECYCLE_STAGES: Array<{ id: ResidentLifecycleStage; label: string }> = [
  { id: 'lead', label: 'Lead' },
  { id: 'applied', label: 'Applied' },
  { id: 'verified', label: 'Verified' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'moved_in', label: 'Moved in' },
  { id: 'vacating', label: 'Vacating' },
  { id: 'completed', label: 'Completed' },
];

const CATEGORY_SORT: Record<ResidentOpsQueueCategory, number> = {
  refund: 0,
  kyc: 1,
  bed_assignment: 2,
  payment_proof: 3,
  resident_request: 4,
  rent_overdue: 5,
  move_out: 6,
};

export function deriveResidentLifecycle(input: {
  tenancyStatus: ResidentListRow['tenancyStatus'] | null;
  kycStatus: ResidentListRow['kycStatus'] | null;
  hasBooking: boolean;
  hasBed: boolean;
}): ResidentLifecycleStage {
  if (input.tenancyStatus === 'vacated') return 'completed';
  if (input.tenancyStatus === 'vacating') return 'vacating';
  if (input.tenancyStatus === 'active') return 'moved_in';
  if (input.hasBed && input.tenancyStatus === 'unassigned') return 'assigned';
  if (input.kycStatus === 'approved') return 'verified';
  if (input.hasBooking) return 'applied';
  return 'lead';
}

export function lifecycleStageIndex(stage: ResidentLifecycleStage): number {
  return LIFECYCLE_STAGES.findIndex((s) => s.id === stage);
}

function parseNameFromPaymentTitle(title: string): string {
  const idx = title.indexOf(' · ');
  return idx > 0 ? title.slice(0, idx) : title;
}

export function buildResidentOperationsDashboard(input: {
  rentOverdue: CollectionQueueItem[];
  paymentProofs: PendingPaymentReviewItem[];
  kycPending: KycSubmissionListRow[];
  unassignedResidents: ResidentListRow[];
  vacatingRows: Array<{
    id: string;
    customerId: string;
    customerFullName: string;
    pgName: string;
    roomNumber: string;
    bedCode: string;
    status: string;
    vacatingDate: string;
    bookingId: string;
    settlementId?: string | null;
  }>;
  checkoutRefunds: CheckoutSettlementRow[];
  depositRefunds: Array<{
    bookingId: string;
    customerName: string;
    pgName: string;
    customerId?: string;
  }>;
  residentRequests: Array<{
    id: string;
    type: string;
    customerId: string;
    customerName: string;
    pgName: string;
    bookingId: string;
    status: string;
  }>;
  moveInsToday: Array<{ residentName: string; pgName: string; bedCode: string; roomNumber: string }>;
  moveOutsToday: Array<{ residentName: string; pgName: string }>;
  rentsDueToday: CollectionQueueItem[];
}): {
  buckets: AttentionBucket[];
  queue: ResidentOpsQueueItem[];
  todayWork: TodayWorkItem[];
  residentsById: Map<string, ResidentListRow>;
} {
  const queue: ResidentOpsQueueItem[] = [];
  const today = formatDate(new Date());

  for (const s of input.checkoutRefunds) {
    queue.push({
      id: `checkout-refund-${s.id}`,
      category: 'refund',
      filterBucket: 'deposit_refund',
      customerId: s.customerId,
      residentName: s.customerName,
      pgName: s.pgName,
      roomNumber: s.roomNumber,
      bedCode: s.bedCode,
      issue: 'Checkout refund waiting to be sent',
      nextAction: 'Send refund and mark paid',
      primaryActionLabel: 'Process refund',
      primaryHref: `/admin/checkout-settlements/${s.id}#mark-refund-paid`,
      sortPriority: 0,
      bookingId: s.bookingId,
      kycSubmissionId: null,
      tenancyStatus: 'vacating',
      kycStatus: null,
    });
  }

  for (const r of input.depositRefunds) {
    queue.push({
      id: `deposit-refund-${r.bookingId}`,
      category: 'refund',
      filterBucket: 'deposit_refund',
      customerId: r.customerId ?? '',
      residentName: r.customerName,
      pgName: r.pgName,
      roomNumber: null,
      bedCode: null,
      issue: 'Deposit refund pending after move-out',
      nextAction: 'Complete deposit payout',
      primaryActionLabel: 'Process refund',
      primaryHref: `/admin/deposits/${r.bookingId}`,
      sortPriority: 1,
      bookingId: r.bookingId,
      kycSubmissionId: null,
      tenancyStatus: null,
      kycStatus: null,
    });
  }

  for (const k of input.kycPending) {
    queue.push({
      id: `kyc-${k.id}`,
      category: 'kyc',
      filterBucket: 'kyc_pending',
      customerId: k.customerId,
      residentName: k.customerName,
      pgName: null,
      roomNumber: null,
      bedCode: null,
      issue: 'Identity documents awaiting review',
      nextAction: 'Review Aadhaar and selfie, approve or request correction',
      primaryActionLabel: 'Approve KYC',
      primaryHref: `/admin/residents/kyc/${k.id}`,
      sortPriority: 0,
      bookingId: k.bookingId,
      kycSubmissionId: k.id,
      tenancyStatus: null,
      kycStatus: 'pending',
    });
  }

  for (const r of input.unassignedResidents) {
    queue.push({
      id: `bed-${r.id}`,
      category: 'bed_assignment',
      filterBucket: 'bed_unassigned',
      customerId: r.id,
      residentName: r.fullName,
      pgName: r.pgName,
      roomNumber: r.roomNumber,
      bedCode: r.bedCode,
      issue: 'Verified resident without a bed',
      nextAction: 'Assign to an open bed on the map',
      primaryActionLabel: 'Assign bed',
      primaryHref: `/admin/beds?customerId=${r.id}`,
      sortPriority: 0,
      bookingId: r.bookingId,
      kycSubmissionId: null,
      tenancyStatus: 'unassigned',
      kycStatus: r.kycStatus,
    });
  }

  for (const p of input.paymentProofs) {
    const name = parseNameFromPaymentTitle(p.title);
    queue.push({
      id: `pay-${p.key}`,
      category: 'payment_proof',
      filterBucket: 'payment_proof',
      customerId: '',
      residentName: name,
      pgName: p.pgName,
      roomNumber: null,
      bedCode: null,
      issue: 'Payment screenshot awaiting approval',
      nextAction: 'Verify proof and approve or reject',
      primaryActionLabel: 'Review payment',
      primaryHref: '/admin/revenue/billing?tab=approvals',
      sortPriority: 0,
      bookingId: null,
      kycSubmissionId: null,
      tenancyStatus: null,
      kycStatus: null,
    });
  }

  for (const req of input.residentRequests.filter((r) => r.type !== 'deposit_refund')) {
    queue.push({
      id: `req-${req.id}`,
      category: 'resident_request',
      filterBucket: 'requests_pending',
      customerId: req.customerId,
      residentName: req.customerName,
      pgName: req.pgName,
      roomNumber: null,
      bedCode: null,
      issue: `${req.type.replace(/_/g, ' ')} request · ${req.status}`,
      nextAction: 'Review resident request and approve or reject',
      primaryActionLabel: 'Open request',
      primaryHref: '/admin/requests',
      sortPriority: 0,
      bookingId: req.bookingId,
      kycSubmissionId: null,
      tenancyStatus: null,
      kycStatus: null,
    });
  }

  for (const req of input.residentRequests.filter((r) => r.type === 'deposit_refund')) {
    queue.push({
      id: `req-refund-${req.id}`,
      category: 'resident_request',
      filterBucket: 'deposit_refund',
      customerId: req.customerId,
      residentName: req.customerName,
      pgName: req.pgName,
      roomNumber: null,
      bedCode: null,
      issue: 'Deposit refund request from resident',
      nextAction: 'Review and process refund',
      primaryActionLabel: 'Open request',
      primaryHref: '/admin/requests',
      sortPriority: 2,
      bookingId: req.bookingId,
      kycSubmissionId: null,
      tenancyStatus: null,
      kycStatus: null,
    });
  }

  for (const r of input.rentOverdue) {
    queue.push({
      id: r.id,
      category: 'rent_overdue',
      filterBucket: 'rent_overdue',
      customerId: r.customerId,
      residentName: r.customerFullName,
      pgName: r.pgName,
      roomNumber: r.roomNumber,
      bedCode: r.bedCode ?? null,
      issue: `Rent overdue · ${formatDisplayDate(r.dueDate)} · ${r.daysOverdue} day${r.daysOverdue === 1 ? '' : 's'}`,
      nextAction: 'Contact resident and collect payment',
      primaryActionLabel: 'Collect payment',
      primaryHref: `/admin/residents/${r.customerId}`,
      sortPriority: r.daysOverdue,
      bookingId: r.bookingId ?? null,
      kycSubmissionId: null,
      tenancyStatus: 'active',
      kycStatus: null,
    });
  }

  for (const v of input.vacatingRows) {
    queue.push({
      id: `moveout-${v.id}`,
      category: 'move_out',
      filterBucket: 'move_out',
      customerId: v.customerId,
      residentName: v.customerFullName,
      pgName: v.pgName,
      roomNumber: v.roomNumber,
      bedCode: v.bedCode,
      issue:
        v.status === 'pending'
          ? `Move-out notice · leaves ${formatDisplayDate(v.vacatingDate)}`
          : `Move-out approved · checkout in progress`,
      nextAction:
        v.status === 'pending' ? 'Approve move-out notice' : 'Complete checkout settlement',
      primaryActionLabel: v.status === 'pending' ? 'Approve move-out' : 'Open checkout',
      primaryHref:
        v.status === 'pending'
          ? `/admin/vacating?legacy=1&status=pending`
          : v.settlementId
            ? `/admin/checkout-settlements/${v.settlementId}`
            : '/admin/checkout-settlements',
      sortPriority: v.status === 'pending' ? 0 : diffDays(today, v.vacatingDate),
      bookingId: v.bookingId,
      kycSubmissionId: null,
      tenancyStatus: 'vacating',
      kycStatus: null,
    });
  }

  queue.sort((a, b) => {
    const c = CATEGORY_SORT[a.category] - CATEGORY_SORT[b.category];
    if (c !== 0) return c;
    return a.sortPriority - b.sortPriority;
  });

  const depositRefundCount =
    input.checkoutRefunds.length +
    input.depositRefunds.length +
    input.residentRequests.filter((r) => r.type === 'deposit_refund').length;

  const buckets: AttentionBucket[] = [
    { id: 'rent_overdue', label: 'Rent overdue', count: input.rentOverdue.length },
    { id: 'payment_proof', label: 'Payment proof awaiting review', count: input.paymentProofs.length },
    { id: 'kyc_pending', label: 'KYC pending', count: input.kycPending.length },
    { id: 'bed_unassigned', label: 'Bed not assigned', count: input.unassignedResidents.length },
    { id: 'move_out', label: 'Move-out in progress', count: input.vacatingRows.length },
    { id: 'deposit_refund', label: 'Deposit refund pending', count: depositRefundCount },
    {
      id: 'requests_pending',
      label: 'Requests pending',
      count: input.residentRequests.filter((r) => r.type !== 'deposit_refund').length,
    },
  ];

  const todayWork: TodayWorkItem[] = [
    {
      id: 'move-in',
      label: `${input.moveInsToday.length} resident${input.moveInsToday.length === 1 ? '' : 's'} moving in today`,
      count: input.moveInsToday.length,
      href: '/admin/beds',
    },
    {
      id: 'move-out',
      label: `${input.moveOutsToday.length} move-out${input.moveOutsToday.length === 1 ? '' : 's'} today`,
      count: input.moveOutsToday.length,
      href: '/admin/vacating',
    },
    {
      id: 'deposit-refund',
      label: `${depositRefundCount} deposit refund${depositRefundCount === 1 ? '' : 's'} awaiting action`,
      count: depositRefundCount,
      href: '/admin/checkout-settlements?tab=refund_pending',
    },
    {
      id: 'rent-due',
      label: `${input.rentsDueToday.length} rent bill${input.rentsDueToday.length === 1 ? '' : 's'} due today`,
      count: input.rentsDueToday.length,
      href: '/admin/revenue/billing',
    },
  ].filter((t) => t.count > 0);

  const residentsById = new Map<string, ResidentListRow>();
  for (const r of input.unassignedResidents) {
    residentsById.set(r.id, r);
  }

  return { buckets, queue, todayWork, residentsById };
}

export function filterQueueByBucket(
  queue: ResidentOpsQueueItem[],
  bucket: AttentionBucketId | null,
): ResidentOpsQueueItem[] {
  if (!bucket) return queue;
  return queue.filter((q) => q.filterBucket === bucket);
}

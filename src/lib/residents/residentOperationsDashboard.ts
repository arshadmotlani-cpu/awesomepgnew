import { formatDate as formatDisplayDate } from '@/src/lib/format';
import { diffDays, formatDate } from '@/src/lib/dates';
import { deriveCheckoutOpsNextAction } from '@/src/lib/residents/checkoutOpsQueueCopy';
import { isActiveCheckoutSettlement } from '@/src/lib/residents/residentLifecycleState';
import type { CollectionQueueItem } from '@/src/lib/billing/collectionsQueue';
import type { KycSubmissionListRow } from '@/src/services/kyc';
import type { PendingPaymentReviewItem } from '@/src/services/paymentProofQueue';
import type { ResidentListRow } from '@/src/services/residentAdmin';
import type { CheckoutSettlementRow } from '@/src/services/checkoutSettlement';

export type AttentionBucketId =
  | 'rent_overdue'
  | 'rent_due'
  | 'electricity_due'
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
  | 'rent_due'
  | 'electricity_due'
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
  vacatingRequestId?: string | null;
  tenancyStatus: ResidentListRow['tenancyStatus'] | null;
  kycStatus: ResidentListRow['kycStatus'] | null;
  outstandingLabel?: string;
  outstandingAmountPaise?: number;
  financialInvoiceId?: string | null;
  outstandingKind?: 'rent' | 'electricity' | 'deposit';
  outstandingCategory?: string;
  outstandingPeriod?: string;
  customerPhone?: string;
  pgId?: string;
  sourceId?: string;
  sourceTable?: 'rent_invoices' | 'electricity_invoices';
  billingMonth?: string;
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
  payment_proof: 1,
  kyc: 2,
  bed_assignment: 3,
  rent_overdue: 4,
  rent_due: 5,
  electricity_due: 6,
  resident_request: 7,
  move_out: 8,
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

export function buildResidentOperationsDashboard(input: {
  unpaidBilling: CollectionQueueItem[];
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
    settlementStatus?: string | null;
    finalRefundPaise?: number | null;
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

  const activeCheckoutCustomerIds = new Set<string>();
  for (const v of input.vacatingRows) {
    if (v.customerId && v.settlementStatus && isActiveCheckoutSettlement({ status: v.settlementStatus as CheckoutSettlementRow['status'] })) {
      activeCheckoutCustomerIds.add(v.customerId);
    }
  }
  for (const s of input.checkoutRefunds) {
    if (isActiveCheckoutSettlement(s)) activeCheckoutCustomerIds.add(s.customerId);
  }

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
    if (activeCheckoutCustomerIds.has(k.customerId)) continue;
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
    if (activeCheckoutCustomerIds.has(r.id)) continue;
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
    if (!p.customerId) continue;
    if (activeCheckoutCustomerIds.has(p.customerId)) continue;
    const kindLabel =
      p.kind === 'electricity' ? 'Electricity payment' : p.kind === 'rent' ? 'Rent payment' : p.paymentTypeLabel;
    queue.push({
      id: `pay-${p.key}`,
      category: 'payment_proof',
      filterBucket: 'payment_proof',
      customerId: p.customerId,
      residentName: p.residentName,
      pgName: p.pgName,
      roomNumber: p.roomNumber,
      bedCode: p.bedCode,
      issue: `${kindLabel} screenshot awaiting admin review`,
      nextAction: 'Verify payment screenshot and approve or reject',
      primaryActionLabel: 'Review payment',
      primaryHref: '/admin/operations?filter=payment_proof',
      sortPriority: 0,
      bookingId: p.bookingId,
      kycSubmissionId: null,
      tenancyStatus: 'active',
      kycStatus: null,
    });
  }

  const proofCustomerIds = new Set(
    input.paymentProofs.map((p) => p.customerId).filter(Boolean) as string[],
  );
  const pendingElecInvoiceIds = new Set(
    input.paymentProofs
      .filter((p) => p.kind === 'electricity')
      .map((p) => p.entityId)
      .filter(Boolean),
  );

  for (const b of input.unpaidBilling) {
    if (activeCheckoutCustomerIds.has(b.customerId)) continue;
    const isRent = b.kind === 'rent';
    if (isRent && proofCustomerIds.has(b.customerId)) continue;
    if (!isRent && pendingElecInvoiceIds.has(b.sourceId)) continue;

    const category: ResidentOpsQueueCategory = isRent
      ? b.priority === 'overdue'
        ? 'rent_overdue'
        : 'rent_due'
      : 'electricity_due';
    const filterBucket: AttentionBucketId =
      b.priority === 'overdue' ? 'rent_overdue' : isRent ? 'rent_due' : 'electricity_due';

    const dueLabel =
      b.priority === 'overdue'
        ? `Overdue · ${b.daysOverdue} day${b.daysOverdue === 1 ? '' : 's'}`
        : b.priority === 'due_today'
          ? 'Due today'
          : b.priority === 'due_soon'
            ? 'Due soon'
            : 'Waiting for payment';

    queue.push({
      id: b.id,
      category,
      filterBucket,
      customerId: b.customerId,
      residentName: b.customerFullName,
      pgName: b.pgName,
      roomNumber: b.roomNumber,
      bedCode: b.bedCode ?? null,
      issue: `${b.invoiceLabel} · ${dueLabel}`,
      nextAction: 'Resident pays and uploads payment screenshot',
      primaryActionLabel: 'Open resident',
      primaryHref: b.financialInvoiceId
        ? `/admin/invoices/${b.financialInvoiceId}`
        : `/admin/residents/${b.customerId}#open-bills`,
      sortPriority: b.priority === 'overdue' ? b.daysOverdue : 0,
      bookingId: b.bookingId ?? null,
      kycSubmissionId: null,
      tenancyStatus: 'active',
      kycStatus: null,
      outstandingLabel: b.invoiceLabel,
      outstandingAmountPaise: b.amountPaise,
      financialInvoiceId: b.financialInvoiceId ?? null,
      outstandingKind: isRent ? 'rent' : 'electricity',
      outstandingCategory: b.categoryLabel,
      outstandingPeriod: b.periodLabel,
      customerPhone: b.customerPhone,
      pgId: b.pgId,
      sourceId: b.sourceId,
      sourceTable: b.sourceTable,
      billingMonth: b.billingMonth,
    });
  }

  for (const v of input.vacatingRows) {
    const copy = deriveCheckoutOpsNextAction({
      vacatingStatus: v.status,
      settlementStatus: v.settlementStatus as Parameters<
        typeof deriveCheckoutOpsNextAction
      >[0]['settlementStatus'],
      finalRefundPaise: v.finalRefundPaise ?? null,
    });
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
          : copy.issue,
      nextAction: copy.nextAction,
      primaryActionLabel: copy.primaryActionLabel,
      primaryHref:
        v.status === 'pending'
          ? '/admin/vacating?status=pending'
          : v.settlementId
            ? `/admin/checkout-settlements/${v.settlementId}`
            : '/admin/checkout-settlements',
      sortPriority: v.status === 'pending' ? 0 : diffDays(today, v.vacatingDate),
      bookingId: v.bookingId,
      kycSubmissionId: null,
      vacatingRequestId: v.id,
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

  const overdueBilling = input.unpaidBilling.filter((b) => b.priority === 'overdue');
  const rentDue = input.unpaidBilling.filter((b) => b.kind === 'rent' && b.priority !== 'overdue');
  const elecDue = input.unpaidBilling.filter((b) => b.kind === 'electricity');

  const buckets: AttentionBucket[] = [
    { id: 'rent_due', label: 'Rent awaiting payment', count: rentDue.length },
    { id: 'electricity_due', label: 'Electricity awaiting payment', count: elecDue.length },
    { id: 'rent_overdue', label: 'Overdue invoices', count: overdueBilling.length },
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
      label: `${input.unpaidBilling.length} pending bill${input.unpaidBilling.length === 1 ? '' : 's'} awaiting payment`,
      count: input.unpaidBilling.length,
      href: '/admin/billing?tab=billing',
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

/**
 * Single lifecycle state per resident — Operations renders exactly one action card.
 * Active checkout settlement overrides all other workflows (bed, KYC, booking, etc.).
 */
import type { CheckoutSettlementRow } from '@/src/services/checkoutSettlement';
import type {
  ResidentOpsQueueCategory,
  ResidentOpsQueueItem,
} from '@/src/lib/residents/residentOperationsDashboard';
import type { ResidentsQueueRow } from '@/src/lib/residents/residentOperationsResidentsView';

export type ResidentLifecycleState =
  | 'waiting_bed_assignment'
  | 'living'
  | 'notice_given'
  | 'waiting_for_resident'
  | 'waiting_for_admin'
  | 'refund_pending'
  | 'checkout_complete'
  | 'kyc_pending'
  | 'payment_proof_pending'
  | 'rent_overdue'
  | 'rent_due'
  | 'electricity_due'
  | 'resident_request';

export const LIFECYCLE_STATE_LABEL: Record<ResidentLifecycleState, string> = {
  waiting_bed_assignment: 'Waiting Bed Assignment',
  living: 'Living',
  notice_given: 'Notice Given',
  waiting_for_resident: 'Waiting For Resident',
  waiting_for_admin: 'Waiting For Admin',
  refund_pending: 'Refund Pending',
  checkout_complete: 'Checkout Complete',
  kyc_pending: 'KYC Pending',
  payment_proof_pending: 'Payment Proof Pending',
  rent_overdue: 'Rent Overdue',
  rent_due: 'Rent Due',
  electricity_due: 'Electricity Due',
  resident_request: 'Resident Request',
};

const ACTIVE_CHECKOUT_STATUSES = new Set([
  'awaiting_resident_details',
  'awaiting_admin_review',
  'approved',
  'refund_pending',
]);

const SUPPRESSED_WHEN_CHECKOUT_ACTIVE: Set<ResidentOpsQueueCategory> = new Set([
  'bed_assignment',
  'kyc',
  'payment_proof',
  'rent_overdue',
  'rent_due',
  'electricity_due',
  'resident_request',
  'refund',
]);

const CATEGORY_TO_LIFECYCLE: Partial<Record<ResidentOpsQueueCategory, ResidentLifecycleState>> = {
  bed_assignment: 'waiting_bed_assignment',
  kyc: 'kyc_pending',
  payment_proof: 'payment_proof_pending',
  rent_overdue: 'rent_overdue',
  rent_due: 'rent_due',
  electricity_due: 'electricity_due',
  resident_request: 'resident_request',
  refund: 'refund_pending',
  move_out: 'waiting_for_admin',
};

const H5_CATEGORY_ORDER: Record<ResidentOpsQueueCategory, number> = {
  move_out: 0,
  refund: 1,
  payment_proof: 2,
  kyc: 3,
  bed_assignment: 4,
  rent_overdue: 5,
  rent_due: 6,
  electricity_due: 7,
  resident_request: 8,
};

const BILLING_CATEGORIES: Set<ResidentOpsQueueCategory> = new Set([
  'payment_proof',
  'rent_overdue',
  'rent_due',
  'electricity_due',
]);

export function isActiveCheckoutSettlement(
  settlement: Pick<CheckoutSettlementRow, 'status'> | null | undefined,
): boolean {
  return Boolean(settlement && ACTIVE_CHECKOUT_STATUSES.has(settlement.status));
}

export function lifecycleStateFromSettlement(
  settlement: Pick<CheckoutSettlementRow, 'status'>,
): ResidentLifecycleState {
  if (settlement.status === 'awaiting_resident_details') return 'waiting_for_resident';
  if (settlement.status === 'refund_pending') return 'refund_pending';
  if (settlement.status === 'completed' || settlement.status === 'refund_paid') {
    return 'checkout_complete';
  }
  return 'waiting_for_admin';
}

export function lifecycleStateFromQueueItem(item: ResidentOpsQueueItem): ResidentLifecycleState {
  if (item.category === 'move_out') {
    if (
      item.tenancyStatus === 'vacating' &&
      (item.issue.toLowerCase().includes('notice') || item.sortPriority === 0)
    ) {
      return 'notice_given';
    }
    return 'waiting_for_admin';
  }
  return CATEGORY_TO_LIFECYCLE[item.category] ?? 'living';
}

/**
 * Given all queue candidates for one resident, return the single winning item.
 */
export function resolveResidentQueueWinner(input: {
  customerId: string;
  items: ResidentOpsQueueItem[];
  settlement?: CheckoutSettlementRow | null;
}): ResidentOpsQueueItem | null {
  if (input.items.length === 0) return null;

  const activeCheckout = isActiveCheckoutSettlement(input.settlement);
  const eligible = activeCheckout
    ? input.items.filter((item) => !SUPPRESSED_WHEN_CHECKOUT_ACTIVE.has(item.category))
    : input.items;

  if (eligible.length === 0) {
    return input.items.find((item) => item.category === 'move_out') ?? input.items[0] ?? null;
  }

  const sorted = [...eligible].sort((a, b) => {
    const rank = H5_CATEGORY_ORDER[a.category] - H5_CATEGORY_ORDER[b.category];
    if (rank !== 0) return rank;
    return a.sortPriority - b.sortPriority;
  });

  return sorted[0] ?? null;
}

export function applyLifecycleStateToQueueRow(
  row: ResidentsQueueRow,
  settlement?: CheckoutSettlementRow | null,
  sourceItem?: ResidentOpsQueueItem,
): ResidentsQueueRow {
  let state: ResidentLifecycleState;
  if (isActiveCheckoutSettlement(settlement)) {
    state = lifecycleStateFromSettlement(settlement!);
  } else if (sourceItem) {
    state = lifecycleStateFromQueueItem(sourceItem);
  } else {
    state =
      CATEGORY_TO_LIFECYCLE[row.category] ??
      (row.currentState.toLowerCase().includes('notice') ? 'notice_given' : 'living');
  }

  const filterTags = isActiveCheckoutSettlement(settlement)
    ? row.filterTags.filter(
        (tag) => tag !== 'bed_assignment' && tag !== 'kyc' && tag !== 'overdue',
      )
    : row.filterTags;

  return {
    ...row,
    currentState: LIFECYCLE_STATE_LABEL[state],
    filterTags,
  };
}

export function buildLifecycleResolvedQueue(input: {
  queueItems: ResidentOpsQueueItem[];
  queueRows: ResidentsQueueRow[];
  settlementsByCustomerId: Map<string, CheckoutSettlementRow>;
}): ResidentsQueueRow[] {
  const rowById = new Map(input.queueRows.map((row) => [row.id, row]));
  const itemsByCustomer = new Map<string, ResidentOpsQueueItem[]>();
  const withoutCustomer: ResidentsQueueRow[] = [];
  const billingRows: ResidentsQueueRow[] = [];

  for (const item of input.queueItems) {
    if (!item.customerId) continue;
    if (BILLING_CATEGORIES.has(item.category)) {
      const row = rowById.get(item.id);
      if (row) billingRows.push(row);
      continue;
    }
    const list = itemsByCustomer.get(item.customerId) ?? [];
    list.push(item);
    itemsByCustomer.set(item.customerId, list);
  }

  for (const row of input.queueRows) {
    if (!row.customerId) withoutCustomer.push(row);
  }

  const resolved: ResidentsQueueRow[] = [];
  for (const [customerId, items] of itemsByCustomer) {
    const settlement = input.settlementsByCustomerId.get(customerId);
    const winner = resolveResidentQueueWinner({ customerId, items, settlement });
    if (!winner) continue;
    const row = rowById.get(winner.id);
    if (!row) continue;
    resolved.push(applyLifecycleStateToQueueRow(row, settlement, winner));
  }

  const billingByCustomer = new Map<string, ResidentsQueueRow[]>();
  for (const row of billingRows) {
    const key = row.customerId ?? row.id;
    const list = billingByCustomer.get(key) ?? [];
    list.push(row);
    billingByCustomer.set(key, list);
  }

  const mergedBilling: ResidentsQueueRow[] = [];
  for (const [customerId, rows] of billingByCustomer) {
    const enriched = rows.map((row) => {
      const settlement = row.customerId
        ? input.settlementsByCustomerId.get(row.customerId)
        : undefined;
      const sourceItem = input.queueItems.find((i) => i.id === row.id);
      return applyLifecycleStateToQueueRow(row, settlement, sourceItem);
    });
    if (enriched.length === 1) {
      mergedBilling.push(enriched[0]!);
      continue;
    }
    const primary = [...enriched].sort(
      (a, b) => H5_CATEGORY_ORDER[a.category] - H5_CATEGORY_ORDER[b.category],
    )[0]!;
    mergedBilling.push({
      ...primary,
      outstandingLabel: enriched
        .map((r) => r.outstandingLabel)
        .filter((label): label is string => Boolean(label))
        .join(' · '),
      nextAction: 'Resident pays rent and electricity — open bills for each invoice',
      primaryActionLabel: 'Open bills',
      primaryHref: `/admin/residents/${customerId}#open-bills`,
    });
  }

  return [...withoutCustomer, ...resolved, ...mergedBilling].sort((a, b) => {
    const c = H5_CATEGORY_ORDER[a.category] - H5_CATEGORY_ORDER[b.category];
    if (c !== 0) return c;
    return b.ageSortHours - a.ageSortHours;
  });
}

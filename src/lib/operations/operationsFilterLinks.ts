/** Operations action-center filter SSOT — eight admin queues only. */

export const OPS_QUEUE_FILTERS = [
  'waiting_for_approval',
  'rent_due',
  'electricity_due',
  'vacating_requests',
  'refund_due',
  'booking_approval',
  'deposit_due',
  'kyc_review',
] as const;

export type OpsQueueFilter = (typeof OPS_QUEUE_FILTERS)[number];

export const OPS_QUEUE_LABELS: Record<OpsQueueFilter, string> = {
  waiting_for_approval: 'Waiting for approval',
  rent_due: 'Rent due',
  electricity_due: 'Electricity due',
  vacating_requests: 'Vacating requests',
  refund_due: 'Refund due',
  booking_approval: 'Booking approval',
  deposit_due: 'Deposit due',
  kyc_review: 'KYC review',
};

const LEGACY_FILTER_ALIASES: Record<string, OpsQueueFilter> = {
  payment_proof: 'waiting_for_approval',
  waiting_for_admin_review: 'waiting_for_approval',
  move_out: 'vacating_requests',
  checkout: 'vacating_requests',
  refund: 'refund_due',
  kyc: 'kyc_review',
  bed_assignment: 'deposit_due',
  deposit_due: 'deposit_due',
  booking_approval: 'booking_approval',
  rent_due: 'rent_due',
  electricity_due: 'electricity_due',
};

export function operationsFilterHref(filter: OpsQueueFilter, focus?: string): string {
  const base = `/admin/operations?filter=${filter}`;
  if (focus) return `${base}&focus=${encodeURIComponent(focus)}`;
  return base;
}

export function parseOperationsFilter(value: string | undefined): OpsQueueFilter | null {
  if (!value) return null;
  if (OPS_QUEUE_FILTERS.includes(value as OpsQueueFilter)) {
    return value as OpsQueueFilter;
  }
  return LEGACY_FILTER_ALIASES[value] ?? null;
}

export function defaultOperationsFilter(
  counts: Record<OpsQueueFilter, number>,
): OpsQueueFilter {
  for (const id of OPS_QUEUE_FILTERS) {
    if (counts[id] > 0) return id;
  }
  return 'waiting_for_approval';
}

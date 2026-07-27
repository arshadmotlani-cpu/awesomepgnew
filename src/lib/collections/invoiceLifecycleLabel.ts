/**
 * Collections product lifecycle labels — maps stored rent_invoice status +
 * projected effectiveStatus to UI language. Does not invent money math.
 */

export type CollectionsLifecycleLabel =
  | 'Upcoming'
  | 'Generated'
  | 'Awaiting Payment'
  | 'Payment Submitted'
  | 'Under Verification'
  | 'Partially Paid'
  | 'Paid'
  | 'Overdue'
  | 'Cancelled'
  | 'Expired';

export type CollectionsBucket =
  | 'upcoming'
  | 'due_today'
  | 'overdue'
  | 'awaiting'
  | 'paid_today';

export type InvoiceLifecycleInput = {
  /** Stored rent_invoices.status (or virtual for upcoming). */
  status?: string | null;
  /** From projectInvoice / RFE — never recompute outstanding here. */
  effectiveStatus?: string | null;
  /**
   * When true, treat payment_in_progress as Under Verification (in proof queue).
   * When false with payment_in_progress, treat as Payment Submitted.
   * Default: true (admin queue view).
   */
  inProofQueue?: boolean;
  /** Virtual row: bill not yet generated. */
  isUpcoming?: boolean;
};

/**
 * Single mapper for Collections UI labels.
 * Prefer effectiveStatus (RFE) when present; fall back to stored status.
 */
export function invoiceLifecycleLabel(input: InvoiceLifecycleInput): CollectionsLifecycleLabel {
  if (input.isUpcoming) return 'Upcoming';

  const effective = (input.effectiveStatus ?? '').toLowerCase();
  const status = (input.status ?? '').toLowerCase();

  if (effective === 'cancelled' || status === 'cancelled') return 'Cancelled';
  if (effective === 'expired' || status === 'expired') return 'Expired';
  if (effective === 'paid' || status === 'paid') return 'Paid';
  if (effective === 'partial') return 'Partially Paid';

  if (effective === 'payment_in_progress' || status === 'payment_in_progress') {
    return input.inProofQueue === false ? 'Payment Submitted' : 'Under Verification';
  }

  if (effective === 'overdue' || status === 'overdue') return 'Overdue';

  if (status === 'sent') return 'Awaiting Payment';
  if (status === 'generated') return 'Generated';
  if (status === 'pending' || effective === 'pending') return 'Awaiting Payment';

  return 'Awaiting Payment';
}

/** Map a lifecycle label + due context into a dashboard bucket (when applicable). */
export function lifecycleLabelToBucket(args: {
  label: CollectionsLifecycleLabel;
  dueDate?: string | null;
  paidAtIsoDay?: string | null;
  todayIso: string;
}): CollectionsBucket | null {
  const { label, dueDate, paidAtIsoDay, todayIso } = args;

  if (label === 'Upcoming') return 'upcoming';
  if (label === 'Paid') {
    return paidAtIsoDay === todayIso ? 'paid_today' : null;
  }
  if (label === 'Under Verification' || label === 'Payment Submitted') return 'awaiting';
  if (label === 'Cancelled' || label === 'Expired') return null;

  if (dueDate && dueDate < todayIso) return 'overdue';
  if (dueDate === todayIso) return 'due_today';
  if (label === 'Overdue') return 'overdue';
  return null;
}

export function collectionsBucketLabel(bucket: CollectionsBucket): string {
  switch (bucket) {
    case 'upcoming':
      return 'Upcoming (7d)';
    case 'due_today':
      return 'Due Today';
    case 'overdue':
      return 'Overdue';
    case 'awaiting':
      return 'Awaiting Verification';
    case 'paid_today':
      return 'Paid Today';
    default:
      return bucket;
  }
}

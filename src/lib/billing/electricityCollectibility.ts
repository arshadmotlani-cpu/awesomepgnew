/**
 * Single source of truth — when an electricity invoice belongs in "Electricity Due"
 * (resident must pay) vs "Waiting for approval" vs settled.
 */

export type ElectricityCollectibilityRow = {
  id: string;
  status: string;
  paymentProofUrl?: string | null;
  outstandingPaise: number;
  effectiveStatus: string;
  supersededByInvoiceId?: string | null;
  bookingId: string;
  billingMonth: string;
};

export function electricityBookingMonthKey(bookingId: string, billingMonth: string): string {
  return `${bookingId}:${billingMonth}`;
}

/** Resident must upload payment — not in approval, not paid, not cancelled. */
export function isElectricityAwaitingResidentPayment(
  row: ElectricityCollectibilityRow,
  paidBookingMonthKeys?: ReadonlySet<string>,
): boolean {
  if (row.supersededByInvoiceId) return false;
  if (row.status === 'paid' || row.status === 'cancelled') return false;
  if (row.outstandingPaise <= 0) return false;
  if (row.paymentProofUrl?.trim()) return false;
  if (row.effectiveStatus === 'paid' || row.effectiveStatus === 'cancelled') return false;
  if (row.effectiveStatus === 'payment_in_progress') return false;
  if (paidBookingMonthKeys?.has(electricityBookingMonthKey(row.bookingId, row.billingMonth))) {
    return false;
  }
  return true;
}

/** Screenshot uploaded — admin must approve (Waiting for approval only). */
export function isElectricityAwaitingAdminApproval(row: {
  status: string;
  paymentProofUrl?: string | null;
  supersededByInvoiceId?: string | null;
}): boolean {
  if (row.supersededByInvoiceId) return false;
  return row.status === 'pending' && Boolean(row.paymentProofUrl?.trim());
}

export function buildPaidElectricityBookingMonthKeys(
  rows: Array<{ bookingId: string; billingMonth: string }>,
): Set<string> {
  return new Set(rows.map((r) => electricityBookingMonthKey(r.bookingId, r.billingMonth)));
}

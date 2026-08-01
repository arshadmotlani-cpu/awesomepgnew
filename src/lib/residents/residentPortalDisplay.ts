/** Client-safe resident portal financial display helpers (no DB). */

const VISIBLE_INVOICE_STATUSES = new Set([
  'pending',
  'paid',
  'partial',
  'overdue',
  'payment_in_progress',
  'expired',
]);

export function isVisibleResidentInvoiceStatus(status: string): boolean {
  return VISIBLE_INVOICE_STATUSES.has(status);
}

export function isCancelledResidentInvoiceStatus(status: string): boolean {
  return status === 'cancelled';
}

/** Sum of payable due rows (rows with a pay link) for Total Due card. */
export function computeResidentTotalDuePaise(
  rows: Array<{ amountPaise: number; href?: string | null }>,
): number {
  return rows.filter((r) => r.href).reduce((s, r) => s + r.amountPaise, 0);
}

/** Pure message builder for tests and UI. */
export function pendingRentGenerationMessage(formattedDate: string): string {
  return `Your next rent invoice will be generated on ${formattedDate}.`;
}

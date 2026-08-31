/** `deposit_ledger.related_payment_id` FK — only real `payments.id` UUIDs are valid. */

const PAYMENTS_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parsePaymentsRelatedId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return PAYMENTS_UUID_RE.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function depositLinkLedgerReason(linkId: string): string {
  return `deposit-link:${linkId}`;
}

export function invoiceDepositLedgerReason(bookingId: string, sourceId: string): string {
  return `invoice-deposit:${bookingId}:${sourceId}`;
}

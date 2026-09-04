/**
 * Canonical resident "payable now" projection — Bills Due, Total Due, and Pay All
 * must all consume the same rows and totals.
 */
import type { PaymentDueRow } from '@/src/components/customer/account/resident/ResidentPaymentsPanel';

export const RESIDENT_PORTAL_PAY_ALL_SOURCE = 'resident_portal_pay_all';

export type ResidentPayableTarget =
  | { kind: 'rent'; invoiceId: string }
  | { kind: 'electricity'; invoiceId: string }
  | { kind: 'financial'; invoiceId: string }
  | { kind: 'deposit'; bookingId: string };

export type ResidentPayableNowRow = PaymentDueRow & {
  target: ResidentPayableTarget;
};

export function isResidentPortalPayAllSource(sourceTable: string | null | undefined): boolean {
  return sourceTable === RESIDENT_PORTAL_PAY_ALL_SOURCE;
}

export function parseResidentPayableTarget(
  row: PaymentDueRow,
  bookingId: string | null,
): ResidentPayableTarget | null {
  if (!row.href || row.amountPaise <= 0) return null;
  if (row.key.startsWith('rent-')) {
    return { kind: 'rent', invoiceId: row.key.slice('rent-'.length) };
  }
  if (row.electricityInvoiceId) {
    return { kind: 'electricity', invoiceId: row.electricityInvoiceId };
  }
  if (row.key.startsWith('elec-')) {
    return { kind: 'electricity', invoiceId: row.key.slice('elec-'.length) };
  }
  if (row.key.startsWith('fi-')) {
    return { kind: 'financial', invoiceId: row.key.slice('fi-'.length) };
  }
  if (row.key === 'deposit-due' && bookingId) {
    return { kind: 'deposit', bookingId };
  }
  return null;
}

/** Payable-now rows: due + rejected (rejected payments remain payable). */
export function buildResidentPayableNowRows(input: {
  dueRows: PaymentDueRow[];
  rejectedRows?: PaymentDueRow[];
  bookingId: string | null;
}): ResidentPayableNowRow[] {
  const combined = [...input.dueRows, ...(input.rejectedRows ?? [])];
  const out: ResidentPayableNowRow[] = [];
  const seen = new Set<string>();

  for (const row of combined) {
    const target = parseResidentPayableTarget(row, input.bookingId);
    if (!target) continue;
    const dedupeKey = `${target.kind}:${'invoiceId' in target ? target.invoiceId : target.bookingId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({ ...row, target });
  }
  return out;
}

export function computeResidentPayableNowTotalPaise(rows: ResidentPayableNowRow[]): number {
  return rows.reduce((sum, row) => sum + row.amountPaise, 0);
}

export function resolveResidentPayAllPresentation(
  payables: ResidentPayableNowRow[],
): {
  visible: boolean;
  totalPaise: number;
  href: string | null;
  needsAggregateLink: boolean;
} {
  const totalPaise = computeResidentPayableNowTotalPaise(payables);
  if (totalPaise <= 0 || payables.length === 0) {
    return { visible: false, totalPaise: 0, href: null, needsAggregateLink: false };
  }
  if (payables.length === 1) {
    return {
      visible: true,
      totalPaise,
      href: payables[0]!.href,
      needsAggregateLink: false,
    };
  }
  return {
    visible: true,
    totalPaise,
    href: null,
    needsAggregateLink: true,
  };
}

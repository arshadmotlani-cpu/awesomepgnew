/**
 * Invoice lifecycle guards — prevents invalid transitions (e.g. paid → cancelled).
 */

import type { FinancialInvoiceStatus } from '@/src/db/schema/enums';

export type InvoiceTransitionSource =
  | 'webhook'
  | 'cron'
  | 'user'
  | 'system'
  | 'admin'
  | 'reconcile';

export type RentInvoiceLifecycleStatus =
  | 'pending'
  | 'overdue'
  | 'payment_in_progress'
  | 'paid'
  | 'expired'
  | 'cancelled';

/** Rent statuses that may be cancelled by admin/cron. */
export const RENT_CANCELLABLE_STATUSES: readonly RentInvoiceLifecycleStatus[] = [
  'pending',
  'overdue',
  'expired',
];

/** Rent statuses locked while payment is in flight or complete. */
export const RENT_PAYMENT_LOCKED_STATUSES: readonly RentInvoiceLifecycleStatus[] = [
  'payment_in_progress',
  'paid',
];

/** Financial statuses that may be cancelled. */
export const FINANCIAL_CANCELLABLE_STATUSES: readonly FinancialInvoiceStatus[] = [
  'draft',
  'sent',
  'overdue',
  'expired',
];

/** Financial statuses that must never be cancelled. */
export const FINANCIAL_PAYMENT_LOCKED_STATUSES: readonly FinancialInvoiceStatus[] = [
  'payment_in_progress',
  'processing',
  'settled',
  'paid',
  'partial',
];

export function isRentInvoiceCancellable(status: string): boolean {
  return (RENT_CANCELLABLE_STATUSES as readonly string[]).includes(status);
}

export function isRentInvoicePaymentLocked(status: string): boolean {
  return (RENT_PAYMENT_LOCKED_STATUSES as readonly string[]).includes(status);
}

export function isFinancialInvoiceCancellable(status: FinancialInvoiceStatus | string): boolean {
  return (FINANCIAL_CANCELLABLE_STATUSES as readonly string[]).includes(status);
}

export function isFinancialInvoicePaymentLocked(status: FinancialInvoiceStatus | string): boolean {
  return (FINANCIAL_PAYMENT_LOCKED_STATUSES as readonly string[]).includes(status);
}

export function canTransitionRentStatus(
  from: string,
  to: RentInvoiceLifecycleStatus,
): boolean {
  if (from === to) return true;
  if (to === 'cancelled') return isRentInvoiceCancellable(from);
  if (to === 'expired') return isRentInvoiceCancellable(from);
  if (to === 'payment_in_progress') {
    return from === 'pending' || from === 'overdue';
  }
  if (to === 'paid') {
    return (
      from === 'pending' ||
      from === 'overdue' ||
      from === 'payment_in_progress'
    );
  }
  if (to === 'overdue') return from === 'pending';
  return false;
}

export function canTransitionFinancialStatus(
  from: FinancialInvoiceStatus | string,
  to: FinancialInvoiceStatus,
): boolean {
  if (from === to) return true;
  if (to === 'cancelled') return isFinancialInvoiceCancellable(from);
  if (to === 'expired') return isFinancialInvoiceCancellable(from);
  if (to === 'payment_in_progress') {
    return from === 'draft' || from === 'sent' || from === 'overdue';
  }
  if (to === 'paid' || to === 'partial') {
    return (
      from === 'draft' ||
      from === 'sent' ||
      from === 'overdue' ||
      from === 'payment_in_progress' ||
      from === 'processing' ||
      from === 'partial'
    );
  }
  if (to === 'processing') {
    return from === 'payment_in_progress' || from === 'sent' || from === 'overdue';
  }
  if (to === 'settled') {
    return from === 'processing' || from === 'paid';
  }
  if (to === 'refunded') {
    return from === 'paid' || from === 'partial';
  }
  return false;
}

export function rentStatusToUnifiedStatus(
  status: string,
  dueDate: string,
): FinancialInvoiceStatus {
  if (status === 'paid') return 'paid';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'payment_in_progress') return 'payment_in_progress';
  if (status === 'expired') return 'expired';
  if (status === 'overdue') return 'overdue';
  if (dueDate < new Date().toISOString().slice(0, 10)) return 'overdue';
  return 'sent';
}

/**
 * Merge rent-derived status into an existing financial row without downgrading
 * payment-locked states during concurrent cancel/sync races.
 */
export function mergeFinancialStatusFromRent(
  currentFinancial: FinancialInvoiceStatus | null | undefined,
  rentStatus: string,
  dueDate: string,
  hasPaymentProof: boolean,
): FinancialInvoiceStatus {
  const fromRent = rentStatusToUnifiedStatus(rentStatus, dueDate);

  if (rentStatus === 'payment_in_progress' || (hasPaymentProof && rentStatus !== 'paid' && rentStatus !== 'cancelled')) {
    if (currentFinancial === 'paid' || currentFinancial === 'partial') {
      return currentFinancial;
    }
    return 'payment_in_progress';
  }

  if (currentFinancial && isFinancialInvoicePaymentLocked(currentFinancial)) {
    if (rentStatus === 'paid') return 'paid';
    return currentFinancial;
  }

  return fromRent;
}

export function expressSaleIdempotencyKey(args: {
  rentInvoiceId?: string | null;
  financialInvoiceId?: string | null;
  linkId: string;
}): string {
  if (args.rentInvoiceId) return `express-sale:rent:${args.rentInvoiceId}`;
  if (args.financialInvoiceId) return `express-sale:fi:${args.financialInvoiceId}`;
  return `express-sale:link:${args.linkId}`;
}

export function expressSalePaymentIdempotencyKey(linkId: string): string {
  return `express-sale:payment:${linkId}`;
}

export function logInvoiceStateTransition(args: {
  invoiceId: string;
  layer: 'rent' | 'financial';
  previousStatus: string;
  newStatus: string;
  source: InvoiceTransitionSource;
  meta?: Record<string, unknown>;
}): void {
  const payload = {
    invoiceId: args.invoiceId,
    layer: args.layer,
    previousStatus: args.previousStatus,
    newStatus: args.newStatus,
    source: args.source,
    ...args.meta,
  };
  console.info('[invoice-state]', JSON.stringify(payload));
}

export function guardRentStatusTransition(
  from: string,
  to: RentInvoiceLifecycleStatus,
): { ok: true } | { ok: false; error: string } {
  if (canTransitionRentStatus(from, to)) return { ok: true };
  return {
    ok: false,
    error: `Invalid rent invoice transition ${from} → ${to}`,
  };
}

export function guardFinancialStatusTransition(
  from: FinancialInvoiceStatus | string,
  to: FinancialInvoiceStatus,
): { ok: true } | { ok: false; error: string } {
  if (canTransitionFinancialStatus(from, to)) return { ok: true };
  return {
    ok: false,
    error: `Invalid financial invoice transition ${from} → ${to}`,
  };
}

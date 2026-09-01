import { logger } from '@/src/lib/logger';
import type { PaymentDueRow } from '@/src/components/customer/account/resident/ResidentPaymentsPanel';

const UNAVAILABLE_LABEL = 'Bill unavailable';

export function logResidentBillRowProjectionError(input: {
  scope: 'rent' | 'electricity';
  entityId: string;
  bookingId: string;
  bookingCode?: string | null;
  error: unknown;
}): void {
  logger.error('resident_portal.bill_row_projection_failed', {
    scope: input.scope,
    entityId: input.entityId,
    bookingId: input.bookingId,
    bookingCode: input.bookingCode ?? null,
    message: input.error instanceof Error ? input.error.message : String(input.error),
  });
}

export function unavailableBillDueRow(input: {
  key: string;
  invoiceNumber?: string | null;
  label?: string;
}): PaymentDueRow {
  return {
    key: input.key,
    label: input.label ?? UNAVAILABLE_LABEL,
    amountPaise: 0,
    dueDate: null,
    href: null,
    status: 'Unable to display — contact PG office',
    invoiceNumber: input.invoiceNumber ?? undefined,
  };
}

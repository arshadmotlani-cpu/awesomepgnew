/**
 * Admin custom charges — creates financial_invoices (SSOT obligation).
 */

import { db } from '@/src/db/client';
import { financialInvoices } from '@/src/db/schema';
import type { FinancialInvoiceType } from '@/src/db/schema/enums';
import type { InvoiceBreakdown } from '@/src/db/schema/financialInvoices';
import { formatDate } from '@/src/lib/dates';
import { revalidateFinancialViews } from '@/src/lib/billing/revalidateFinancialViews';
import { nextFinancialInvoiceNumber } from '@/src/lib/billing/invoiceNumbering.server';
import { getResidentFinancialSummary } from '@/src/services/residentFinancialEngine';
import { createPaymentLinkForInvoice } from '@/src/services/unifiedInvoices';

export type CustomChargeKind =
  | 'damage'
  | 'penalty'
  | 'cleaning'
  | 'maintenance'
  | 'admin'
  | 'custom';

const KIND_TO_INVOICE_TYPE: Record<CustomChargeKind, FinancialInvoiceType> = {
  damage: 'damage',
  penalty: 'penalty',
  cleaning: 'custom',
  maintenance: 'custom',
  admin: 'custom',
  custom: 'custom',
};

export type CreateCustomChargeInput = {
  customerId: string;
  bookingId?: string | null;
  kind: CustomChargeKind;
  title: string;
  description?: string;
  amountPaise: number;
  dueDate?: string;
  actorId: string;
};

export type CreateCustomChargeResult =
  | { ok: true; invoiceId: string; invoiceNumber: string; amountPaise: number }
  | { ok: false; error: string };

/** Create a custom charge invoice — appears in SSOT other/outstanding. */
export async function createCustomCharge(
  input: CreateCustomChargeInput,
): Promise<CreateCustomChargeResult> {
  if (input.amountPaise <= 0) {
    return { ok: false, error: 'Amount must be greater than zero.' };
  }
  if (!input.title.trim()) {
    return { ok: false, error: 'Title is required.' };
  }

  const summary = await getResidentFinancialSummary(input.customerId);
  if (!summary?.pgId) {
    return { ok: false, error: 'Resident not found or has no PG context.' };
  }

  const bookingId = input.bookingId ?? summary.bookingId ?? null;
  const invoiceType = KIND_TO_INVOICE_TYPE[input.kind];
  const label = input.title.trim();
  const notes = input.description?.trim()
    ? `${label} — ${input.description.trim()}`
    : label;

  const breakdown: InvoiceBreakdown = {
    otherPaise: input.amountPaise,
    lines: [
      {
        kind: 'custom',
        label,
        amountPaise: input.amountPaise,
        sourceTable: 'financial_invoices',
      },
    ],
  };

  const invoiceNumber = await nextFinancialInvoiceNumber({ pgId: summary.pgId });
  const dueDate = input.dueDate ?? formatDate(new Date());

  const [row] = await db
    .insert(financialInvoices)
    .values({
      invoiceNumber,
      invoiceType,
      customerId: input.customerId,
      bookingId,
      pgId: summary.pgId,
      roomNumber: summary.roomNumber,
      amountPaise: input.amountPaise,
      breakdown,
      status: 'sent',
      dueDate,
      sentAt: new Date(),
      notes,
    })
    .returning({ id: financialInvoices.id });

  await createPaymentLinkForInvoice(row.id).catch(() => undefined);
  revalidateFinancialViews();

  return {
    ok: true,
    invoiceId: row.id,
    invoiceNumber,
    amountPaise: input.amountPaise,
  };
}

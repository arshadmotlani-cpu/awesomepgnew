/**
 * Resident Credit Balance — overpayments and adjustments separate from deposit escrow.
 */

import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { residentCreditLedger } from '@/src/db/schema';

export type ResidentCreditBalance = {
  customerId: string;
  balancePaise: number;
};

export async function getResidentCreditBalance(customerId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${residentCreditLedger.amountPaise}), 0)::bigint::int`,
    })
    .from(residentCreditLedger)
    .where(eq(residentCreditLedger.customerId, customerId));
  return Math.max(0, row?.total ?? 0);
}

export async function recordResidentCredit(input: {
  customerId: string;
  bookingId?: string | null;
  amountPaise: number;
  reason: string;
  relatedPaymentId?: string | null;
  createdByAdminId?: string | null;
}): Promise<void> {
  if (input.amountPaise <= 0) return;
  await db.insert(residentCreditLedger).values({
    customerId: input.customerId,
    bookingId: input.bookingId ?? null,
    entryKind: 'credit',
    amountPaise: input.amountPaise,
    reason: input.reason,
    relatedPaymentId: input.relatedPaymentId ?? null,
    createdByAdminId: input.createdByAdminId ?? null,
  });
}

export async function recordResidentCreditDebit(input: {
  customerId: string;
  bookingId?: string | null;
  amountPaise: number;
  reason: string;
  createdByAdminId?: string | null;
}): Promise<void> {
  if (input.amountPaise <= 0) return;
  await db.insert(residentCreditLedger).values({
    customerId: input.customerId,
    bookingId: input.bookingId ?? null,
    entryKind: 'debit',
    amountPaise: -input.amountPaise,
    reason: input.reason,
    createdByAdminId: input.createdByAdminId ?? null,
  });
}

/**
 * Auto-apply available credit to a newly issued rent invoice (default on).
 * Idempotent via unique index on related_rent_invoice_id.
 */
export async function autoApplyCreditToRentInvoice(input: {
  customerId: string;
  bookingId: string;
  invoiceId: string;
  outstandingPaise: number;
}): Promise<{ appliedPaise: number }> {
  if (input.outstandingPaise <= 0) return { appliedPaise: 0 };

  const balance = await getResidentCreditBalance(input.customerId);
  if (balance <= 0) return { appliedPaise: 0 };

  const applyPaise = Math.min(balance, input.outstandingPaise);

  try {
    await db.insert(residentCreditLedger).values({
      customerId: input.customerId,
      bookingId: input.bookingId,
      entryKind: 'applied',
      amountPaise: -applyPaise,
      reason: `Auto-applied to rent invoice`,
      relatedRentInvoiceId: input.invoiceId,
    });
  } catch {
    return { appliedPaise: 0 };
  }

  const { recordRentPaymentSuccess } = await import('@/src/services/rentInvoices');
  await recordRentPaymentSuccess({
    invoiceId: input.invoiceId,
    amountPaise: applyPaise,
    provider: 'mock',
    providerPaymentId: `credit:${input.invoiceId}`,
    offlineProvider: 'cash',
  }).catch(() => undefined);

  return { appliedPaise: applyPaise };
}

export async function listRecentCreditEntries(
  customerId: string,
  limit = 20,
): Promise<
  Array<{
    id: string;
    entryKind: string;
    amountPaise: number;
    reason: string;
    createdAt: Date;
  }>
> {
  return db
    .select({
      id: residentCreditLedger.id,
      entryKind: residentCreditLedger.entryKind,
      amountPaise: residentCreditLedger.amountPaise,
      reason: residentCreditLedger.reason,
      createdAt: residentCreditLedger.createdAt,
    })
    .from(residentCreditLedger)
    .where(eq(residentCreditLedger.customerId, customerId))
    .orderBy(sql`${residentCreditLedger.createdAt} DESC`)
    .limit(limit);
}

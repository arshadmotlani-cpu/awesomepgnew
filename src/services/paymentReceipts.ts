/**
 * Payment receipts — Collections Phase 3 scaffolding.
 * Creates durable receipt rows linked to financial invoices; PDF via receiptPdf stub.
 */

import { randomBytes } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { paymentReceipts, type PaymentReceipt } from '@/src/db/schema';
import { formatDate } from '@/src/lib/dates';

export type CreatePaymentReceiptInput = {
  customerId: string;
  bookingId: string;
  financialInvoiceId: string;
  rentInvoiceId?: string | null;
  paymentId?: string | null;
  proofApprovalId?: string | null;
  amountPaise: number;
  method: string;
  paidAt: Date;
  collectedByAdminId?: string | null;
  transactionRef?: string | null;
};

function makeShareToken(): string {
  return randomBytes(16).toString('hex');
}

function makeReceiptNumber(paidAt: Date): string {
  const y = paidAt.getUTCFullYear();
  const m = String(paidAt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(paidAt.getUTCDate()).padStart(2, '0');
  const suffix = randomBytes(3).toString('hex').toUpperCase();
  return `RCPT-${y}${m}${d}-${suffix}`;
}

export async function createReceipt(
  input: CreatePaymentReceiptInput,
): Promise<PaymentReceipt> {
  if (input.amountPaise <= 0) {
    throw new Error('Receipt amount must be positive');
  }

  const [row] = await db
    .insert(paymentReceipts)
    .values({
      receiptNumber: makeReceiptNumber(input.paidAt),
      customerId: input.customerId,
      bookingId: input.bookingId,
      financialInvoiceId: input.financialInvoiceId,
      rentInvoiceId: input.rentInvoiceId ?? null,
      paymentId: input.paymentId ?? null,
      proofApprovalId: input.proofApprovalId ?? null,
      amountPaise: input.amountPaise,
      method: input.method,
      paidAt: input.paidAt,
      collectedByAdminId: input.collectedByAdminId ?? null,
      transactionRef: input.transactionRef ?? null,
      shareToken: makeShareToken(),
    })
    .returning();

  if (!row) throw new Error('Failed to create payment receipt');
  return row;
}

export async function listForCustomer(
  customerId: string,
  limit = 50,
): Promise<PaymentReceipt[]> {
  return db
    .select()
    .from(paymentReceipts)
    .where(eq(paymentReceipts.customerId, customerId))
    .orderBy(desc(paymentReceipts.createdAt))
    .limit(limit);
}

export async function getReceiptByShareToken(
  shareToken: string,
): Promise<PaymentReceipt | null> {
  const [row] = await db
    .select()
    .from(paymentReceipts)
    .where(eq(paymentReceipts.shareToken, shareToken))
    .limit(1);
  return row ?? null;
}

export async function getReceiptById(id: string): Promise<PaymentReceipt | null> {
  const [row] = await db
    .select()
    .from(paymentReceipts)
    .where(eq(paymentReceipts.id, id))
    .limit(1);
  return row ?? null;
}

/** Display helper for stubs / PDF. */
export function receiptPaidOnLabel(paidAt: Date): string {
  return formatDate(paidAt);
}

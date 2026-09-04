/**
 * Resident portal Pay All — aggregate financial invoice + payment link.
 * Settles each underlying payable once via invoice breakdown lines (SSOT: allocateInvoicePayment).
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { financialInvoices, paymentLinks } from '@/src/db/schema';
import type { InvoiceBreakdown } from '@/src/db/schema/financialInvoices';
import { nextFinancialInvoiceNumber } from '@/src/lib/billing/invoiceNumbering.server';
import { createInvoiceShareToken } from '@/src/lib/billing/invoiceShareToken';
import {
  RESIDENT_PORTAL_PAY_ALL_SOURCE,
  type ResidentPayableNowRow,
  type ResidentPayableTarget,
} from '@/src/lib/residents/residentPayableNowProjection';
import { ROOM_CHANGE_INVOICE_SOURCE } from '@/src/services/roomShiftQuote';
import { createPaymentLinkForInvoice } from '@/src/services/unifiedInvoices';

function targetSourceTable(target: ResidentPayableTarget): string | null {
  switch (target.kind) {
    case 'rent':
      return 'rent_invoices';
    case 'electricity':
      return 'electricity_invoices';
    case 'financial':
      return 'financial_invoices';
    case 'deposit':
      return 'bookings';
  }
}

function breakdownLineFromPayable(row: ResidentPayableNowRow) {
  const target = row.target;
  return {
    kind: target.kind,
    label: row.label,
    amountPaise: row.amountPaise,
    sourceTable: targetSourceTable(target),
    sourceId:
      target.kind === 'deposit' ? target.bookingId : target.invoiceId,
  };
}

function breakdownFromPayables(payables: ResidentPayableNowRow[]): InvoiceBreakdown {
  const lines = payables.map(breakdownLineFromPayable);
  let rentPaise = 0;
  let electricityPaise = 0;
  let depositPaise = 0;
  let otherPaise = 0;
  for (const line of lines) {
    if (line.kind === 'rent') rentPaise += line.amountPaise;
    else if (line.kind === 'electricity') electricityPaise += line.amountPaise;
    else if (line.kind === 'deposit') depositPaise += line.amountPaise;
    else otherPaise += line.amountPaise;
  }
  return { rentPaise, electricityPaise, depositPaise, otherPaise, lines };
}

async function loadRoomChangePayAllHref(
  customerId: string,
  expectedTotalPaise: number,
): Promise<string | null> {
  const [row] = await db
    .select({
      amountPaise: financialInvoices.amountPaise,
      paymentLinkId: financialInvoices.paymentLinkId,
      shareToken: financialInvoices.shareToken,
      status: financialInvoices.status,
    })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.customerId, customerId),
        eq(financialInvoices.sourceTable, ROOM_CHANGE_INVOICE_SOURCE.payAll),
        inArray(financialInvoices.status, ['draft', 'sent', 'overdue', 'partial']),
      ),
    )
    .limit(1);
  if (!row || row.amountPaise !== expectedTotalPaise) return null;
  if (row.paymentLinkId) return `/pay/${row.paymentLinkId}`;
  if (row.shareToken) return `/i/${row.shareToken}`;
  return null;
}

function payablesAreRoomChangeFinancialChildrenOnly(payables: ResidentPayableNowRow[]): boolean {
  return (
    payables.length > 0 &&
    payables.every(
      (p) =>
        p.target.kind === 'financial' &&
        p.key.startsWith('fi-') &&
        (p.label.includes('Change Bed') || p.label.includes('Room change')),
    )
  );
}

export async function ensureResidentPayAllPaymentHref(input: {
  customerId: string;
  bookingId: string;
  pgId: string;
  pgName: string;
  roomNumber: string | null;
  bedCode: string | null;
  payables: ResidentPayableNowRow[];
}): Promise<string | null> {
  if (input.payables.length === 0) return null;

  const totalPaise = input.payables.reduce((s, p) => s + p.amountPaise, 0);
  if (totalPaise <= 0) return null;

  if (payablesAreRoomChangeFinancialChildrenOnly(input.payables)) {
    const roomChangeHref = await loadRoomChangePayAllHref(input.customerId, totalPaise);
    if (roomChangeHref) return roomChangeHref;
  }

  const breakdown = breakdownFromPayables(input.payables);
  const [existing] = await db
    .select({
      id: financialInvoices.id,
      status: financialInvoices.status,
      amountPaise: financialInvoices.amountPaise,
      paymentLinkId: financialInvoices.paymentLinkId,
      paymentProofUrl: paymentLinks.paymentProofUrl,
      paymentProofTransactionRef: paymentLinks.paymentProofTransactionRef,
    })
    .from(financialInvoices)
    .leftJoin(paymentLinks, eq(paymentLinks.id, financialInvoices.paymentLinkId))
    .where(
      and(
        eq(financialInvoices.customerId, input.customerId),
        eq(financialInvoices.sourceTable, RESIDENT_PORTAL_PAY_ALL_SOURCE),
        eq(financialInvoices.sourceId, input.customerId),
        inArray(financialInvoices.status, ['draft', 'sent', 'overdue', 'partial', 'payment_in_progress']),
      ),
    )
    .limit(1);

  let invoiceId = existing?.id ?? null;
  const proofPending = Boolean(
    existing?.paymentProofTransactionRef?.trim() || existing?.paymentProofUrl?.trim(),
  );

  if (invoiceId && !proofPending) {
    await db
      .update(financialInvoices)
      .set({
        amountPaise: totalPaise,
        breakdown,
        bookingId: input.bookingId,
        pgId: input.pgId,
        roomNumber: input.roomNumber,
        bedCode: input.bedCode,
        notes: 'All bills due',
        updatedAt: new Date(),
      })
      .where(eq(financialInvoices.id, invoiceId));
    if (existing?.paymentLinkId) {
      await db
        .update(paymentLinks)
        .set({ amount: totalPaise })
        .where(eq(paymentLinks.id, existing.paymentLinkId));
    }
  } else if (!invoiceId) {
    const invoiceNumber = await nextFinancialInvoiceNumber({ pgId: input.pgId });
    const [created] = await db
      .insert(financialInvoices)
      .values({
        invoiceNumber,
        invoiceType: 'combined',
        sourceTable: RESIDENT_PORTAL_PAY_ALL_SOURCE,
        sourceId: input.customerId,
        customerId: input.customerId,
        bookingId: input.bookingId,
        pgId: input.pgId,
        roomNumber: input.roomNumber,
        bedCode: input.bedCode,
        amountPaise: totalPaise,
        breakdown,
        status: 'sent',
        dueDate: new Date().toISOString().slice(0, 10),
        sentAt: new Date(),
        notes: 'All bills due',
        shareToken: createInvoiceShareToken(),
      })
      .returning({ id: financialInvoices.id });
    invoiceId = created.id;
    await createPaymentLinkForInvoice(invoiceId).catch(() => undefined);
  }

  if (!invoiceId) return null;

  const [inv] = await db
    .select({
      paymentLinkId: financialInvoices.paymentLinkId,
      shareToken: financialInvoices.shareToken,
    })
    .from(financialInvoices)
    .where(eq(financialInvoices.id, invoiceId))
    .limit(1);

  if (inv?.paymentLinkId) return `/pay/${inv.paymentLinkId}`;
  if (inv?.shareToken) return `/i/${inv.shareToken}`;
  const linkRes = await createPaymentLinkForInvoice(invoiceId);
  if (linkRes.ok) {
    const linkId =
      'linkId' in linkRes && linkRes.linkId
        ? linkRes.linkId
        : linkRes.publicUrl.split('/').pop();
    return linkId ? `/pay/${linkId}` : linkRes.publicUrl;
  }
  return null;
}

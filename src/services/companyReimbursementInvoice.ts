/**
 * Company reimbursement invoices — printable documents with zero accounting impact.
 * Do not create payment links, ledger rows, or SSOT outstanding obligations.
 */

import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  customers,
  financialInvoices,
  floors,
  pgs,
  rooms,
} from '@/src/db/schema';
import type { InvoiceBreakdown } from '@/src/db/schema/financialInvoices';
import { createInvoiceShareToken } from '@/src/lib/billing/invoiceShareToken';
import { nextFinancialInvoiceNumber } from '@/src/lib/billing/invoiceNumbering.server';
import {
  DOCUMENT_ONLY_INVOICE_FOOTER,
  DOCUMENT_ONLY_PAYMENT_STATUS,
  displayRatePerDayPaise,
  hotelAccommodationLineLabel,
} from '@/src/lib/billing/companyReimbursementCopy';
import { formatDate } from '@/src/lib/dates';
import { formatDate as formatDisplayDate } from '@/src/lib/format';

export {
  DOCUMENT_ONLY_INVOICE_FOOTER,
  DOCUMENT_ONLY_PAYMENT_STATUS,
  COMPANY_REIMBURSEMENT_FOOTER,
  displayRatePerDayPaise,
  hotelAccommodationLineLabel,
} from '@/src/lib/billing/companyReimbursementCopy';

export type CreateCompanyReimbursementInvoiceInput = {
  bookingCode: string;
  /** Inclusive stay start (YYYY-MM-DD). */
  stayStart: string;
  /** Inclusive stay end (YYYY-MM-DD). */
  stayEnd: string;
  durationDays: number;
  totalPaise: number;
  /** Optional phone digits check against the booking resident. */
  expectedPhoneDigits?: string;
  /** Optional resident name substring check. */
  expectedNameIncludes?: string;
  actorId?: string;
};

export type CreateCompanyReimbursementInvoiceResult =
  | {
      ok: true;
      invoiceId: string;
      invoiceNumber: string;
      shareToken: string;
      amountPaise: number;
      ratePerDayPaise: number;
    }
  | { ok: false; error: string };

function stayPeriodLabel(stayStart: string, stayEnd: string): string {
  return `${formatDisplayDate(stayStart)} – ${formatDisplayDate(stayEnd)}`;
}

export async function createCompanyReimbursementInvoice(
  input: CreateCompanyReimbursementInvoiceInput,
): Promise<CreateCompanyReimbursementInvoiceResult> {
  if (input.totalPaise <= 0) {
    return { ok: false, error: 'Total amount must be greater than zero.' };
  }
  if (input.durationDays <= 0) {
    return { ok: false, error: 'Duration must be at least 1 day.' };
  }
  if (!input.stayStart || !input.stayEnd) {
    return { ok: false, error: 'Stay period is required.' };
  }

  const [ctx] = await db
    .select({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      pgId: pgs.id,
      bedId: beds.id,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(
      bedReservations,
      and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')),
    )
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(eq(bookings.bookingCode, input.bookingCode.trim()))
    .limit(1);

  if (!ctx) {
    return { ok: false, error: `Booking ${input.bookingCode} not found.` };
  }

  if (input.expectedNameIncludes) {
    const needle = input.expectedNameIncludes.trim().toLowerCase();
    if (!ctx.customerName.toLowerCase().includes(needle)) {
      return {
        ok: false,
        error: `Resident name "${ctx.customerName}" does not match expected "${input.expectedNameIncludes}".`,
      };
    }
  }

  if (input.expectedPhoneDigits) {
    const expected = input.expectedPhoneDigits.replace(/\D/g, '');
    const actual = ctx.customerPhone.replace(/\D/g, '');
    if (!actual.endsWith(expected) && !actual.includes(expected)) {
      return {
        ok: false,
        error: `Resident phone "${ctx.customerPhone}" does not match expected digits.`,
      };
    }
  }

  const [existing] = await db
    .select({
      id: financialInvoices.id,
      invoiceNumber: financialInvoices.invoiceNumber,
      shareToken: financialInvoices.shareToken,
      amountPaise: financialInvoices.amountPaise,
      breakdown: financialInvoices.breakdown,
    })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.bookingId, ctx.bookingId),
        eq(financialInvoices.invoiceType, 'company_reimbursement'),
        eq(financialInvoices.isDocumentOnly, true),
      ),
    )
    .limit(1);

  if (existing) {
    const ratePerDayPaise =
      existing.breakdown?.documentOnly?.ratePerDayPaise ??
      displayRatePerDayPaise(existing.amountPaise, input.durationDays);
    return {
      ok: true,
      invoiceId: existing.id,
      invoiceNumber: existing.invoiceNumber,
      shareToken: existing.shareToken ?? '',
      amountPaise: existing.amountPaise,
      ratePerDayPaise,
    };
  }

  const ratePerDayPaise = displayRatePerDayPaise(input.totalPaise, input.durationDays);
  const period = stayPeriodLabel(input.stayStart, input.stayEnd);
  const paymentStatusLabel = DOCUMENT_ONLY_PAYMENT_STATUS;

  const breakdown: InvoiceBreakdown = {
    otherPaise: input.totalPaise,
    documentOnly: {
      stayStart: input.stayStart,
      stayEnd: input.stayEnd,
      durationDays: input.durationDays,
      ratePerDayPaise,
      paymentStatusLabel,
    },
    lines: [
      {
        kind: 'company_reimbursement',
        label: hotelAccommodationLineLabel(input.durationDays, ratePerDayPaise),
        period,
        amountPaise: input.totalPaise,
      },
    ],
  };

  const invoiceNumber = await nextFinancialInvoiceNumber({ pgId: ctx.pgId });
  const shareToken = createInvoiceShareToken();
  const notes = [
    `Accommodation with Breakfast, Lunch & Dinner · Stay ${period} (${input.durationDays} days).`,
    DOCUMENT_ONLY_INVOICE_FOOTER,
  ].join(' ');

  const [row] = await db
    .insert(financialInvoices)
    .values({
      invoiceNumber,
      invoiceType: 'company_reimbursement',
      customerId: ctx.customerId,
      bookingId: ctx.bookingId,
      pgId: ctx.pgId,
      bedId: ctx.bedId,
      roomNumber: ctx.roomNumber,
      bedCode: ctx.bedCode,
      amountPaise: input.totalPaise,
      breakdown,
      status: 'settled',
      dueDate: null,
      billingMonth: null,
      sentAt: new Date(),
      notes,
      shareToken,
      isDocumentOnly: true,
      excludeFromReports: true,
      revenueImpact: false,
      analyticsImpact: false,
    })
    .returning({ id: financialInvoices.id });

  const { invoiceAuditEvents } = await import('@/src/db/schema');
  await db.insert(invoiceAuditEvents).values({
    invoiceId: row.id,
    action: 'company_reimbursement_created',
    actorType: input.actorId ? 'admin' : 'system',
    actorId: input.actorId ?? null,
    diff: {
      bookingCode: ctx.bookingCode,
      stayStart: input.stayStart,
      stayEnd: input.stayEnd,
      durationDays: input.durationDays,
      totalPaise: input.totalPaise,
      ratePerDayPaise,
      accountingImpact: 'none',
      issuedAt: formatDate(new Date()),
    },
  });

  return {
    ok: true,
    invoiceId: row.id,
    invoiceNumber,
    shareToken,
    amountPaise: input.totalPaise,
    ratePerDayPaise,
  };
}

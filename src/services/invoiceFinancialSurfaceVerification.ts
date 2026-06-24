/**
 * P0 — verify identical financial numbers across admin/resident invoice surfaces.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { bookings, financialInvoices, rentInvoices } from '@/src/db/schema';
import { getInvoiceDocumentDetail } from '@/src/lib/billing/invoiceDocumentModel';
import { formatDate as formatIsoDate } from '@/src/lib/dates';
import { allocateBookingCheckoutPayment } from '@/src/lib/billing/bookingPaymentAllocation';
import { loadDepositPageData } from '@/src/lib/deposits/loadDepositPageData';
import { loadBookingPaymentFinancialStory } from '@/src/services/bookingPaymentFinancialProjection';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { loadResidentAccountContext } from '@/src/services/residentAccountContext';
import { repairRentInvoiceDueDatesBeforeIssue } from '@/src/services/rentInvoices';

export type InvoiceSurfaceReport = {
  bookingCode: string;
  bookingId: string;
  financialInvoiceId: string | null;
  rentInvoiceId: string | null;
  depositHeldPaise: number;
  depositSurfaces: {
    ledger: number;
    depositPage: number;
    invoiceStory: number | null;
    residentWallet: number | null;
  };
  depositSurfacesMatch: boolean;
  bookingPaymentSummary: {
    totalPaymentPaise: number;
    rentPaise: number;
    depositCashPaise: number;
    priorOutstandingPaise: number;
    depositTransferCreditPaise: number;
    currentDepositHeldPaise: number;
    allocationLineCount: number;
  } | null;
  allocationMatchesCheckout: boolean;
  invoiceDueDateValid: boolean;
  invoiceShowsBookingPaymentSummary: boolean;
  duplicateRentInvoices: number;
  duplicateFinancialInvoices: number;
  overallPass: boolean;
};

async function countDuplicateRentInvoices(bookingId: string): Promise<number> {
  const rows = await db
    .select({ billingMonth: rentInvoices.billingMonth })
    .from(rentInvoices)
    .where(and(eq(rentInvoices.bookingId, bookingId), eq(rentInvoices.isAdhoc, false)));
  const seen = new Set<string>();
  let dupes = 0;
  for (const row of rows) {
    const key = String(row.billingMonth);
    if (seen.has(key)) dupes += 1;
    seen.add(key);
  }
  return dupes;
}

async function countDuplicateFinancialRentInvoices(bookingId: string): Promise<number> {
  const rows = await db
    .select({ sourceId: financialInvoices.sourceId })
    .from(financialInvoices)
    .where(
      and(
        eq(financialInvoices.bookingId, bookingId),
        eq(financialInvoices.sourceTable, 'rent_invoices'),
      ),
    );
  const seen = new Set<string>();
  let dupes = 0;
  for (const row of rows) {
    const key = row.sourceId ?? '';
    if (!key) continue;
    if (seen.has(key)) dupes += 1;
    seen.add(key);
  }
  return dupes;
}

export async function verifyInvoiceFinancialSurfaces(
  bookingCode: string,
): Promise<InvoiceSurfaceReport | null> {
  const [booking] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      subtotalPaise: bookings.subtotalPaise,
      discountPaise: bookings.discountPaise,
      depositPaise: bookings.depositPaise,
      totalPaise: bookings.totalPaise,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.bookingCode, bookingCode))
    .limit(1);
  if (!booking) return null;

  const ledgerSummary = await getDepositSummaryForBooking(booking.id);
  const depositPage = await loadDepositPageData(booking.id);
  const residentCtx = await loadResidentAccountContext(booking.customerId);
  const residentHeld = residentCtx?.depositHeldPaise ?? null;

  const [paidRent] = await db
    .select({
      id: rentInvoices.id,
      paymentId: rentInvoices.paymentId,
    })
    .from(rentInvoices)
    .where(and(eq(rentInvoices.bookingId, booking.id), eq(rentInvoices.status, 'paid')))
    .limit(1);

  const [finInv] = paidRent
    ? await db
        .select({
          id: financialInvoices.id,
          dueDate: financialInvoices.dueDate,
          createdAt: financialInvoices.createdAt,
        })
        .from(financialInvoices)
        .where(
          and(
            eq(financialInvoices.sourceTable, 'rent_invoices'),
            eq(financialInvoices.sourceId, paidRent.id),
          ),
        )
        .limit(1)
    : [null];

  const financialInvoiceId = finInv?.id ?? null;
  const invoiceDoc = financialInvoiceId
    ? await getInvoiceDocumentDetail(financialInvoiceId)
    : null;

  const story = await loadBookingPaymentFinancialStory({
    bookingId: booking.id,
    paymentId: paidRent?.paymentId ?? null,
  });

  const ledgerHeld = ledgerSummary?.refundableBalancePaise ?? 0;
  const pageHeld = depositPage.refundablePaise;
  const storyHeld = story?.currentDepositHeldPaise ?? null;

  const heldValues = [ledgerHeld, pageHeld, storyHeld, residentHeld].filter(
    (v): v is number => v != null,
  );
  const depositSurfacesMatch =
    heldValues.length > 0 && heldValues.every((v) => v === heldValues[0]);

  let allocationMatchesCheckout = false;
  let bookingPaymentSummary: InvoiceSurfaceReport['bookingPaymentSummary'] = null;

  if (story) {
    const expected = allocateBookingCheckoutPayment(
      {
        subtotalPaise: booking.subtotalPaise,
        discountPaise: booking.discountPaise,
        depositPaise: booking.depositPaise,
        totalPaise: booking.totalPaise,
        pricingSnapshot: booking.pricingSnapshot,
      },
      story.totalPaymentPaise,
    );
    bookingPaymentSummary = {
      totalPaymentPaise: story.totalPaymentPaise,
      rentPaise: expected.rentPaise,
      depositCashPaise: expected.depositCashPaise,
      priorOutstandingPaise: expected.priorOutstandingPaise,
      depositTransferCreditPaise: expected.depositTransferCreditPaise,
      currentDepositHeldPaise: story.currentDepositHeldPaise,
      allocationLineCount: story.allocationLines.length,
    };
    allocationMatchesCheckout =
      story.allocationLines.find((l) => l.key === 'rent')?.amountPaise === expected.rentPaise &&
      story.allocationLines.find((l) => l.key === 'deposit_collected')?.amountPaise ===
        expected.depositCashPaise &&
      (expected.priorOutstandingPaise === 0 ||
        story.allocationLines.find((l) => l.key === 'prior_outstanding')?.amountPaise ===
          expected.priorOutstandingPaise) &&
      (expected.depositTransferCreditPaise === 0 ||
        story.allocationLines.find((l) => l.key === 'deposit_transfer')?.amountPaise ===
          expected.depositTransferCreditPaise);
  }

  const invoiceDueDateValid =
    !finInv?.dueDate ||
    !finInv.createdAt ||
    finInv.dueDate >= formatIsoDate(finInv.createdAt);

  const invoiceShowsBookingPaymentSummary = Boolean(invoiceDoc?.bookingPaymentSummary);

  const duplicateRentInvoices = await countDuplicateRentInvoices(booking.id);
  const duplicateFinancialInvoices = await countDuplicateFinancialRentInvoices(booking.id);

  const overallPass =
    depositSurfacesMatch &&
    allocationMatchesCheckout &&
    invoiceDueDateValid &&
    invoiceShowsBookingPaymentSummary &&
    duplicateRentInvoices === 0 &&
    duplicateFinancialInvoices === 0;

  return {
    bookingCode,
    bookingId: booking.id,
    financialInvoiceId,
    rentInvoiceId: paidRent?.id ?? null,
    depositHeldPaise: ledgerHeld,
    depositSurfaces: {
      ledger: ledgerHeld,
      depositPage: pageHeld,
      invoiceStory: storyHeld,
      residentWallet: residentHeld,
    },
    depositSurfacesMatch,
    bookingPaymentSummary,
    allocationMatchesCheckout,
    invoiceDueDateValid,
    invoiceShowsBookingPaymentSummary,
    duplicateRentInvoices,
    duplicateFinancialInvoices,
    overallPass,
  };
}

export async function runInvoiceFinancialSurfaceVerification(input: {
  bookingCodes: string[];
  executeDueDateRepair?: boolean;
}): Promise<{
  dueDateRepair: { repairedRentInvoiceIds: string[] } | null;
  surfaces: InvoiceSurfaceReport[];
  overallPass: boolean;
}> {
  let dueDateRepair: { repairedRentInvoiceIds: string[] } | null = null;
  if (input.executeDueDateRepair) {
    dueDateRepair = await repairRentInvoiceDueDatesBeforeIssue();
  }

  const surfaces: InvoiceSurfaceReport[] = [];
  for (const code of input.bookingCodes) {
    const row = await verifyInvoiceFinancialSurfaces(code);
    if (row) surfaces.push(row);
  }

  return {
    dueDateRepair,
    surfaces,
    overallPass: surfaces.length > 0 && surfaces.every((s) => s.overallPass),
  };
}

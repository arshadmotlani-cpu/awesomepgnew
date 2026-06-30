/**
 * Invoice Command Center — date-driven daily financial summary + timeline.
 * Aggregates from ledger, payments, and financial_invoices (no duplicate math in UI).
 */

import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bookings,
  checkoutSettlements,
  customers,
  depositLedger,
  electricityInvoices,
  financialInvoices,
  payments,
  pgPaymentRecords,
  rentInvoices,
} from '@/src/db/schema';
import { resolveSelectedDay } from '@/src/lib/billing/dayNavigation';
import { invoiceDetailHref } from '@/src/lib/billing/invoiceRoutes';
import { allocateBookingCheckoutPayment } from '@/src/lib/billing/bookingPaymentAllocation';
import { asPlainNumber } from '@/src/lib/format';
import { hasDatabaseUrl } from '@/src/lib/db/env';
import { getDailyCollectionTotals } from '@/src/db/queries/admin';
import { DEPOSIT_CREDIT_REASON } from '@/src/services/depositCredit';

const PRIOR_DEPOSIT_SETTLED_REASON = 'Prior stay balance collected with new booking checkout';

export type InvoiceDailySummary = {
  selectedDate: string;
  rentCollectedPaise: number;
  electricityCollectedPaise: number;
  depositsCollectedPaise: number;
  depositCashCollectedPaise: number;
  depositTransfersPaise: number;
  priorDepositSettledPaise: number;
  /** Booking rent not yet on a paid rent invoice — ops alert only, not revenue. */
  bookingPaymentsUninvoicedPaise: number;
  checkoutDeductionsPaise: number;
  refundsPaidPaise: number;
  netRevenuePaise: number;
  invoicesGeneratedCount: number;
  invoicesPaidCount: number;
  invoicesPendingCount: number;
};

export type FinancialTimelineEventType =
  | 'booking_rent_collected'
  | 'booking_payment_uninvoiced'
  | 'deposit_collected'
  | 'deposit_transfer'
  | 'prior_deposit_settled'
  | 'rent_paid'
  | 'electricity_paid'
  | 'checkout_deduction'
  | 'refund_paid'
  | 'invoice_generated'
  | 'invoice_paid'
  | 'manual_adjustment'
  | 'notice_deduction';

export type FinancialTimelineEvent = {
  id: string;
  occurredAt: string;
  eventType: FinancialTimelineEventType;
  label: string;
  amountPaise: number;
  customerId: string;
  customerName: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  residentHref: string;
  invoiceHref: string | null;
};

export type InvoiceCommandCenterData = {
  selectedDate: string;
  summary: InvoiceDailySummary;
  timeline: FinancialTimelineEvent[];
  invoicesForDay: Array<{
    id: string;
    invoiceNumber: string;
    invoiceType: string;
    customerName: string;
    amountPaise: number;
    status: string;
    createdAt: string;
    paidAt: string | null;
    isPipelineTest: boolean;
  }>;
};

const OPEN_INVOICE_STATUSES = [
  'draft',
  'sent',
  'overdue',
  'partial',
  'payment_in_progress',
  'processing',
] as const;

/** Pipeline-test electricity rows stay visible in lists but never affect daily totals. */
function excludePipelineTestFinancialInvoices() {
  return sql`NOT (
    ${financialInvoices.sourceTable} = 'electricity_invoices'
    AND EXISTS (
      SELECT 1 FROM electricity_invoices ei
      WHERE ei.id = ${financialInvoices.sourceId}
        AND ei.is_pipeline_test = true
    )
  )`;
}

/** Pure net inflow for a calendar day — invoice-first (no gross booking payment bucket). */
export function computeInvoiceDailyNetRevenue(input: {
  rentCollectedPaise: number;
  electricityCollectedPaise?: number;
  depositsCollectedPaise: number;
  refundsPaidPaise: number;
}): number {
  return (
    input.rentCollectedPaise +
    (input.electricityCollectedPaise ?? 0) +
    input.depositsCollectedPaise -
    input.refundsPaidPaise
  );
}

function residentAdminHref(customerId: string): string {
  return `/admin/residents/${customerId}`;
}

export async function getInvoiceDailySummary(dateInput?: string): Promise<InvoiceDailySummary> {
  const selectedDate = resolveSelectedDay(dateInput);
  const zero: InvoiceDailySummary = {
    selectedDate,
    rentCollectedPaise: 0,
    electricityCollectedPaise: 0,
    depositsCollectedPaise: 0,
    depositCashCollectedPaise: 0,
    depositTransfersPaise: 0,
    priorDepositSettledPaise: 0,
    bookingPaymentsUninvoicedPaise: 0,
    checkoutDeductionsPaise: 0,
    refundsPaidPaise: 0,
    netRevenuePaise: 0,
    invoicesGeneratedCount: 0,
    invoicesPaidCount: 0,
    invoicesPendingCount: 0,
  };

  if (!hasDatabaseUrl()) return zero;

  const collections = await getDailyCollectionTotals(selectedDate);
  const productionCustomerFilter = and(
    eq(customers.isTest, false),
    or(isNull(financialInvoices.bookingId), eq(bookings.isTest, false)),
  );

  const [
    uninvoicedBookingRow,
    depositCashRow,
    depositTransferRow,
    priorSettledRow,
    checkoutDeductionRow,
    refundRow,
    invoiceGeneratedRow,
    invoicePaidRow,
    invoicePendingRow,
  ] = await Promise.all([
    db
      .select({
        paymentId: payments.id,
        amountPaise: payments.amountPaise,
        subtotalPaise: bookings.subtotalPaise,
        discountPaise: bookings.discountPaise,
        depositPaise: bookings.depositPaise,
        totalPaise: bookings.totalPaise,
        pricingSnapshot: bookings.pricingSnapshot,
      })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .where(
        and(
          eq(payments.status, 'succeeded'),
          eq(payments.purpose, 'booking'),
          sql`${payments.paidAt}::date = ${selectedDate}::date`,
          eq(bookings.isTest, false),
          eq(customers.isTest, false),
          sql`NOT EXISTS (
            SELECT 1 FROM rent_invoices ri
            WHERE ri.booking_id = ${bookings.id}
              AND ri.payment_id = ${payments.id}
              AND ri.status = 'paid'
          )`,
        ),
      ),
    db
      .select({
        total: sql<number>`coalesce(sum(${depositLedger.amountPaise}), 0)::bigint::int`,
      })
      .from(depositLedger)
      .innerJoin(bookings, eq(bookings.id, depositLedger.bookingId))
      .innerJoin(customers, eq(customers.id, depositLedger.customerId))
      .where(
        and(
          eq(depositLedger.entryKind, 'collected'),
          sql`${depositLedger.reason} LIKE 'deposit captured with payment%'`,
          sql`${depositLedger.createdAt}::date = ${selectedDate}::date`,
          eq(bookings.isTest, false),
          eq(customers.isTest, false),
        ),
      ),
    db
      .select({
        total: sql<number>`coalesce(sum(${depositLedger.amountPaise}), 0)::bigint::int`,
      })
      .from(depositLedger)
      .innerJoin(bookings, eq(bookings.id, depositLedger.bookingId))
      .innerJoin(customers, eq(customers.id, depositLedger.customerId))
      .where(
        and(
          eq(depositLedger.entryKind, 'collected'),
          eq(depositLedger.reason, DEPOSIT_CREDIT_REASON),
          sql`${depositLedger.createdAt}::date = ${selectedDate}::date`,
          eq(bookings.isTest, false),
          eq(customers.isTest, false),
        ),
      ),
    db
      .select({
        total: sql<number>`coalesce(sum(${depositLedger.amountPaise}), 0)::bigint::int`,
      })
      .from(depositLedger)
      .innerJoin(bookings, eq(bookings.id, depositLedger.bookingId))
      .innerJoin(customers, eq(customers.id, depositLedger.customerId))
      .where(
        and(
          eq(depositLedger.entryKind, 'collected'),
          eq(depositLedger.reason, PRIOR_DEPOSIT_SETTLED_REASON),
          sql`${depositLedger.createdAt}::date = ${selectedDate}::date`,
          eq(bookings.isTest, false),
          eq(customers.isTest, false),
        ),
      ),
    db
      .select({
        total: sql<number>`coalesce(sum(abs(${depositLedger.amountPaise})), 0)::bigint::int`,
      })
      .from(depositLedger)
      .innerJoin(bookings, eq(bookings.id, depositLedger.bookingId))
      .innerJoin(customers, eq(customers.id, depositLedger.customerId))
      .where(
        and(
          eq(depositLedger.entryKind, 'deducted'),
          sql`${depositLedger.createdAt}::date = ${selectedDate}::date`,
          eq(bookings.isTest, false),
          eq(customers.isTest, false),
        ),
      ),
    db
      .select({
        total: sql<number>`coalesce(sum(abs(${depositLedger.amountPaise})), 0)::bigint::int`,
      })
      .from(depositLedger)
      .innerJoin(bookings, eq(bookings.id, depositLedger.bookingId))
      .innerJoin(customers, eq(customers.id, depositLedger.customerId))
      .where(
        and(
          eq(depositLedger.entryKind, 'refunded'),
          sql`${depositLedger.createdAt}::date = ${selectedDate}::date`,
          eq(bookings.isTest, false),
          eq(customers.isTest, false),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(financialInvoices)
      .innerJoin(customers, eq(customers.id, financialInvoices.customerId))
      .leftJoin(bookings, eq(bookings.id, financialInvoices.bookingId))
      .where(
        and(
          sql`${financialInvoices.createdAt}::date = ${selectedDate}::date`,
          productionCustomerFilter,
          excludePipelineTestFinancialInvoices(),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(financialInvoices)
      .innerJoin(customers, eq(customers.id, financialInvoices.customerId))
      .leftJoin(bookings, eq(bookings.id, financialInvoices.bookingId))
      .where(
        and(
          inArray(financialInvoices.status, ['paid', 'partial', 'settled']),
          sql`${financialInvoices.paidAt}::date = ${selectedDate}::date`,
          productionCustomerFilter,
          excludePipelineTestFinancialInvoices(),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(financialInvoices)
      .innerJoin(customers, eq(customers.id, financialInvoices.customerId))
      .leftJoin(bookings, eq(bookings.id, financialInvoices.bookingId))
      .where(
        and(
          sql`${financialInvoices.createdAt}::date = ${selectedDate}::date`,
          inArray(financialInvoices.status, [...OPEN_INVOICE_STATUSES]),
          productionCustomerFilter,
          excludePipelineTestFinancialInvoices(),
        ),
      ),
  ]);

  const rentCollectedPaise = collections.ok ? collections.data.rentPaise : 0;
  const electricityCollectedPaise = collections.ok ? collections.data.electricityPaise : 0;
  const depositsCollectedPaise = collections.ok ? collections.data.depositPaise : 0;
  const depositCashCollectedPaise = asPlainNumber(depositCashRow[0]?.total);
  const depositTransfersPaise = asPlainNumber(depositTransferRow[0]?.total);
  const priorDepositSettledPaise = asPlainNumber(priorSettledRow[0]?.total);
  const bookingPaymentsUninvoicedPaise = uninvoicedBookingRow.reduce((sum, row) => {
    const allocation = allocateBookingCheckoutPayment(
      {
        subtotalPaise: row.subtotalPaise,
        discountPaise: row.discountPaise,
        depositPaise: row.depositPaise,
        totalPaise: row.totalPaise,
        pricingSnapshot: row.pricingSnapshot,
      },
      row.amountPaise,
    );
    return sum + allocation.rentPaise;
  }, 0);
  const checkoutDeductionsPaise = asPlainNumber(checkoutDeductionRow[0]?.total);
  const refundsPaidPaise = asPlainNumber(refundRow[0]?.total);

  return {
    selectedDate,
    rentCollectedPaise,
    electricityCollectedPaise,
    depositsCollectedPaise,
    depositCashCollectedPaise,
    depositTransfersPaise,
    priorDepositSettledPaise,
    bookingPaymentsUninvoicedPaise,
    checkoutDeductionsPaise,
    refundsPaidPaise,
    netRevenuePaise: computeInvoiceDailyNetRevenue({
      rentCollectedPaise,
      electricityCollectedPaise,
      depositsCollectedPaise,
      refundsPaidPaise,
    }),
    invoicesGeneratedCount: invoiceGeneratedRow[0]?.count ?? 0,
    invoicesPaidCount: invoicePaidRow[0]?.count ?? 0,
    invoicesPendingCount: invoicePendingRow[0]?.count ?? 0,
  };
}

export async function getFinancialTimelineForDate(
  dateInput?: string,
  limit = 100,
): Promise<FinancialTimelineEvent[]> {
  const selectedDate = resolveSelectedDay(dateInput);
  if (!hasDatabaseUrl()) return [];

  const productionCustomerFilter = and(
    eq(customers.isTest, false),
    or(isNull(financialInvoices.bookingId), eq(bookings.isTest, false)),
  );
  const events: FinancialTimelineEvent[] = [];

  const [
    bookingPayments,
    depositEntries,
    paidInvoices,
    generatedInvoices,
    approvedSettlements,
    approvedQrRecords,
  ] = await Promise.all([
    db
      .select({
        id: payments.id,
        paidAt: payments.paidAt,
        amountPaise: payments.amountPaise,
        purpose: payments.purpose,
        customerId: bookings.customerId,
        customerName: customers.fullName,
        bookingCode: bookings.bookingCode,
        subtotalPaise: bookings.subtotalPaise,
        discountPaise: bookings.discountPaise,
        depositPaise: bookings.depositPaise,
        totalPaise: bookings.totalPaise,
        pricingSnapshot: bookings.pricingSnapshot,
        rentInvoiceId: rentInvoices.id,
        financialInvoiceId: financialInvoices.id,
        invoiceNumber: financialInvoices.invoiceNumber,
      })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .innerJoin(customers, eq(customers.id, bookings.customerId))
      .leftJoin(
        rentInvoices,
        and(
          eq(rentInvoices.paymentId, payments.id),
          eq(rentInvoices.status, 'paid'),
        ),
      )
      .leftJoin(
        financialInvoices,
        and(
          eq(financialInvoices.sourceTable, 'rent_invoices'),
          eq(financialInvoices.sourceId, rentInvoices.id),
        ),
      )
      .where(
        and(
          eq(payments.status, 'succeeded'),
          inArray(payments.purpose, ['booking', 'bed_reserve']),
          sql`${payments.paidAt}::date = ${selectedDate}::date`,
          eq(bookings.isTest, false),
          eq(customers.isTest, false),
        ),
      )
      .orderBy(desc(payments.paidAt)),
    db
      .select({
        id: depositLedger.id,
        createdAt: depositLedger.createdAt,
        amountPaise: depositLedger.amountPaise,
        entryKind: depositLedger.entryKind,
        reason: depositLedger.reason,
        customerId: depositLedger.customerId,
        customerName: customers.fullName,
      })
      .from(depositLedger)
      .innerJoin(bookings, eq(bookings.id, depositLedger.bookingId))
      .innerJoin(customers, eq(customers.id, depositLedger.customerId))
      .where(
        and(
          sql`${depositLedger.createdAt}::date = ${selectedDate}::date`,
          eq(bookings.isTest, false),
          eq(customers.isTest, false),
        ),
      )
      .orderBy(desc(depositLedger.createdAt)),
    db
      .select({
        id: financialInvoices.id,
        invoiceNumber: financialInvoices.invoiceNumber,
        invoiceType: financialInvoices.invoiceType,
        paidAt: financialInvoices.paidAt,
        amountPaise: financialInvoices.amountPaise,
        customerId: financialInvoices.customerId,
        customerName: customers.fullName,
      })
      .from(financialInvoices)
      .innerJoin(customers, eq(customers.id, financialInvoices.customerId))
      .leftJoin(bookings, eq(bookings.id, financialInvoices.bookingId))
      .where(
        and(
          inArray(financialInvoices.status, ['paid', 'partial', 'settled']),
          sql`${financialInvoices.paidAt}::date = ${selectedDate}::date`,
          productionCustomerFilter,
        ),
      )
      .orderBy(desc(financialInvoices.paidAt)),
    db
      .select({
        id: financialInvoices.id,
        invoiceNumber: financialInvoices.invoiceNumber,
        invoiceType: financialInvoices.invoiceType,
        createdAt: financialInvoices.createdAt,
        amountPaise: financialInvoices.amountPaise,
        customerId: financialInvoices.customerId,
        customerName: customers.fullName,
      })
      .from(financialInvoices)
      .innerJoin(customers, eq(customers.id, financialInvoices.customerId))
      .leftJoin(bookings, eq(bookings.id, financialInvoices.bookingId))
      .where(
        and(
          sql`${financialInvoices.createdAt}::date = ${selectedDate}::date`,
          productionCustomerFilter,
          excludePipelineTestFinancialInvoices(),
        ),
      )
      .orderBy(desc(financialInvoices.createdAt)),
    db
      .select({
        id: checkoutSettlements.id,
        approvedAt: checkoutSettlements.approvedAt,
        noticeDeductionPaise: checkoutSettlements.noticeDeductionPaise,
        customerId: checkoutSettlements.customerId,
        customerName: customers.fullName,
      })
      .from(checkoutSettlements)
      .innerJoin(customers, eq(customers.id, checkoutSettlements.customerId))
      .where(
        and(
          sql`${checkoutSettlements.approvedAt}::date = ${selectedDate}::date`,
          eq(customers.isTest, false),
        ),
      )
      .orderBy(desc(checkoutSettlements.approvedAt)),
    db
      .select({
        id: pgPaymentRecords.id,
        reviewedAt: pgPaymentRecords.reviewedAt,
        amountPaise: pgPaymentRecords.amountPaise,
        customerId: pgPaymentRecords.customerId,
        customerName: customers.fullName,
      })
      .from(pgPaymentRecords)
      .innerJoin(customers, eq(customers.id, pgPaymentRecords.customerId))
      .where(
        and(
          eq(pgPaymentRecords.status, 'approved'),
          sql`${pgPaymentRecords.reviewedAt}::date = ${selectedDate}::date`,
          eq(customers.isTest, false),
        ),
      )
      .orderBy(desc(pgPaymentRecords.reviewedAt)),
  ]);

  for (const row of bookingPayments) {
    if (!row.paidAt) continue;
    if (row.purpose === 'booking') {
      const allocation = allocateBookingCheckoutPayment(
        {
          subtotalPaise: row.subtotalPaise,
          discountPaise: row.discountPaise,
          depositPaise: row.depositPaise,
          totalPaise: row.totalPaise,
          pricingSnapshot: row.pricingSnapshot,
        },
        row.amountPaise,
      );
      if (row.rentInvoiceId && allocation.rentPaise > 0) {
        events.push({
          id: `booking-rent-${row.id}`,
          occurredAt: row.paidAt.toISOString(),
          eventType: 'booking_rent_collected',
          label: `Booking rent · ${row.bookingCode}`,
          amountPaise: allocation.rentPaise,
          customerId: row.customerId,
          customerName: row.customerName,
          invoiceId: row.financialInvoiceId,
          invoiceNumber: row.invoiceNumber,
          residentHref: residentAdminHref(row.customerId),
          invoiceHref: row.financialInvoiceId
            ? invoiceDetailHref(row.financialInvoiceId, 'admin')
            : null,
        });
      } else if (allocation.rentPaise > 0) {
        events.push({
          id: `booking-uninvoiced-${row.id}`,
          occurredAt: row.paidAt.toISOString(),
          eventType: 'booking_payment_uninvoiced',
          label: `Booking rent pending invoice · ${row.bookingCode}`,
          amountPaise: allocation.rentPaise,
          customerId: row.customerId,
          customerName: row.customerName,
          invoiceId: null,
          invoiceNumber: null,
          residentHref: residentAdminHref(row.customerId),
          invoiceHref: null,
        });
      }
      continue;
    }
    events.push({
      id: `reserve-${row.id}`,
      occurredAt: row.paidAt.toISOString(),
      eventType: 'booking_payment_uninvoiced',
      label: 'Reservation payment approved',
      amountPaise: row.amountPaise,
      customerId: row.customerId,
      customerName: row.customerName,
      invoiceId: null,
      invoiceNumber: null,
      residentHref: residentAdminHref(row.customerId),
      invoiceHref: null,
    });
  }

  for (const row of depositEntries) {
    const absAmount = Math.abs(row.amountPaise);
    if (row.entryKind === 'collected') {
      if (row.reason === DEPOSIT_CREDIT_REASON) {
        events.push({
          id: `deposit-transfer-${row.id}`,
          occurredAt: row.createdAt.toISOString(),
          eventType: 'deposit_transfer',
          label: row.reason,
          amountPaise: absAmount,
          customerId: row.customerId,
          customerName: row.customerName,
          invoiceId: null,
          invoiceNumber: null,
          residentHref: residentAdminHref(row.customerId),
          invoiceHref: null,
        });
      } else if (row.reason === PRIOR_DEPOSIT_SETTLED_REASON) {
        events.push({
          id: `prior-deposit-${row.id}`,
          occurredAt: row.createdAt.toISOString(),
          eventType: 'prior_deposit_settled',
          label: row.reason,
          amountPaise: absAmount,
          customerId: row.customerId,
          customerName: row.customerName,
          invoiceId: null,
          invoiceNumber: null,
          residentHref: residentAdminHref(row.customerId),
          invoiceHref: null,
        });
      } else {
        events.push({
          id: `deposit-${row.id}`,
          occurredAt: row.createdAt.toISOString(),
          eventType: 'deposit_collected',
          label: row.reason || 'Deposit collected',
          amountPaise: absAmount,
          customerId: row.customerId,
          customerName: row.customerName,
          invoiceId: null,
          invoiceNumber: null,
          residentHref: residentAdminHref(row.customerId),
          invoiceHref: null,
        });
      }
    } else if (row.entryKind === 'deducted') {
      const isNotice = /notice/i.test(row.reason ?? '');
      events.push({
        id: `deduct-${row.id}`,
        occurredAt: row.createdAt.toISOString(),
        eventType: isNotice ? 'notice_deduction' : 'checkout_deduction',
        label: row.reason || 'Checkout deduction',
        amountPaise: absAmount,
        customerId: row.customerId,
        customerName: row.customerName,
        invoiceId: null,
        invoiceNumber: null,
        residentHref: residentAdminHref(row.customerId),
        invoiceHref: null,
      });
    } else if (row.entryKind === 'refunded') {
      events.push({
        id: `refund-${row.id}`,
        occurredAt: row.createdAt.toISOString(),
        eventType: 'refund_paid',
        label: row.reason || 'Deposit refund paid',
        amountPaise: absAmount,
        customerId: row.customerId,
        customerName: row.customerName,
        invoiceId: null,
        invoiceNumber: null,
        residentHref: residentAdminHref(row.customerId),
        invoiceHref: null,
      });
    }
  }

  for (const row of paidInvoices) {
    if (!row.paidAt) continue;
    const typeLabel = row.invoiceType === 'electricity' ? 'Electricity recovered' : 'Invoice paid';
    events.push({
      id: `inv-paid-${row.id}`,
      occurredAt: row.paidAt.toISOString(),
      eventType: row.invoiceType === 'electricity' ? 'electricity_paid' : 'invoice_paid',
      label: `${typeLabel} · ${row.invoiceNumber}`,
      amountPaise: row.amountPaise,
      customerId: row.customerId,
      customerName: row.customerName,
      invoiceId: row.id,
      invoiceNumber: row.invoiceNumber,
      residentHref: residentAdminHref(row.customerId),
      invoiceHref: invoiceDetailHref(row.id, 'admin'),
    });
  }

  for (const row of generatedInvoices) {
    const isManual = ['custom', 'damage', 'penalty'].includes(row.invoiceType);
    events.push({
      id: `inv-gen-${row.id}`,
      occurredAt: row.createdAt.toISOString(),
      eventType: isManual ? 'manual_adjustment' : 'invoice_generated',
      label: isManual
        ? `Manual charge · ${row.invoiceNumber}`
        : `Invoice generated · ${row.invoiceNumber}`,
      amountPaise: row.amountPaise,
      customerId: row.customerId,
      customerName: row.customerName,
      invoiceId: row.id,
      invoiceNumber: row.invoiceNumber,
      residentHref: residentAdminHref(row.customerId),
      invoiceHref: invoiceDetailHref(row.id, 'admin'),
    });
  }

  for (const row of approvedSettlements) {
    if (!row.approvedAt || row.noticeDeductionPaise <= 0) continue;
    events.push({
      id: `settlement-${row.id}`,
      occurredAt: row.approvedAt.toISOString(),
      eventType: 'notice_deduction',
      label: 'Checkout settlement approved (notice deduction)',
      amountPaise: row.noticeDeductionPaise,
      customerId: row.customerId,
      customerName: row.customerName,
      invoiceId: null,
      invoiceNumber: null,
      residentHref: residentAdminHref(row.customerId),
      invoiceHref: null,
    });
  }

  for (const row of approvedQrRecords) {
    if (!row.reviewedAt || !row.customerId) continue;
    events.push({
      id: `qr-${row.id}`,
      occurredAt: row.reviewedAt.toISOString(),
      eventType: 'booking_payment_uninvoiced',
      label: 'QR payment proof approved',
      amountPaise: row.amountPaise,
      customerId: row.customerId,
      customerName: row.customerName,
      invoiceId: null,
      invoiceNumber: null,
      residentHref: residentAdminHref(row.customerId),
      invoiceHref: null,
    });
  }

  events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return events.slice(0, limit);
}

export async function listInvoicesForSelectedDay(dateInput?: string) {
  const selectedDate = resolveSelectedDay(dateInput);
  if (!hasDatabaseUrl()) return [];

  const productionCustomerFilter = and(
    eq(customers.isTest, false),
    or(isNull(financialInvoices.bookingId), eq(bookings.isTest, false)),
  );
  const rows = await db
    .select({
      id: financialInvoices.id,
      invoiceNumber: financialInvoices.invoiceNumber,
      invoiceType: financialInvoices.invoiceType,
      customerName: customers.fullName,
      amountPaise: financialInvoices.amountPaise,
      status: financialInvoices.status,
      createdAt: financialInvoices.createdAt,
      paidAt: financialInvoices.paidAt,
      isPipelineTest: sql<boolean>`coalesce(${electricityInvoices.isPipelineTest}, false)`,
    })
    .from(financialInvoices)
    .innerJoin(customers, eq(customers.id, financialInvoices.customerId))
    .leftJoin(bookings, eq(bookings.id, financialInvoices.bookingId))
    .leftJoin(
      electricityInvoices,
      and(
        eq(financialInvoices.sourceTable, 'electricity_invoices'),
        eq(financialInvoices.sourceId, electricityInvoices.id),
      ),
    )
    .where(
      and(
        productionCustomerFilter,
        or(
          sql`${financialInvoices.createdAt}::date = ${selectedDate}::date`,
          sql`${financialInvoices.paidAt}::date = ${selectedDate}::date`,
        ),
      ),
    )
    .orderBy(desc(financialInvoices.createdAt))
    .limit(200);

  return rows.map((row) => ({
    id: row.id,
    invoiceNumber: row.invoiceNumber,
    invoiceType: row.invoiceType,
    customerName: row.customerName,
    amountPaise: row.amountPaise,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    paidAt: row.paidAt?.toISOString() ?? null,
    isPipelineTest: Boolean(row.isPipelineTest),
  }));
}

export async function getInvoiceCommandCenterData(
  dateInput?: string,
): Promise<InvoiceCommandCenterData> {
  const selectedDate = resolveSelectedDay(dateInput);
  const [summary, timeline, invoicesForDay] = await Promise.all([
    getInvoiceDailySummary(selectedDate),
    getFinancialTimelineForDate(selectedDate),
    listInvoicesForSelectedDay(selectedDate),
  ]);
  return { selectedDate, summary, timeline, invoicesForDay };
}

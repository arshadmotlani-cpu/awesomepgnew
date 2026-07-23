/**
 * Checkout rent accounting — discovery and repair for proration/credit gaps.
 *
 * Invariant after payment success (exactly one must hold):
 *   A) Full-month invoice + full-month principal applied
 *   B) Prorated invoice + surplus recorded as advance rent credit
 *
 * Option A repair is the SSOT for historical pre-anniversary-billing defects.
 */
import { eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { auditLog, bookings, payments, rentInvoices } from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { allocateBookingCheckoutPayment } from '@/src/lib/billing/bookingPaymentAllocation';
import {
  anniversaryBillingPeriod,
  rentInvoiceBillingPeriodNote,
} from '@/src/services/billing';
import {
  getBookingMoneyBalances,
  syncBookingRentReceivedPaise,
} from '@/src/services/bookingMoneyBalances';
import { sumAdvanceRentCreditFromSnapshot } from '@/src/lib/billing/checkoutRentProration';
import { getBillingProfileForBooking } from '@/src/services/residentBillingProfiles';
import { syncRentInvoiceToUnified } from '@/src/services/unifiedInvoices';

/** Commit 1b88acb — anniversary billing deploy (18:53 IST). */
export const ANNIVERSARY_BILLING_DEPLOY_UTC = '2026-07-04T13:23:00.000Z';

export type CheckoutRentProrationGapRow = {
  bookingId: string;
  bookingCode: string;
  resident: string;
  monthlyRentPaise: number;
  rentCollectedPaise: number;
  invoiceId: string;
  invoiceNumber: string;
  invoiceRentPaise: number;
  invoicePaidPaise: number;
  differencePaise: number;
  outstandingRentPaise: number;
  paymentId: string;
  paymentDate: string;
  anniversaryDeployed: boolean;
  invoiceNotes: string | null;
};

export type CheckoutRentAccountingAudit = {
  gap: CheckoutRentProrationGapRow | null;
  balances: Awaited<ReturnType<typeof getBookingMoneyBalances>>;
  closed: boolean;
};

export type CheckoutRentAccountingRepairResult = {
  bookingCode: string;
  bookingId: string;
  executed: boolean;
  skipped: boolean;
  skipReason?: string;
  invoiceId?: string;
  before?: {
    rentPaise: number;
    paidPrincipalPaise: number;
    notes: string | null;
    outstandingRentPaise: number;
  };
  after?: {
    rentPaise: number;
    paidPrincipalPaise: number;
    notes: string | null;
    outstandingRentPaise: number;
  };
};

export type CheckoutRentClosureInput = {
  rentPaisePaidFromPayment: number;
  invoicePaidPrincipalPaise: number;
  advanceRentCreditPaise: number;
};

export type CheckoutRentClosureResult = CheckoutRentClosureInput & {
  closed: boolean;
  unallocatedPaise: number;
};

/** Pure — whether checkout rent is fully allocated to invoice and/or advance credit. */
export function computeCheckoutRentClosure(
  input: CheckoutRentClosureInput,
): CheckoutRentClosureResult {
  const rentPaisePaidFromPayment = Math.max(0, input.rentPaisePaidFromPayment);
  const invoicePaidPrincipalPaise = Math.max(0, input.invoicePaidPrincipalPaise);
  const advanceRentCreditPaise = Math.max(0, input.advanceRentCreditPaise);
  const allocated = invoicePaidPrincipalPaise + advanceRentCreditPaise;
  const unallocatedPaise = Math.max(0, rentPaisePaidFromPayment - allocated);
  return {
    rentPaisePaidFromPayment,
    invoicePaidPrincipalPaise,
    advanceRentCreditPaise,
    closed: unallocatedPaise === 0,
    unallocatedPaise,
  };
}

/** Pure — detect Option-A repair target when checkout collected full month but invoice is short. */
export function computeOptionARepairTarget(input: {
  monthlyRentPaise: number;
  rentCollectedPaise: number;
  invoiceRentPaise: number;
  invoicePaidPaise: number;
  advanceRentCreditPaise: number;
}): { needsRepair: boolean; targetRentPaise: number; gapPaise: number } {
  const gapPaise = Math.max(0, input.rentCollectedPaise - input.invoicePaidPaise);
  const needsRepair =
    input.rentCollectedPaise === input.monthlyRentPaise &&
    input.invoiceRentPaise < input.monthlyRentPaise &&
    input.invoicePaidPaise === input.invoiceRentPaise &&
    gapPaise > 0 &&
    input.advanceRentCreditPaise === 0;
  return {
    needsRepair,
    targetRentPaise: input.monthlyRentPaise,
    gapPaise,
  };
}

export async function discoverCheckoutRentProrationGaps(input?: {
  bookingCode?: string;
  includeTestCustomers?: boolean;
}): Promise<CheckoutRentProrationGapRow[]> {
  const bookingFilter = input?.bookingCode
    ? sql`AND b.booking_code = ${input.bookingCode}`
    : sql``;
  const testFilter = input?.includeTestCustomers ? sql`` : sql`AND c.is_test = false`;

  const rows = await db.execute<{
    booking_id: string;
    booking_code: string;
    resident: string;
    monthly_rent_paise: number;
    rent_collected_paise: number;
    invoice_id: string;
    invoice_number: string;
    invoice_rent_paise: number;
    invoice_paid_paise: number;
    difference_paise: number;
    outstanding_rent_paise: number;
    payment_id: string;
    payment_date: string;
    anniversary_deployed: boolean;
    invoice_notes: string | null;
  }>(sql`
    WITH succeeded_checkout AS (
      SELECT
        b.id AS booking_id,
        b.booking_code,
        c.full_name AS resident,
        (b.subtotal_paise - b.discount_paise)::bigint::int AS monthly_rent_paise,
        p.id AS payment_id,
        p.paid_at,
        LEAST(
          p.amount_paise,
          (b.subtotal_paise - b.discount_paise)::bigint
        )::bigint::int AS rent_collected_paise
      FROM bookings b
      INNER JOIN customers c ON c.id = b.customer_id
      INNER JOIN payments p ON p.booking_id = b.id
      WHERE p.purpose = 'booking'
        AND p.status = 'succeeded'
        AND b.duration_mode IN ('monthly', 'open_ended')
        AND (b.subtotal_paise - b.discount_paise) > 0
        ${testFilter}
        ${bookingFilter}
    ),
    first_invoice AS (
      SELECT DISTINCT ON (ri.booking_id)
        ri.booking_id,
        ri.id AS invoice_id,
        ri.invoice_number,
        ri.rent_paise::bigint::int AS invoice_rent_paise,
        ri.paid_principal_paise::bigint::int AS invoice_paid_paise,
        ri.notes,
        ri.payment_id AS invoice_payment_id
      FROM rent_invoices ri
      WHERE ri.is_adhoc = false
      ORDER BY ri.booking_id, ri.billing_month ASC, ri.created_at ASC
    ),
    rent_paid_total AS (
      SELECT booking_id, coalesce(sum(paid_principal_paise), 0)::bigint::int AS total_paid
      FROM rent_invoices
      WHERE status <> 'cancelled'
      GROUP BY booking_id
    ),
    advance_credit AS (
      SELECT
        sc.booking_id,
        sc.payment_id,
        EXISTS (
          SELECT 1
          FROM audit_log al
          WHERE al.entity = 'booking'
            AND al.entity_id = sc.booking_id
            AND al.action = 'advance_rent_credit_from_checkout'
            AND (al.diff->>'paymentId') = sc.payment_id::text
        ) AS has_audit_credit,
        EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            COALESCE(
              (SELECT pricing_snapshot->'checkoutCredits' FROM bookings bx WHERE bx.id = sc.booking_id),
              '[]'::jsonb
            )
          ) elem
          WHERE elem->>'kind' = 'advance_rent_credit'
            AND elem->>'relatedPaymentId' = sc.payment_id::text
        ) AS has_snapshot_credit
      FROM succeeded_checkout sc
    )
    SELECT
      sc.booking_id::text,
      sc.booking_code,
      sc.resident,
      sc.monthly_rent_paise,
      sc.rent_collected_paise,
      fi.invoice_id::text,
      fi.invoice_number,
      fi.invoice_rent_paise,
      fi.invoice_paid_paise,
      (sc.rent_collected_paise - fi.invoice_paid_paise)::bigint::int AS difference_paise,
      GREATEST(0, sc.monthly_rent_paise - coalesce(rpt.total_paid, 0))::bigint::int AS outstanding_rent_paise,
      sc.payment_id::text,
      to_char(sc.paid_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS payment_date,
      (sc.paid_at >= ${ANNIVERSARY_BILLING_DEPLOY_UTC}::timestamptz) AS anniversary_deployed,
      fi.notes AS invoice_notes
    FROM succeeded_checkout sc
    INNER JOIN first_invoice fi ON fi.booking_id = sc.booking_id
    LEFT JOIN rent_paid_total rpt ON rpt.booking_id = sc.booking_id
    LEFT JOIN advance_credit ac ON ac.booking_id = sc.booking_id AND ac.payment_id = sc.payment_id
    WHERE sc.rent_collected_paise = sc.monthly_rent_paise
      AND fi.invoice_rent_paise < sc.monthly_rent_paise
      AND fi.invoice_paid_paise = fi.invoice_rent_paise
      AND fi.invoice_payment_id = sc.payment_id
      AND (sc.rent_collected_paise - fi.invoice_paid_paise) > 0
      AND coalesce(ac.has_audit_credit, false) = false
      AND coalesce(ac.has_snapshot_credit, false) = false
    ORDER BY sc.paid_at ASC
  `);

  return (rows as typeof rows extends infer T ? T[] : never).map((r) => ({
    bookingId: r.booking_id,
    bookingCode: r.booking_code,
    resident: r.resident,
    monthlyRentPaise: r.monthly_rent_paise,
    rentCollectedPaise: r.rent_collected_paise,
    invoiceId: r.invoice_id,
    invoiceNumber: r.invoice_number,
    invoiceRentPaise: r.invoice_rent_paise,
    invoicePaidPaise: r.invoice_paid_paise,
    differencePaise: r.difference_paise,
    outstandingRentPaise: r.outstanding_rent_paise,
    paymentId: r.payment_id,
    paymentDate: r.payment_date,
    anniversaryDeployed: r.anniversary_deployed,
    invoiceNotes: r.invoice_notes,
  }));
}

export async function auditCheckoutRentAccounting(
  bookingCode: string,
): Promise<CheckoutRentAccountingAudit | null> {
  const gaps = await discoverCheckoutRentProrationGaps({ bookingCode });
  const [booking] = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(eq(bookings.bookingCode, bookingCode))
    .limit(1);
  if (!booking) return null;

  const balances = await getBookingMoneyBalances(booking.id);
  const gap = gaps[0] ?? null;
  const closed = gap == null && (balances?.rent.outstandingPaise ?? 0) === 0;

  return { gap, balances, closed };
}

async function resolveAnniversaryInvoiceNotes(
  bookingId: string,
  dueDate: string,
): Promise<string> {
  const profile = await getBillingProfileForBooking(bookingId);
  const billingDay = profile?.billingDay ?? 5;
  const billingPeriod = anniversaryBillingPeriod(dueDate, billingDay);
  return rentInvoiceBillingPeriodNote(billingPeriod.periodStart, billingPeriod.periodEnd);
}

async function applyOptionAInvoiceRepair(input: {
  bookingId: string;
  bookingCode: string;
  invoiceId: string;
  paymentId: string;
  targetRentPaise: number;
  execute: boolean;
}): Promise<CheckoutRentAccountingRepairResult> {
  const [invoice] = await db
    .select({
      id: rentInvoices.id,
      rentPaise: rentInvoices.rentPaise,
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      notes: rentInvoices.notes,
      dueDate: rentInvoices.dueDate,
      status: rentInvoices.status,
      paymentId: rentInvoices.paymentId,
    })
    .from(rentInvoices)
    .where(eq(rentInvoices.id, input.invoiceId))
    .limit(1);

  if (!invoice) {
    return {
      bookingCode: input.bookingCode,
      bookingId: input.bookingId,
      executed: false,
      skipped: true,
      skipReason: 'Invoice not found',
    };
  }

  if (
    invoice.rentPaise >= input.targetRentPaise &&
    invoice.paidPrincipalPaise >= input.targetRentPaise
  ) {
    const balances = await getBookingMoneyBalances(input.bookingId);
    return {
      bookingCode: input.bookingCode,
      bookingId: input.bookingId,
      executed: false,
      skipped: true,
      skipReason: 'Already at full-month invoice amounts',
      invoiceId: invoice.id,
      after: {
        rentPaise: invoice.rentPaise,
        paidPrincipalPaise: invoice.paidPrincipalPaise,
        notes: invoice.notes,
        outstandingRentPaise: balances?.rent.outstandingPaise ?? 0,
      },
    };
  }

  const beforeBalances = await getBookingMoneyBalances(input.bookingId);
  const before = {
    rentPaise: invoice.rentPaise,
    paidPrincipalPaise: invoice.paidPrincipalPaise,
    notes: invoice.notes,
    outstandingRentPaise: beforeBalances?.rent.outstandingPaise ?? 0,
  };

  const notes = await resolveAnniversaryInvoiceNotes(input.bookingId, invoice.dueDate);

  if (!input.execute) {
    return {
      bookingCode: input.bookingCode,
      bookingId: input.bookingId,
      executed: false,
      skipped: false,
      invoiceId: invoice.id,
      before,
      after: {
        rentPaise: input.targetRentPaise,
        paidPrincipalPaise: input.targetRentPaise,
        notes,
        outstandingRentPaise: 0,
      },
    };
  }

  await db
    .update(rentInvoices)
    .set({
      rentPaise: input.targetRentPaise,
      paidPrincipalPaise: input.targetRentPaise,
      notes,
      status: 'paid',
      paymentId: invoice.paymentId ?? input.paymentId,
      updatedAt: new Date(),
    })
    .where(eq(rentInvoices.id, invoice.id));

  await syncRentInvoiceToUnified(invoice.id);
  await syncBookingRentReceivedPaise(input.bookingId);

  await db.insert(auditLog).values({
    actorType: 'system',
    actorId: null,
    entity: 'rent_invoice',
    entityId: invoice.id,
    action: 'checkout_rent_accounting_repair',
    diff: {
      bookingCode: input.bookingCode,
      bookingId: input.bookingId,
      paymentId: input.paymentId,
      repairStrategy: 'option_a_full_month_invoice',
      before,
      after: {
        rentPaise: input.targetRentPaise,
        paidPrincipalPaise: input.targetRentPaise,
        notes,
      },
    },
  });

  const afterBalances = await getBookingMoneyBalances(input.bookingId);

  return {
    bookingCode: input.bookingCode,
    bookingId: input.bookingId,
    executed: true,
    skipped: false,
    invoiceId: invoice.id,
    before,
    after: {
      rentPaise: input.targetRentPaise,
      paidPrincipalPaise: input.targetRentPaise,
      notes,
      outstandingRentPaise: afterBalances?.rent.outstandingPaise ?? 0,
    },
  };
}

export async function repairCheckoutRentAccountingGap(input: {
  bookingCode: string;
  execute?: boolean;
}): Promise<CheckoutRentAccountingRepairResult> {
  const execute = input.execute ?? false;
  const gaps = await discoverCheckoutRentProrationGaps({ bookingCode: input.bookingCode });

  const [booking] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      subtotalPaise: bookings.subtotalPaise,
      discountPaise: bookings.discountPaise,
      depositPaise: bookings.depositPaise,
      totalPaise: bookings.totalPaise,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.bookingCode, input.bookingCode))
    .limit(1);

  if (!booking) {
    return {
      bookingCode: input.bookingCode,
      bookingId: '',
      executed: false,
      skipped: true,
      skipReason: 'Booking not found',
    };
  }

  const gap = gaps[0];
  if (!gap) {
    const balances = await getBookingMoneyBalances(booking.id);
    return {
      bookingCode: input.bookingCode,
      bookingId: booking.id,
      executed: false,
      skipped: true,
      skipReason: 'No checkout rent proration gap detected',
      after: balances
        ? {
            rentPaise: balances.rent.receivedPaise,
            paidPrincipalPaise: balances.rent.receivedPaise,
            notes: null,
            outstandingRentPaise: balances.rent.outstandingPaise,
          }
        : undefined,
    };
  }

  const [payment] = await db
    .select({ amountPaise: payments.amountPaise })
    .from(payments)
    .where(eq(payments.id, gap.paymentId))
    .limit(1);

  if (!payment) {
    return {
      bookingCode: input.bookingCode,
      bookingId: booking.id,
      executed: false,
      skipped: true,
      skipReason: 'Linked payment not found',
    };
  }

  const allocation = allocateBookingCheckoutPayment(
    {
      subtotalPaise: booking.subtotalPaise,
      discountPaise: booking.discountPaise,
      depositPaise: booking.depositPaise,
      totalPaise: booking.totalPaise,
      pricingSnapshot: booking.pricingSnapshot as PricingSnapshot | null,
    },
    payment.amountPaise,
  );

  if (allocation.rentPaise !== gap.monthlyRentPaise) {
    return {
      bookingCode: input.bookingCode,
      bookingId: booking.id,
      executed: false,
      skipped: true,
      skipReason: `Payment rent allocation ${allocation.rentPaise} does not match monthly rent ${gap.monthlyRentPaise}`,
    };
  }

  return applyOptionAInvoiceRepair({
    bookingId: booking.id,
    bookingCode: booking.bookingCode,
    invoiceId: gap.invoiceId,
    paymentId: gap.paymentId,
    targetRentPaise: gap.monthlyRentPaise,
    execute,
  });
}

export async function repairAllCheckoutRentAccountingGaps(input?: {
  execute?: boolean;
}): Promise<CheckoutRentAccountingRepairResult[]> {
  const gaps = await discoverCheckoutRentProrationGaps();
  const results: CheckoutRentAccountingRepairResult[] = [];
  for (const gap of gaps) {
    results.push(
      await repairCheckoutRentAccountingGap({
        bookingCode: gap.bookingCode,
        execute: input?.execute ?? false,
      }),
    );
  }
  return results;
}

/**
 * Post-payment closure invariant — throws in non-production when rent is orphaned.
 * Attempts Option A auto-reconcile when anniversary policy applies (no advance credit).
 */
export async function assertCheckoutRentAccountingClosed(input: {
  bookingId: string;
  bookingCode: string;
  paymentId: string;
  rentPaisePaidFromPayment: number;
  invoiceId: string;
  advanceRentCreditPaise: number;
}): Promise<{ closed: boolean; autoRepaired: boolean }> {
  const [invoice] = await db
    .select({
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      rentPaise: rentInvoices.rentPaise,
    })
    .from(rentInvoices)
    .where(eq(rentInvoices.id, input.invoiceId))
    .limit(1);

  if (!invoice) {
    throw new Error(`Checkout rent closure: invoice ${input.invoiceId} not found`);
  }

  const [bookingRow] = await db
    .select({
      bookingCode: bookings.bookingCode,
      subtotalPaise: bookings.subtotalPaise,
      discountPaise: bookings.discountPaise,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);

  const snapshotCredit = sumAdvanceRentCreditFromSnapshot(
    bookingRow?.pricingSnapshot as PricingSnapshot | null,
    input.paymentId,
  );
  const advanceRentCreditPaise = Math.max(
    input.advanceRentCreditPaise,
    snapshotCredit,
  );

  const closure = computeCheckoutRentClosure({
    rentPaisePaidFromPayment: input.rentPaisePaidFromPayment,
    invoicePaidPrincipalPaise: invoice.paidPrincipalPaise,
    advanceRentCreditPaise,
  });

  if (closure.closed) {
    return { closed: true, autoRepaired: false };
  }

  const monthlyRentPaise = Math.max(
    0,
    (bookingRow?.subtotalPaise ?? 0) - (bookingRow?.discountPaise ?? 0),
  );
  const repairTarget = computeOptionARepairTarget({
    monthlyRentPaise,
    rentCollectedPaise: input.rentPaisePaidFromPayment,
    invoiceRentPaise: invoice.rentPaise,
    invoicePaidPaise: invoice.paidPrincipalPaise,
    advanceRentCreditPaise,
  });

  if (repairTarget.needsRepair && advanceRentCreditPaise === 0) {
    const repair = await applyOptionAInvoiceRepair({
      bookingId: input.bookingId,
      bookingCode: bookingRow?.bookingCode ?? input.bookingCode,
      invoiceId: input.invoiceId,
      paymentId: input.paymentId,
      targetRentPaise: repairTarget.targetRentPaise,
      execute: true,
    });
    if (repair.executed || repair.skipped) {
      const afterClosure = computeCheckoutRentClosure({
        rentPaisePaidFromPayment: input.rentPaisePaidFromPayment,
        invoicePaidPrincipalPaise: repair.after?.paidPrincipalPaise ?? invoice.paidPrincipalPaise,
        advanceRentCreditPaise,
      });
      if (afterClosure.closed) {
        return { closed: true, autoRepaired: repair.executed };
      }
    }
  }

  const message =
    `Checkout rent accounting not closed for ${input.bookingCode}: ` +
    `paid ${input.rentPaisePaidFromPayment}, invoice ${invoice.paidPrincipalPaise}, ` +
    `credit ${advanceRentCreditPaise}, unallocated ${closure.unallocatedPaise}`;

  if (process.env.NODE_ENV !== 'production') {
    throw new Error(message);
  }

  console.error(message);
  return { closed: false, autoRepaired: false };
}

/**
 * Invoice-first closure for booking checkout and extension payments.
 *
 * Rule: every succeeded booking/extension payment with a rent portion must
 * produce a paid rent_invoices row + financial_invoices sync, linked to the
 * existing payment row (no duplicate payment insert). Deposits stay on
 * deposit_ledger only — never revenue.
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  floors,
  payments,
  pgs,
  rentInvoices,
  rooms,
  stayExtensions,
} from '@/src/db/schema';
import type { PricingSnapshot } from '@/src/db/schema/bookings';
import { formatDate } from '@/src/lib/dates';
import { firstOfMonth } from '@/src/services/billing';
import { allocateBookingCheckoutPayment } from '@/src/lib/billing/bookingPaymentAllocation';
import {
  createAdhocRentInvoice,
  ensureMonthlyRentInvoice,
  markRentInvoicePaidFromExistingPayment,
} from '@/src/services/rentInvoices';
import { syncRentInvoiceToUnified } from '@/src/services/unifiedInvoices';

type BookingForRentInvoice = {
  id: string;
  customerId: string;
  bookingCode: string;
  durationMode: string;
  subtotalPaise: number;
  discountPaise: number;
  depositPaise: number;
  totalPaise: number;
  pricingSnapshot: PricingSnapshot | null;
};

export function computeBookingRentPaisePaid(input: {
  booking: BookingForRentInvoice;
  paymentAmountPaise: number;
  membershipAmountPaise?: number;
}): number {
  const bookingPaymentPaise = Math.max(
    0,
    input.paymentAmountPaise - (input.membershipAmountPaise ?? 0),
  );
  return allocateBookingCheckoutPayment(input.booking, bookingPaymentPaise).rentPaise;
}

async function primaryStayStartDate(bookingId: string): Promise<string | null> {
  const [row] = await db
    .select({
      stayStart: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
    })
    .from(bedReservations)
    .where(
      and(eq(bedReservations.bookingId, bookingId), eq(bedReservations.kind, 'primary')),
    )
    .limit(1);
  return row?.stayStart ?? null;
}

async function rentInvoiceLinkedToPayment(
  bookingId: string,
  paymentId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: rentInvoices.id })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, bookingId),
        eq(rentInvoices.paymentId, paymentId),
        eq(rentInvoices.status, 'paid'),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

async function loadBedContext(bookingId: string) {
  const [ctx] = await db
    .select({
      customerId: bookings.customerId,
      bedId: bedReservations.bedId,
      pgId: pgs.id,
    })
    .from(bookings)
    .innerJoin(
      bedReservations,
      and(eq(bedReservations.bookingId, bookings.id), eq(bedReservations.kind, 'primary')),
    )
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return ctx ?? null;
}

export type ApplyBookingRentInvoiceResult =
  | { ok: true; invoiceId: string; financialInvoiceId: string | null; created: boolean }
  | { ok: false; reason: string };

/**
 * Ensure booking checkout rent is invoiced and linked to the booking payment.
 * Idempotent per (bookingId, paymentId).
 */
export async function applyBookingRentInvoiceOnPaymentSuccess(input: {
  booking: BookingForRentInvoice;
  paymentId: string;
  paymentAmountPaise: number;
  membershipAmountPaise?: number;
  providerPaymentId: string;
  paidAt?: Date;
  source?: 'webhook' | 'backfill';
}): Promise<ApplyBookingRentInvoiceResult> {
  const rentPaisePaid = computeBookingRentPaisePaid({
    booking: input.booking,
    paymentAmountPaise: input.paymentAmountPaise,
    membershipAmountPaise: input.membershipAmountPaise,
  });

  if (rentPaisePaid <= 0) {
    return { ok: true, invoiceId: '', financialInvoiceId: null, created: false };
  }

  const existingLinked = await rentInvoiceLinkedToPayment(input.booking.id, input.paymentId);
  if (existingLinked) {
    const financialInvoiceId = await syncRentInvoiceToUnified(existingLinked);
    return {
      ok: true,
      invoiceId: existingLinked,
      financialInvoiceId,
      created: false,
    };
  }

  const stayStart = await primaryStayStartDate(input.booking.id);
  const billingAnchor = stayStart ?? formatDate(new Date());

  const ensured = await ensureMonthlyRentInvoice({
    bookingId: input.booking.id,
    billingMonth: firstOfMonth(billingAnchor),
    amountPaise: rentPaisePaid,
  });

  if (!ensured.ok) {
    return { ok: false, reason: ensured.error };
  }

  const marked = await markRentInvoicePaidFromExistingPayment({
    invoiceId: ensured.invoiceId,
    paymentId: input.paymentId,
    principalPaise: rentPaisePaid,
    paidAt: input.paidAt,
    source: input.source === 'backfill' ? 'system' : 'webhook',
    meta: {
      bookingCode: input.booking.bookingCode,
      providerPaymentId: input.providerPaymentId,
      durationMode: input.booking.durationMode,
    },
  });

  if (!marked.ok) {
    return { ok: false, reason: marked.reason };
  }

  const financialInvoiceId = await syncRentInvoiceToUnified(ensured.invoiceId);
  if (!financialInvoiceId) {
    return { ok: false, reason: 'Unified invoice sync failed after booking rent invoice.' };
  }

  return {
    ok: true,
    invoiceId: ensured.invoiceId,
    financialInvoiceId,
    created: ensured.created || marked.stateChanged,
  };
}

export type ApplyExtensionRentInvoiceResult =
  | { ok: true; invoiceId: string; financialInvoiceId: string | null }
  | { ok: false; reason: string };

/** Extension payments are rent-only — invoice the full extension payment amount. */
export async function applyExtensionRentInvoiceOnPaymentSuccess(input: {
  extensionId: string;
  bookingId: string;
  paymentId: string;
  amountPaise: number;
  paidAt?: Date;
  source?: 'webhook' | 'backfill';
}): Promise<ApplyExtensionRentInvoiceResult> {
  if (input.amountPaise <= 0) {
    return { ok: true, invoiceId: '', financialInvoiceId: null };
  }

  const existingLinked = await rentInvoiceLinkedToPayment(input.bookingId, input.paymentId);
  if (existingLinked) {
    const financialInvoiceId = await syncRentInvoiceToUnified(existingLinked);
    return { ok: true, invoiceId: existingLinked, financialInvoiceId };
  }

  const ctx = await loadBedContext(input.bookingId);
  if (!ctx?.bedId || !ctx.pgId) {
    return { ok: false, reason: 'Booking bed context missing for extension rent invoice.' };
  }

  const created = await createAdhocRentInvoice({
    bookingId: input.bookingId,
    customerId: ctx.customerId,
    bedId: ctx.bedId,
    pgId: ctx.pgId,
    amountPaise: input.amountPaise,
    title: 'Stay extension',
    description: `Extension ${input.extensionId}`,
  });

  if (!created.ok) {
    return { ok: false, reason: created.error };
  }

  const marked = await markRentInvoicePaidFromExistingPayment({
    invoiceId: created.invoiceId,
    paymentId: input.paymentId,
    principalPaise: input.amountPaise,
    paidAt: input.paidAt,
    source: input.source === 'backfill' ? 'system' : 'webhook',
    meta: { extensionId: input.extensionId },
  });

  if (!marked.ok) {
    return { ok: false, reason: marked.reason };
  }

  const financialInvoiceId = await syncRentInvoiceToUnified(created.invoiceId);
  if (!financialInvoiceId) {
    return { ok: false, reason: 'Unified invoice sync failed after extension rent invoice.' };
  }

  return { ok: true, invoiceId: created.invoiceId, financialInvoiceId };
}

/** Idempotent repair when payment webhook replays after invoice layer was added. */
export async function ensureBookingRentInvoiceForExistingPayment(
  paymentId: string,
): Promise<ApplyBookingRentInvoiceResult | { ok: true; skipped: true; reason: string }> {
  const [payment] = await db
    .select({
      id: payments.id,
      bookingId: payments.bookingId,
      purpose: payments.purpose,
      amountPaise: payments.amountPaise,
      paidAt: payments.paidAt,
      providerPaymentId: payments.providerPaymentId,
      status: payments.status,
    })
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);

  if (!payment || payment.status !== 'succeeded' || !payment.bookingId) {
    return { ok: true, skipped: true, reason: 'payment missing or not succeeded' };
  }

  if (payment.purpose === 'booking') {
    const [booking] = await db
      .select({
        id: bookings.id,
        customerId: bookings.customerId,
        bookingCode: bookings.bookingCode,
        durationMode: bookings.durationMode,
        subtotalPaise: bookings.subtotalPaise,
        discountPaise: bookings.discountPaise,
        depositPaise: bookings.depositPaise,
        totalPaise: bookings.totalPaise,
        pricingSnapshot: bookings.pricingSnapshot,
      })
      .from(bookings)
      .where(eq(bookings.id, payment.bookingId))
      .limit(1);

    if (!booking || booking.durationMode === 'reserve') {
      return { ok: true, skipped: true, reason: 'reserve booking — no rent invoice' };
    }

    return applyBookingRentInvoiceOnPaymentSuccess({
      booking,
      paymentId: payment.id,
      paymentAmountPaise: payment.amountPaise,
      providerPaymentId: payment.providerPaymentId ?? payment.id,
      paidAt: payment.paidAt ?? undefined,
      source: 'backfill',
    });
  }

  if (payment.purpose === 'extension') {
    const [ext] = await db
      .select({ id: stayExtensions.id })
      .from(stayExtensions)
      .where(eq(stayExtensions.paymentId, payment.id))
      .limit(1);

    if (!ext) {
      return { ok: true, skipped: true, reason: 'extension row not linked to payment' };
    }

    const extResult = await applyExtensionRentInvoiceOnPaymentSuccess({
      extensionId: ext.id,
      bookingId: payment.bookingId,
      paymentId: payment.id,
      amountPaise: payment.amountPaise,
      paidAt: payment.paidAt ?? undefined,
      source: 'backfill',
    });

    if (!extResult.ok) return extResult;
    return {
      ok: true,
      invoiceId: extResult.invoiceId,
      financialInvoiceId: extResult.financialInvoiceId,
      created: true,
    };
  }

  return { ok: true, skipped: true, reason: `purpose ${payment.purpose} not invoiced here` };
}

export type BookingRentInvoiceGapRow = {
  bookingId: string;
  bookingCode: string;
  durationMode: string;
  paymentId: string;
  paymentAmountPaise: number;
  paidAt: string | null;
  estimatedRentPaise: number;
  customerId: string;
  isTest: boolean;
};

export type ExtensionRentInvoiceGapRow = {
  extensionId: string;
  bookingId: string;
  bookingCode: string;
  paymentId: string;
  paymentAmountPaise: number;
  paidAt: string | null;
  customerId: string;
};

export type BookingRentInvoiceGapReport = {
  generatedAt: string;
  bookingGaps: BookingRentInvoiceGapRow[];
  extensionGaps: ExtensionRentInvoiceGapRow[];
  summary: {
    affectedBookingPaymentCount: number;
    affectedExtensionPaymentCount: number;
    affectedBookingCount: number;
    estimatedMissingRentPaise: number;
    estimatedMissingExtensionRentPaise: number;
    totalEstimatedMissingRevenuePaise: number;
  };
};

/** Read-only discovery — bookings/extensions with succeeded payments but no paid rent invoice link. */
export async function discoverBookingRentInvoiceGaps(): Promise<BookingRentInvoiceGapReport> {
  const bookingRows = await db.execute<{
    booking_id: string;
    booking_code: string;
    duration_mode: string;
    payment_id: string;
    payment_amount_paise: number;
    paid_at: string | null;
    subtotal_paise: number;
    discount_paise: number;
    deposit_paise: number;
    total_paise: number;
    pricing_snapshot: PricingSnapshot | null;
    customer_id: string;
    is_test: boolean;
  }>(sql`
    SELECT
      b.id AS booking_id,
      b.booking_code,
      b.duration_mode,
      p.id AS payment_id,
      p.amount_paise::bigint::int AS payment_amount_paise,
      p.paid_at::text AS paid_at,
      b.subtotal_paise::bigint::int AS subtotal_paise,
      b.discount_paise::bigint::int AS discount_paise,
      b.deposit_paise::bigint::int AS deposit_paise,
      b.total_paise::bigint::int AS total_paise,
      b.pricing_snapshot AS pricing_snapshot,
      b.customer_id,
      c.is_test
    FROM payments p
    INNER JOIN bookings b ON b.id = p.booking_id
    INNER JOIN customers c ON c.id = b.customer_id
    WHERE p.purpose = 'booking'
      AND p.status = 'succeeded'
      AND b.duration_mode <> 'reserve'
      AND b.status IN ('confirmed', 'completed', 'cancelled')
      AND NOT EXISTS (
        SELECT 1 FROM rent_invoices ri
        WHERE ri.booking_id = b.id
          AND ri.payment_id = p.id
          AND ri.status = 'paid'
      )
    ORDER BY p.paid_at DESC NULLS LAST
  `);

  const extensionRows = await db.execute<{
    extension_id: string;
    booking_id: string;
    booking_code: string;
    payment_id: string;
    payment_amount_paise: number;
    paid_at: string | null;
    customer_id: string;
  }>(sql`
    SELECT
      se.id AS extension_id,
      b.id AS booking_id,
      b.booking_code,
      p.id AS payment_id,
      p.amount_paise::bigint::int AS payment_amount_paise,
      p.paid_at::text AS paid_at,
      b.customer_id
    FROM payments p
    INNER JOIN stay_extensions se ON se.payment_id = p.id
    INNER JOIN bookings b ON b.id = p.booking_id
    INNER JOIN customers c ON c.id = b.customer_id
    WHERE p.purpose = 'extension'
      AND p.status = 'succeeded'
      AND se.status = 'paid'
      AND NOT EXISTS (
        SELECT 1 FROM rent_invoices ri
        WHERE ri.booking_id = b.id
          AND ri.payment_id = p.id
          AND ri.status = 'paid'
      )
    ORDER BY p.paid_at DESC NULLS LAST
  `);

  const bookingGaps: BookingRentInvoiceGapRow[] = bookingRows
    .map((r) => {
      const booking = {
        id: r.booking_id,
        customerId: r.customer_id,
        bookingCode: r.booking_code,
        durationMode: r.duration_mode,
        subtotalPaise: r.subtotal_paise,
        discountPaise: r.discount_paise,
        depositPaise: r.deposit_paise,
        totalPaise: r.total_paise,
        pricingSnapshot: r.pricing_snapshot,
      };
      const estimatedRentPaise = computeBookingRentPaisePaid({
        booking,
        paymentAmountPaise: r.payment_amount_paise,
      });
      return {
        bookingId: r.booking_id,
        bookingCode: r.booking_code,
        durationMode: r.duration_mode,
        paymentId: r.payment_id,
        paymentAmountPaise: r.payment_amount_paise,
        paidAt: r.paid_at,
        estimatedRentPaise,
        customerId: r.customer_id,
        isTest: r.is_test,
      };
    })
    .filter((r) => r.estimatedRentPaise > 0);

  const extensionGaps: ExtensionRentInvoiceGapRow[] = extensionRows.map((r) => ({
    extensionId: r.extension_id,
    bookingId: r.booking_id,
    bookingCode: r.booking_code,
    paymentId: r.payment_id,
    paymentAmountPaise: r.payment_amount_paise,
    paidAt: r.paid_at,
    customerId: r.customer_id,
  }));

  const prodBookingGaps = bookingGaps.filter((r) => !r.isTest);
  const bookingRent = prodBookingGaps.reduce((a, r) => a + r.estimatedRentPaise, 0);
  const extensionRent = extensionGaps.reduce((a, r) => a + r.paymentAmountPaise, 0);

  return {
    generatedAt: new Date().toISOString(),
    bookingGaps,
    extensionGaps,
    summary: {
      affectedBookingPaymentCount: prodBookingGaps.length,
      affectedExtensionPaymentCount: extensionGaps.length,
      affectedBookingCount: new Set(prodBookingGaps.map((r) => r.bookingId)).size,
      estimatedMissingRentPaise: bookingRent,
      estimatedMissingExtensionRentPaise: extensionRent,
      totalEstimatedMissingRevenuePaise: bookingRent + extensionRent,
    },
  };
}

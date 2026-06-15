/**
 * Phase 5.5 — monthly rent invoicing.
 *
 *   generateRentInvoicesForMonth()  — idempotent invoice fan-out for a billing month
 *   markOverdueInvoices()            — sweep: pending → overdue when today > due_date
 *   recordRentPaymentSuccess()       — webhook fork: rent purpose
 *   recordRentPaymentFailure()       — webhook fork: rent purpose (idempotency only — no rollback)
 *
 * Eligibility (monthly resident):
 *   - bookings.status = 'confirmed'
 *   - bookings.duration_mode ∈ ('monthly', 'open_ended')
 *   - at least one bed_reservation (primary or extension) with status='active'
 *     whose stay_range intersects the billing month
 *
 * Rent amount is always read from the booking's pricing snapshot
 * (`perBed[*].monthlyRatePaise`), summed across all beds on the booking.
 * That's the same rate the resident saw at checkout — never a fresh
 * lookup against `bed_prices`, so a later rate hike does NOT silently
 * raise an existing resident's monthly bill.
 *
 * Pro-ration:
 *   - First month (resident moves in mid-month): pro-rated by days active.
 *   - Last month (vacating mid-month): pro-rated.
 *   - Full months: full monthly rate, no pro-ration.
 *
 * Idempotency:
 *   - UNIQUE(booking_id, billing_month) on rent_invoices.
 *   - Generator inserts ON CONFLICT DO NOTHING.
 *   - Payment recorder probes for the (provider, providerPaymentId) row
 *     first and treats SQLSTATE 23505 on the partial unique index as
 *     "already processed".
 */

import { and, desc, eq, inArray, isNotNull, lte, ne, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  customers,
  payments,
  pgs,
  rentInvoices,
  rooms,
  type RentInvoice,
} from '../db/schema';
import type { PricingSnapshot } from '../db/schema/bookings';
import { adminCanAccessPg } from '../lib/auth/roles';
import type { AdminSession } from '../lib/auth/session';
import { formatDate, parseDate, type DateLike } from '../lib/dates';
import {
  computeLateFee,
  daysOverdue,
  dueDateForMonth,
  firstOfMonth,
  monthBounds,
  prorateForMonth,
} from './billing';
import type { AnyPaymentProvider } from './bookingLifecycle';
import type { ProviderName } from './payments';

const INVOICE_PREFIX = 'RNT';

// ───────────────────────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────────────────────

export type GenerateRentInvoicesInput = {
  /** Any date in the target month — normalised to YYYY-MM-01 internally. */
  billingMonth: DateLike;
  /** Optional: restrict to a single PG (defaults to all). */
  pgId?: string;
};

export type GenerateRentInvoicesResult = {
  billingMonth: string; // YYYY-MM-01
  candidateBookings: number;
  invoicesCreated: number;
  invoicesSkipped: number;
  invoiceIds: string[];
};

export type RentInvoiceView = RentInvoice & {
  /** Late fee accrued as-of `asOf` (defaults to today). 0 if paid. */
  accruedLateFeePaise: number;
  /** rent + late fee - paid. 0 if fully paid. */
  outstandingPaise: number;
  /** Effective UI status — computes overdue dynamically when stored status is `pending`. */
  effectiveStatus: 'pending' | 'paid' | 'overdue' | 'cancelled';
};

export type RecordRentPaymentSuccessInput = {
  provider: ProviderName;
  providerPaymentId: string;
  providerOrderId?: string | null;
  amountPaise: number;
  invoiceId: string;
  rawPayload?: unknown;
  /** Offline (`'cash' | 'upi_manual' | 'bank_transfer'`) admin overrides. */
  offlineProvider?: AnyPaymentProvider;
};

export type RecordRentPaymentSuccessResult =
  | {
      ok: true;
      paymentId: string;
      invoiceId: string;
      stateChanged: boolean;
    }
  | { ok: false; reason: string };

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function pgErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const direct = (err as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  // Drizzle wraps postgres-js errors under `cause`.
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const c = (cause as { code?: unknown }).code;
    if (typeof c === 'string') return c;
  }
  return null;
}

/** YYYY-MM → "2026-06" — used in invoice numbers. */
function monthLabel(billingMonth: DateLike): string {
  const d = parseDate(billingMonth);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Per-month invoice number: `RNT-2026-06-0001`. The numeric suffix is
 * `count(rent_invoices for that month) + 1`. Per-month counters are fine
 * because each (booking, billing_month) is unique anyway — the suffix is
 * purely cosmetic.
 *
 * Race-safety: we read the count then insert with the prefix. The unique
 * index on `invoice_number` will reject a collision with SQLSTATE 23505,
 * in which case the caller can retry with `count + 2`.
 */
async function nextInvoiceNumber(billingMonth: DateLike, attempt = 0): Promise<string> {
  const label = monthLabel(billingMonth);
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(rentInvoices)
    .where(eq(rentInvoices.billingMonth, firstOfMonth(billingMonth)));
  const seq = (count ?? 0) + 1 + attempt;
  return `${INVOICE_PREFIX}-${label}-${String(seq).padStart(4, '0')}`;
}

/**
 * Sum of `pricingSnapshot.perBed[*].monthlyRatePaise` for the booking.
 * This is the resident's monthly rent (matches what they saw at checkout).
 * Returns 0 if the snapshot is missing or has no monthly rates — the
 * generator will skip such bookings (and audit the skip).
 */
function monthlyRentFromSnapshot(snapshot: PricingSnapshot | null): number {
  if (!snapshot || !Array.isArray(snapshot.perBed)) return 0;
  return snapshot.perBed.reduce((acc, bed) => acc + (bed.monthlyRatePaise ?? 0), 0);
}

/**
 * Latest active stay window for a booking, used for pro-ration.
 *
 *   - "active start" = min(lower(stay_range)) across all
 *     bed_reservations with status='active'.
 *   - "active end" = max(upper(stay_range)) — exclusive (half-open
 *     range convention). For open-ended bookings (`expected_checkout_date IS NULL`)
 *     we cap the end at the far-future sentinel (year 9999) so the
 *     intersection with any billing month is "full month".
 */
async function loadStayWindow(
  bookingId: string,
): Promise<{ start: string; end: string | null } | null> {
  const rows = await db
    .select({
      lower: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
      upper: sql<string | null>`to_char(upper(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
    })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.bookingId, bookingId),
        eq(bedReservations.status, 'active'),
      ),
    );
  if (rows.length === 0) return null;
  const lowers = rows.map((r) => r.lower).filter(Boolean) as string[];
  const uppers = rows.map((r) => r.upper).filter((u): u is string => !!u);
  if (lowers.length === 0) return null;
  const start = lowers.sort()[0];
  const end =
    uppers.length === rows.length // every reservation has an upper bound
      ? uppers.sort().slice(-1)[0]
      : null; // at least one open-ended reservation
  return { start, end };
}

// ───────────────────────────────────────────────────────────────────────────
// generateRentInvoicesForMonth — idempotent
// ───────────────────────────────────────────────────────────────────────────

export async function generateRentInvoicesForMonth(
  input: GenerateRentInvoicesInput,
): Promise<GenerateRentInvoicesResult> {
  const billingMonth = firstOfMonth(input.billingMonth);
  const dueDate = formatDate(dueDateForMonth(billingMonth));
  const { start: monthStart, end: monthEnd } = monthBounds(billingMonth);
  const monthStartIso = formatDate(monthStart);
  const monthEndIso = formatDate(monthEnd);

  // 1. Find every confirmed monthly booking whose active reservations
  //    intersect [monthStart, monthEnd). We deduplicate by booking_id and
  //    pick one representative bed (the smallest UUID — deterministic
  //    for tests) to record on the invoice's `bed_id` column.
  const rows = await db
    .selectDistinct({
      bookingId: bookings.id,
      customerId: bookings.customerId,
      durationMode: bookings.durationMode,
      pricingSnapshot: bookings.pricingSnapshot,
      bedId: bedReservations.bedId,
      // Active stay window comes from the reservation that intersects
      // this month — we'll re-query bedwise below to keep this top-level
      // select cheap.
    })
    .from(bookings)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.status, 'confirmed'),
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
        eq(bedReservations.status, 'active'),
        sql`${bedReservations.stayRange} && daterange(${monthStartIso}::date, ${monthEndIso}::date, '[)')`,
        input.pgId
          ? sql`EXISTS (
              SELECT 1 FROM beds b
              JOIN rooms r ON r.id = b.room_id
              JOIN floors f ON f.id = r.floor_id
              WHERE b.id = ${bedReservations.bedId}
                AND f.pg_id = ${input.pgId}
            )`
          : sql`TRUE`,
      ),
    );

  // 2. Reduce to one (bookingId → representative bedId, snapshot, etc).
  const byBooking = new Map<
    string,
    {
      bookingId: string;
      customerId: string;
      durationMode: 'monthly' | 'open_ended';
      pricingSnapshot: PricingSnapshot | null;
      bedId: string;
    }
  >();
  for (const row of rows) {
    const existing = byBooking.get(row.bookingId);
    if (!existing) {
      byBooking.set(row.bookingId, {
        bookingId: row.bookingId,
        customerId: row.customerId,
        durationMode: row.durationMode as 'monthly' | 'open_ended',
        pricingSnapshot: row.pricingSnapshot as PricingSnapshot | null,
        bedId: row.bedId,
      });
    } else if (row.bedId < existing.bedId) {
      existing.bedId = row.bedId;
    }
  }

  const candidates = [...byBooking.values()];
  const invoiceIds: string[] = [];
  let created = 0;
  let skipped = 0;

  for (const c of candidates) {
    const monthlyRent = monthlyRentFromSnapshot(c.pricingSnapshot);
    if (monthlyRent <= 0) {
      // No monthly rate on snapshot — skip (audit log, no invoice).
      skipped += 1;
      continue;
    }

    // Pro-rate against the resident's active window.
    const stay = await loadStayWindow(c.bookingId);
    if (!stay) {
      skipped += 1;
      continue;
    }
    const prorated = prorateForMonth({
      monthlyRatePaise: monthlyRent,
      billingMonth,
      activeStart: stay.start,
      // For open-ended bookings (no upper bound), use far-future so
      // intersection = full month.
      activeEnd: stay.end ?? '9999-12-31',
    });
    if (prorated.amountPaise <= 0) {
      skipped += 1;
      continue;
    }

    // Look up pgId for the bed (so we can index by PG cheaply).
    const [pgRow] = await db.execute<{ pg_id: string }>(sql`
      SELECT f.pg_id AS pg_id
      FROM beds b
      JOIN rooms r ON r.id = b.room_id
      JOIN floors f ON f.id = r.floor_id
      WHERE b.id = ${c.bedId}
      LIMIT 1
    `);
    const pgId = (pgRow as { pg_id: string } | undefined)?.pg_id;
    if (!pgId) {
      skipped += 1;
      continue;
    }

    // Insert, retrying invoice-number collisions.
    let inserted: { id: string; invoice_number: string } | null = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const invoiceNumber = await nextInvoiceNumber(billingMonth, attempt);
      try {
        const [row] = await db
          .insert(rentInvoices)
          .values({
            invoiceNumber,
            bookingId: c.bookingId,
            customerId: c.customerId,
            bedId: c.bedId,
            pgId,
            billingMonth,
            dueDate,
            rentPaise: prorated.amountPaise,
            status: 'pending',
            notes: prorated.isFullMonth
              ? null
              : `Pro-rated: ${prorated.daysActive}/${prorated.daysInMonth} days active.`,
          })
          .onConflictDoNothing({
            target: [rentInvoices.bookingId, rentInvoices.billingMonth],
          })
          .returning({ id: rentInvoices.id, invoice_number: rentInvoices.invoiceNumber });
        if (row) {
          inserted = { id: row.id, invoice_number: row.invoice_number };
        }
        break;
      } catch (err) {
        // 23505 on invoice_number — bump attempt and retry.
        if (pgErrorCode(err) === '23505') continue;
        throw err;
      }
    }

    if (inserted) {
      created += 1;
      invoiceIds.push(inserted.id);
      const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
      void syncRentInvoiceToUnified(inserted.id);
      await db.insert(auditLog).values({
        actorType: 'system',
        actorId: null,
        entity: 'rent_invoice',
        entityId: inserted.id,
        action: 'generated',
        diff: {
          bookingId: c.bookingId,
          billingMonth,
          rentPaise: prorated.amountPaise,
          isFullMonth: prorated.isFullMonth,
          daysActive: prorated.daysActive,
        },
      });
      const { notifyRentReminder } = await import('@/src/lib/email/notifications');
      notifyRentReminder({
        customerId: c.customerId,
        billingMonth,
        amountPaise: prorated.amountPaise,
        dueDate,
      });
    } else {
      // ON CONFLICT no-op (invoice for this booking+month already exists).
      skipped += 1;
    }
  }

  return {
    billingMonth,
    candidateBookings: candidates.length,
    invoicesCreated: created,
    invoicesSkipped: skipped,
    invoiceIds,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// markOverdueInvoices — daily sweeper helper
// ───────────────────────────────────────────────────────────────────────────

export async function markOverdueInvoices(
  asOf: DateLike = formatDate(new Date()),
): Promise<{ updated: number; updatedInvoiceIds: string[] }> {
  const today = formatDate(parseDate(asOf));
  const rows = await db
    .update(rentInvoices)
    .set({ status: 'overdue', updatedAt: new Date() })
    .where(
      and(
        eq(rentInvoices.status, 'pending'),
        // due_date < today (overdue starts on the 6th — diffDays(due_date, today) > 0)
        sql`${rentInvoices.dueDate} < ${today}::date`,
      ),
    )
    .returning({ id: rentInvoices.id });

  if (rows.length > 0) {
    await db.insert(auditLog).values(
      rows.map((r) => ({
        actorType: 'system' as const,
        actorId: null,
        entity: 'rent_invoice',
        entityId: r.id,
        action: 'marked_overdue',
        diff: { asOf: today },
      })),
    );
    const { syncManyToUnified } = await import('@/src/services/unifiedInvoices');
    void syncManyToUnified(
      rows.map((r) => r.id),
      'rent',
    );
  }
  return { updated: rows.length, updatedInvoiceIds: rows.map((r) => r.id) };
}

// ───────────────────────────────────────────────────────────────────────────
// recordRentPaymentSuccess — webhook entry point (idempotent)
// ───────────────────────────────────────────────────────────────────────────

export async function recordRentPaymentSuccess(
  input: RecordRentPaymentSuccessInput,
): Promise<RecordRentPaymentSuccessResult> {
  const [invoice] = await db
    .select({
      id: rentInvoices.id,
      bookingId: rentInvoices.bookingId,
      customerId: rentInvoices.customerId,
      status: rentInvoices.status,
      rentPaise: rentInvoices.rentPaise,
      billingMonth: rentInvoices.billingMonth,
    })
    .from(rentInvoices)
    .where(eq(rentInvoices.id, input.invoiceId))
    .limit(1);
  if (!invoice) {
    return { ok: false, reason: `no rent invoice with id ${input.invoiceId}` };
  }
  if (invoice.status === 'cancelled') {
    return { ok: false, reason: 'invoice is cancelled' };
  }

  const provider = (input.offlineProvider ?? input.provider) as AnyPaymentProvider;

  // Idempotency probe.
  const [existing] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.provider, provider),
        eq(payments.providerPaymentId, input.providerPaymentId),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      ok: true,
      paymentId: existing.id,
      invoiceId: invoice.id,
      stateChanged: false,
    };
  }

  // Snapshot the late fee accrued AT PAYMENT TIME so the customer ledger
  // doesn't keep accruing after the payment lands.
  const lateFee = computeLateFee({
    rentPaise: invoice.rentPaise,
    billingMonth: invoice.billingMonth,
  });

  try {
    const result = await db.transaction(async (tx) => {
      const [payment] = await tx
        .insert(payments)
        .values({
          bookingId: invoice.bookingId,
          purpose: 'rent',
          provider,
          providerPaymentId: input.providerPaymentId,
          providerOrderId: input.providerOrderId ?? null,
          amountPaise: input.amountPaise,
          status: 'succeeded',
          rawPayload: (input.rawPayload as object | undefined) ?? null,
          paidAt: new Date(),
        })
        .returning({ id: payments.id });

      await tx
        .update(rentInvoices)
        .set({
          status: 'paid',
          paidPrincipalPaise: invoice.rentPaise,
          paidLateFeePaise: lateFee,
          lateFeeLockedPaise: lateFee,
          paymentId: payment.id,
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(rentInvoices.id, invoice.id),
            // Re-check non-cancellation under the transaction.
            ne(rentInvoices.status, 'cancelled'),
          ),
        );

      await tx.insert(auditLog).values({
        actorType: 'system',
        actorId: null,
        entity: 'rent_invoice',
        entityId: invoice.id,
        action: 'paid',
        diff: {
          provider,
          providerPaymentId: input.providerPaymentId,
          amountPaise: input.amountPaise,
          rentPaise: invoice.rentPaise,
          lateFeeLockedPaise: lateFee,
        },
      });

      return { paymentId: payment.id };
    });

    const { notifyPaymentReceipt } = await import('@/src/lib/email/notifications');
    notifyPaymentReceipt({
      customerId: invoice.customerId,
      purpose: 'rent',
      amountPaise: input.amountPaise,
      reference: invoice.billingMonth,
    });

    const { markActivePaymentLinksPaid } = await import('@/src/services/paymentLinks');
    void markActivePaymentLinksPaid({
      residentId: invoice.customerId,
      purpose: 'rent',
      amountPaise: input.amountPaise,
    });

    const [automationCtx] = await db
      .select({
        pgId: rentInvoices.pgId,
        pgName: pgs.name,
        customerName: customers.fullName,
      })
      .from(rentInvoices)
      .innerJoin(pgs, eq(pgs.id, rentInvoices.pgId))
      .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
      .where(eq(rentInvoices.id, invoice.id))
      .limit(1);

    if (automationCtx) {
      const { emitPaymentReceivedAutomation } = await import('./automationEngine');
      void emitPaymentReceivedAutomation({
        pgId: automationCtx.pgId,
        customerId: invoice.customerId,
        bookingId: invoice.bookingId,
        paymentId: result.paymentId,
        amountPaise: input.amountPaise,
        pgName: automationCtx.pgName,
        customerName: automationCtx.customerName,
        paymentPurpose: 'rent',
      });
    }

    const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
    void syncRentInvoiceToUnified(invoice.id);

    return {
      ok: true,
      paymentId: result.paymentId,
      invoiceId: invoice.id,
      stateChanged: true,
    };
  } catch (err) {
    if (pgErrorCode(err) === '23505') {
      const [reread] = await db
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.provider, provider),
            eq(payments.providerPaymentId, input.providerPaymentId),
          ),
        )
        .limit(1);
      if (reread) {
        return {
          ok: true,
          paymentId: reread.id,
          invoiceId: invoice.id,
          stateChanged: false,
        };
      }
    }
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown error' };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// recordRentPaymentFailure — webhook entry point (idempotent)
//
// Failure on a rent payment doesn't cancel the invoice — the resident is
// still expected to pay. We only record the failed attempt in the
// ledger so the operator has a paper trail.
// ───────────────────────────────────────────────────────────────────────────

export async function recordRentPaymentFailure(input: {
  provider: ProviderName;
  providerPaymentId: string;
  providerOrderId?: string | null;
  invoiceId: string;
  reason: string;
  rawPayload?: unknown;
}): Promise<{
  ok: boolean;
  paymentId?: string;
  stateChanged?: boolean;
  reason?: string;
}> {
  const [invoice] = await db
    .select({ id: rentInvoices.id, bookingId: rentInvoices.bookingId })
    .from(rentInvoices)
    .where(eq(rentInvoices.id, input.invoiceId))
    .limit(1);
  if (!invoice) return { ok: false, reason: `no rent invoice ${input.invoiceId}` };

  const [existing] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.provider, input.provider),
        eq(payments.providerPaymentId, input.providerPaymentId),
      ),
    )
    .limit(1);
  if (existing) {
    return { ok: true, paymentId: existing.id, stateChanged: false };
  }

  try {
    const [payment] = await db
      .insert(payments)
      .values({
        bookingId: invoice.bookingId,
        purpose: 'rent',
        provider: input.provider,
        providerPaymentId: input.providerPaymentId,
        providerOrderId: input.providerOrderId ?? null,
        amountPaise: 0,
        status: 'failed',
        rawPayload: (input.rawPayload as object | undefined) ?? null,
      })
      .returning({ id: payments.id });

    await db.insert(auditLog).values({
      actorType: 'system',
      actorId: null,
      entity: 'rent_invoice',
      entityId: invoice.id,
      action: 'payment_failed',
      diff: {
        provider: input.provider,
        providerPaymentId: input.providerPaymentId,
        reason: input.reason,
      },
    });

    return { ok: true, paymentId: payment.id, stateChanged: true };
  } catch (err) {
    if (pgErrorCode(err) === '23505') {
      const [reread] = await db
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.provider, input.provider),
            eq(payments.providerPaymentId, input.providerPaymentId),
          ),
        )
        .limit(1);
      if (reread) return { ok: true, paymentId: reread.id, stateChanged: false };
    }
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown error' };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// View helpers (dynamic late-fee accrual on read)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Augment a stored `rent_invoices` row with the live late fee and
 * effective UI status. The stored `status` is "pending" until the
 * sweeper flips it to "overdue", but the customer-facing dashboard
 * should reflect overdue immediately on the 6th regardless of cron lag.
 */
export function projectInvoice(
  invoice: RentInvoice,
  asOf: DateLike = formatDate(new Date()),
): RentInvoiceView {
  if (invoice.status === 'paid') {
    return {
      ...invoice,
      accruedLateFeePaise: invoice.lateFeeLockedPaise ?? 0,
      outstandingPaise: 0,
      effectiveStatus: 'paid',
    };
  }
  if (invoice.status === 'cancelled') {
    return {
      ...invoice,
      accruedLateFeePaise: 0,
      outstandingPaise: 0,
      effectiveStatus: 'cancelled',
    };
  }
  const lateFee = computeLateFee({
    rentPaise: invoice.rentPaise,
    billingMonth: invoice.billingMonth,
    today: asOf,
  });
  const outstanding = invoice.rentPaise + lateFee
    - invoice.paidPrincipalPaise
    - invoice.paidLateFeePaise;
  const effectiveStatus =
    daysOverdue(invoice.billingMonth, asOf) > 0 ? 'overdue' : 'pending';
  return {
    ...invoice,
    accruedLateFeePaise: lateFee,
    outstandingPaise: Math.max(0, outstanding),
    effectiveStatus,
  };
}

/**
 * Cancel all future rent invoices for a booking (used when a vacating
 * request is completed). "Future" = billing_month > current month.
 */
export async function cancelFutureRentInvoices(
  bookingId: string,
  reason: string,
  asOf: DateLike = formatDate(new Date()),
): Promise<{ cancelled: number; ids: string[] }> {
  const today = formatDate(parseDate(asOf));
  const rows = await db
    .update(rentInvoices)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancellationReason: reason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(rentInvoices.bookingId, bookingId),
        inArray(rentInvoices.status, ['pending', 'overdue']),
        sql`${rentInvoices.billingMonth} > date_trunc('month', ${today}::date)`,
      ),
    )
    .returning({ id: rentInvoices.id });

  if (rows.length > 0) {
    await db.insert(auditLog).values(
      rows.map((r) => ({
        actorType: 'system' as const,
        actorId: null,
        entity: 'rent_invoice',
        entityId: r.id,
        action: 'cancelled',
        diff: { reason, asOf: today },
      })),
    );
    const { syncManyToUnified } = await import('@/src/services/unifiedInvoices');
    void syncManyToUnified(
      rows.map((r) => r.id),
      'rent',
    );
  }
  return { cancelled: rows.length, ids: rows.map((r) => r.id) };
}

// Re-exports so callers don't have to import from two places.
export { customers };

export async function submitRentPaymentProof(
  customerId: string,
  invoiceId: string,
  paymentProofUrl: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [invoice] = await db
    .select()
    .from(rentInvoices)
    .where(eq(rentInvoices.id, invoiceId))
    .limit(1);
  if (!invoice || invoice.customerId !== customerId) {
    return { ok: false, message: 'Invoice not found.' };
  }
  if (!['pending', 'overdue'].includes(invoice.status)) {
    return { ok: false, message: 'This invoice is not awaiting payment.' };
  }
  if (!paymentProofUrl.trim()) {
    return { ok: false, message: 'Payment photo is required.' };
  }

  await db
    .update(rentInvoices)
    .set({ paymentProofUrl: paymentProofUrl.trim(), updatedAt: new Date() })
    .where(eq(rentInvoices.id, invoiceId));

  return { ok: true };
}

export async function listPendingRentProofsForPg(pgId: string) {
  return db
    .select({
      invoiceId: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
      customerName: customers.fullName,
      roomNumber: rooms.roomNumber,
      bedCode: beds.bedCode,
      billingMonth: rentInvoices.billingMonth,
      rentPaise: rentInvoices.rentPaise,
      paymentProofUrl: rentInvoices.paymentProofUrl,
    })
    .from(rentInvoices)
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .innerJoin(beds, eq(beds.id, rentInvoices.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(
      and(
        eq(rentInvoices.pgId, pgId),
        inArray(rentInvoices.status, ['pending', 'overdue']),
        isNotNull(rentInvoices.paymentProofUrl),
      ),
    )
    .orderBy(desc(rentInvoices.updatedAt));
}

export async function approveRentPaymentProof(
  session: AdminSession,
  invoiceId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const [invoice] = await db
    .select()
    .from(rentInvoices)
    .where(eq(rentInvoices.id, invoiceId))
    .limit(1);
  if (!invoice) return { ok: false, message: 'Invoice not found.' };
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, invoice.pgId)) {
    return { ok: false, message: 'Access denied.' };
  }
  if (!invoice.paymentProofUrl) {
    return { ok: false, message: 'No payment photo uploaded.' };
  }
  if (!['pending', 'overdue'].includes(invoice.status)) {
    return { ok: false, message: 'Invoice is not awaiting payment.' };
  }

  const projected = projectInvoice(invoice);
  const amountPaise = projected.outstandingPaise;

  const result = await recordRentPaymentSuccess({
    provider: 'mock',
    offlineProvider: 'upi_manual',
    providerPaymentId: `rent-proof-${invoiceId}`,
    amountPaise,
    invoiceId,
    rawPayload: { source: 'payment_proof', proofUrl: invoice.paymentProofUrl },
  });

  if (!result.ok) return { ok: false, message: result.reason };
  return { ok: true };
}

// ───────────────────────────────────────────────────────────────────────────
// Admin rent edit — recalculate open invoices from booking snapshot
// ───────────────────────────────────────────────────────────────────────────

export async function recalculatePendingRentInvoicesForBooking(args: {
  bookingId: string;
  pricingSnapshot: PricingSnapshot;
  adminId: string;
}): Promise<{
  updatedCount: number;
  invoiceChanges: Array<{
    invoiceId: string;
    billingMonth: string;
    fromPaise: number;
    toPaise: number;
  }>;
}> {
  const monthlyRent = monthlyRentFromSnapshot(args.pricingSnapshot);
  const pending = await db
    .select()
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, args.bookingId),
        inArray(rentInvoices.status, ['pending', 'overdue']),
      ),
    );

  const stay = await loadStayWindow(args.bookingId);
  const invoiceChanges: Array<{
    invoiceId: string;
    billingMonth: string;
    fromPaise: number;
    toPaise: number;
  }> = [];
  const now = new Date();

  for (const inv of pending) {
    if (!stay) continue;
    const prorated = prorateForMonth({
      monthlyRatePaise: monthlyRent,
      billingMonth: inv.billingMonth,
      activeStart: stay.start,
      activeEnd: stay.end ?? '9999-12-31',
    });
    const newPaise = prorated.amountPaise;
    if (newPaise <= 0 || newPaise === inv.rentPaise) continue;

    await db
      .update(rentInvoices)
      .set({ rentPaise: newPaise, updatedAt: now })
      .where(eq(rentInvoices.id, inv.id));

    invoiceChanges.push({
      invoiceId: inv.id,
      billingMonth: inv.billingMonth,
      fromPaise: inv.rentPaise,
      toPaise: newPaise,
    });
  }

  if (invoiceChanges.length > 0) {
    await db.insert(auditLog).values({
      actorType: 'admin',
      actorId: args.adminId,
      entity: 'rent_invoice',
      entityId: args.bookingId,
      action: 'recalculate_pending',
      diff: { invoiceChanges, monthlyRentPaise: monthlyRent },
    });
  }

  return { updatedCount: invoiceChanges.length, invoiceChanges };
}

// Pseudonyms to keep imports tidy in tests.
export const _internals = { nextInvoiceNumber, monthlyRentFromSnapshot, loadStayWindow };
// Suppress unused-import warnings if linter complains; these are used in tests.
void isNotNull; void lte; void or;

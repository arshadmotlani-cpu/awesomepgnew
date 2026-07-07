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
 * Rent amount is read from the billing SSOT chain:
 *   bed_prices (per-bed) → rooms.private_room_monthly_rent_paise (negotiated)
 *   → resident_billing_profiles → pricing snapshot (historical fallback only).
 *
 * Anniversary billing:
 *   - Every invoice is the full monthly rent (no calendar proration).
 *   - Invoices generate on the resident's billing day each month.
 *   - Billing period is shown as e.g. 4 Jul 2026 → 4 Aug 2026.
 *
 * Idempotency:
 *   - UNIQUE(booking_id, billing_month) on rent_invoices.
 *   - Generator inserts ON CONFLICT DO NOTHING.
 *   - Payment recorder probes for the (provider, providerPaymentId) row
 *     first and treats SQLSTATE 23505 on the partial unique index as
 *     "already processed".
 */

import { and, desc, eq, inArray, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  customers,
  financialInvoices,
  floors,
  payments,
  pgs,
  rentInvoices,
  rooms,
  type RentInvoice,
} from '../db/schema';
import type { PricingSnapshot } from '../db/schema/bookings';
import {
  purgeUnpaidRentInvoiceRow,
  shouldPurgeCancelledRentInvoiceForRetry,
} from './expressRentInvoiceRecovery';
import { adminCanAccessPg } from '../lib/auth/roles';
import type { AdminSession } from '../lib/auth/session';
import { addDays, diffDays, formatDate, parseDate, type DateLike } from '../lib/dates';
import { writeAuditLogNonBlocking } from '@/src/lib/audit/writeAuditLog';
import { formatPostgresError } from '@/src/lib/db/postgresError';
import {
  anniversaryBillingPeriod,
  computeLateFee,
  daysOverdue,
  dueDateForBillingDay,
  dueDateForMonth,
  firstOfMonth,
  fullMonthlyRentPaise,
  isResidentActiveOnDate,
  monthBounds,
  rentInvoiceBillingPeriodNote,
} from './billing';
import type { AnyPaymentProvider } from './bookingLifecycle';
import type { ProviderName } from './payments';
import {
  isRentInvoiceCancellable,
  isRentInvoicePaymentLocked,
  logInvoiceStateTransition,
  guardRentStatusTransition,
  type InvoiceTransitionSource,
} from '@/src/lib/billing/invoiceStateMachine';
import {
  isProductionBookingFilter,
  isProductionCustomerFilter,
  isActiveResidentFilter,
  collectibleResidentFilters,
} from '@/src/lib/billing/productionDataFilter';
import {
  getRoomBillingConfigForBed,
  resolvePrivateRoomRentPaise,
  shouldSkipPrivateRoomDuplicate,
} from '@/src/lib/billing/roomBilling';
import {
  ensureBillingProfileForBooking,
  getBillingProfileForBooking,
  syncBillingDayFromCheckIn,
} from '@/src/services/residentBillingProfiles';
import {
  resolveMonthlyRentPaiseForBooking,
  syncBillingProfileRentFromSsot,
} from '@/src/lib/billing/rentPricingSsot';
import {
  clampDueDateOnOrAfterIssueDate,
  resolveRentInvoiceDueDate,
} from '@/src/lib/billing/invoiceDueDate';

const INVOICE_PREFIX = 'RNT';

// ───────────────────────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────────────────────

export type GenerateRentInvoicesInput = {
  /** Any date in the target month — normalised to YYYY-MM-01 internally. */
  billingMonth: DateLike;
  /** Optional: restrict to a single PG (defaults to all). */
  pgId?: string;
  /** Skip tenants whose move-in is after this date (check-in aware auto-billing). */
  asOf?: DateLike;
  /** When set, only these bookings are considered. */
  bookingIds?: string[];
  /** Admin batch: generate even if move-in is after `asOf`. */
  forceAll?: boolean;
  /** Due date = this calendar day of the billing month (e.g. 15). Overrides profile billing day. */
  collectionDueDay?: number;
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
  effectiveStatus: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled' | 'payment_in_progress' | 'expired';
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
  /** Backdate paid_at for express / historical collections. */
  paidAt?: Date;
  /** Skip receipts, automations, and payment-link side effects. */
  historical?: boolean;
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

/** Days after due_date before a pending/overdue invoice auto-expires (never while paying). */
export const RENT_INVOICE_EXPIRE_DAYS_AFTER_DUE = 90;

export type EnsureMonthlyRentInvoiceResult =
  | { ok: true; invoiceId: string; invoiceNumber: string; created: boolean; status: string }
  | { ok: false; error: string };

async function ensureFixedStayRentInvoice(input: {
  bookingId: string;
  billingMonth: string;
  amountPaise?: number;
}): Promise<EnsureMonthlyRentInvoiceResult> {
  const [existing] = await db
    .select({
      id: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
      status: rentInvoices.status,
      rentPaise: rentInvoices.rentPaise,
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      paymentId: rentInvoices.paymentId,
      cancellationReason: rentInvoices.cancellationReason,
    })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, input.bookingId),
        eq(rentInvoices.billingMonth, input.billingMonth),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.status === 'payment_in_progress') {
      return {
        ok: false,
        error: 'Rent payment is in progress for this month — cannot modify or re-collect.',
      };
    }
    if (existing.status === 'paid') {
      return {
        ok: true,
        invoiceId: existing.id,
        invoiceNumber: existing.invoiceNumber,
        created: false,
        status: existing.status,
      };
    }
    if (existing.status === 'cancelled') {
      if (shouldPurgeCancelledRentInvoiceForRetry(existing)) {
        await purgeUnpaidRentInvoiceRow(existing.id);
        // Fall through — createAdhocRentInvoice below.
      } else {
        return {
          ok: false,
          error: 'Rent invoice was cancelled. Re-generate from the billing queue first.',
        };
      }
    } else {
      if (input.amountPaise && input.amountPaise !== existing.rentPaise) {
        await db
          .update(rentInvoices)
          .set({ rentPaise: input.amountPaise, updatedAt: new Date() })
          .where(eq(rentInvoices.id, existing.id));
        const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
        await syncRentInvoiceToUnified(existing.id);
      }
      return {
        ok: true,
        invoiceId: existing.id,
        invoiceNumber: existing.invoiceNumber,
        created: false,
        status: existing.status,
      };
    }
  }

  const [ctx] = await db
    .select({
      customerId: bookings.customerId,
      bedId: bedReservations.bedId,
      pgId: pgs.id,
      totalPaise: bookings.totalPaise,
      depositPaise: bookings.depositPaise,
      stayStart: sql<string>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD')`,
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
    .where(eq(bookings.id, input.bookingId))
    .limit(1);

  if (!ctx?.bedId || !ctx.pgId) {
    return { ok: false, error: 'Booking bed context missing for fixed-stay rent invoice.' };
  }

  const amountPaise =
    input.amountPaise ?? Math.max(0, ctx.totalPaise - ctx.depositPaise);
  if (amountPaise <= 0) {
    return { ok: false, error: 'Fixed-stay rent amount must be greater than zero.' };
  }

  const created = await createAdhocRentInvoice({
    bookingId: input.bookingId,
    customerId: ctx.customerId,
    bedId: ctx.bedId,
    pgId: ctx.pgId,
    amountPaise,
    title: 'Fixed stay rent',
    dueDate: resolveRentInvoiceDueDate({
      stayStart: ctx.stayStart,
      issueDate: new Date(),
    }),
  });

  if (!created.ok) {
    return { ok: false, error: created.error };
  }

  const [row] = await db
    .select({ status: rentInvoices.status })
    .from(rentInvoices)
    .where(eq(rentInvoices.id, created.invoiceId))
    .limit(1);

  return {
    ok: true,
    invoiceId: created.invoiceId,
    invoiceNumber: created.invoiceNumber,
    created: true,
    status: row?.status ?? 'pending',
  };
}

/**
 * Return the canonical monthly rent invoice for a booking/month.
 * Creates via the idempotent generator when missing — never adhoc.
 */
export async function ensureMonthlyRentInvoice(input: {
  bookingId: string;
  billingMonth?: DateLike;
  amountPaise?: number;
  /** Express walk-in / collection — auto-recover cancelled tombstones on retry. */
  expressWalkInRetry?: boolean;
}): Promise<EnsureMonthlyRentInvoiceResult> {
  const billingMonth = firstOfMonth(input.billingMonth ?? new Date());
  await ensureBillingProfileForBooking(input.bookingId);

  const [bookingMeta] = await db
    .select({ durationMode: bookings.durationMode })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);

  if (bookingMeta?.durationMode === 'fixed_stay') {
    return ensureFixedStayRentInvoice({
      bookingId: input.bookingId,
      billingMonth,
      amountPaise: input.amountPaise,
    });
  }

  const [existing] = await db
    .select({
      id: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
      status: rentInvoices.status,
      rentPaise: rentInvoices.rentPaise,
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      paymentId: rentInvoices.paymentId,
      cancellationReason: rentInvoices.cancellationReason,
    })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, input.bookingId),
        eq(rentInvoices.billingMonth, billingMonth),
        eq(rentInvoices.isAdhoc, false),
      ),
    )
    .limit(1);

  if (existing) {
    if (existing.status === 'payment_in_progress') {
      return {
        ok: false,
        error: 'Rent payment is in progress for this month — cannot modify or re-collect.',
      };
    }
    if (existing.status === 'paid') {
      return {
        ok: true,
        invoiceId: existing.id,
        invoiceNumber: existing.invoiceNumber,
        created: false,
        status: existing.status,
      };
    }
    if (existing.status === 'cancelled') {
      const expressTombstone =
        input.expressWalkInRetry ||
        shouldPurgeCancelledRentInvoiceForRetry(existing);
      if (expressTombstone) {
        await purgeUnpaidRentInvoiceRow(existing.id);
        // Fall through — generate a fresh invoice below.
      } else {
        return {
          ok: false,
          error: 'Monthly invoice was cancelled. Re-generate from the billing queue first.',
        };
      }
    } else {
      if (input.amountPaise && input.amountPaise !== existing.rentPaise) {
        await db
          .update(rentInvoices)
          .set({ rentPaise: input.amountPaise, updatedAt: new Date() })
          .where(eq(rentInvoices.id, existing.id));
        const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
        await syncRentInvoiceToUnified(existing.id);
      }
      return {
        ok: true,
        invoiceId: existing.id,
        invoiceNumber: existing.invoiceNumber,
        created: false,
        status: existing.status,
      };
    }
  }

  await generateRentInvoicesForMonth({
    billingMonth,
    bookingIds: [input.bookingId],
    forceAll: true,
  });

  const [created] = await db
    .select({
      id: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
      status: rentInvoices.status,
    })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, input.bookingId),
        eq(rentInvoices.billingMonth, billingMonth),
        eq(rentInvoices.isAdhoc, false),
      ),
    )
    .limit(1);

  if (!created) {
    return { ok: false, error: 'Could not generate monthly rent invoice for this booking.' };
  }

  return {
    ok: true,
    invoiceId: created.id,
    invoiceNumber: created.invoiceNumber,
    created: true,
    status: created.status,
  };
}

export type BillingCycleOperationRow = {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerFullName: string;
  customerPhone: string;
  bookingId: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  rentPaise: number;
  dueDate: string;
  billingMonth: string;
  status: string;
  daysUntilDue: number;
};

/** Invoices due within the next day (operations visibility window). */
export async function listBillingCycleOperations(
  asOf: DateLike = formatDate(new Date()),
): Promise<{ dueSoon: BillingCycleOperationRow[]; generatedPending: BillingCycleOperationRow[] }> {
  const today = formatDate(parseDate(asOf));
  const tomorrow = formatDate(addDays(today, 1));

  const rows = await db
    .select({
      invoiceId: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
      customerId: rentInvoices.customerId,
      customerFullName: customers.fullName,
      customerPhone: customers.phone,
      bookingId: rentInvoices.bookingId,
      pgId: rentInvoices.pgId,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
      rentPaise: rentInvoices.rentPaise,
      dueDate: rentInvoices.dueDate,
      billingMonth: rentInvoices.billingMonth,
      status: rentInvoices.status,
    })
    .from(rentInvoices)
    .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .innerJoin(pgs, eq(pgs.id, rentInvoices.pgId))
    .innerJoin(beds, eq(beds.id, rentInvoices.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(
      and(
        collectibleResidentFilters(),
        eq(rentInvoices.isAdhoc, false),
        inArray(rentInvoices.status, ['pending', 'overdue']),
        sql`${rentInvoices.dueDate} >= ${today}::date`,
        sql`${rentInvoices.dueDate} <= ${tomorrow}::date`,
      ),
    );

  const dueSoon: BillingCycleOperationRow[] = rows.map((r) => ({
    ...r,
    roomNumber: r.roomNumber ?? '',
    daysUntilDue: diffDays(today, r.dueDate),
  }));

  const currentMonth = firstOfMonth(today);
  const generatedRows = await db
    .select({
      invoiceId: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
      customerId: rentInvoices.customerId,
      customerFullName: customers.fullName,
      customerPhone: customers.phone,
      bookingId: rentInvoices.bookingId,
      pgId: rentInvoices.pgId,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
      rentPaise: rentInvoices.rentPaise,
      dueDate: rentInvoices.dueDate,
      billingMonth: rentInvoices.billingMonth,
      status: rentInvoices.status,
    })
    .from(rentInvoices)
    .innerJoin(bookings, eq(bookings.id, rentInvoices.bookingId))
    .innerJoin(customers, eq(customers.id, rentInvoices.customerId))
    .innerJoin(pgs, eq(pgs.id, rentInvoices.pgId))
    .innerJoin(beds, eq(beds.id, rentInvoices.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .where(
      and(
        collectibleResidentFilters(),
        eq(rentInvoices.isAdhoc, false),
        eq(rentInvoices.billingMonth, currentMonth),
        eq(rentInvoices.status, 'pending'),
        sql`${rentInvoices.dueDate} > ${tomorrow}::date`,
      ),
    );

  const generatedPending: BillingCycleOperationRow[] = generatedRows.map((r) => ({
    ...r,
    roomNumber: r.roomNumber ?? '',
    daysUntilDue: diffDays(today, r.dueDate),
  }));

  return { dueSoon, generatedPending };
}

// ───────────────────────────────────────────────────────────────────────────
// generateRentInvoicesForMonth — idempotent
// ───────────────────────────────────────────────────────────────────────────

export async function generateRentInvoicesForMonth(
  input: GenerateRentInvoicesInput,
): Promise<GenerateRentInvoicesResult> {
  const billingMonth = firstOfMonth(input.billingMonth);
  const asOf = formatDate(parseDate(input.asOf ?? new Date()));
  const { start: monthStart, end: monthEnd } = monthBounds(billingMonth);
  const monthStartIso = formatDate(monthStart);
  const monthEndIso = formatDate(monthEnd);
  /** Booking checkout approval — future move-in is valid; skip "occupied today" gate. */
  const targetedBookingGeneration =
    input.forceAll === true && (input.bookingIds?.length ?? 0) > 0;

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
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.status, 'confirmed'),
        isProductionBookingFilter(),
        isProductionCustomerFilter(),
        targetedBookingGeneration ? undefined : isActiveResidentFilter(),
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
        eq(bedReservations.status, 'active'),
        sql`${bedReservations.stayRange} && daterange(${monthStartIso}::date, ${monthEndIso}::date, '[)')`,
        targetedBookingGeneration && input.bookingIds?.length
          ? inArray(bookings.id, input.bookingIds)
          : undefined,
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
    if (input.bookingIds?.length && !input.bookingIds.includes(c.bookingId)) {
      skipped += 1;
      continue;
    }

    await syncBillingProfileRentFromSsot(c.bookingId, billingMonth);
    let profile = await getBillingProfileForBooking(c.bookingId);
    if (!profile) {
      profile = await ensureBillingProfileForBooking(c.bookingId);
    }
    if (profile && !profile.autoGenerate) {
      skipped += 1;
      continue;
    }

    const resolved = await resolveMonthlyRentPaiseForBooking(c.bookingId, billingMonth);
    let monthlyRent = resolved.rentPaise;
    if (monthlyRent <= 0) {
      monthlyRent =
        profile?.rentAmountPaise ?? monthlyRentFromSnapshot(c.pricingSnapshot);
    }
    if (monthlyRent <= 0) {
      skipped += 1;
      continue;
    }

    const roomConfig = await getRoomBillingConfigForBed(c.bedId);
    if (roomConfig?.billingMode === 'private_room') {
      const dup = await shouldSkipPrivateRoomDuplicate({
        roomId: roomConfig.roomId,
        billingMonth,
        bookingId: c.bookingId,
        bedId: c.bedId,
      });
      if (dup.skip) {
        skipped += 1;
        continue;
      }
      if (resolved.source !== 'private_room_config') {
        monthlyRent = resolvePrivateRoomRentPaise(
          roomConfig,
          monthlyRent,
          monthlyRentFromSnapshot(c.pricingSnapshot),
        );
      }
    }

    const billingDay = profile?.billingDay ?? 5;

    // Pro-rate against the resident's active window.
    const stay = await loadStayWindow(c.bookingId);
    if (!stay) {
      skipped += 1;
      continue;
    }

    if (!input.forceAll && !input.bookingIds?.length && stay.start > asOf) {
      skipped += 1;
      continue;
    }

    const calendarDue =
      input.collectionDueDay != null
        ? formatDate(dueDateForBillingDay(billingMonth, input.collectionDueDay))
        : formatDate(dueDateForBillingDay(billingMonth, billingDay));
    const dueDate =
      input.collectionDueDay != null
        ? calendarDue
        : stay.start > calendarDue
          ? formatDate(addDays(stay.start, 4))
          : calendarDue;

    const rentPaise = fullMonthlyRentPaise(monthlyRent);
    if (rentPaise <= 0) {
      skipped += 1;
      continue;
    }

    const anniversaryDate = dueDate;
    if (!isResidentActiveOnDate(stay, anniversaryDate)) {
      skipped += 1;
      continue;
    }

    const billingPeriod = anniversaryBillingPeriod(anniversaryDate, billingDay);
    const invoiceNotes = rentInvoiceBillingPeriodNote(
      billingPeriod.periodStart,
      billingPeriod.periodEnd,
    );

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
            rentPaise,
            status: 'pending',
            notes: invoiceNotes,
          })
          .onConflictDoNothing({
            target: [rentInvoices.bookingId, rentInvoices.billingMonth],
            where: sql`${rentInvoices.isAdhoc} = false`,
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
      await syncRentInvoiceToUnified(inserted.id);
      await db.insert(auditLog).values({
        actorType: 'system',
        actorId: null,
        entity: 'rent_invoice',
        entityId: inserted.id,
        action: 'generated',
        diff: {
          bookingId: c.bookingId,
          billingMonth,
          rentPaise,
          billingPeriod,
        },
      });
      const { notifyRentReminder } = await import('@/src/lib/email/notifications');
      notifyRentReminder({
        customerId: c.customerId,
        billingMonth,
        amountPaise: rentPaise,
        dueDate,
      });
    } else {
      // ON CONFLICT no-op (invoice for this booking+month already exists).
      skipped += 1;
    }
  }

  if (created > 0) {
    const { scheduleAdminNotificationSync } = await import('@/src/services/adminLiveSync');
    scheduleAdminNotificationSync();
  }

  return {
    billingMonth,
    candidateBookings: candidates.length,
    invoicesCreated: created,
    invoicesSkipped: skipped,
    invoiceIds,
  };
}

export type GenerateRentInvoiceForBookingResult =
  | { ok: true; created: boolean; invoiceId: string; invoiceNumber: string }
  | { ok: false; error: string; code?: string };

/** Idempotent single-booking rent invoice for anniversary scheduler + retry. */
export async function generateRentInvoiceForBookingAnniversary(input: {
  bookingId: string;
  billingMonth: DateLike;
}): Promise<GenerateRentInvoiceForBookingResult> {
  const billingMonth = firstOfMonth(input.billingMonth);
  const [existing] = await db
    .select({
      id: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
    })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, input.bookingId),
        eq(rentInvoices.billingMonth, billingMonth),
        eq(rentInvoices.isAdhoc, false),
      ),
    )
    .limit(1);

  if (existing) {
    return {
      ok: true,
      created: false,
      invoiceId: existing.id,
      invoiceNumber: existing.invoiceNumber,
    };
  }

  const result = await generateRentInvoicesForMonth({
    billingMonth,
    bookingIds: [input.bookingId],
    forceAll: true,
  });

  const [created] = await db
    .select({
      id: rentInvoices.id,
      invoiceNumber: rentInvoices.invoiceNumber,
    })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, input.bookingId),
        eq(rentInvoices.billingMonth, billingMonth),
        eq(rentInvoices.isAdhoc, false),
      ),
    )
    .limit(1);

  if (!created) {
    return {
      ok: false,
      error: 'Invoice was not created',
      code: result.invoicesCreated > 0 ? 'race' : 'skipped',
    };
  }

  const { residentBillingProfiles } = await import('@/src/db/schema');
  await db
    .update(residentBillingProfiles)
    .set({
      lastAutoGeneratedAt: new Date(),
      lastAutoBillingMonth: billingMonth,
      updatedAt: new Date(),
    })
    .where(eq(residentBillingProfiles.bookingId, input.bookingId));

  return {
    ok: true,
    created: true,
    invoiceId: created.id,
    invoiceNumber: created.invoiceNumber,
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
    await syncManyToUnified(
      rows.map((r) => r.id),
      'rent',
    );
  }
  return { updated: rows.length, updatedInvoiceIds: rows.map((r) => r.id) };
}

/**
 * Expire stale pending/overdue invoices past due + grace window.
 * Never touches payment_in_progress or paid invoices.
 */
export async function expireRentInvoicesPastDue(
  opts?: { asOf?: DateLike; daysAfterDue?: number },
): Promise<{ expired: number; expiredInvoiceIds: string[] }> {
  const today = formatDate(parseDate(opts?.asOf ?? new Date()));
  const grace = opts?.daysAfterDue ?? RENT_INVOICE_EXPIRE_DAYS_AFTER_DUE;
  const cutoff = formatDate(addDays(today, -grace));

  const rows = await db
    .update(rentInvoices)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(
      and(
        inArray(rentInvoices.status, ['pending', 'overdue']),
        sql`${rentInvoices.dueDate} < ${cutoff}::date`,
        isNull(rentInvoices.paymentProofUrl),
        isNull(rentInvoices.paymentId),
      ),
    )
    .returning({ id: rentInvoices.id });

  for (const row of rows) {
    logInvoiceStateTransition({
      invoiceId: row.id,
      layer: 'rent',
      previousStatus: 'pending_or_overdue',
      newStatus: 'expired',
      source: 'cron',
    });
  }

  if (rows.length > 0) {
    const { syncManyToUnified } = await import('@/src/services/unifiedInvoices');
    await syncManyToUnified(
      rows.map((r) => r.id),
      'rent',
    );
  }

  return { expired: rows.length, expiredInvoiceIds: rows.map((r) => r.id) };
}

// ───────────────────────────────────────────────────────────────────────────
// markRentInvoicePaidFromExistingPayment — link invoice to an existing payment
// ───────────────────────────────────────────────────────────────────────────

export async function markRentInvoicePaidFromExistingPayment(input: {
  invoiceId: string;
  paymentId: string;
  principalPaise: number;
  paidAt?: Date;
  source?: InvoiceTransitionSource;
  meta?: Record<string, unknown>;
}): Promise<
  | { ok: true; invoiceId: string; stateChanged: boolean }
  | { ok: false; reason: string }
> {
  if (input.principalPaise <= 0) {
    return { ok: false, reason: 'principalPaise must be > 0' };
  }

  const [invoice] = await db
    .select({
      id: rentInvoices.id,
      bookingId: rentInvoices.bookingId,
      status: rentInvoices.status,
      rentPaise: rentInvoices.rentPaise,
      paymentId: rentInvoices.paymentId,
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      paidLateFeePaise: rentInvoices.paidLateFeePaise,
    })
    .from(rentInvoices)
    .where(eq(rentInvoices.id, input.invoiceId))
    .limit(1);

  if (!invoice) {
    return { ok: false, reason: `no rent invoice ${input.invoiceId}` };
  }
  if (invoice.status === 'cancelled') {
    return { ok: false, reason: 'invoice is cancelled' };
  }
  if (invoice.status === 'paid') {
    if (invoice.paymentId === input.paymentId) {
      return { ok: true, invoiceId: invoice.id, stateChanged: false };
    }
    if (!invoice.paymentId) {
      await db
        .update(rentInvoices)
        .set({ paymentId: input.paymentId, updatedAt: new Date() })
        .where(eq(rentInvoices.id, invoice.id));
      return { ok: true, invoiceId: invoice.id, stateChanged: true };
    }
    return { ok: true, invoiceId: invoice.id, stateChanged: false };
  }

  const paidAt = input.paidAt ?? new Date();
  const principal = Math.min(input.principalPaise, invoice.rentPaise);
  const fullyPaid = principal >= invoice.rentPaise;

  await db
    .update(rentInvoices)
    .set({
      status: fullyPaid ? 'paid' : invoice.status,
      paidPrincipalPaise: principal,
      paidLateFeePaise: 0,
      lateFeeLockedPaise: fullyPaid ? 0 : undefined,
      paymentId: fullyPaid ? input.paymentId : null,
      paidAt: fullyPaid ? paidAt : undefined,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(rentInvoices.id, invoice.id),
        inArray(rentInvoices.status, ['pending', 'overdue', 'payment_in_progress']),
      ),
    );

  if (fullyPaid) {
    logInvoiceStateTransition({
      invoiceId: invoice.id,
      layer: 'rent',
      previousStatus: invoice.status,
      newStatus: 'paid',
      source: input.source ?? 'webhook',
      meta: { paymentId: input.paymentId, ...input.meta },
    });
  }

  await db.insert(auditLog).values({
    actorType: 'system',
    actorId: null,
    entity: 'rent_invoice',
    entityId: invoice.id,
    action: fullyPaid ? 'paid' : 'partial_payment',
    diff: {
      source: input.source ?? 'booking_payment',
      paymentId: input.paymentId,
      principalPaise: principal,
      rentPaise: invoice.rentPaise,
      meta: input.meta ?? null,
    },
  });

  return { ok: true, invoiceId: invoice.id, stateChanged: fullyPaid };
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
      discountPaise: rentInvoices.discountPaise,
      billingMonth: rentInvoices.billingMonth,
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      paidLateFeePaise: rentInvoices.paidLateFeePaise,
      lateFeeLockedPaise: rentInvoices.lateFeeLockedPaise,
      paymentId: rentInvoices.paymentId,
      paymentProofUrl: rentInvoices.paymentProofUrl,
      proofSubmittedAt: rentInvoices.proofSubmittedAt,
      proofSnapshotOutstandingPaise: rentInvoices.proofSnapshotOutstandingPaise,
      proofSnapshotLateFeePaise: rentInvoices.proofSnapshotLateFeePaise,
      proofSnapshotPrincipalDuePaise: rentInvoices.proofSnapshotPrincipalDuePaise,
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
  if (isRentInvoicePaymentLocked(invoice.status) && invoice.status !== 'payment_in_progress') {
    return {
      ok: true,
      paymentId: invoice.paymentId ?? '',
      invoiceId: invoice.id,
      stateChanged: false,
    };
  }

  if (!['pending', 'overdue', 'payment_in_progress'].includes(invoice.status)) {
    return { ok: false, reason: `invoice is not payable (status=${invoice.status})` };
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

  if (invoice.status === 'paid') {
    return {
      ok: true,
      paymentId: '',
      invoiceId: invoice.id,
      stateChanged: false,
    };
  }

  const projected = projectInvoice(invoice as RentInvoice);
  const maxPayablePaise =
    rentProofApprovalAmountPaise(invoice as RentInvoice) ?? projected.outstandingPaise;
  if (input.amountPaise <= 0) {
    return { ok: false, reason: 'payment amount must be > 0' };
  }
  if (input.amountPaise > maxPayablePaise) {
    return {
      ok: false,
      reason: `payment ${input.amountPaise} exceeds outstanding ${maxPayablePaise}`,
    };
  }

  const rentDuePaise = computeRentDuePaise(invoice.rentPaise, invoice.discountPaise);
  const snapshotLateFee = rentProofSnapshotLateFeeOwedPaise(invoice as RentInvoice);
  const lateFee = input.historical
    ? 0
    : snapshotLateFee != null
      ? (invoice.proofSnapshotLateFeePaise ?? 0)
      : computeLateFee({
          rentPaise: rentDuePaise,
          billingMonth: invoice.billingMonth,
        });

  let remaining = input.amountPaise;
  const lateOwed = Math.max(0, lateFee - invoice.paidLateFeePaise);
  const latePaid = Math.min(remaining, lateOwed);
  remaining -= latePaid;
  const principalOwed = Math.max(0, rentDuePaise - invoice.paidPrincipalPaise);
  const principalPaid = Math.min(remaining, principalOwed);
  const newPaidLate = invoice.paidLateFeePaise + latePaid;
  const newPaidPrincipal = invoice.paidPrincipalPaise + principalPaid;
  const newOutstanding = rentDuePaise + lateFee - newPaidPrincipal - newPaidLate;
  const fullyPaid = newOutstanding <= 0;
  const paidAt = input.paidAt ?? new Date();

  let paymentId: string;
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
          paidAt,
        })
        .returning({ id: payments.id });

      await tx
        .update(rentInvoices)
        .set({
          status: fullyPaid ? 'paid' : invoice.status === 'overdue' ? 'overdue' : 'pending',
          paidPrincipalPaise: newPaidPrincipal,
          paidLateFeePaise: newPaidLate,
          lateFeeLockedPaise: fullyPaid ? lateFee : invoice.lateFeeLockedPaise,
          paymentId: fullyPaid ? payment.id : null,
          paidAt: fullyPaid ? paidAt : undefined,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(rentInvoices.id, invoice.id),
            inArray(rentInvoices.status, ['pending', 'overdue', 'payment_in_progress']),
          ),
        );

      if (fullyPaid) {
        logInvoiceStateTransition({
          invoiceId: invoice.id,
          layer: 'rent',
          previousStatus: invoice.status,
          newStatus: 'paid',
          source: 'webhook',
          meta: { providerPaymentId: input.providerPaymentId },
        });
      }

      const {
        syncRentInvoiceToUnifiedInTx,
        recordBillingSettlementEventInTx,
      } = await import('@/src/lib/billing/syncUnifiedInvoiceInTx');
      const unifiedInvoiceId = await syncRentInvoiceToUnifiedInTx(tx, invoice.id);
      await recordBillingSettlementEventInTx(tx, {
        purpose: 'rent',
        sourceTable: 'rent_invoices',
        sourceInvoiceId: invoice.id,
        paymentId: payment.id,
        unifiedInvoiceId,
        providerPaymentId: input.providerPaymentId,
        amountPaise: input.amountPaise,
      });

      return { paymentId: payment.id };
    });
    paymentId = result.paymentId;
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
    return { ok: false, reason: formatPostgresError(err) };
  }

  const auditResult = await writeAuditLogNonBlocking(db, {
    actorType: 'system',
    actorId: null,
    entity: 'rent_invoice',
    entityId: invoice.id,
    action: fullyPaid ? 'paid' : 'partial_payment',
    diff: {
      provider,
      providerPaymentId: input.providerPaymentId,
      amountPaise: input.amountPaise,
      rentPaise: invoice.rentPaise,
      paidPrincipalPaise: newPaidPrincipal,
      paidLateFeePaise: newPaidLate,
      lateFeeLockedPaise: fullyPaid ? lateFee : invoice.lateFeeLockedPaise,
      outstandingPaise: Math.max(0, newOutstanding),
    },
  });
  if (!auditResult.ok) {
    console.error(
      '[rent-payment] payment recorded but audit_log insert failed',
      auditResult.error,
    );
  }

  if (!input.historical) {
    try {
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
          paymentId,
          amountPaise: input.amountPaise,
          pgName: automationCtx.pgName,
          customerName: automationCtx.customerName,
          paymentPurpose: 'rent',
        });
      }
    } catch (sideEffectErr) {
      console.error('[rent-payment] post-payment side effects failed', sideEffectErr);
    }
  }

  if (fullyPaid && !input.historical) {
    try {
      const { creditReferralEarningOnBookingPayment } = await import('./referrals');
      await creditReferralEarningOnBookingPayment({
        bookingId: invoice.bookingId,
        rentSubtotalPaise: rentDuePaise,
      });
    } catch (referralErr) {
      console.error('referral earning credit on rent payment failed:', referralErr);
    }
  }

  return {
    ok: true,
    paymentId,
    invoiceId: invoice.id,
    stateChanged: true,
  };
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

/** Rows from joins may omit new promo / proof-snapshot columns until migration runs. */
export type RentInvoiceProjectInput = Omit<
  RentInvoice,
  'discountPaise' | 'promoCode' | 'proofSubmittedAt' | 'proofSnapshotOutstandingPaise' | 'proofSnapshotLateFeePaise' | 'proofSnapshotPrincipalDuePaise'
> & {
  discountPaise?: number;
  promoCode?: string | null;
  proofSubmittedAt?: Date | null;
  proofSnapshotOutstandingPaise?: number | null;
  proofSnapshotLateFeePaise?: number | null;
  proofSnapshotPrincipalDuePaise?: number | null;
};

export type ProjectInvoiceOptions = {
  /** When true, always accrue late fees live (used when capturing proof snapshot). */
  bypassProofSnapshot?: boolean;
};

function hasFrozenProofSnapshot(
  invoice: RentInvoiceProjectInput,
): invoice is RentInvoiceProjectInput & { proofSnapshotOutstandingPaise: number } {
  return (
    invoice.proofSnapshotOutstandingPaise != null &&
    invoice.proofSnapshotOutstandingPaise >= 0 &&
    Boolean(invoice.paymentProofUrl)
  );
}

/** Financial snapshot frozen at payment-proof upload — SSOT for review + approval. */
export function buildRentProofFinancialSnapshot(
  invoice: RentInvoiceProjectInput,
  submittedAt: Date = new Date(),
): {
  proofSubmittedAt: Date;
  proofSnapshotOutstandingPaise: number;
  proofSnapshotLateFeePaise: number;
  proofSnapshotPrincipalDuePaise: number;
} {
  const live = projectInvoice(invoice, formatDate(submittedAt), { bypassProofSnapshot: true });
  const rentDuePaise = computeRentDuePaise(invoice.rentPaise, invoice.discountPaise);
  const principalDuePaise = Math.max(0, rentDuePaise - (invoice.paidPrincipalPaise ?? 0));
  return {
    proofSubmittedAt: submittedAt,
    proofSnapshotOutstandingPaise: live.outstandingPaise,
    proofSnapshotLateFeePaise: live.accruedLateFeePaise,
    proofSnapshotPrincipalDuePaise: principalDuePaise,
  };
}

/**
 * Backfill missing paise columns for legacy rows that only have proof_submitted_at.
 * Reconstructs amounts as-of submission time — never uses approval-time accrual.
 */
export async function ensureRentProofSnapshot(
  invoiceId: string,
): Promise<RentInvoice | null> {
  const [invoice] = await db
    .select()
    .from(rentInvoices)
    .where(eq(rentInvoices.id, invoiceId))
    .limit(1);
  if (!invoice?.paymentProofUrl) return invoice ?? null;
  if (invoice.proofSnapshotOutstandingPaise != null) return invoice;

  const anchor = invoice.proofSubmittedAt ?? invoice.updatedAt;
  const snapshot = buildRentProofFinancialSnapshot(invoice, anchor);

  const [updated] = await db
    .update(rentInvoices)
    .set({
      proofSubmittedAt: invoice.proofSubmittedAt ?? snapshot.proofSubmittedAt,
      proofSnapshotOutstandingPaise: snapshot.proofSnapshotOutstandingPaise,
      proofSnapshotLateFeePaise: snapshot.proofSnapshotLateFeePaise,
      proofSnapshotPrincipalDuePaise: snapshot.proofSnapshotPrincipalDuePaise,
      updatedAt: new Date(),
    })
    .where(eq(rentInvoices.id, invoiceId))
    .returning();

  return updated ?? invoice;
}

/** Outstanding paise for admin proof approval — always the frozen snapshot. */
export function rentProofApprovalAmountPaise(invoice: RentInvoiceProjectInput): number | null {
  if (!hasFrozenProofSnapshot(invoice)) return null;
  return Math.max(
    0,
    invoice.proofSnapshotOutstandingPaise -
      (invoice.paidPrincipalPaise ?? 0) -
      (invoice.paidLateFeePaise ?? 0),
  );
}

/** Net rent principal still owed per proof snapshot (for settlement allocation). */
export function rentProofSnapshotPrincipalOwedPaise(invoice: RentInvoiceProjectInput): number | null {
  if (!hasFrozenProofSnapshot(invoice)) return null;
  if (invoice.proofSnapshotPrincipalDuePaise != null) {
    return Math.max(0, invoice.proofSnapshotPrincipalDuePaise);
  }
  const rentDuePaise = computeRentDuePaise(invoice.rentPaise, invoice.discountPaise);
  return Math.max(0, rentDuePaise - (invoice.paidPrincipalPaise ?? 0));
}

/** Late fee owed per proof snapshot (for settlement allocation). */
export function rentProofSnapshotLateFeeOwedPaise(invoice: RentInvoiceProjectInput): number | null {
  if (!hasFrozenProofSnapshot(invoice)) return null;
  const frozenLate = invoice.proofSnapshotLateFeePaise ?? 0;
  return Math.max(0, frozenLate - (invoice.paidLateFeePaise ?? 0));
}

/** Net rent principal due after promo discount — SSOT for all billing surfaces. */
export function computeRentDuePaise(
  rentPaise: number,
  discountPaise?: number | null,
): number {
  return Math.max(0, rentPaise - (discountPaise ?? 0));
}

/**
 * Augment a stored `rent_invoices` row with late fee and effective UI status.
 *
 * - Before proof upload: late fee accrues live from billing month / due date.
 * - After proof upload: uses `proof_snapshot_*` — payable never moves during review.
 * - After payment: uses `late_fee_locked_paise`.
 */
export function projectInvoice(
  invoice: RentInvoiceProjectInput,
  asOf: DateLike = formatDate(new Date()),
  options?: ProjectInvoiceOptions,
): RentInvoiceView {
  const inv: RentInvoice = {
    ...invoice,
    discountPaise: invoice.discountPaise ?? 0,
    promoCode: invoice.promoCode ?? null,
    proofSubmittedAt: invoice.proofSubmittedAt ?? null,
    proofSnapshotOutstandingPaise: invoice.proofSnapshotOutstandingPaise ?? null,
    proofSnapshotLateFeePaise: invoice.proofSnapshotLateFeePaise ?? null,
    proofSnapshotPrincipalDuePaise: invoice.proofSnapshotPrincipalDuePaise ?? null,
  };
  if (inv.status === 'paid') {
    return {
      ...inv,
      accruedLateFeePaise: inv.lateFeeLockedPaise ?? 0,
      outstandingPaise: 0,
      effectiveStatus: 'paid',
    };
  }
  if (inv.status === 'cancelled') {
    return {
      ...inv,
      accruedLateFeePaise: 0,
      outstandingPaise: 0,
      effectiveStatus: 'cancelled',
    };
  }
  if (inv.status === 'expired') {
    return {
      ...inv,
      accruedLateFeePaise: 0,
      outstandingPaise: 0,
      effectiveStatus: 'expired',
    };
  }

  if (!options?.bypassProofSnapshot && hasFrozenProofSnapshot(inv)) {
    const accruedLateFeePaise = inv.proofSnapshotLateFeePaise ?? 0;
    const outstandingPaise = Math.max(
      0,
      inv.proofSnapshotOutstandingPaise -
        inv.paidPrincipalPaise -
        inv.paidLateFeePaise,
    );
    return {
      ...inv,
      accruedLateFeePaise,
      outstandingPaise,
      effectiveStatus: 'payment_in_progress',
    };
  }

  const rentDuePaise = computeRentDuePaise(inv.rentPaise, inv.discountPaise);
  if (inv.status === 'payment_in_progress') {
    const lateFee = computeLateFee({
      rentPaise: rentDuePaise,
      billingMonth: inv.billingMonth,
      today: asOf,
    });
    const outstandingPaise = Math.max(
      0,
      rentDuePaise + lateFee - inv.paidPrincipalPaise - inv.paidLateFeePaise,
    );
    return {
      ...inv,
      accruedLateFeePaise: lateFee,
      outstandingPaise,
      effectiveStatus: 'payment_in_progress',
    };
  }
  const lateFee = computeLateFee({
    rentPaise: rentDuePaise,
    billingMonth: inv.billingMonth,
    today: asOf,
  });
  const outstanding = rentDuePaise + lateFee
    - inv.paidPrincipalPaise
    - inv.paidLateFeePaise;
  const outstandingPaise = Math.max(0, outstanding);
  const hasPartial =
    outstandingPaise > 0 &&
    (inv.paidPrincipalPaise > 0 || inv.paidLateFeePaise > 0);
  const effectiveStatus = hasPartial
    ? 'partial'
    : daysOverdue(inv.billingMonth, asOf) > 0
      ? 'overdue'
      : 'pending';
  return {
    ...inv,
    accruedLateFeePaise: lateFee,
    outstandingPaise,
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
    await syncManyToUnified(
      rows.map((r) => r.id),
      'rent',
    );
  }
  return { cancelled: rows.length, ids: rows.map((r) => r.id) };
}

// Re-exports so callers don't have to import from two places.
export { customers };

export async function createAdhocRentInvoice(input: {
  bookingId: string;
  customerId: string;
  bedId: string;
  pgId: string;
  amountPaise: number;
  title: string;
  description?: string;
  dueDate?: string;
}): Promise<
  | { ok: true; invoiceId: string; invoiceNumber: string }
  | { ok: false; error: string }
> {
  if (input.amountPaise <= 0) {
    return { ok: false, error: 'Amount must be greater than zero.' };
  }

  const billingMonth = firstOfMonth(formatDate(new Date()));
  const dueDate = resolveRentInvoiceDueDate({
    explicitDueDate: input.dueDate,
    issueDate: new Date(),
  });
  const notes = input.description?.trim()
    ? `${input.title.trim()} — ${input.description.trim()}`
    : input.title.trim();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const invoiceNumber = await nextInvoiceNumber(billingMonth, attempt);
    try {
      const [row] = await db
        .insert(rentInvoices)
        .values({
          invoiceNumber,
          bookingId: input.bookingId,
          customerId: input.customerId,
          bedId: input.bedId,
          pgId: input.pgId,
          billingMonth,
          dueDate,
          rentPaise: input.amountPaise,
          status: 'pending',
          notes,
          isAdhoc: true,
        })
        .returning({
          id: rentInvoices.id,
          invoiceNumber: rentInvoices.invoiceNumber,
        });

      const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
      await syncRentInvoiceToUnified(row.id);

      return { ok: true, invoiceId: row.id, invoiceNumber: row.invoiceNumber };
    } catch (err) {
      if (pgErrorCode(err) !== '23505') throw err;
    }
  }

  return { ok: false, error: 'Could not allocate rent invoice number.' };
}

export async function submitRentPaymentProof(
  customerId: string,
  invoiceId: string,
  paymentProofUrl: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!paymentProofUrl.trim()) {
    return { ok: false, message: 'Payment photo is required.' };
  }

  const proofUrl = paymentProofUrl.trim();
  const idempotencyKey = `rent-proof-submit:${invoiceId}`;

  const result = await db.transaction(async (tx) => {
    const [invoice] = await tx
      .select()
      .from(rentInvoices)
      .where(eq(rentInvoices.id, invoiceId))
      .for('update')
      .limit(1);

    if (!invoice || invoice.customerId !== customerId) {
      return { ok: false as const, message: 'Invoice not found.' };
    }
    if (invoice.status === 'paid') {
      return { ok: true as const };
    }
    if (invoice.status === 'cancelled' || invoice.status === 'expired') {
      return { ok: false as const, message: 'This invoice is not awaiting payment.' };
    }
    if (
      !['pending', 'overdue', 'payment_in_progress'].includes(invoice.status)
    ) {
      return { ok: false as const, message: 'This invoice is not awaiting payment.' };
    }
    if (invoice.paymentProofUrl === proofUrl) {
      if (invoice.proofSnapshotOutstandingPaise == null) {
        const snapshot = buildRentProofFinancialSnapshot(
          invoice,
          invoice.proofSubmittedAt ?? invoice.updatedAt,
        );
        await tx
          .update(rentInvoices)
          .set({
            proofSubmittedAt: invoice.proofSubmittedAt ?? snapshot.proofSubmittedAt,
            proofSnapshotOutstandingPaise: snapshot.proofSnapshotOutstandingPaise,
            proofSnapshotLateFeePaise: snapshot.proofSnapshotLateFeePaise,
            proofSnapshotPrincipalDuePaise: snapshot.proofSnapshotPrincipalDuePaise,
            updatedAt: new Date(),
          })
          .where(eq(rentInvoices.id, invoiceId));
      }
      return { ok: true as const };
    }

    const previousStatus = invoice.status;
    const nextStatus = previousStatus === 'payment_in_progress' ? previousStatus : 'payment_in_progress';
    const submittedAt = new Date();
    const snapshot = buildRentProofFinancialSnapshot(invoice, submittedAt);

    await tx
      .update(rentInvoices)
      .set({
        paymentProofUrl: proofUrl,
        status: nextStatus,
        proofSubmittedAt: snapshot.proofSubmittedAt,
        proofSnapshotOutstandingPaise: snapshot.proofSnapshotOutstandingPaise,
        proofSnapshotLateFeePaise: snapshot.proofSnapshotLateFeePaise,
        proofSnapshotPrincipalDuePaise: snapshot.proofSnapshotPrincipalDuePaise,
        updatedAt: submittedAt,
      })
      .where(eq(rentInvoices.id, invoiceId));

    logInvoiceStateTransition({
      invoiceId,
      layer: 'rent',
      previousStatus,
      newStatus: nextStatus,
      source: 'user',
      meta: {
        idempotencyKey,
        action: 'payment_proof_uploaded',
        proofSnapshotOutstandingPaise: snapshot.proofSnapshotOutstandingPaise,
        proofSnapshotLateFeePaise: snapshot.proofSnapshotLateFeePaise,
      },
    });

    const { supersedeActiveRejection } = await import('@/src/services/paymentProofRejectionService');
    await supersedeActiveRejection('rent_invoice', invoiceId, tx);

    return { ok: true as const };
  });

  if (!result.ok) return result;

  const [invoiceMeta] = await db
    .select({
      pgId: rentInvoices.pgId,
      bookingId: rentInvoices.bookingId,
    })
    .from(rentInvoices)
    .where(eq(rentInvoices.id, invoiceId))
    .limit(1);

  const { linkResidentUpload } = await import('@/src/services/residentUploadEvents');
  await linkResidentUpload({
    storagePath: proofUrl,
    adminQueue: 'collections',
    linkedEntity: 'rent_invoice',
    linkedEntityId: invoiceId,
    bookingId: invoiceMeta?.bookingId ?? null,
    pgId: invoiceMeta?.pgId ?? null,
  }).catch(() => undefined);

  const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
  await syncRentInvoiceToUnified(invoiceId);

  const { scheduleAdminNotificationSync } = await import('@/src/services/adminLiveSync');
  scheduleAdminNotificationSync();

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
        inArray(rentInvoices.status, ['pending', 'overdue', 'payment_in_progress']),
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
  if (!['pending', 'overdue', 'payment_in_progress'].includes(invoice.status)) {
    return { ok: false, message: 'Invoice is not awaiting payment.' };
  }

  const invoiceWithSnapshot = (await ensureRentProofSnapshot(invoiceId)) ?? invoice;
  const amountPaise = rentProofApprovalAmountPaise(invoiceWithSnapshot);
  if (amountPaise == null || amountPaise <= 0) {
    return {
      ok: false,
      message: 'Payment snapshot missing — ask the resident to re-upload proof.',
    };
  }

  const { applyApprovedPaymentAtomic } = await import('@/src/services/paymentSettlementAtomic');
  const result = await applyApprovedPaymentAtomic({
    purpose: 'rent',
    provider: 'mock',
    offlineProvider: 'upi_manual',
    providerPaymentId: `rent-proof-${invoiceId}`,
    amountPaise,
    invoiceId,
    rawPayload: {
      source: 'payment_proof',
      proofUrl: invoiceWithSnapshot.paymentProofUrl,
      proofSnapshotOutstandingPaise: invoiceWithSnapshot.proofSnapshotOutstandingPaise,
      proofSubmittedAt: invoiceWithSnapshot.proofSubmittedAt?.toISOString() ?? null,
    },
  });

  if (result.ok) return { ok: true };

  const [refreshed] = await db
    .select({ status: rentInvoices.status })
    .from(rentInvoices)
    .where(eq(rentInvoices.id, invoiceId))
    .limit(1);
  if (refreshed?.status === 'paid') {
    return { ok: true };
  }

  return { ok: false, message: result.reason };
}

export async function rejectRentPaymentProof(
  session: AdminSession,
  invoiceId: string,
  rejection: {
    reviewKey: string;
    reasonCode: import('@/src/lib/approvals/paymentProofRejectionReasons').PaymentProofRejectionReasonCode;
    reasonDetail?: string;
    adminNote?: string;
    residentMessage: string;
    sendWhatsApp: boolean;
  },
): Promise<{ ok: true; whatsappUrl?: string } | { ok: false; message: string }> {
  const { rejectPaymentProof } = await import('@/src/services/paymentProofRejectionService');
  return rejectPaymentProof(session, {
    reviewKey: rejection.reviewKey,
    entityType: 'rent_invoice',
    entityId: invoiceId,
    reasonCode: rejection.reasonCode,
    reasonDetail: rejection.reasonDetail,
    adminNote: rejection.adminNote,
    residentMessage: rejection.residentMessage,
    sendWhatsApp: rejection.sendWhatsApp,
  });
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
    const newPaise = fullMonthlyRentPaise(monthlyRent);
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

/** After a check-in date change — sync billing day, pro-rate amounts, and due dates. */
export async function recalculateRentAfterMoveInChange(args: {
  bookingId: string;
  adminId: string;
}): Promise<{ updatedCount: number; billingDay: number }> {
  const [booking] = await db
    .select({ pricingSnapshot: bookings.pricingSnapshot })
    .from(bookings)
    .where(eq(bookings.id, args.bookingId))
    .limit(1);
  if (!booking) return { updatedCount: 0, billingDay: 5 };

  const snapshot = booking.pricingSnapshot as PricingSnapshot | null;
  const billingDay = await syncBillingDayFromCheckIn(args.bookingId);
  if (!snapshot) return { updatedCount: 0, billingDay };

  const amountResult = await recalculatePendingRentInvoicesForBooking({
    bookingId: args.bookingId,
    pricingSnapshot: snapshot,
    adminId: args.adminId,
  });

  const stay = await loadStayWindow(args.bookingId);
  if (!stay) {
    return { updatedCount: amountResult.updatedCount, billingDay };
  }

  const pending = await db
    .select({ id: rentInvoices.id, billingMonth: rentInvoices.billingMonth, dueDate: rentInvoices.dueDate })
    .from(rentInvoices)
    .where(
      and(
        eq(rentInvoices.bookingId, args.bookingId),
        inArray(rentInvoices.status, ['pending', 'overdue']),
      ),
    );

  let dueDateUpdates = 0;
  const now = new Date();
  for (const inv of pending) {
    const calendarDue = formatDate(dueDateForBillingDay(inv.billingMonth, billingDay));
    const dueDate =
      stay.start > calendarDue ? formatDate(addDays(stay.start, 4)) : calendarDue;
    if (dueDate === inv.dueDate) continue;
    await db
      .update(rentInvoices)
      .set({ dueDate, updatedAt: now })
      .where(eq(rentInvoices.id, inv.id));
    dueDateUpdates += 1;
  }

  return {
    updatedCount: amountResult.updatedCount + dueDateUpdates,
    billingDay,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Billing overview + undo / selective generation helpers
// ───────────────────────────────────────────────────────────────────────────

export type RentBillingOverviewRow = {
  bookingId: string;
  bookingCode: string;
  customerId: string;
  customerFullName: string;
  customerPhone: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  checkInDate: string;
  expectedRentPaise: number;
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: 'none' | 'pending' | 'paid' | 'overdue' | 'cancelled';
  rentPaise: number;
  dueDate: string | null;
  depositDuePaise: number;
  depositCollectionStatus: string;
  isDueForGeneration: boolean;
};

export async function listRentBillingOverview(
  billingMonth: DateLike,
  opts?: { pgId?: string },
): Promise<RentBillingOverviewRow[]> {
  const month = firstOfMonth(billingMonth);
  const asOf = formatDate(new Date());
  const { start: monthStart, end: monthEnd } = monthBounds(month);
  const monthStartIso = formatDate(monthStart);
  const monthEndIso = formatDate(monthEnd);

  const rows = await db
    .selectDistinct({
      bookingId: bookings.id,
      bookingCode: bookings.bookingCode,
      customerId: bookings.customerId,
      customerFullName: customers.fullName,
      customerPhone: customers.phone,
      depositDuePaise: bookings.depositDuePaise,
      depositCollectionStatus: bookings.depositCollectionStatus,
      pricingSnapshot: bookings.pricingSnapshot,
      bedId: bedReservations.bedId,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .where(
      and(
        eq(bookings.status, 'confirmed'),
        isProductionBookingFilter(),
        isProductionCustomerFilter(),
        isActiveResidentFilter(),
        inArray(bookings.durationMode, ['monthly', 'open_ended']),
        eq(bedReservations.status, 'active'),
        eq(bedReservations.kind, 'primary'),
        sql`${bedReservations.stayRange} && daterange(${monthStartIso}::date, ${monthEndIso}::date, '[)')`,
        opts?.pgId
          ? sql`EXISTS (
              SELECT 1 FROM beds b
              JOIN rooms r ON r.id = b.room_id
              JOIN floors f ON f.id = r.floor_id
              WHERE b.id = ${bedReservations.bedId} AND f.pg_id = ${opts.pgId}
            )`
          : sql`TRUE`,
      ),
    );

  const byBooking = new Map<string, (typeof rows)[0]>();
  for (const row of rows) {
    const existing = byBooking.get(row.bookingId);
    if (!existing || row.bedId < existing.bedId) byBooking.set(row.bookingId, row);
  }

  const overview: RentBillingOverviewRow[] = [];

  for (const c of byBooking.values()) {
    const stay = await loadStayWindow(c.bookingId);
    if (!stay) continue;

    const monthlyRent = monthlyRentFromSnapshot(c.pricingSnapshot as PricingSnapshot | null);
    const invoiceRentPaise = monthlyRent > 0 ? fullMonthlyRentPaise(monthlyRent) : 0;

    const [bedMeta] = await db.execute<{
      pg_id: string;
      pg_name: string;
      room_number: string;
      bed_code: string;
    }>(sql`
      SELECT f.pg_id, p.name AS pg_name, r.room_number, b.bed_code
      FROM beds b
      JOIN rooms r ON r.id = b.room_id
      JOIN floors f ON f.id = r.floor_id
      JOIN pgs p ON p.id = f.pg_id
      WHERE b.id = ${c.bedId}
      LIMIT 1
    `);
    if (!bedMeta) continue;

    const [inv] = await db
      .select({
        id: rentInvoices.id,
        invoiceNumber: rentInvoices.invoiceNumber,
        status: rentInvoices.status,
        rentPaise: rentInvoices.rentPaise,
        dueDate: rentInvoices.dueDate,
      })
      .from(rentInvoices)
      .where(and(eq(rentInvoices.bookingId, c.bookingId), eq(rentInvoices.billingMonth, month)))
      .limit(1);

    const invoiceStatus = (inv?.status ?? 'none') as RentBillingOverviewRow['invoiceStatus'];
    const isDueForGeneration =
      invoiceRentPaise > 0 && stay.start <= asOf && !inv;

    overview.push({
      bookingId: c.bookingId,
      bookingCode: c.bookingCode,
      customerId: c.customerId,
      customerFullName: c.customerFullName,
      customerPhone: c.customerPhone,
      pgId: bedMeta.pg_id,
      pgName: bedMeta.pg_name,
      roomNumber: bedMeta.room_number,
      bedCode: bedMeta.bed_code,
      checkInDate: stay.start,
      expectedRentPaise: invoiceRentPaise,
      invoiceId: inv?.id ?? null,
      invoiceNumber: inv?.invoiceNumber ?? null,
      invoiceStatus: inv ? invoiceStatus : 'none',
      rentPaise: inv?.rentPaise ?? 0,
      dueDate: inv?.dueDate ?? null,
      depositDuePaise: c.depositDuePaise ?? 0,
      depositCollectionStatus: c.depositCollectionStatus ?? 'pending',
      isDueForGeneration,
    });
  }

  return overview.sort((a, b) => a.customerFullName.localeCompare(b.customerFullName));
}

export async function cancelPendingRentInvoicesForMonth(
  billingMonth: DateLike,
  reason: string,
  opts?: { pgId?: string; bookingIds?: string[] },
): Promise<{ cancelled: number; errors: string[] }> {
  const month = firstOfMonth(billingMonth);
  const { cancelUnifiedInvoice } = await import('@/src/services/unifiedInvoices');

  const rows = await db
    .select({
      rentInvoiceId: rentInvoices.id,
      unifiedId: financialInvoices.id,
      bookingId: rentInvoices.bookingId,
      pgId: rentInvoices.pgId,
    })
    .from(rentInvoices)
    .leftJoin(
      financialInvoices,
      and(
        eq(financialInvoices.sourceTable, 'rent_invoices'),
        eq(financialInvoices.sourceId, rentInvoices.id),
      ),
    )
    .where(
      and(
        eq(rentInvoices.billingMonth, month),
        inArray(rentInvoices.status, ['pending', 'overdue', 'expired']),
        eq(rentInvoices.isAdhoc, false),
        isNull(rentInvoices.paymentProofUrl),
        isNull(rentInvoices.paymentId),
        sql`${rentInvoices.dueDate} < ${formatDate(new Date())}::date`,
        opts?.pgId ? eq(rentInvoices.pgId, opts.pgId) : sql`TRUE`,
        opts?.bookingIds?.length
          ? inArray(rentInvoices.bookingId, opts.bookingIds)
          : sql`TRUE`,
      ),
    );

  let cancelled = 0;
  const errors: string[] = [];

  for (const row of rows) {
    if (row.unifiedId) {
      const res = await cancelUnifiedInvoice(row.unifiedId, reason, {
        type: 'admin',
        id: null,
      });
      if (!res.ok) {
        errors.push(`${row.rentInvoiceId}: ${res.error}`);
        continue;
      }
    } else {
      const [rentRow] = await db
        .select({ status: rentInvoices.status })
        .from(rentInvoices)
        .where(eq(rentInvoices.id, row.rentInvoiceId))
        .limit(1);
      if (!rentRow || !isRentInvoiceCancellable(rentRow.status)) {
        errors.push(`${row.rentInvoiceId}: not cancellable (${rentRow?.status ?? 'missing'})`);
        continue;
      }
      if (isRentInvoicePaymentLocked(rentRow.status)) {
        errors.push(`${row.rentInvoiceId}: payment locked (${rentRow.status})`);
        continue;
      }
      const cancelGuard = guardRentStatusTransition(rentRow.status, 'cancelled');
      if (!cancelGuard.ok) {
        errors.push(`${row.rentInvoiceId}: ${cancelGuard.error}`);
        continue;
      }
      const [updated] = await db
        .update(rentInvoices)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: reason,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(rentInvoices.id, row.rentInvoiceId),
            inArray(rentInvoices.status, ['pending', 'overdue', 'expired']),
            isNull(rentInvoices.paymentProofUrl),
          ),
        )
        .returning({ id: rentInvoices.id });
      if (!updated) {
        errors.push(`${row.rentInvoiceId}: state changed during cancel`);
        continue;
      }
      logInvoiceStateTransition({
        invoiceId: row.rentInvoiceId,
        layer: 'rent',
        previousStatus: rentRow.status,
        newStatus: 'cancelled',
        source: 'admin',
        meta: { reason },
      });
      const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
      await syncRentInvoiceToUnified(row.rentInvoiceId);
    }
    cancelled += 1;
  }

  if (cancelled > 0) {
    const { reconcileStaleFinancialInvoices } = await import('@/src/lib/billing/financialMetrics');
    await reconcileStaleFinancialInvoices({ billingMonth: month }).catch(() => undefined);

    const { resolveStaleBillingActionItems, syncActionItemsForCron } = await import(
      '@/src/services/actionItems'
    );
    await resolveStaleBillingActionItems();
    await syncActionItemsForCron();
  }

  return { cancelled, errors };
}

/** Backfill rent/financial invoices where due_date precedes created_at (issue date). */
export async function repairRentInvoiceDueDatesBeforeIssue(): Promise<{
  repairedRentInvoiceIds: string[];
}> {
  const rows = await db
    .select({
      id: rentInvoices.id,
      dueDate: rentInvoices.dueDate,
      createdAt: rentInvoices.createdAt,
    })
    .from(rentInvoices)
    .where(sql`${rentInvoices.dueDate} < ${rentInvoices.createdAt}::date`);

  const repairedRentInvoiceIds: string[] = [];
  const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');

  for (const row of rows) {
    const issueDate = formatDate(row.createdAt);
    const dueDate = clampDueDateOnOrAfterIssueDate(row.dueDate, issueDate);
    if (dueDate === row.dueDate) continue;

    await db
      .update(rentInvoices)
      .set({ dueDate, updatedAt: new Date() })
      .where(eq(rentInvoices.id, row.id));
    await syncRentInvoiceToUnified(row.id);
    repairedRentInvoiceIds.push(row.id);
  }

  return { repairedRentInvoiceIds };
}

// Pseudonyms to keep imports tidy in tests.
export const _internals = { nextInvoiceNumber, monthlyRentFromSnapshot, loadStayWindow };
// Suppress unused-import warnings if linter complains; these are used in tests.
void isNotNull; void lte; void or;

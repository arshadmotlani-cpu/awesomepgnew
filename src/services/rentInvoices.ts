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
import { adminCanAccessPg } from '../lib/auth/roles';
import type { AdminSession } from '../lib/auth/session';
import { addDays, diffDays, formatDate, parseDate, type DateLike } from '../lib/dates';
import {
  computeLateFee,
  daysOverdue,
  dueDateForBillingDay,
  dueDateForMonth,
  firstOfMonth,
  monthBounds,
  prorateForMonth,
} from './billing';
import type { AnyPaymentProvider } from './bookingLifecycle';
import type { ProviderName } from './payments';
import {
  isRentInvoiceCancellable,
  isRentInvoicePaymentLocked,
  logInvoiceStateTransition,
  guardRentStatusTransition,
} from '@/src/lib/billing/invoiceStateMachine';
import {
  isProductionBookingFilter,
  isProductionCustomerFilter,
  isActiveResidentFilter,
  collectibleResidentFilters,
} from '@/src/lib/billing/productionDataFilter';
import {
  ensureBillingProfileForBooking,
} from '@/src/services/residentBillingProfiles';

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
      return {
        ok: false,
        error: 'Rent invoice was cancelled. Re-generate from the billing queue first.',
      };
    }
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
    dueDate: ctx.stayStart,
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
      return {
        ok: false,
        error: 'Monthly invoice was cancelled. Re-generate from the billing queue first.',
      };
    }
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
        isActiveResidentFilter(),
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
    if (input.bookingIds?.length && !input.bookingIds.includes(c.bookingId)) {
      skipped += 1;
      continue;
    }

    const profile = await ensureBillingProfileForBooking(c.bookingId);
    if (profile && !profile.autoGenerate) {
      skipped += 1;
      continue;
    }

    const monthlyRent =
      profile?.rentAmountPaise ?? monthlyRentFromSnapshot(c.pricingSnapshot);
    if (monthlyRent <= 0) {
      // No monthly rate on snapshot — skip (audit log, no invoice).
      skipped += 1;
      continue;
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

    const calendarDue = formatDate(dueDateForBillingDay(billingMonth, billingDay));
    const dueDate =
      stay.start > calendarDue ? formatDate(addDays(stay.start, 4)) : calendarDue;

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
    void syncManyToUnified(
      rows.map((r) => r.id),
      'rent',
    );
  }

  return { expired: rows.length, expiredInvoiceIds: rows.map((r) => r.id) };
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
      paidPrincipalPaise: rentInvoices.paidPrincipalPaise,
      paidLateFeePaise: rentInvoices.paidLateFeePaise,
      lateFeeLockedPaise: rentInvoices.lateFeeLockedPaise,
      paymentId: rentInvoices.paymentId,
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
  if (input.amountPaise <= 0) {
    return { ok: false, reason: 'payment amount must be > 0' };
  }
  if (input.amountPaise > projected.outstandingPaise) {
    return {
      ok: false,
      reason: `payment ${input.amountPaise} exceeds outstanding ${projected.outstandingPaise}`,
    };
  }

  const lateFee = input.historical
    ? 0
    : computeLateFee({
        rentPaise: invoice.rentPaise,
        billingMonth: invoice.billingMonth,
      });

  let remaining = input.amountPaise;
  const lateOwed = Math.max(0, lateFee - invoice.paidLateFeePaise);
  const latePaid = Math.min(remaining, lateOwed);
  remaining -= latePaid;
  const principalOwed = Math.max(0, invoice.rentPaise - invoice.paidPrincipalPaise);
  const principalPaid = Math.min(remaining, principalOwed);
  const newPaidLate = invoice.paidLateFeePaise + latePaid;
  const newPaidPrincipal = invoice.paidPrincipalPaise + principalPaid;
  const newOutstanding = invoice.rentPaise + lateFee - newPaidPrincipal - newPaidLate;
  const fullyPaid = newOutstanding <= 0;
  const paidAt = input.paidAt ?? new Date();

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

      await tx.insert(auditLog).values({
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

      return { paymentId: payment.id };
    });

    if (!input.historical) {
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
    }

    const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
    const unifiedId = await syncRentInvoiceToUnified(invoice.id);
    if (!unifiedId) {
      return { ok: false, reason: 'Unified invoice sync failed after rent payment.' };
    }

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
  if (invoice.status === 'payment_in_progress') {
    const lateFee = computeLateFee({
      rentPaise: invoice.rentPaise,
      billingMonth: invoice.billingMonth,
      today: asOf,
    });
    const outstandingPaise = Math.max(
      0,
      invoice.rentPaise + lateFee - invoice.paidPrincipalPaise - invoice.paidLateFeePaise,
    );
    return {
      ...invoice,
      accruedLateFeePaise: lateFee,
      outstandingPaise,
      effectiveStatus: 'payment_in_progress',
    };
  }
  if (invoice.status === 'expired') {
    return {
      ...invoice,
      accruedLateFeePaise: 0,
      outstandingPaise: 0,
      effectiveStatus: 'expired',
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
  const outstandingPaise = Math.max(0, outstanding);
  const hasPartial =
    outstandingPaise > 0 &&
    (invoice.paidPrincipalPaise > 0 || invoice.paidLateFeePaise > 0);
  const effectiveStatus = hasPartial
    ? 'partial'
    : daysOverdue(invoice.billingMonth, asOf) > 0
      ? 'overdue'
      : 'pending';
  return {
    ...invoice,
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
    void syncManyToUnified(
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
  const dueDate = input.dueDate ?? formatDate(new Date());
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
      return { ok: true as const };
    }

    const previousStatus = invoice.status;
    const nextStatus = previousStatus === 'payment_in_progress' ? previousStatus : 'payment_in_progress';

    await tx
      .update(rentInvoices)
      .set({
        paymentProofUrl: proofUrl,
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(rentInvoices.id, invoiceId));

    logInvoiceStateTransition({
      invoiceId,
      layer: 'rent',
      previousStatus,
      newStatus: nextStatus,
      source: 'user',
      meta: { idempotencyKey, action: 'payment_proof_uploaded' },
    });

    return { ok: true as const };
  });

  if (!result.ok) return result;

  const { syncRentInvoiceToUnified } = await import('@/src/services/unifiedInvoices');
  await syncRentInvoiceToUnified(invoiceId).catch(() => undefined);

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
  if (!['pending', 'overdue', 'payment_in_progress'].includes(invoice.status)) {
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
    const prorated =
      monthlyRent > 0
        ? prorateForMonth({
            monthlyRatePaise: monthlyRent,
            billingMonth: month,
            activeStart: stay.start,
            activeEnd: stay.end ?? '9999-12-31',
          })
        : { amountPaise: 0 };

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
      prorated.amountPaise > 0 && stay.start <= asOf && !inv;

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
      expectedRentPaise: prorated.amountPaise,
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
      await syncRentInvoiceToUnified(row.rentInvoiceId).catch(() => undefined);
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

// Pseudonyms to keep imports tidy in tests.
export const _internals = { nextInvoiceNumber, monthlyRentFromSnapshot, loadStayWindow };
// Suppress unused-import warnings if linter complains; these are used in tests.
void isNotNull; void lte; void or;

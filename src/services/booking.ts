/**
 * Booking service.
 *
 * Phase 3 of PROJECT_PLAN.md — "Booking Core". Provides one mutating entry
 * point that the customer cart submits to:
 *
 *   - `createBooking()` is the transactional heart of the system. It upserts
 *     the customer, allocates a unique booking code, snapshots pricing, and
 *     inserts one `bed_reservations` row per selected bed. The whole thing
 *     either commits or rolls back; the GiST EXCLUDE constraint on
 *     `bed_reservations.stay_range` is the ultimate authority for overlap
 *     prevention (race-proof at the storage layer).
 *
 * Phase 3 deliberately skips the payment step: bookings are created as
 * `status='confirmed'` and reservations as `status='active'` (i.e. "manual
 * confirm" per the phase's exit criteria). Phase 4 will introduce the
 * `hold → pending_payment → confirmed` flow and wire Razorpay in.
 *
 * Conflict handling:
 *   - Pre-flight check using {@link isBedAvailable} so the common case fails
 *     fast with a useful error before we even open a transaction.
 *   - In-transaction, the EXCLUDE constraint fires SQLSTATE 23P01 if two
 *     reservations race for the same bed. We catch that, rollback, and
 *     return a structured `{ ok: false, kind: 'conflict' }` result so the
 *     UI can re-render the cart with the offending beds flagged.
 *   - Booking-code uniqueness is enforced by a unique index; we retry up to
 *     5 sequence positions on SQLSTATE 23505 collisions.
 */

import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { countBookingsInYear } from '../db/queries/customer';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  couponRedemptions,
  customers,
  pgs,
} from '../db/schema';
import type { PricingSnapshot } from '../db/schema/bookings';
import { applyDateCouponToRentSubtotal } from '../lib/dateCoupon';
import { env } from '../lib/env';
import { formatDate, parseDate, type DateLike } from '../lib/dates';
import { nextBookingCode, utcYear } from '../lib/bookingCode';
import { stampProfileCompletedAtIfReady } from './profile';
import { isBedAvailable, validateBedStayRange } from './availability';
import {
  reserveBlocksLongStay,
  validateShortStayDuringReserve,
} from './bedReserve';
import { DEFAULT_POLICY } from './cancellationPolicy';
import {
  quoteBookingPrice,
  quoteAdminTenantAssignment,
  type BookingQuote,
  type PricingMode,
} from './pricing';

// ───────────────────────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────────────────────

export type CreateBookingInput = {
  bedIds: string[];
  startDate: DateLike;
  /** null when durationMode === 'open_ended' */
  endDate: DateLike | null;
  durationMode: PricingMode;
  customer: {
    fullName: string;
    email: string;
    phone: string;
    gender: 'male' | 'female' | 'other';
  };
  /** Logged-in cart: bind booking to this account (skips phone upsert). */
  customerId?: string;
  notes?: string;
  /**
   * Phase 4: who is creating this booking. Customer-initiated bookings go
   * to `pending_payment` with `hold` reservations awaiting Razorpay (or
   * mock) checkout. Admin-initiated bookings go straight to `confirmed`
   * with `active` reservations — admins recording walk-ins handle money
   * out-of-band via "record offline payment".
   */
  createdVia?: 'customer' | 'admin';
  createdByAdminId?: string;
  /**
   * Admin only: hold reservations through this date (e.g. 2099-01-01 for
   * long-term monthly residents).
   */
  reservationEndDate?: DateLike;
  /**
   * Admin only: block every bed in the tenant's room on the calendar even
   * though only one bed is billed (single-sharing rent in a multi-bed room).
   */
  blocksRoomAvailability?: boolean;
  /** Admin only: override monthly rent on the primary bed in the snapshot. */
  customMonthlyRatePaise?: number;
  /** Admin only: override refundable deposit on the booking. */
  customDepositPaise?: number;
  /** Customer checkout: DDMMYY date coupon — 10% off rent only. */
  couponCode?: string;
};

export type CreateBookingSuccess = {
  ok: true;
  bookingId: string;
  bookingCode: string;
  customerId: string;
  totalPaise: number;
  depositPaise: number;
  /** Final booking status after createBooking returns. */
  status: 'pending_payment' | 'confirmed';
  /**
   * For customer-initiated bookings, when the hold lapses. null for
   * admin-initiated bookings (which are already active).
   */
  holdExpiresAt: Date | null;
};

export type CreateBookingFailure = {
  ok: false;
  /** Discriminator so the UI can render the appropriate empty / error state. */
  kind:
    | 'validation'
    | 'conflict'
    | 'unavailable_bed'
    | 'gender_policy'
    | 'unknown';
  message: string;
  conflictBedIds?: string[];
};

export type CreateBookingResult = CreateBookingSuccess | CreateBookingFailure;

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

/**
 * Build the snapshot blob that goes into `bookings.pricing_snapshot`. The
 * shape matches the `PricingSnapshot` contract declared on the schema and
 * is therefore the source of truth for invoices, refunds, and accounting
 * even if `bed_prices` is edited later.
 *
 * `lineTotalPaise` is the per-bed **rent** (i.e. the bed's contribution to
 * `bookings.subtotal_paise`) — deposits are intentionally excluded so that
 * `Σ perBed[i].lineTotalPaise === bookings.subtotal_paise` and the
 * confirmation/cart UI can render the standard "lines → subtotal → deposit
 * → total" ledger without the per-bed lines silently rolling deposit in.
 * The bed's deposit is still available as `securityDepositPaise` on each
 * snapshot row for invoicing/refund flows.
 */
function buildSnapshot(
  quote: BookingQuote,
  notes?: string,
  dateCoupon?: PricingSnapshot['dateCoupon'],
): PricingSnapshot {
  const rentLineItems = quote.perBed.flatMap((q) =>
    q.lineItems.filter((li) => li.kind !== 'deposit'),
  );
  return {
    perBed: quote.perBed.map((q) => ({
      bedId: q.bedId,
      dailyRatePaise: q.rate.dailyRatePaise,
      weeklyRatePaise: q.rate.weeklyRatePaise,
      monthlyRatePaise: q.rate.monthlyRatePaise,
      securityDepositPaise: q.rate.securityDepositPaise,
      durationMode: q.durationMode,
      units: q.units,
      lineTotalPaise: q.subtotalPaise,
    })),
    computedAt: quote.computedAt,
    notes,
    cancellationPolicy: { ...DEFAULT_POLICY },
    dateCoupon,
    rentLineItems,
  };
}

function applyAdminPricingOverrides(
  quote: BookingQuote,
  input: Pick<
    CreateBookingInput,
    'customMonthlyRatePaise' | 'customDepositPaise' | 'durationMode'
  >,
): BookingQuote {
  if (input.customMonthlyRatePaise == null && input.customDepositPaise == null) {
    return quote;
  }

  const next = {
    ...quote,
    perBed: quote.perBed.map((bed) => ({ ...bed, rate: { ...bed.rate } })),
  };

  if (next.perBed.length > 0 && input.customMonthlyRatePaise != null) {
    const bed = next.perBed[0]!;
    bed.rate.monthlyRatePaise = input.customMonthlyRatePaise;
    if (input.durationMode === 'monthly' || input.durationMode === 'open_ended') {
      bed.subtotalPaise = input.customMonthlyRatePaise * Math.max(1, bed.units);
      bed.totalPaise = bed.subtotalPaise + bed.depositPaise;
    }
  }

  if (input.customDepositPaise != null) {
    next.depositPaise = input.customDepositPaise;
    if (next.perBed.length > 0) {
      const bed = next.perBed[0]!;
      bed.depositPaise = input.customDepositPaise;
      bed.rate.securityDepositPaise = input.customDepositPaise;
      bed.totalPaise = bed.subtotalPaise + bed.depositPaise;
    }
  }

  next.subtotalPaise = next.perBed.reduce((acc, bed) => acc + bed.subtotalPaise, 0);
  next.totalPaise = next.subtotalPaise + next.depositPaise;
  return next;
}

import { siblingBedIdsInRoom } from '@/src/services/tenantAssignmentInternals';
import { scheduleAdminNotificationSync } from '@/src/services/adminLiveSync';
import { computeNewBookingCheckoutTotals } from '@/src/lib/billing/bookingCheckoutTotals';
import type { PriorOutstandingItem } from '@/src/lib/billing/bookingCheckoutTotals';
import { getCustomerPriorOutstandingForCheckout } from '@/src/services/bookingPriorOutstanding';

/**
 * Best-effort error classification for postgres-js errors. We rely on
 * SQLSTATE codes — the human-readable messages can change between Postgres
 * versions.
 *
 *  - `23P01` — exclusion_violation (our overlap constraint fired)
 *  - `23505` — unique_violation (e.g. booking_code or customers.phone)
 *  - `23514` — check_violation (e.g. our money-sign constraints)
 */
function pgCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err) {
    const c = (err as { code?: unknown }).code;
    if (typeof c === 'string') return c;
  }
  return null;
}

function pgConstraint(err: unknown): string | null {
  if (err && typeof err === 'object' && 'constraint_name' in err) {
    const c = (err as { constraint_name?: unknown }).constraint_name;
    if (typeof c === 'string') return c;
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// createBooking
// ───────────────────────────────────────────────────────────────────────────

const MAX_CODE_RETRIES = 5;

export async function createBooking(
  input: CreateBookingInput,
): Promise<CreateBookingResult> {
  // 1. Basic shape validation. Tighter Zod validation lives in the server
  //    action layer; this is the last-line defense for direct service calls.
  if (input.bedIds.length === 0) {
    return {
      ok: false,
      kind: 'validation',
      message: 'Select at least one bed before confirming.',
    };
  }
  const uniqueBedIds = Array.from(new Set(input.bedIds));
  if (uniqueBedIds.length !== input.bedIds.length) {
    return {
      ok: false,
      kind: 'validation',
      message: 'Duplicate beds in the cart.',
    };
  }
  if (input.durationMode !== 'open_ended' && !input.endDate) {
    return {
      ok: false,
      kind: 'validation',
      message: 'End date is required for daily/weekly/monthly stays.',
    };
  }

  const isAdminCreated = input.createdVia === 'admin';

  const startDate = parseDate(input.startDate);
  const endDate = input.endDate ? parseDate(input.endDate) : null;
  if (endDate && endDate.getTime() <= startDate.getTime()) {
    return {
      ok: false,
      kind: 'validation',
      message: 'End date must be after start date.',
    };
  }

  // Checkout cap: stay must fit inside a single free window per bed.
  if (endDate && !isAdminCreated) {
    for (const bedId of uniqueBedIds) {
      const cap = await validateBedStayRange({
        bedId,
        startDate,
        endDate,
      });
      if (!cap.ok) {
        return {
          ok: false,
          kind: 'validation',
          message: cap.message,
          conflictBedIds: [bedId],
        };
      }
    }
  }

  const reservationEnd = input.reservationEndDate
    ? parseDate(input.reservationEndDate)
    : endDate ??
      new Date(
        Date.UTC(
          startDate.getUTCFullYear(),
          startDate.getUTCMonth() + 1,
          startDate.getUTCDate(),
        ),
      );

  let reservationBedIds = uniqueBedIds;
  if (input.blocksRoomAvailability) {
    if (uniqueBedIds.length !== 1) {
      return {
        ok: false,
        kind: 'validation',
        message: 'Whole-room occupancy applies to a single billed bed.',
      };
    }
    const siblings = await siblingBedIdsInRoom(uniqueBedIds[0]!);
    reservationBedIds = [...uniqueBedIds, ...siblings];
  }

  // 2. Pre-flight availability. The DB constraint is still authoritative,
  //    but checking up-front means we usually fail with a clean error before
  //    we open a transaction or upsert the customer.
  const conflictBedIds: string[] = [];
  for (const bedId of reservationBedIds) {
    const ok = await isBedAvailable({
      bedId,
      startDate,
      endDate: reservationEnd,
    });
    if (!ok) conflictBedIds.push(bedId);
  }
  if (conflictBedIds.length > 0) {
    return {
      ok: false,
      kind: 'unavailable_bed',
      message:
        conflictBedIds.length === 1
          ? 'One of the selected beds is no longer available for the requested dates.'
          : `${conflictBedIds.length} of the selected beds are no longer available for the requested dates.`,
      conflictBedIds,
    };
  }

  if (!isAdminCreated && endDate) {
    for (const bedId of uniqueBedIds) {
      if (
        await reserveBlocksLongStay(
          bedId,
          startDate,
          endDate,
          input.durationMode,
        )
      ) {
        return {
          ok: false,
          kind: 'unavailable_bed',
          message:
            'This bed is reserved for a future tenant — only daily or weekly stays are allowed until their check-in.',
          conflictBedIds: [bedId],
        };
      }
      const shortErr = await validateShortStayDuringReserve(bedId, startDate, endDate);
      if (shortErr) {
        return {
          ok: false,
          kind: 'validation',
          message: shortErr,
          conflictBedIds: [bedId],
        };
      }
    }
  }

  // 3. Gender policy: every selected bed must belong to a PG whose
  //    `gender_policy` accepts the customer's gender. `coed` accepts all.
  const policyRows = await db
    .select({ pgId: pgs.id, genderPolicy: pgs.genderPolicy })
    .from(pgs)
    .where(
      sql`${pgs.id} IN (
        SELECT f.pg_id FROM floors f
        JOIN rooms r ON r.floor_id = f.id
        JOIN beds b ON b.room_id = r.id
        WHERE b.id = ANY(${sql.raw(`'{${uniqueBedIds.join(',')}}'::uuid[]`)})
      )`,
    );
  for (const row of policyRows) {
    if (row.genderPolicy === 'coed') continue;
    if (input.customer.gender === 'other') {
      return {
        ok: false,
        kind: 'gender_policy',
        message: `One of the selected PGs is restricted to ${row.genderPolicy} residents.`,
      };
    }
    if (row.genderPolicy !== input.customer.gender) {
      return {
        ok: false,
        kind: 'gender_policy',
        message: `One of the selected PGs is restricted to ${row.genderPolicy} residents.`,
      };
    }
  }

  // 4. Compute the price quote (one round-trip per bed inside the pricing
  //    service — small N, fine for Phase 3).
  let quote: BookingQuote;
  try {
    if (isAdminCreated) {
      quote = await quoteAdminTenantAssignment({
        bedIds: uniqueBedIds,
        startDate,
        endDate: input.durationMode === 'open_ended' ? null : reservationEnd,
        durationMode: input.durationMode,
        includeDeposit: true,
        customMonthlyRatePaise: input.customMonthlyRatePaise,
        customDepositPaise: input.customDepositPaise,
      });
    } else {
      quote = await quoteBookingPrice({
        bedIds: uniqueBedIds,
        startDate,
        endDate: input.durationMode === 'open_ended' ? null : reservationEnd,
        durationMode: input.durationMode,
        includeDeposit: true,
      });
      quote = applyAdminPricingOverrides(quote, input);
    }
  } catch (err) {
    return {
      ok: false,
      kind: 'validation',
      message: err instanceof Error ? err.message : 'Failed to compute price.',
    };
  }

  let discountPaise = 0;
  let dateCoupon: PricingSnapshot['dateCoupon'];
  if (!isAdminCreated && input.couponCode?.trim()) {
    const couponResult = applyDateCouponToRentSubtotal(quote.subtotalPaise, input.couponCode);
    if (!couponResult.ok) {
      return {
        ok: false,
        kind: 'validation',
        message: 'Invalid coupon',
      };
    }
    discountPaise = couponResult.discountPaise;
    dateCoupon = couponResult.coupon ?? undefined;
  }

  let depositCreditAppliedPaise = 0;
  if (!isAdminCreated && input.customerId) {
    const { getCustomerDepositCredit, computeDepositDue } = await import('./depositCredit');
    const wallet = await getCustomerDepositCredit(input.customerId);
    depositCreditAppliedPaise = computeDepositDue(
      quote.depositPaise,
      wallet.availableCreditPaise,
    ).creditAppliedPaise;
  }
  const additionalDepositDuePaise = quote.depositPaise - depositCreditAppliedPaise;

  let priorOutstanding: { totalPaise: number; items: PriorOutstandingItem[] } = {
    totalPaise: 0,
    items: [],
  };
  if (!isAdminCreated && input.customerId) {
    priorOutstanding = await getCustomerPriorOutstandingForCheckout(input.customerId);
  }

  const checkoutTotals = computeNewBookingCheckoutTotals({
    rentSubtotalPaise: quote.subtotalPaise,
    depositRequiredPaise: quote.depositPaise,
    depositCreditAppliedPaise,
    discountPaise,
    priorOutstanding,
  });
  const totalPaise = checkoutTotals.totalToCollectTodayPaise;
  const snapshot = buildSnapshot(quote, input.notes, dateCoupon);
  if (depositCreditAppliedPaise > 0) {
    snapshot.depositCredit = {
      requiredPaise: quote.depositPaise,
      appliedPaise: depositCreditAppliedPaise,
      additionalDuePaise: additionalDepositDuePaise,
      appliedAt: new Date().toISOString(),
    };
  }
  if (priorOutstanding.totalPaise > 0) {
    snapshot.priorOutstanding = priorOutstanding;
  }

  // 5. Retry loop over booking_code collisions. The COUNT-based sequence
  //    can lose a race with another concurrent booking; the unique index on
  //    booking_code is the authority.
  const year = utcYear();
  const yearPrefix = `APG-${year}-`;
  let baseCount = await countBookingsInYear(yearPrefix);

  // Phase 4 state machine. Customer bookings need payment; admin bookings
  // are recorded as already-confirmed walk-ins.
  const bookingStatus: 'pending_payment' | 'confirmed' = isAdminCreated
    ? 'confirmed'
    : 'pending_payment';
  const reservationStatus: 'hold' | 'active' = isAdminCreated ? 'active' : 'hold';
  const holdExpiresAt: Date | null = isAdminCreated
    ? null
    : new Date(Date.now() + env.BOOKING_HOLD_MINUTES * 60 * 1000);

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt += 1) {
    const candidateCode = nextBookingCode(year, baseCount + attempt);

    try {
      const result = await db.transaction(async (tx) => {
        let customer: { id: string };
        if (input.customerId) {
          const [row] = await tx
            .update(customers)
            .set({
              fullName: input.customer.fullName,
              email: input.customer.email,
              phone: input.customer.phone,
              gender: input.customer.gender,
              updatedAt: new Date(),
            })
            .where(eq(customers.id, input.customerId))
            .returning({ id: customers.id });
          if (!row) {
            throw new Error('Customer account not found.');
          }
          customer = row;
        } else {
          // Guest / script path: upsert by phone. If the phone exists, keep the
          // existing id but refresh name/email/gender.
          const [row] = await tx
            .insert(customers)
            .values({
              fullName: input.customer.fullName,
              email: input.customer.email,
              phone: input.customer.phone,
              gender: input.customer.gender,
              authProvider: 'email',
              kycStatus: 'pending',
            })
            .onConflictDoUpdate({
              target: customers.phone,
              set: {
                fullName: input.customer.fullName,
                email: input.customer.email,
                gender: input.customer.gender,
                updatedAt: new Date(),
              },
            })
            .returning({ id: customers.id });
          customer = row;
        }

        const [booking] = await tx
          .insert(bookings)
          .values({
            bookingCode: candidateCode,
            customerId: customer.id,
            status: bookingStatus,
            durationMode: input.durationMode,
            expectedCheckoutDate:
              input.durationMode === 'open_ended' || !endDate
                ? null
                : formatDate(endDate),
            subtotalPaise: quote.subtotalPaise,
            discountPaise,
            taxPaise: 0,
            totalPaise,
            depositPaise: quote.depositPaise,
            pricingSnapshot: snapshot,
            notes: input.notes ?? null,
            createdVia: isAdminCreated ? 'admin' : 'customer',
            createdByAdminId: input.createdByAdminId ?? null,
            blocksRoomAvailability: input.blocksRoomAvailability === true,
          })
          .returning({ id: bookings.id });

        const startIso = formatDate(startDate);
        const endIso = formatDate(reservationEnd);

        // One insert per bed. We could VALUES-batch this, but per-row
        // inserts let postgres point us at the specific conflicting row in
        // its error message if the EXCLUDE constraint fires.
        for (const bedId of reservationBedIds) {
          await tx
            .insert(bedReservations)
            .values({
              bookingId: booking.id,
              bedId,
              stayRange: sql`daterange(${startIso}::date, ${endIso}::date, '[)')` as unknown as string,
              kind: 'primary',
              status: reservationStatus,
              holdExpiresAt,
            });
        }

        if (dateCoupon && discountPaise > 0) {
          await tx.insert(couponRedemptions).values({
            bookingId: booking.id,
            customerId: customer.id,
            couponCode: dateCoupon.code,
            couponDate: dateCoupon.couponDate,
            discountPaise,
          });
        }

        await tx.insert(auditLog).values({
          actorType: isAdminCreated ? 'admin' : 'customer',
          actorId: isAdminCreated ? input.createdByAdminId ?? null : customer.id,
          entity: 'booking',
          entityId: booking.id,
          action: 'create',
          diff: {
            bookingCode: candidateCode,
            bedCount: reservationBedIds.length,
            billedBedCount: uniqueBedIds.length,
            blocksRoomAvailability: input.blocksRoomAvailability === true,
            durationMode: input.durationMode,
            status: bookingStatus,
            reservationStatus,
            holdExpiresAt: holdExpiresAt?.toISOString() ?? null,
            totalPaise,
            discountPaise,
            depositCreditAppliedPaise,
            couponCode: dateCoupon?.code ?? null,
          },
        });

        return { id: booking.id, customerId: customer.id };
      });

      await stampProfileCompletedAtIfReady(result.customerId);

      scheduleAdminNotificationSync();

      return {
        ok: true,
        bookingId: result.id,
        bookingCode: candidateCode,
        customerId: result.customerId,
        totalPaise,
        depositPaise: quote.depositPaise,
        status: bookingStatus,
        holdExpiresAt,
      };
    } catch (err) {
      lastErr = err;
      const code = pgCode(err);
      const constraint = pgConstraint(err);

      // booking_code collision → bump and retry with the next sequence.
      if (
        code === '23505' &&
        (constraint === 'bookings_booking_code_unique' ||
          /booking_code/.test(constraint ?? ''))
      ) {
        // Refresh the count in case other bookings landed during the gap.
        baseCount = await countBookingsInYear(yearPrefix);
        continue;
      }

      // Overlap constraint fired (race with another booking landed between
      // our pre-flight check and INSERT). Return a structured conflict so
      // the UI can re-render the cart and have the user pick a fresh bed.
      if (code === '23P01') {
        return {
          ok: false,
          kind: 'conflict',
          message:
            'One of the selected beds was just booked by another customer. ' +
            'Please pick a different bed or change your dates.',
          conflictBedIds: uniqueBedIds,
        };
      }

      // Anything else is a real failure — surface it.
      return {
        ok: false,
        kind: 'unknown',
        message:
          err instanceof Error
            ? err.message
            : 'Failed to create booking. Please try again.',
      };
    }
  }

  return {
    ok: false,
    kind: 'unknown',
    message:
      lastErr instanceof Error
        ? `Failed to allocate a unique booking code after ${MAX_CODE_RETRIES} attempts: ${lastErr.message}`
        : `Failed to allocate a unique booking code after ${MAX_CODE_RETRIES} attempts.`,
  };
}

// Re-export the snapshot builder so tests can exercise it without a DB.
export const _testing = { buildSnapshot };

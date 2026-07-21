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
  discountApplications,
  pgs,
  referralRedemptions,
  rooms,
  floors,
  adminUsers,
} from '../db/schema';
import type { PricingSnapshot } from '../db/schema/bookings';
import {
  resolveCheckoutDiscount,
} from '../lib/billing/discountEngine';
import { env } from '../lib/env';
import { formatDate, parseDate, type DateLike } from '../lib/dates';
import {
  stayTypeFromPricingMode,
  validateFixedDateStay,
  type StayType,
} from '../lib/stayType';
import { nextBookingCode, utcYear } from '../lib/bookingCode';
import { stampProfileCompletedAtIfReady } from './profile';
import { isBedAvailable, validateBedStayRange } from './availability';
import {
  reserveBlocksLongStay,
  validateShortStayDuringReserve,
} from './bedReserve';
import { getCancellationPolicyForStayType } from '@/src/lib/booking/bookingPolicies';
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
  /**
   * Admin only: deposit credit transferred from a prior booking wallet.
   * Customer bookings never auto-apply cross-booking deposit credit.
   */
  depositCreditAppliedPaise?: number;
};

export type CreateBookingSuccess = {
  ok: true;
  bookingId: string;
  bookingCode: string;
  customerId: string;
  totalPaise: number;
  depositPaise: number;
  /** Final booking status after createBooking returns. */
  status: 'draft' | 'pending_payment' | 'confirmed';
  holdExpiresAt: Date | null;
  draftExpiresAt: Date | null;
};

export type CreateBookingFailure = {
  ok: false;
  /** Discriminator so the UI can render the appropriate empty / error state. */
  kind:
    | 'validation'
    | 'conflict'
    | 'unavailable_bed'
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
    stayType: stayTypeFromPricingMode(quote.durationMode),
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
    cancellationPolicy: {
      ...getCancellationPolicyForStayType(stayTypeFromPricingMode(quote.durationMode)),
    },
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

  const isAdminCreated = input.createdVia === 'admin';

  if (input.durationMode !== 'open_ended' && !input.endDate) {
    return {
      ok: false,
      kind: 'validation',
      message: 'Check-out date is required for fixed-date stays.',
    };
  }

  if (
    !isAdminCreated &&
    (input.durationMode === 'daily' || input.durationMode === 'weekly')
  ) {
    return {
      ok: false,
      kind: 'validation',
      message: 'Short stays use Fixed-Date Stay — pick check-in and check-out dates.',
    };
  }

  const bookingStayType: StayType = stayTypeFromPricingMode(input.durationMode);

  const startDate = parseDate(input.startDate);
  const endDate = input.endDate ? parseDate(input.endDate) : null;
  if (endDate && endDate.getTime() <= startDate.getTime()) {
    return {
      ok: false,
      kind: 'validation',
      message: 'End date must be after start date.',
    };
  }

  if (!isAdminCreated && input.durationMode === 'fixed_stay' && endDate) {
    const fixedErr = validateFixedDateStay(
      formatDate(startDate),
      formatDate(endDate),
    );
    if (fixedErr) {
      return { ok: false, kind: 'validation', message: fixedErr };
    }
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

  const isOpenEndedMonthly =
    input.durationMode === 'open_ended' || input.durationMode === 'monthly';

  let reservationEnd: Date | null = null;
  if (input.reservationEndDate) {
    reservationEnd = parseDate(input.reservationEndDate);
  } else if (endDate) {
    reservationEnd = endDate;
  } else if (!isOpenEndedMonthly) {
    reservationEnd = new Date(
      Date.UTC(
        startDate.getUTCFullYear(),
        startDate.getUTCMonth() + 1,
        startDate.getUTCDate(),
      ),
    );
  }

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
            'This bed is reserved for a future tenant — only fixed-date stays are allowed until their check-in.',
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

  // 3. Compute the price quote (one round-trip per bed inside the pricing
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
  let appliedDiscountType: 'referral' | 'date_coupon' | 'promo_code' | null = null;
  let appliedPromoCode: string | null = null;
  let referralReferrerId: string | null = null;

  if (!isAdminCreated && input.couponCode?.trim()) {
    const resolved = await resolveCheckoutDiscount({
      kind: 'booking_checkout',
      amountPaise: quote.subtotalPaise,
      promoCode: input.couponCode,
      customerId: input.customerId,
      customerEmail: input.customer.email,
      customerPhone: input.customer.phone,
    });
    if ('error' in resolved) {
      return {
        ok: false,
        kind: 'validation',
        message: resolved.error,
      };
    }
    discountPaise = resolved.discountPaise;
    dateCoupon = resolved.dateCoupon;
    appliedDiscountType = resolved.discountType;
    appliedPromoCode = resolved.code;
    if (resolved.discountType === 'referral' && resolved.referrerCustomerId) {
      referralReferrerId = resolved.referrerCustomerId;
    }
  }

  // Booking deposits are booking-scoped. Cross-booking wallet credit is never
  // auto-applied — only when an admin explicitly passes depositCreditAppliedPaise.
  let depositCreditAppliedPaise = 0;
  if (isAdminCreated && (input.depositCreditAppliedPaise ?? 0) > 0) {
    depositCreditAppliedPaise = Math.min(
      quote.depositPaise,
      Math.max(0, input.depositCreditAppliedPaise ?? 0),
    );
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
  if (depositCreditAppliedPaise > 0 && isAdminCreated) {
    snapshot.depositCredit = {
      requiredPaise: quote.depositPaise,
      appliedPaise: depositCreditAppliedPaise,
      additionalDuePaise: additionalDepositDuePaise,
      appliedAt: new Date().toISOString(),
      adminTransferred: true,
      transferredByAdminId: input.createdByAdminId,
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

  // Five-state lifecycle: customer path creates draft only (no bed_reservations).
  // Reservations are created as under_review when payment proof is submitted.
  const bookingStatus: 'draft' | 'confirmed' = isAdminCreated ? 'confirmed' : 'draft';
  const reservationStatus: 'active' | null = isAdminCreated ? 'active' : null;
  const draftExpiresAt: Date | null = isAdminCreated
    ? null
    : (await import('@/src/lib/reservationLifecycle')).draftExpiresAtFromNow();
  const holdExpiresAt = null as Date | null;

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

        const startIso = formatDate(startDate);

        const [booking] = await tx
          .insert(bookings)
          .values({
            bookingCode: candidateCode,
            customerId: customer.id,
            status: bookingStatus,
            durationMode: input.durationMode,
            stayType: bookingStayType,
            expectedCheckoutDate:
              isOpenEndedMonthly || !endDate
                ? null
                : formatDate(endDate),
            billingAnchorDate: startIso,
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
            draftExpiresAt,
          })
          .returning({ id: bookings.id });

        // Admin walk-ins only — customer drafts get reservations on proof submit.
        if (reservationStatus) {
          for (const bedId of reservationBedIds) {
            const stayRange =
              isOpenEndedMonthly
                ? (sql`daterange(${startIso}::date, NULL, '[)')` as unknown as string)
                : (sql`daterange(${startIso}::date, ${formatDate(reservationEnd!)}::date, '[)')` as unknown as string);
            await tx
              .insert(bedReservations)
              .values({
                bookingId: booking.id,
                bedId,
                stayRange,
                kind: 'primary',
                status: reservationStatus,
                holdExpiresAt,
              });
          }
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

        if (referralReferrerId && appliedPromoCode && discountPaise > 0) {
          await tx.insert(referralRedemptions).values({
            referrerCustomerId: referralReferrerId,
            refereeEmail: input.customer.email.toLowerCase(),
            refereeCustomerId: customer.id,
            bookingId: booking.id,
            discountPaise,
            status: 'pending',
          });
        }

        if (discountPaise > 0 && appliedDiscountType) {
          await tx.insert(discountApplications).values({
            discountType: appliedDiscountType,
            originalAmountPaise: quote.subtotalPaise,
            discountAmountPaise: discountPaise,
            finalAmountPaise: quote.subtotalPaise - discountPaise,
            appliedByCustomerId: customer.id,
            bookingId: booking.id,
            couponCode:
              appliedDiscountType === 'referral' ? null : appliedPromoCode,
            referralCode: appliedDiscountType === 'referral' ? appliedPromoCode : null,
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

      if (isAdminCreated && bookingStatus === 'confirmed') {
        try {
          const { supersedePriorOpenBookingsForConfirmedBooking } = await import(
            '@/src/services/supersededBookingLifecycle'
          );
          await supersedePriorOpenBookingsForConfirmedBooking(result.id, {
            supersededByAdminId: input.createdByAdminId ?? null,
          });
        } catch (supersedeErr) {
          console.error('supersede prior open bookings on admin create failed:', supersedeErr);
        }
      }

      scheduleAdminNotificationSync();

      if (!isAdminCreated) {
        const { emitBookingCreatedAdminNotifications } = await import(
          '@/src/services/notificationEngine'
        );
        const { adminCanAccessPg } = await import('@/src/lib/auth/roles');
        const [pgRow] = await db
          .select({ id: pgs.id, name: pgs.name })
          .from(pgs)
          .innerJoin(floors, eq(floors.pgId, pgs.id))
          .innerJoin(rooms, eq(rooms.floorId, floors.id))
          .innerJoin(beds, eq(beds.roomId, rooms.id))
          .where(eq(beds.id, uniqueBedIds[0]!))
          .limit(1);
        const admins = await db
          .select({ id: adminUsers.id, role: adminUsers.role, pgScope: adminUsers.pgScope })
          .from(adminUsers)
          .where(eq(adminUsers.isActive, true));
        const adminIds = pgRow
          ? admins
              .filter((a) => adminCanAccessPg({ role: a.role, pgScope: a.pgScope }, pgRow.id))
              .map((a) => a.id)
          : admins.map((a) => a.id);
        if (adminIds.length > 0 && pgRow) {
          void emitBookingCreatedAdminNotifications({
            adminIds,
            bookingId: result.id,
            bookingCode: candidateCode,
            pgName: pgRow.name,
            residentName: input.customer.fullName,
          });
        }
      }

      const { scheduleAvailabilityCacheInvalidation } = await import(
        '@/src/lib/cache/invalidateAvailability'
      );
      scheduleAvailabilityCacheInvalidation({ bookingId: result.id });

      return {
        ok: true,
        bookingId: result.id,
        bookingCode: candidateCode,
        customerId: result.customerId,
        totalPaise,
        depositPaise: quote.depositPaise,
        status: bookingStatus,
        holdExpiresAt,
        draftExpiresAt,
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

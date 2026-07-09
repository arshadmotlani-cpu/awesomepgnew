/**
 * Booking lifecycle.
 *
 * Phase 4 of PROJECT_PLAN.md. createBooking() (in ./booking.ts) now leaves
 * the booking in `pending_payment` with all `bed_reservations` in `hold`
 * and a `hold_expires_at` timestamp. This module owns every transition out
 * of that state:
 *
 *   recordPaymentSuccess(input)  hold + pending_payment → active + confirmed
 *   recordPaymentFailure(input)  hold + pending_payment → cancelled + cancelled
 *   releaseExpiredHolds()        sweeper: cron, idempotent
 *   cancelBooking(input)         user/admin cancellation + refund
 *
 * Idempotency is the headline requirement. Webhooks are at-least-once: the
 * same payment id can arrive 1×, 2×, or 5× — and the result must be one
 * payment row, one confirmed booking, one audit log entry. The
 * `payments_provider_payment_id_unique` partial index is the storage-layer
 * authority; this code interprets `23505` on that index as "already
 * processed, no-op" rather than an error.
 */

import { and, eq, inArray, isNotNull, lte, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  auditLog,
  bedReserveHolds,
  bedReservations,
  bookings,
  payments,
  stayExtensions,
} from '../db/schema';
import type { PricingSnapshot } from '../db/schema/bookings';
import { formatDate, parseDate } from '../lib/dates';
import type { ProviderName } from './payments';
import { getPaymentProvider } from './payments';

/**
 * Phase 5 — superset of {@link ProviderName} that also accepts the
 * offline-payment provider variants we write straight into the ledger
 * (no webhook involved). `payments.provider` is a Postgres enum that
 * already includes these — this is just the TS type alignment.
 */
export type AnyPaymentProvider =
  | ProviderName
  | 'cash'
  | 'upi_manual'
  | 'bank_transfer';
import {
  DEFAULT_POLICY,
  computeRefund,
  type CancellationPolicy,
  type RefundComputation,
} from './cancellationPolicy';
import { markExpiredExtensions } from './extension';
import { env } from '@/src/lib/env';
import {
  bookingCancellationBlockedReason,
  isTerminalBookingLifecycleStatus,
  type BookingStatus,
} from '@/src/lib/booking/bookingStatus';

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export type LifecycleActor =
  | { kind: 'customer'; customerId: string | null }
  | { kind: 'admin'; adminId: string | null }
  | { kind: 'system'; note?: string };

export type RecordPaymentSuccessInput = {
  /** Provider that signed the webhook. */
  provider: AnyPaymentProvider;
  providerPaymentId: string;
  providerOrderId?: string | null;
  amountPaise: number;
  currency?: string;
  /** Awesome PG's `bookings.booking_code` (== webhook receipt). */
  bookingCode: string;
  rawPayload?: unknown;
  /** PS4 add-on portion included in amountPaise — excluded from rent/deposit split. */
  membershipAmountPaise?: number;
  /** Admin-approved partial deposit move-in. */
  partialDeposit?: {
    depositDueDate: string;
    approvedByAdminId: string;
  };
  /** Admin who recorded an offline payment — used for audit attribution. */
  recordedByAdminId?: string;
  /** Overpayment after rent/deposit/prior allocation (admin-selected disposition). */
  overpayment?: {
    excessPaise: number;
    disposition: 'wallet_credit' | 'future_adjustment' | 'refund' | 'refund_later';
    approvedByAdminId?: string;
  };
};

export type RecordPaymentSuccessResult =
  | {
      ok: true;
      paymentId: string;
      bookingId: string;
      bookingCode: string;
      /** True if this call actually changed state; false if it was a duplicate webhook. */
      stateChanged: boolean;
    }
  | { ok: false; reason: string };

export type RecordPaymentFailureInput = {
  provider: ProviderName;
  providerPaymentId: string;
  providerOrderId?: string | null;
  bookingCode: string;
  reason: string;
  rawPayload?: unknown;
};

export type ReleaseExpiredHoldsResult = {
  bookingsCancelled: number;
  reservationsReleased: number;
  /** Booking codes that were flipped from pending_payment → cancelled. */
  cancelledCodes: string[];
  /** Phase 5: stay_extensions rows that flipped pending → cancelled. */
  expiredExtensions: number;
};

export type CancelBookingInput = {
  bookingCode: string;
  reason: string;
  actor: LifecycleActor;
  /**
   * Pass a fixed timestamp in tests; defaults to `new Date()`. Cancellation
   * tier is derived from this vs. the booking's earliest check-in.
   */
  cancelAt?: Date;
  /**
   * Optional policy override. If unset, the policy snapshotted onto the
   * booking is used; if that's missing too, the runtime DEFAULT_POLICY.
   */
  policyOverride?: CancellationPolicy;
};

export type CancelBookingResult =
  | {
      ok: true;
      bookingId: string;
      bookingCode: string;
      refund: RefundComputation;
      /** Payment row created for the refund, if any. */
      refundPaymentId: string | null;
    }
  | { ok: false; reason: string };

// ───────────────────────────────────────────────────────────────────────────
// Internal helpers
// ───────────────────────────────────────────────────────────────────────────

function actorTypeFor(a: LifecycleActor): 'customer' | 'admin' | 'system' {
  return a.kind;
}
function actorIdFor(a: LifecycleActor): string | null {
  if (a.kind === 'customer') return a.customerId;
  if (a.kind === 'admin') return a.adminId;
  return null;
}

function pgErrorCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'code' in err) {
    const c = (err as { code?: unknown }).code;
    if (typeof c === 'string') return c;
  }
  return null;
}

/** True when activating this booking would overlap an already-confirmed stay. */
async function bookingActivationConflicts(bookingId: string): Promise<string | null> {
  const holds = await db
    .select({
      bedId: bedReservations.bedId,
      stayRange: bedReservations.stayRange,
    })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.bookingId, bookingId),
        eq(bedReservations.status, 'hold'),
        eq(bedReservations.kind, 'primary'),
      ),
    );

  for (const hold of holds) {
    const [conflict] = await db
      .select({ id: bedReservations.id })
      .from(bedReservations)
      .where(
        and(
          eq(bedReservations.bedId, hold.bedId),
          eq(bedReservations.status, 'active'),
          sql`${bedReservations.bookingId} <> ${bookingId}::uuid`,
          sql`${bedReservations.stayRange} && ${hold.stayRange}::daterange`,
        ),
      )
      .limit(1);
    if (conflict) {
      return (
        'This bed is already confirmed for another guest. Reject this payment or ask the ' +
        'customer to choose a different bed.'
      );
    }
  }
  return null;
}

/**
 * Earliest check-in across a booking's primary reservations, in UTC. Used to
 * compute the cancellation refund tier. Returns `null` if the booking has no
 * reservations (defensive — shouldn't happen for non-draft bookings).
 */
async function earliestCheckIn(bookingId: string): Promise<Date | null> {
  const rows = await db
    .select({
      lower: sql<string | null>`to_char(lower(${bedReservations.stayRange}), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
    })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.bookingId, bookingId),
        eq(bedReservations.kind, 'primary'),
      ),
    );
  const dates = rows
    .map((r) => (r.lower ? new Date(r.lower) : null))
    .filter((d): d is Date => d != null && !Number.isNaN(d.getTime()));
  if (dates.length === 0) return null;
  return new Date(Math.min(...dates.map((d) => d.getTime())));
}

/**
 * DR-03 — Financial mirror phase (fail-closed).
 *
 * Transaction boundaries for `recordPaymentSuccess`:
 *   Phase A (single db.transaction): payment insert, booking → confirmed,
 *     primary reservations hold → active, payment_succeeded audit.
 *   Phase B (this function, must succeed or Phase A is compensated):
 *     deposit ledger, deposit credit transfer, partial/full collection status,
 *     prior outstanding allocation, overpayment disposition.
 *   Phase C (best-effort after Phase B): notifications, automation, PS4, analytics.
 */
async function applyBookingPaymentFinancialMirrors(input: {
  booking: {
    id: string;
    customerId: string;
    bookingCode: string;
    subtotalPaise: number;
    discountPaise: number;
    depositPaise: number;
    totalPaise: number;
    pricingSnapshot: PricingSnapshot | null;
  };
  paymentId: string;
  recordPaymentSuccessInput: RecordPaymentSuccessInput;
}): Promise<void> {
  const { booking, paymentId, recordPaymentSuccessInput: payInput } = input;
  const snapshot = booking.pricingSnapshot as PricingSnapshot | null;
  const creditApplied =
    snapshot?.depositCredit?.adminTransferred === true
      ? (snapshot.depositCredit.appliedPaise ?? 0)
      : 0;

  const {
    validateBookingPayment,
    applyPartialDepositOnConfirm,
    applyFullDepositOnConfirm,
  } = await import('./depositCollection');
  const validation = validateBookingPayment({
    booking,
    amountPaise: payInput.amountPaise,
    membershipAmountPaise: payInput.membershipAmountPaise,
    allowPartialDeposit: Boolean(payInput.partialDeposit),
  });
  const split = validation.ok ? validation.split : null;
  const depositPaisePaid =
    split?.depositPaisePaid ?? Math.max(0, booking.depositPaise - creditApplied);

  if (creditApplied > 0 && snapshot?.depositCredit?.adminTransferred === true) {
    const { applyDepositCreditToBooking } = await import('./depositCredit');
    const creditResult = await applyDepositCreditToBooking({
      customerId: booking.customerId,
      targetBookingId: booking.id,
      creditPaise: creditApplied,
      sourceBookingId: snapshot.depositCredit.sourceBookingId,
    });
    if (!creditResult.ok) {
      throw new Error(`Deposit credit transfer failed: ${creditResult.error}`);
    }
  }

  if (depositPaisePaid > 0) {
    const { recordDepositCollected } = await import('./deposits');
    await recordDepositCollected({
      bookingId: booking.id,
      customerId: booking.customerId,
      amountPaise: depositPaisePaid,
      reason: `deposit captured with payment ${payInput.providerPaymentId}`,
      relatedPaymentId: paymentId,
    });
  }

  if (payInput.partialDeposit && split && split.depositDuePaise > 0) {
    await applyPartialDepositOnConfirm({
      bookingId: booking.id,
      depositDuePaise: split.depositDuePaise,
      depositDueDate: payInput.partialDeposit.depositDueDate,
      approvedByAdminId: payInput.partialDeposit.approvedByAdminId,
    });
  } else if (
    split?.isFullPayment ||
    depositPaisePaid + creditApplied >= booking.depositPaise
  ) {
    await applyFullDepositOnConfirm(booking.id);
  }

  let priorOutstandingAppliedPaise = 0;
  const priorOutstanding = snapshot?.priorOutstanding;
  if (priorOutstanding && priorOutstanding.totalPaise > 0 && split) {
    const bookingPaymentPaise = Math.max(
      0,
      payInput.amountPaise - (payInput.membershipAmountPaise ?? 0),
    );
    const newBookingPaid = split.rentPaisePaid + split.depositPaisePaid;
    const priorSlice = Math.max(0, bookingPaymentPaise - newBookingPaid);
    if (priorSlice > 0) {
      priorOutstandingAppliedPaise = priorSlice;
      const { applyPriorOutstandingFromCheckoutPayment } = await import(
        './bookingPriorOutstanding'
      );
      await applyPriorOutstandingFromCheckoutPayment({
        customerId: booking.customerId,
        priorOutstanding,
        amountPaise: priorSlice,
        relatedPaymentId: paymentId,
      });
    }
  }

  const overpaymentInput = payInput.overpayment;
  if (overpaymentInput && overpaymentInput.excessPaise > 0) {
    const { applyBookingOverpaymentDisposition } = await import('./bookingOverpayment');
    await applyBookingOverpaymentDisposition({
      bookingId: booking.id,
      bookingCode: booking.bookingCode,
      customerId: booking.customerId,
      paymentId,
      excessPaise: overpaymentInput.excessPaise,
      disposition: overpaymentInput.disposition,
      approvedByAdminId:
        overpaymentInput.approvedByAdminId ?? payInput.recordedByAdminId ?? null,
    });
  } else if (!overpaymentInput) {
    const { computeBookingCheckoutOverpaymentPaise } = await import('./bookingOverpayment');
    const excessPaise = computeBookingCheckoutOverpaymentPaise({
      booking,
      amountPaise: payInput.amountPaise,
      membershipAmountPaise: payInput.membershipAmountPaise,
      priorOutstandingAppliedPaise,
    });
    if (excessPaise > 0) {
      throw new Error(
        `Overpayment of ${excessPaise} paise requires admin disposition before confirm`,
      );
    }
  }
}

async function applyZeroDepositOverpaymentMirror(input: {
  booking: { id: string; bookingCode: string; customerId: string };
  paymentId: string;
  overpayment: NonNullable<RecordPaymentSuccessInput['overpayment']>;
  recordedByAdminId?: string | null;
}): Promise<void> {
  const { applyBookingOverpaymentDisposition } = await import('./bookingOverpayment');
  await applyBookingOverpaymentDisposition({
    bookingId: input.booking.id,
    bookingCode: input.booking.bookingCode,
    customerId: input.booking.customerId,
    paymentId: input.paymentId,
    excessPaise: input.overpayment.excessPaise,
    disposition: input.overpayment.disposition,
    approvedByAdminId: input.overpayment.approvedByAdminId ?? input.recordedByAdminId ?? null,
  });
}

/** Reverts Phase A when Phase B financial mirrors fail (DR-03). */
async function compensateFailedBookingPaymentConfirm(input: {
  bookingId: string;
  paymentId: string;
  priorBookingStatus: string;
  wasAwaitingConfirm: boolean;
  isReserveBooking: boolean;
  reason: string;
  recordedByAdminId?: string | null;
}): Promise<void> {
  const holdExpiresAt =
    input.wasAwaitingConfirm && input.priorBookingStatus === 'pending_payment'
      ? new Date(Date.now() + env.BOOKING_HOLD_MINUTES * 60 * 1000)
      : null;

  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(payments.id, input.paymentId));

    if (input.wasAwaitingConfirm && !input.isReserveBooking) {
      await tx
        .update(bookings)
        .set({
          status: input.priorBookingStatus as 'pending_payment' | 'pending_approval' | 'draft' | 'confirmed',
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, input.bookingId));

      await tx
        .update(bedReservations)
        .set({
          status: 'hold',
          holdExpiresAt,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(bedReservations.bookingId, input.bookingId),
            eq(bedReservations.status, 'active'),
            eq(bedReservations.kind, 'primary'),
          ),
        );
    }

    await tx.insert(auditLog).values({
      actorType: input.recordedByAdminId ? 'admin' : 'system',
      actorId: input.recordedByAdminId ?? null,
      entity: 'booking',
      entityId: input.bookingId,
      action: 'payment_confirm_compensated',
      diff: {
        paymentId: input.paymentId,
        reason: input.reason,
        priorBookingStatus: input.priorBookingStatus,
      },
    });
  });
}

// ───────────────────────────────────────────────────────────────────────────
// recordPaymentSuccess — webhook entry point (idempotent)
// ───────────────────────────────────────────────────────────────────────────

export async function recordPaymentSuccess(
  input: RecordPaymentSuccessInput,
): Promise<RecordPaymentSuccessResult> {
  // 1. Locate the booking by code. Doing this first means we can give a
  //    clear "no such booking" error before we touch the payments table.
  const [booking] = await db
    .select({
      id: bookings.id,
      status: bookings.status,
      durationMode: bookings.durationMode,
      subtotalPaise: bookings.subtotalPaise,
      discountPaise: bookings.discountPaise,
      totalPaise: bookings.totalPaise,
      depositPaise: bookings.depositPaise,
      customerId: bookings.customerId,
      bookingCode: bookings.bookingCode,
      pricingSnapshot: bookings.pricingSnapshot,
      billingAnchorDate: bookings.billingAnchorDate,
      expectedCheckoutDate: bookings.expectedCheckoutDate,
    })
    .from(bookings)
    .where(eq(bookings.bookingCode, input.bookingCode))
    .limit(1);
  if (!booking) {
    return { ok: false, reason: `no booking with code "${input.bookingCode}"` };
  }

  const wasAwaitingConfirm =
    booking.status === 'pending_payment' ||
    booking.status === 'pending_approval' ||
    booking.status === 'draft';

  const isReserveBooking = booking.durationMode === 'reserve';

  if (!isReserveBooking && booking.depositPaise > 0) {
    const { validateBookingPayment } = await import('./depositCollection');
    const validation = validateBookingPayment({
      booking,
      amountPaise: input.amountPaise,
      membershipAmountPaise: input.membershipAmountPaise,
      allowPartialDeposit: Boolean(input.partialDeposit),
    });
    if (!validation.ok) {
      return { ok: false, reason: validation.reason };
    }
  } else if (!isReserveBooking && !input.partialDeposit) {
    const bookingPaymentPaise = Math.max(
      0,
      input.amountPaise - (input.membershipAmountPaise ?? 0),
    );
    if (bookingPaymentPaise < booking.totalPaise) {
      return {
        ok: false,
        reason: `Payment is short by ₹${((booking.totalPaise - bookingPaymentPaise) / 100).toFixed(0)}.`,
      };
    }
  }

  if (
    !isReserveBooking &&
    (booking.status === 'pending_payment' ||
      booking.status === 'pending_approval' ||
      booking.status === 'draft')
  ) {
    const conflictReason = await bookingActivationConflicts(booking.id);
    if (conflictReason) {
      return { ok: false, reason: conflictReason };
    }
  }

  // 2. Idempotency probe: has this exact (provider, providerPaymentId) pair
  //    already been recorded? If so, return ok with stateChanged=false.
  const [existing] = await db
    .select({ id: payments.id, status: payments.status, bookingId: payments.bookingId })
    .from(payments)
    .where(
      and(
        eq(payments.provider, input.provider),
        eq(payments.providerPaymentId, input.providerPaymentId),
      ),
    )
    .limit(1);
  if (existing) {
    try {
      const { ensureBookingRentInvoiceForExistingPayment } = await import(
        './bookingPaymentInvoices'
      );
      await ensureBookingRentInvoiceForExistingPayment(existing.id);
    } catch (repairErr) {
      console.error('booking rent invoice replay repair failed:', repairErr);
    }
    if (isReserveBooking) {
      const { ensureBedReserveHoldActiveForBooking } = await import('./bedReserve');
      await ensureBedReserveHoldActiveForBooking(booking.id);
    }
    return {
      ok: true,
      paymentId: existing.id,
      bookingId: existing.bookingId,
      bookingCode: input.bookingCode,
      stateChanged: false,
    };
  }

  // 3. Transactional state flip. We rely on the partial unique index
  //    `payments_provider_payment_id_unique` to catch a webhook racing with
  //    itself (e.g. our probe + insert window). SQLSTATE 23505 there means
  //    "another caller already wrote this", which we treat as success.
  try {
    const result = await db.transaction(async (tx) => {
      const [payment] = await tx
        .insert(payments)
        .values({
          bookingId: booking.id,
          purpose: isReserveBooking ? 'bed_reserve' : 'booking',
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
          providerOrderId: input.providerOrderId ?? null,
          amountPaise: input.amountPaise,
          currency: input.currency ?? 'INR',
          status: 'succeeded',
          rawPayload: (input.rawPayload as object | undefined) ?? null,
          paidAt: new Date(),
        })
        .returning({ id: payments.id });

      let flippedCount = 0;
      if (!isReserveBooking) {
        const flipped = await tx
          .update(bedReservations)
          .set({ status: 'active', holdExpiresAt: null, updatedAt: new Date() })
          .where(
            and(
              eq(bedReservations.bookingId, booking.id),
              inArray(bedReservations.status, ['hold', 'under_review']),
              eq(bedReservations.kind, 'primary'),
            ),
          )
          .returning({ id: bedReservations.id });
        flippedCount = flipped.length;

        if (flippedCount === 0 && wasAwaitingConfirm) {
          const snapshot = booking.pricingSnapshot as {
            perBed?: Array<{ bedId: string }>;
          } | null;
          const bedIds = snapshot?.perBed?.map((b) => b.bedId).filter(Boolean) ?? [];
          const startIso = booking.billingAnchorDate;
          const isOpenEnded =
            booking.durationMode === 'open_ended' || booking.durationMode === 'monthly';
          if (startIso && bedIds.length > 0) {
            const endIso =
              !isOpenEnded && booking.expectedCheckoutDate
                ? formatDate(parseDate(booking.expectedCheckoutDate))
                : null;
            for (const bedId of bedIds) {
              const stayRange = isOpenEnded
                ? (sql`daterange(${startIso}::date, NULL, '[)')` as unknown as string)
                : (sql`daterange(${startIso}::date, ${endIso}::date, '[)')` as unknown as string);
              await tx.insert(bedReservations).values({
                bookingId: booking.id,
                bedId,
                stayRange,
                kind: 'primary',
                status: 'active',
              });
              flippedCount += 1;
            }
          }
        }
      }

      // Flip the booking itself if it was awaiting payment. We do NOT flip
      // already-`confirmed` bookings (defensive: admins might have manually
      // confirmed).
      if (
        booking.status === 'pending_payment' ||
        booking.status === 'pending_approval' ||
        booking.status === 'draft'
      ) {
        await tx
          .update(bookings)
          .set({
            status: isReserveBooking ? 'pending_approval' : 'confirmed',
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, booking.id));
      }

      if (isReserveBooking) {
        const activated = await tx
          .update(bedReserveHolds)
          .set({ status: 'active', holdExpiresAt: null, updatedAt: new Date() })
          .where(
            and(
              eq(bedReserveHolds.bookingId, booking.id),
              inArray(bedReserveHolds.status, ['under_review', 'pending_payment']),
            ),
          )
          .returning({ id: bedReserveHolds.id });
        if (activated.length === 0) {
          const { ensureBedReserveHoldActiveForBooking } = await import('./bedReserve');
          const repaired = await ensureBedReserveHoldActiveForBooking(booking.id, tx);
          if (!repaired.ok) {
            throw new Error('Reserve hold not found for this booking.');
          }
        }
      }

      await tx.insert(auditLog).values({
        actorType: input.recordedByAdminId ? 'admin' : 'system',
        actorId: input.recordedByAdminId ?? null,
        entity: 'booking',
        entityId: booking.id,
        action: 'payment_succeeded',
        diff: {
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
          amountPaise: input.amountPaise,
          reservationsFlipped: flippedCount,
          fromStatus: booking.status,
          toStatus: wasAwaitingConfirm
            ? isReserveBooking
              ? 'pending_approval'
              : 'confirmed'
            : booking.status,
          reserveBooking: isReserveBooking,
          adminAmountOverrideReason: input.rawPayload
            ? (input.rawPayload as { adminAmountOverrideReason?: string }).adminAmountOverrideReason
            : undefined,
        },
      });

      return { paymentId: payment.id, isReserveBooking };
    });

    if (!result.isReserveBooking && (
      wasAwaitingConfirm &&
      (booking.durationMode === 'monthly' || booking.durationMode === 'open_ended')
    )) {
      try {
        const { clearBedAdminMarks } = await import('./bookingAdminOps');
        const assignedBeds = await db
          .select({ bedId: bedReservations.bedId })
          .from(bedReservations)
          .where(
            and(
              eq(bedReservations.bookingId, booking.id),
              eq(bedReservations.kind, 'primary'),
            ),
          );
        for (const row of assignedBeds) {
          await clearBedAdminMarks(row.bedId);
        }
      } catch (markErr) {
        console.error('clear admin bed marks after payment failed:', markErr);
      }
    }

    if (!isReserveBooking && booking.depositPaise > 0 && wasAwaitingConfirm) {
      try {
        await applyBookingPaymentFinancialMirrors({
          booking,
          paymentId: result.paymentId,
          recordPaymentSuccessInput: input,
        });
      } catch (mirrorErr) {
        const reason =
          mirrorErr instanceof Error ? mirrorErr.message : 'Deposit ledger mirror failed';
        console.error('deposit ledger mirror failed:', mirrorErr);
        await compensateFailedBookingPaymentConfirm({
          bookingId: booking.id,
          paymentId: result.paymentId,
          priorBookingStatus: booking.status,
          wasAwaitingConfirm,
          isReserveBooking,
          reason,
          recordedByAdminId: input.recordedByAdminId,
        });
        return { ok: false, reason };
      }
    } else if (!isReserveBooking && wasAwaitingConfirm && booking.depositPaise <= 0) {
      const overpaymentInput = input.overpayment;
      if (overpaymentInput && overpaymentInput.excessPaise > 0) {
        try {
          await applyZeroDepositOverpaymentMirror({
            booking,
            paymentId: result.paymentId,
            overpayment: overpaymentInput,
            recordedByAdminId: input.recordedByAdminId,
          });
        } catch (overpayErr) {
          const reason =
            overpayErr instanceof Error ? overpayErr.message : 'Overpayment disposition failed';
          await compensateFailedBookingPaymentConfirm({
            bookingId: booking.id,
            paymentId: result.paymentId,
            priorBookingStatus: booking.status,
            wasAwaitingConfirm,
            isReserveBooking,
            reason,
            recordedByAdminId: input.recordedByAdminId,
          });
          return { ok: false, reason };
        }
      }
    }

    if (!isReserveBooking && wasAwaitingConfirm) {
      try {
        const { applyBookingRentInvoiceOnPaymentSuccess } = await import(
          './bookingPaymentInvoices'
        );
        const rentInvoice = await applyBookingRentInvoiceOnPaymentSuccess({
          booking,
          paymentId: result.paymentId,
          paymentAmountPaise: input.amountPaise,
          membershipAmountPaise: input.membershipAmountPaise,
          providerPaymentId: input.providerPaymentId,
        });
        if (!rentInvoice.ok) {
          await compensateFailedBookingPaymentConfirm({
            bookingId: booking.id,
            paymentId: result.paymentId,
            priorBookingStatus: booking.status,
            wasAwaitingConfirm,
            isReserveBooking,
            reason: rentInvoice.reason,
            recordedByAdminId: input.recordedByAdminId,
          });
          return { ok: false, reason: rentInvoice.reason };
        }
        if (booking.durationMode === 'monthly' || booking.durationMode === 'open_ended') {
          const { ensureBillingProfileForBooking } = await import(
            '@/src/services/residentBillingProfiles'
          );
          await ensureBillingProfileForBooking(booking.id).catch(() => undefined);
        }
      } catch (rentErr) {
        const reason =
          rentErr instanceof Error ? rentErr.message : 'Booking rent invoice failed';
        console.error('booking rent invoice failed:', rentErr);
        await compensateFailedBookingPaymentConfirm({
          bookingId: booking.id,
          paymentId: result.paymentId,
          priorBookingStatus: booking.status,
          wasAwaitingConfirm,
          isReserveBooking,
          reason,
          recordedByAdminId: input.recordedByAdminId,
        });
        return { ok: false, reason };
      }
    }

    try {
      const { clearBedInterestForBooking } = await import('./bedNoticeInterest');
      if (!isReserveBooking && wasAwaitingConfirm) {
        await clearBedInterestForBooking(booking.id);
      }
    } catch (interestErr) {
      console.error('clear bed interest after booking failed:', interestErr);
    }

    try {
      const { activatePendingMembershipForBooking } = await import('./playstationMembership');
      if (!isReserveBooking && wasAwaitingConfirm) {
        await activatePendingMembershipForBooking(booking.id);
      }
    } catch (ps4Err) {
      console.error('PS4 membership activation failed:', ps4Err);
    }

    if (!isReserveBooking && wasAwaitingConfirm) {
      try {
        const { ensureContinuousResidencyOnBookingConfirmed } = await import(
          '@/src/services/continuousResidency'
        );
        await ensureContinuousResidencyOnBookingConfirmed(booking.id);
      } catch (residencyErr) {
        console.error('continuous residency on booking confirm failed:', residencyErr);
      }
    }

    if (!isReserveBooking && wasAwaitingConfirm) {
      try {
        const { supersedePriorOpenBookingsForConfirmedBooking } = await import(
          '@/src/services/supersededBookingLifecycle'
        );
        await supersedePriorOpenBookingsForConfirmedBooking(booking.id, {
          supersededByAdminId: input.recordedByAdminId ?? null,
        });
      } catch (supersedeErr) {
        console.error('supersede prior open bookings failed:', supersedeErr);
      }
    }

    if (!isReserveBooking && wasAwaitingConfirm) {
      try {
        const { creditReferralEarningOnBookingPayment } = await import('./referrals');
        await creditReferralEarningOnBookingPayment({
          bookingId: booking.id,
          rentSubtotalPaise: Math.max(
            0,
            Number(booking.subtotalPaise ?? 0) - Number(booking.discountPaise ?? 0),
          ),
        });
      } catch (referralErr) {
        console.error('referral earning credit failed:', referralErr);
      }
    }

    const { notifyBookingConfirmed, notifyPaymentReceipt } = await import(
      '@/src/lib/email/notifications'
    );
    if (wasAwaitingConfirm) {
      notifyBookingConfirmed({
        customerId: booking.customerId,
        bookingCode: booking.bookingCode,
        totalPaise: input.amountPaise,
      });
    }
    notifyPaymentReceipt({
      customerId: booking.customerId,
      purpose: 'booking',
      amountPaise: input.amountPaise,
      reference: booking.bookingCode,
    });

    if (wasAwaitingConfirm && !isReserveBooking) {
      try {
        const { bedReservations, customers, floors, pgs, rooms, beds } = await import(
          '@/src/db/schema'
        );
        const [ctx] = await db
          .select({
            customerName: customers.fullName,
            pgId: pgs.id,
            pgName: pgs.name,
          })
          .from(bookings)
          .innerJoin(customers, eq(customers.id, bookings.customerId))
          .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
          .innerJoin(beds, eq(beds.id, bedReservations.bedId))
          .innerJoin(rooms, eq(rooms.id, beds.roomId))
          .innerJoin(floors, eq(floors.id, rooms.floorId))
          .innerJoin(pgs, eq(pgs.id, floors.pgId))
          .where(
            and(eq(bookings.id, booking.id), eq(bedReservations.kind, 'primary')),
          )
          .limit(1);
        if (ctx) {
          const { emitPaymentReceivedAutomation } = await import('./automationEngine');
          void emitPaymentReceivedAutomation({
            pgId: ctx.pgId,
            customerId: booking.customerId,
            bookingId: booking.id,
            paymentId: result.paymentId,
            amountPaise: input.amountPaise,
            pgName: ctx.pgName,
            customerName: ctx.customerName,
            paymentPurpose: 'booking_checkout',
          });
        }
      } catch (automationErr) {
        console.error('payment received automation failed:', automationErr);
      }
    }

    const { trackAnalyticsEvent } = await import('./visitorAnalytics');
    void trackAnalyticsEvent({ eventType: 'payment_completed' });
    if (!isReserveBooking && wasAwaitingConfirm) {
      const today = new Date().toISOString().slice(0, 10);
      const [stayRow] = await db
        .select({
          checkIn: sql<string>`lower(${bedReservations.stayRange})::date::text`,
        })
        .from(bedReservations)
        .where(
          and(
            eq(bedReservations.bookingId, booking.id),
            eq(bedReservations.kind, 'primary'),
          ),
        )
        .limit(1);
      if (stayRow?.checkIn && stayRow.checkIn <= today) {
        void trackAnalyticsEvent({ eventType: 'check_in_completed' });
      }
    }

    return {
      ok: true,
      paymentId: result.paymentId,
      bookingId: booking.id,
      bookingCode: booking.bookingCode,
      stateChanged: true,
    };
  } catch (err) {
    // Concurrent webhook for the same payment id landed first.
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
      if (reread) {
        try {
          const { ensureBookingRentInvoiceForExistingPayment } = await import(
            './bookingPaymentInvoices'
          );
          await ensureBookingRentInvoiceForExistingPayment(reread.id);
        } catch (repairErr) {
          console.error('booking rent invoice race repair failed:', repairErr);
        }
        return {
          ok: true,
          paymentId: reread.id,
          bookingId: booking.id,
          bookingCode: booking.bookingCode,
          stateChanged: false,
        };
      }
    }
    return {
      ok: false,
      reason:
        pgErrorCode(err) === '23P01'
          ? 'This bed is already confirmed for another guest. Reject this payment or ask the customer to choose a different bed.'
          : err instanceof Error
            ? err.message
            : 'unknown error',
    };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// recordPaymentFailure — webhook entry point (idempotent)
// ───────────────────────────────────────────────────────────────────────────

export async function recordPaymentFailure(
  input: RecordPaymentFailureInput,
): Promise<{
  ok: boolean;
  paymentId?: string;
  bookingId?: string;
  bookingCode?: string;
  stateChanged?: boolean;
  reason?: string;
}> {
  const [booking] = await db
    .select({ id: bookings.id, status: bookings.status })
    .from(bookings)
    .where(eq(bookings.bookingCode, input.bookingCode))
    .limit(1);
  if (!booking) return { ok: false, reason: `no booking "${input.bookingCode}"` };

  // Idempotency probe — match recordPaymentSuccess shape so the webhook
  // handler can rely on `stateChanged` to know whether a retry actually
  // did anything.
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
    return {
      ok: true,
      paymentId: existing.id,
      bookingId: booking.id,
      bookingCode: input.bookingCode,
      stateChanged: false,
    };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(payments)
        .values({
          bookingId: booking.id,
          purpose: 'booking',
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
          providerOrderId: input.providerOrderId ?? null,
          amountPaise: 0,
          status: 'failed',
          rawPayload: (input.rawPayload as object | undefined) ?? null,
        })
        .returning({ id: payments.id });

      // Cancel `hold` PRIMARY reservations — same `kind='primary'` scope
      // as recordPaymentSuccess so an extension payment failing doesn't
      // collapse the primary booking, and a duplicate primary-payment
      // failure doesn't kill pending extensions.
      await tx
        .update(bedReservations)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(
          and(
            eq(bedReservations.bookingId, booking.id),
            inArray(bedReservations.status, ['hold', 'under_review']),
            eq(bedReservations.kind, 'primary'),
          ),
        );
      if (
        booking.status === 'pending_payment' ||
        booking.status === 'pending_approval' ||
        booking.status === 'draft'
      ) {
        await tx
          .update(bookings)
          .set({
            status: 'cancelled',
            cancelledAt: new Date(),
            cancellationReason: `payment failed: ${input.reason}`,
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, booking.id));
      }

      await tx.insert(auditLog).values({
        actorType: 'system',
        actorId: null,
        entity: 'booking',
        entityId: booking.id,
        action: 'payment_failed',
        diff: {
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
          providerOrderId: input.providerOrderId ?? null,
          reason: input.reason,
          fromStatus: booking.status,
          toStatus:
            booking.status === 'pending_payment' ||
            booking.status === 'pending_approval' ||
            booking.status === 'draft'
              ? 'cancelled'
              : booking.status,
        },
      });

      return { paymentId: row.id };
    });
    return {
      ok: true,
      paymentId: result.paymentId,
      bookingId: booking.id,
      bookingCode: input.bookingCode,
      stateChanged: true,
    };
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
      if (reread) {
        return {
          ok: true,
          paymentId: reread.id,
          bookingId: booking.id,
          bookingCode: input.bookingCode,
          stateChanged: false,
        };
      }
    }
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown' };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// recordExternalRefund — webhook entry point for refunds issued OUTSIDE the
// app (e.g. directly in the Razorpay dashboard).
// ───────────────────────────────────────────────────────────────────────────

export type RecordExternalRefundInput = {
  provider: ProviderName;
  /** The ORIGINAL payment id this refund is against. */
  providerPaymentId: string;
  /** The refund id minted by the provider. Used as the idempotency key. */
  providerRefundId: string;
  amountPaise: number;
  rawPayload?: unknown;
};

export async function recordExternalRefund(input: RecordExternalRefundInput): Promise<{
  ok: boolean;
  refundPaymentId?: string;
  bookingId?: string;
  stateChanged?: boolean;
  reason?: string;
}> {
  // Locate the original payment row + its booking.
  const [original] = await db
    .select({
      id: payments.id,
      bookingId: payments.bookingId,
      status: payments.status,
      amountPaise: payments.amountPaise,
    })
    .from(payments)
    .where(
      and(
        eq(payments.provider, input.provider),
        eq(payments.providerPaymentId, input.providerPaymentId),
        eq(payments.purpose, 'booking'),
      ),
    )
    .limit(1);
  if (!original) {
    return {
      ok: false,
      reason: `no booking payment with provider=${input.provider} provider_payment_id=${input.providerPaymentId}`,
    };
  }

  // Idempotency probe: providerRefundId is stored in the refund row's
  // `providerPaymentId` column (same unique index `(provider, provider_payment_id)`).
  const [existing] = await db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.provider, input.provider),
        eq(payments.providerPaymentId, input.providerRefundId),
        eq(payments.purpose, 'refund'),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      ok: true,
      refundPaymentId: existing.id,
      bookingId: original.bookingId,
      stateChanged: false,
    };
  }

  // Compute whether this refund (plus any previous refunds) makes the
  // original payment fully refunded — for status updates.
  const refundedSoFar = await db
    .select({
      sum: sql<number>`coalesce(sum(amount_paise), 0)::int`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.bookingId, original.bookingId),
        eq(payments.purpose, 'refund'),
        eq(payments.status, 'succeeded'),
      ),
    );
  const alreadyRefunded = Math.abs(refundedSoFar[0]?.sum ?? 0);
  const totalRefundedAfter = alreadyRefunded + input.amountPaise;
  const fullyRefunded = totalRefundedAfter >= original.amountPaise;

  try {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(payments)
        .values({
          bookingId: original.bookingId,
          purpose: 'refund',
          provider: input.provider,
          providerPaymentId: input.providerRefundId,
          providerOrderId: null,
          amountPaise: -Math.abs(input.amountPaise),
          status: 'succeeded',
          rawPayload: (input.rawPayload as object | undefined) ?? null,
          paidAt: new Date(),
        })
        .returning({ id: payments.id });

      await tx
        .update(payments)
        .set({
          status: fullyRefunded ? 'refunded' : 'partially_refunded',
          updatedAt: new Date(),
        })
        .where(eq(payments.id, original.id));

      // If the entire booking is now refunded, mark the booking accordingly.
      if (fullyRefunded) {
        await tx
          .update(bookings)
          .set({ status: 'refunded', updatedAt: new Date() })
          .where(
            and(
              eq(bookings.id, original.bookingId),
              inArray(bookings.status, ['confirmed', 'cancelled']),
            ),
          );
      }

      await tx.insert(auditLog).values({
        actorType: 'system',
        actorId: null,
        entity: 'booking',
        entityId: original.bookingId,
        action: 'external_refund',
        diff: {
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
          providerRefundId: input.providerRefundId,
          amountPaise: input.amountPaise,
          totalRefundedAfter,
          originalAmountPaise: original.amountPaise,
          fullyRefunded,
        },
      });

      return { refundPaymentId: row.id };
    });
    return {
      ok: true,
      refundPaymentId: result.refundPaymentId,
      bookingId: original.bookingId,
      stateChanged: true,
    };
  } catch (err) {
    if (pgErrorCode(err) === '23505') {
      return { ok: true, bookingId: original.bookingId, stateChanged: false };
    }
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown' };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// releaseExpiredHolds — cron sweeper (idempotent)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Release any reservations whose `hold_expires_at` has passed. A booking
 * whose ALL primary reservations get released this way is also flipped to
 * `cancelled` so the customer's UI stops asking them to pay. Safe to call
 * any number of times.
 */
export async function releaseExpiredHolds(
  now: Date = new Date(),
): Promise<ReleaseExpiredHoldsResult> {
  // 1. Collect expired holds and their booking ids in one round-trip.
  const expired = await db
    .select({
      reservationId: bedReservations.id,
      bookingId: bedReservations.bookingId,
    })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.status, 'hold'),
        isNotNull(bedReservations.holdExpiresAt),
        lte(bedReservations.holdExpiresAt, now),
      ),
    );

  const expiredUnderReview = await db
    .select({
      reservationId: bedReservations.id,
      bookingId: bedReservations.bookingId,
    })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.status, 'under_review'),
        isNotNull(bedReservations.holdExpiresAt),
        lte(bedReservations.holdExpiresAt, now),
      ),
    );

  const allExpired = [...expired, ...expiredUnderReview];

  if (allExpired.length === 0) {
    // Even when no primary holds expired, a previous sweep may have left
    // an extension row that needs the pending → cancelled flip.
    const expiredExt = await markExpiredExtensions();
    return {
      bookingsCancelled: 0,
      reservationsReleased: 0,
      cancelledCodes: [],
      expiredExtensions: expiredExt.expired,
    };
  }

  const affectedReservationIds = allExpired.map((r) => r.reservationId);
  const affectedBookingIds = Array.from(new Set(allExpired.map((r) => r.bookingId)));

  const cancelledCodes: string[] = [];
  await db.transaction(async (tx) => {
    await tx
      .update(bedReservations)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(inArray(bedReservations.id, affectedReservationIds));

    // For each affected booking, if it has zero remaining `hold` or `active`
    // reservations, mark it cancelled. Doing this in SQL with a correlated
    // count keeps the round-trip count constant in the booking count.
    for (const bookingId of affectedBookingIds) {
      const [{ remaining }] = await tx
        .select({
          remaining: sql<number>`count(*) FILTER (WHERE status IN ('hold','under_review','active'))::int`,
        })
        .from(bedReservations)
        .where(eq(bedReservations.bookingId, bookingId));
      if (remaining === 0) {
        const [updated] = await tx
          .update(bookings)
          .set({
            status: 'cancelled',
            cancelledAt: new Date(),
            cancellationReason: 'hold expired before payment',
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(bookings.id, bookingId),
              inArray(bookings.status, ['draft', 'pending_payment', 'pending_approval']),
            ),
          )
          .returning({ code: bookings.bookingCode });
        if (updated?.code) cancelledCodes.push(updated.code);
      }
    }

    await tx.insert(auditLog).values({
      actorType: 'system',
      actorId: null,
      entity: 'bed_reservations',
      entityId: affectedReservationIds[0]!,
      action: 'hold_expired_sweep',
      diff: {
        reservationsReleased: affectedReservationIds.length,
        bookingsCancelled: cancelledCodes.length,
      },
    });
  });

  // Phase 5 fold-in: any `stay_extensions` rows whose reservations all just
  // got cancelled need to flip from `pending` to `cancelled` too, so the
  // customer UI stops advertising a pay button for a dead extension.
  // markExpiredExtensions is idempotent — safe to call every sweep.
  const expiredExt = await markExpiredExtensions();

  return {
    bookingsCancelled: cancelledCodes.length,
    reservationsReleased: affectedReservationIds.length,
    cancelledCodes,
    expiredExtensions: expiredExt.expired,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// recordExtensionPaymentSuccess — Phase 5 webhook entry point
// ───────────────────────────────────────────────────────────────────────────

export type RecordExtensionPaymentSuccessInput = {
  /** Webhook providers OR offline payment markers (cash/upi/bank). */
  provider: AnyPaymentProvider;
  providerPaymentId: string;
  providerOrderId?: string | null;
  amountPaise: number;
  currency?: string;
  /** stay_extensions.id — required for extension events. */
  extensionId: string;
  rawPayload?: unknown;
};

export type RecordExtensionPaymentSuccessResult =
  | {
      ok: true;
      paymentId: string;
      extensionId: string;
      bookingId: string;
      bookingCode: string;
      stateChanged: boolean;
    }
  | { ok: false; reason: string };

/**
 * Webhook handler for a captured extension payment. Mirrors
 * recordPaymentSuccess in idempotency contract and audit-logging, but
 * scoped to the specific extension's reservations and updates the
 * booking's expected_checkout_date in the same transaction.
 */
export async function recordExtensionPaymentSuccess(
  input: RecordExtensionPaymentSuccessInput,
): Promise<RecordExtensionPaymentSuccessResult> {
  // 1. Locate the extension + parent booking.
  const [ext] = await db
    .select({
      id: stayExtensions.id,
      bookingId: stayExtensions.bookingId,
      status: stayExtensions.status,
      requestedUntilDate: stayExtensions.requestedUntilDate,
      newReservationIds: stayExtensions.newReservationIds,
      quotedTotalPaise: stayExtensions.quotedTotalPaise,
      extensionDurationMode: stayExtensions.extensionDurationMode,
    })
    .from(stayExtensions)
    .where(eq(stayExtensions.id, input.extensionId))
    .limit(1);
  if (!ext) return { ok: false, reason: `no extension "${input.extensionId}"` };
  const [booking] = await db
    .select({
      id: bookings.id,
      customerId: bookings.customerId,
      bookingCode: bookings.bookingCode,
      expectedCheckoutDate: bookings.expectedCheckoutDate,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.id, ext.bookingId))
    .limit(1);
  if (!booking) return { ok: false, reason: `extension's booking is missing` };

  // 2. Idempotency probe — same shape as recordPaymentSuccess.
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
    try {
      const { ensureBookingRentInvoiceForExistingPayment } = await import(
        './bookingPaymentInvoices'
      );
      await ensureBookingRentInvoiceForExistingPayment(existing.id);
    } catch (repairErr) {
      console.error('extension rent invoice replay repair failed:', repairErr);
    }
    return {
      ok: true,
      paymentId: existing.id,
      extensionId: ext.id,
      bookingId: booking.id,
      bookingCode: booking.bookingCode,
      stateChanged: false,
    };
  }

  const ids = ext.newReservationIds ?? [];
  const newCheckoutDate = ext.requestedUntilDate; // YYYY-MM-DD

  try {
    const result = await db.transaction(async (tx) => {
      const [payment] = await tx
        .insert(payments)
        .values({
          bookingId: booking.id,
          purpose: 'extension',
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
          providerOrderId: input.providerOrderId ?? null,
          amountPaise: input.amountPaise,
          currency: input.currency ?? 'INR',
          status: 'succeeded',
          rawPayload: (input.rawPayload as object | undefined) ?? null,
          paidAt: new Date(),
        })
        .returning({ id: payments.id });

      // Flip extension reservations hold → active. Scope to the
      // specific reservation ids on this extension so we never touch
      // primary reservations or a sibling extension's holds.
      let flipped: { id: string; bedId: string }[] = [];
      if (ids.length > 0) {
        flipped = await tx
          .update(bedReservations)
          .set({ status: 'active', holdExpiresAt: null, updatedAt: new Date() })
          .where(
            and(
              inArray(bedReservations.id, ids),
              eq(bedReservations.status, 'hold'),
            ),
          )
          .returning({ id: bedReservations.id, bedId: bedReservations.bedId });
      }

      // Mark the extension row paid + link the payment.
      await tx
        .update(stayExtensions)
        .set({ status: 'paid', paymentId: payment.id, updatedAt: new Date() })
        .where(eq(stayExtensions.id, ext.id));

      // Roll the booking's expected_checkout_date forward. We only ever
      // move it FORWARD — defensive against out-of-order webhooks for
      // older extensions.
      if (
        booking.expectedCheckoutDate == null ||
        newCheckoutDate > booking.expectedCheckoutDate
      ) {
        await tx
          .update(bookings)
          .set({
            expectedCheckoutDate: newCheckoutDate,
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, booking.id));
      }

      // Append an extension stamp to pricing_snapshot.extensions. This
      // is the human-readable "receipt strip" the customer + admin UI
      // render under the original perBed lines.
      const snap: PricingSnapshot | null = booking.pricingSnapshot ?? null;
      if (snap) {
        const stamp = {
          extensionId: ext.id,
          paidAt: new Date().toISOString(),
          fromDate: booking.expectedCheckoutDate ?? '',
          untilDate: newCheckoutDate,
          durationMode: ext.extensionDurationMode as 'daily' | 'weekly' | 'monthly',
          amountPaise: input.amountPaise,
          perBed: flipped.map((r) => ({
            bedId: r.bedId,
            reservationId: r.id,
            units: 0,
            lineTotalPaise: 0,
          })),
        };
        const nextSnap: PricingSnapshot = {
          ...snap,
          extensions: [...(snap.extensions ?? []), stamp],
        };
        await tx
          .update(bookings)
          .set({ pricingSnapshot: nextSnap, updatedAt: new Date() })
          .where(eq(bookings.id, booking.id));
      }

      await tx.insert(auditLog).values({
        actorType: 'system',
        actorId: null,
        entity: 'stay_extension',
        entityId: ext.id,
        action: 'extension_paid',
        diff: {
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
          amountPaise: input.amountPaise,
          reservationsFlipped: flipped.length,
          newExpectedCheckoutDate: newCheckoutDate,
          previousExpectedCheckoutDate: booking.expectedCheckoutDate,
        },
      });

      return { paymentId: payment.id };
    });

    const { notifyExtensionUpdate, notifyPaymentReceipt } = await import(
      '@/src/lib/email/notifications'
    );
    notifyExtensionUpdate({
      customerId: booking.customerId,
      bookingCode: booking.bookingCode,
      status: 'paid',
      newUntilDate: newCheckoutDate,
      amountPaise: input.amountPaise,
    });
    notifyPaymentReceipt({
      customerId: booking.customerId,
      purpose: 'extension',
      amountPaise: input.amountPaise,
      reference: booking.bookingCode,
    });

    try {
      const { applyExtensionRentInvoiceOnPaymentSuccess } = await import(
        './bookingPaymentInvoices'
      );
      const rentInvoice = await applyExtensionRentInvoiceOnPaymentSuccess({
        extensionId: ext.id,
        bookingId: booking.id,
        paymentId: result.paymentId,
        amountPaise: input.amountPaise,
      });
      if (!rentInvoice.ok) {
        return { ok: false, reason: rentInvoice.reason };
      }
    } catch (rentErr) {
      const reason =
        rentErr instanceof Error ? rentErr.message : 'Extension rent invoice failed';
      console.error('extension rent invoice failed:', rentErr);
      return { ok: false, reason };
    }

    return {
      ok: true,
      paymentId: result.paymentId,
      extensionId: ext.id,
      bookingId: booking.id,
      bookingCode: booking.bookingCode,
      stateChanged: true,
    };
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
      if (reread) {
        try {
          const { ensureBookingRentInvoiceForExistingPayment } = await import(
            './bookingPaymentInvoices'
          );
          await ensureBookingRentInvoiceForExistingPayment(reread.id);
        } catch (repairErr) {
          console.error('extension rent invoice race repair failed:', repairErr);
        }
        return {
          ok: true,
          paymentId: reread.id,
          extensionId: ext.id,
          bookingId: booking.id,
          bookingCode: booking.bookingCode,
          stateChanged: false,
        };
      }
    }
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown' };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// recordExtensionPaymentFailure — Phase 5 webhook entry point
// ───────────────────────────────────────────────────────────────────────────

export type RecordExtensionPaymentFailureInput = {
  provider: AnyPaymentProvider;
  providerPaymentId: string;
  providerOrderId?: string | null;
  extensionId: string;
  reason: string;
  rawPayload?: unknown;
};

export async function recordExtensionPaymentFailure(
  input: RecordExtensionPaymentFailureInput,
): Promise<{
  ok: boolean;
  paymentId?: string;
  extensionId?: string;
  bookingId?: string;
  stateChanged?: boolean;
  reason?: string;
}> {
  const [ext] = await db
    .select({
      id: stayExtensions.id,
      bookingId: stayExtensions.bookingId,
      status: stayExtensions.status,
      newReservationIds: stayExtensions.newReservationIds,
    })
    .from(stayExtensions)
    .where(eq(stayExtensions.id, input.extensionId))
    .limit(1);
  if (!ext) return { ok: false, reason: `no extension "${input.extensionId}"` };

  // Idempotency probe.
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
    return {
      ok: true,
      paymentId: existing.id,
      extensionId: ext.id,
      bookingId: ext.bookingId,
      stateChanged: false,
    };
  }

  const ids = ext.newReservationIds ?? [];

  try {
    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(payments)
        .values({
          bookingId: ext.bookingId,
          purpose: 'extension',
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
          providerOrderId: input.providerOrderId ?? null,
          amountPaise: 0,
          status: 'failed',
          rawPayload: (input.rawPayload as object | undefined) ?? null,
        })
        .returning({ id: payments.id });

      if (ids.length > 0) {
        await tx
          .update(bedReservations)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(
            and(
              inArray(bedReservations.id, ids),
              inArray(bedReservations.status, ['hold', 'active']),
            ),
          );
      }
      if (ext.status === 'pending') {
        await tx
          .update(stayExtensions)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(eq(stayExtensions.id, ext.id));
      }

      await tx.insert(auditLog).values({
        actorType: 'system',
        actorId: null,
        entity: 'stay_extension',
        entityId: ext.id,
        action: 'extension_payment_failed',
        diff: {
          provider: input.provider,
          providerPaymentId: input.providerPaymentId,
          reason: input.reason,
          fromStatus: ext.status,
        },
      });

      return { paymentId: row.id };
    });
    return {
      ok: true,
      paymentId: result.paymentId,
      extensionId: ext.id,
      bookingId: ext.bookingId,
      stateChanged: true,
    };
  } catch (err) {
    if (pgErrorCode(err) === '23505') {
      return { ok: true, extensionId: ext.id, bookingId: ext.bookingId, stateChanged: false };
    }
    return { ok: false, reason: err instanceof Error ? err.message : 'unknown' };
  }
}

// ───────────────────────────────────────────────────────────────────────────
// cancelBooking — customer + admin
// ───────────────────────────────────────────────────────────────────────────

/**
 * Cancel an existing booking and (if applicable) record a refund payment
 * row. The refund money is computed by `cancellationPolicy.computeRefund`
 * using the snapshotted policy on the booking, the booking's rent + deposit,
 * and the earliest check-in date across its reservations.
 *
 * Money mechanics:
 *   - We always emit a single `payments` row with `purpose='refund'` and a
 *     NEGATIVE `amountPaise` when totalRefundPaise > 0. The negative value
 *     matches the convention in PROJECT_PLAN.md §4.7 (refund row reduces
 *     net cash collected).
 *   - For the `razorpay` provider, the actual refund API call against the
 *     original `provider_payment_id` is wired up here too; the resulting
 *     `provider_refund_id` is stored on the refund row.
 *   - For the `mock` provider, no external call is made — the negative row
 *     is the bookkeeping artefact.
 *
 * The booking's status flips to `cancelled` (or `refunded` if every paid
 * rupee is being returned).
 */
export async function cancelBooking(
  input: CancelBookingInput,
): Promise<CancelBookingResult> {
  const cancelAt = input.cancelAt ?? new Date();

  const [b] = await db
    .select({
      id: bookings.id,
      customerId: bookings.customerId,
      status: bookings.status,
      bookingCode: bookings.bookingCode,
      subtotalPaise: bookings.subtotalPaise,
      depositPaise: bookings.depositPaise,
      totalPaise: bookings.totalPaise,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.bookingCode, input.bookingCode))
    .limit(1);
  if (!b) return { ok: false, reason: `no booking "${input.bookingCode}"` };

  if (b.status === 'completed') {
    return { ok: false, reason: `booking ${b.bookingCode} is completed — past cancellation` };
  }
  if (isTerminalBookingLifecycleStatus(b.status)) {
    return {
      ok: false,
      reason: bookingCancellationBlockedReason(b.bookingCode, b.status as BookingStatus),
    };
  }

  const checkIn = (await earliestCheckIn(b.id)) ?? cancelAt;

  const snapshotPolicy = (b.pricingSnapshot as PricingSnapshot | null)
    ?.cancellationPolicy as CancellationPolicy | undefined;
  const policy = input.policyOverride ?? snapshotPolicy ?? DEFAULT_POLICY;

  const refund = computeRefund({
    rentSubtotalPaise: b.subtotalPaise,
    depositPaise: b.depositPaise,
    checkInAt: checkIn,
    cancelAt,
    policy,
  });

  // For pending_payment cancellations there is no money to refund — the
  // customer hasn't paid yet. We override the computation to zero in that
  // case but keep the breakdown for the audit log.
  const noMoneyMoved =
    b.status === 'pending_payment' || b.status === 'pending_approval';

  // Find the original successful booking payment so we can refund against it
  // when there's money to return.
  let originalPayment: { id: string; provider: ProviderName; providerPaymentId: string | null } | null = null;
  if (!noMoneyMoved && refund.totalRefundPaise > 0) {
    const [pay] = await db
      .select({
        id: payments.id,
        provider: payments.provider,
        providerPaymentId: payments.providerPaymentId,
      })
      .from(payments)
      .where(
        and(
          eq(payments.bookingId, b.id),
          eq(payments.status, 'succeeded'),
          eq(payments.purpose, 'booking'),
        ),
      )
      .limit(1);
    if (pay) {
      originalPayment = {
        id: pay.id,
        provider: pay.provider as ProviderName,
        providerPaymentId: pay.providerPaymentId,
      };
    }
  }

  // External refund call (Razorpay). Done OUTSIDE the DB transaction so a
  // slow API call doesn't hold a Postgres transaction open.
  let providerRefundId: string | null = null;
  if (!noMoneyMoved && refund.totalRefundPaise > 0 && originalPayment?.providerPaymentId) {
    const provider = getPaymentProvider();
    if (provider.name === originalPayment.provider) {
      try {
        const r = await provider.refund({
          providerPaymentId: originalPayment.providerPaymentId,
          amountPaise: refund.totalRefundPaise,
          notes: { booking_code: b.bookingCode, reason: input.reason },
        });
        providerRefundId = r.providerRefundId;
      } catch (err) {
        return {
          ok: false,
          reason: `provider refund failed: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }
  }

  let refundPaymentId: string | null = null;
  await db.transaction(async (tx) => {
    if (!noMoneyMoved && refund.totalRefundPaise > 0) {
      const [row] = await tx
        .insert(payments)
        .values({
          bookingId: b.id,
          purpose: 'refund',
          provider: (originalPayment?.provider ?? 'cash') as ProviderName,
          providerPaymentId: providerRefundId ?? null,
          providerOrderId: null,
          // Negative amount per the §4.7 convention; tests assert this.
          amountPaise: -refund.totalRefundPaise,
          status: 'succeeded',
          rawPayload: {
            tier: refund.tier,
            hoursBeforeCheckIn: refund.hoursBeforeCheckIn,
            rentRefundPaise: refund.rentRefundPaise,
            depositRefundPaise: refund.depositRefundPaise,
            breakdown: refund.breakdown,
          },
          paidAt: new Date(),
        })
        .returning({ id: payments.id });
      refundPaymentId = row.id;

      // Mark the original booking payment as fully or partially refunded.
      if (originalPayment) {
        const fully = refund.totalRefundPaise >= b.totalPaise;
        await tx
          .update(payments)
          .set({
            status: fully ? 'refunded' : 'partially_refunded',
            updatedAt: new Date(),
          })
          .where(eq(payments.id, originalPayment.id));
      }
    }

    await tx
      .update(bedReservations)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(bedReservations.bookingId, b.id),
          inArray(bedReservations.status, ['hold', 'under_review', 'active']),
        ),
      );

    await tx
      .update(bedReserveHolds)
      .set({ status: 'cancelled', holdExpiresAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(bedReserveHolds.bookingId, b.id),
          inArray(bedReserveHolds.status, ['pending_payment', 'under_review', 'active']),
        ),
      );

    const newBookingStatus =
      !noMoneyMoved && refund.totalRefundPaise >= b.totalPaise && b.totalPaise > 0
        ? 'refunded'
        : 'cancelled';

    await tx
      .update(bookings)
      .set({
        status: newBookingStatus,
        cancelledAt: new Date(),
        cancellationReason: input.reason,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, b.id));

    await tx.insert(auditLog).values({
      actorType: actorTypeFor(input.actor),
      actorId: actorIdFor(input.actor),
      entity: 'booking',
      entityId: b.id,
      action: 'cancel',
      diff: {
        reason: input.reason,
        fromStatus: b.status,
        toStatus: newBookingStatus,
        refund: {
          tier: refund.tier,
          hoursBeforeCheckIn: refund.hoursBeforeCheckIn,
          totalRefundPaise: refund.totalRefundPaise,
          rentRefundPaise: refund.rentRefundPaise,
          depositRefundPaise: refund.depositRefundPaise,
        },
        providerRefundId,
      },
    });

    const { reverseReferralOnBookingCancel } = await import('./referrals');
    await reverseReferralOnBookingCancel(b.id, tx);
  });

  if (!noMoneyMoved && refund.depositRefundPaise > 0 && refundPaymentId) {
    const { getDepositSummaryForBooking } = await import('./deposits');
    const { settleDepositRefund } = await import('./depositSettlement');
    const summary = await getDepositSummaryForBooking(b.id);
    const ledgerRefundPaise = Math.min(
      refund.depositRefundPaise,
      summary?.refundableBalancePaise ?? 0,
    );
    if (ledgerRefundPaise > 0) {
      const settled = await settleDepositRefund({
        bookingId: b.id,
        customerId: b.customerId,
        idempotencyKey: `cancel:${b.id}:${refundPaymentId}`,
        source: 'manual',
        sourceId: refundPaymentId,
        reason: `Booking cancellation: ${input.reason}`,
        refundPaise: ledgerRefundPaise,
        markBookingRefunded: ledgerRefundPaise >= (summary?.refundableBalancePaise ?? 0),
      });
      if (!settled.ok) {
        return {
          ok: false,
          reason: `Booking cancelled but deposit ledger refund failed: ${settled.error}`,
        };
      }
    }
  }

  const { reconcileBookingOccupancy } = await import('../lib/occupancySync');
  await reconcileBookingOccupancy(b.id);

  return {
    ok: true,
    bookingId: b.id,
    bookingCode: b.bookingCode,
    refund,
    refundPaymentId,
  };
}

/**
 * Expire confirmed short-stay reservations when move-in grace elapsed without check-in.
 */
export async function expireStaleReservations(
  today: string = formatDate(new Date()),
): Promise<{ expired: number; bookingCodes: string[] }> {
  const rows = await db.execute<{ booking_id: string; booking_code: string; reservation_id: string }>(
    sql`
    SELECT bk.id AS booking_id, bk.booking_code, br.id AS reservation_id
    FROM bed_reservations br
    INNER JOIN bookings bk ON bk.id = br.booking_id
    WHERE br.status = 'active'
      AND br.kind = 'primary'
      AND bk.status = 'confirmed'
      AND bk.duration_mode IN ('daily', 'weekly', 'fixed_stay')
      AND lower(br.stay_range) < (${today}::date - interval '1 day')
      AND upper(br.stay_range) IS NOT NULL
      AND upper(br.stay_range) > ${today}::date
    `,
  );

  const resultRows = Array.isArray(rows) ? rows : ((rows as { rows?: typeof rows }).rows ?? []);
  if (resultRows.length === 0) return { expired: 0, bookingCodes: [] };

  const codes: string[] = [];
  await db.transaction(async (tx) => {
    for (const row of resultRows) {
      await tx
        .update(bedReservations)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(bedReservations.id, row.reservation_id));
      await tx
        .update(bookings)
        .set({
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: 'Reservation expired — no check-in before move-in date.',
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, row.booking_id));
      await tx.insert(auditLog).values({
        actorType: 'system',
        actorId: null,
        entity: 'booking',
        entityId: row.booking_id,
        action: 'reservation_expired',
        diff: { moveInBefore: today },
      });
      codes.push(row.booking_code);
    }
  });

  return { expired: resultRows.length, bookingCodes: codes };
}

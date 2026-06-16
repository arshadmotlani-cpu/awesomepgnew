/**
 * Phase 5.5 — vacating workflow.
 *
 *   submitVacatingRequest()  — resident or admin files a vacating notice
 *   approveVacatingRequest() — admin acknowledges
 *   rejectVacatingRequest()  — admin denies (rare)
 *   cancelVacatingRequestByCustomer() — resident withdraws a pending notice
 *   completeVacatingRequest()— admin marks done; writes deposit ledger
 *                               entries (deducted + refunded), cancels
 *                               future rent + electricity invoices
 *
 * Policy (spec):
 *   - If notice >= 14 days: no deposit deduction.
 *   - If notice < 14 days: deduct exactly 5 days' worth of rent
 *     (monthlyRent / 30 * 5). FIXED — never the full notice shortfall.
 *
 * The monthly rent and computed deduction are snapshotted onto the
 * vacating_requests row at SUBMIT time, so a later rate change can't
 * silently rewrite the penalty for past requests.
 *
 * Status machine:
 *   pending → approved → completed  (typical happy path)
 *   pending →            completed  (admin can skip approval)
 *   pending → rejected              (admin denies)
 *   approved → rejected             (admin changes their mind)
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../db/client';
import {
  auditLog,
  bedReservations,
  bookings,
  depositLedger,
  electricityInvoices,
  rentInvoices,
  vacatingRequests,
  type VacatingRequest,
} from '../db/schema';
import type { PricingSnapshot } from '../db/schema/bookings';
import { formatDate, parseDate, todayString, type DateLike } from '../lib/dates';
import {
  assertMayRestoreOccupancy,
  canCompleteCheckoutWithoutActiveStayToday,
  shouldShortenStayOnVacatingApproval,
} from '../lib/occupancyEligibility';
import { reconcileBookingOccupancy } from '../lib/occupancySync';
import { isNoticeCompliant, vacatingPenalty } from './billing';
import { getDepositSummaryForBooking } from './deposits';
import { settleVacatingDepositRefund } from './depositSettlement';
import { cancelFutureRentInvoices } from './rentInvoices';
import { cancelElectricityInvoicesForBooking } from './electricityBilling';
import { recalculateBillingAfterVacatingRestore } from './residentFinancialEngine';

async function vacatingEmailMeta(bookingId: string) {
  const [row] = await db
    .select({ bookingCode: bookings.bookingCode })
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .limit(1);
  return { bookingCode: row?.bookingCode ?? bookingId };
}

// ───────────────────────────────────────────────────────────────────────────
// Public types
// ───────────────────────────────────────────────────────────────────────────

export type SubmitVacatingInput = {
  bookingId: string;
  vacatingDate: DateLike;
  /** Defaults to today. Admin can backdate if filing on behalf of resident. */
  noticeGivenDate?: DateLike;
  notes?: string | null;
  /** Admin: skip 5-day penalty regardless of notice length. */
  waiveDeduction?: boolean;
  /** Admin: approve immediately so the bed is pre-bookable on the website from vacatingDate. */
  openBedForBookingFromVacatingDate?: boolean;
  resolvedByAdminId?: string | null;
};

export type SubmitVacatingResult =
  | {
      ok: true;
      request: VacatingRequest;
      noticeDays: number;
      noticeCompliant: boolean;
      deductionPaise: number;
    }
  | { ok: false; kind: 'no_booking' }
  | { ok: false; kind: 'not_monthly' }
  | { ok: false; kind: 'already_exists'; existingRequestId: string }
  | { ok: false; kind: 'invalid_input'; message: string };

export type CompleteVacatingInput = {
  requestId: string;
  resolvedByAdminId?: string | null;
};

export type CompleteVacatingResult =
  | {
      ok: true;
      request: VacatingRequest;
      deductionPaise: number;
      depositRefundPaise: number;
      futureInvoicesCancelled: number;
      electricityInvoicesCancelled: number;
    }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'wrong_status'; status: VacatingRequest['status'] }
  | { ok: false; kind: 'bed_not_occupied'; message: string }
  | { ok: false; kind: 'settlement_failed'; message: string };

export type RevertVacatingCompletionResult =
  | { ok: true; request: VacatingRequest }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'wrong_status'; status: VacatingRequest['status'] }
  | { ok: false; kind: 'bed_reassigned'; message: string }
  | { ok: false; kind: 'cannot_restore'; message: string };

export type AdminWithdrawVacatingResult =
  | { ok: true; bookingId: string }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'wrong_status'; status: VacatingRequest['status'] }
  | { ok: false; kind: 'cannot_restore'; message: string };

export type RevertVacatingApprovalResult =
  | { ok: true; request: VacatingRequest }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'wrong_status'; status: VacatingRequest['status'] }
  | { ok: false; kind: 'cannot_restore'; message: string };

export type CancelVacatingByCustomerResult =
  | { ok: true; bookingId: string }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'forbidden' }
  | { ok: false; kind: 'wrong_status'; status: VacatingRequest['status'] };

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────

function pgErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null;
  const direct = (err as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === 'object') {
    const c = (cause as { code?: unknown }).code;
    if (typeof c === 'string') return c;
  }
  return null;
}

function monthlyRentFromBooking(snapshot: PricingSnapshot | null): number {
  if (!snapshot || !Array.isArray(snapshot.perBed)) return 0;
  return snapshot.perBed.reduce((acc, b) => acc + (b.monthlyRatePaise ?? 0), 0);
}

/** Shorten active reservations so beds open from vacating date onward. */
async function shortenBookingReservationsToDate(bookingId: string, endDate: string) {
  await db.execute(sql`
    UPDATE bed_reservations
    SET
      stay_range = daterange(lower(stay_range), ${endDate}::date, '[)'),
      updated_at = now()
    WHERE booking_id = ${bookingId}
      AND status IN ('hold', 'active')
      AND upper(stay_range) > ${endDate}::date
  `);

  await db
    .update(bookings)
    .set({ expectedCheckoutDate: endDate, updatedAt: new Date() })
    .where(eq(bookings.id, bookingId));
}

const LONG_TERM_END = '2099-01-01';

async function bookingHasActiveStayToday(bookingId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: bedReservations.id })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.bookingId, bookingId),
        sql`${bedReservations.status} IN ('active', 'hold')`,
        sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

async function restoreOpenEndedStay(
  bookingId: string,
  opts?: { includeCompletedReservations?: boolean; skipKyc?: boolean },
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const mayRestore = await assertMayRestoreOccupancy(bookingId, opts);
  if (!mayRestore.ok) {
    return { ok: false, reason: mayRestore.reason };
  }

  const statuses = opts?.includeCompletedReservations
    ? (['active', 'hold', 'completed'] as const)
    : (['active', 'hold'] as const);

  await db
    .update(bedReservations)
    .set({
      stayRange: sql`daterange(lower(${bedReservations.stayRange}), ${LONG_TERM_END}::date, '[)')`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(bedReservations.bookingId, bookingId),
        eq(bedReservations.kind, 'primary'),
        inArray(bedReservations.status, [...statuses]),
      ),
    );

  await db
    .update(bookings)
    .set({ expectedCheckoutDate: LONG_TERM_END, updatedAt: new Date() })
    .where(eq(bookings.id, bookingId));

  return { ok: true };
}

async function completeBookingReservations(bookingId: string) {
  await db
    .update(bedReservations)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(
      and(
        eq(bedReservations.bookingId, bookingId),
        sql`${bedReservations.status} IN ('hold', 'active')`,
      ),
    );
}

// ───────────────────────────────────────────────────────────────────────────
// submitVacatingRequest
// ───────────────────────────────────────────────────────────────────────────

export async function submitVacatingRequest(
  input: SubmitVacatingInput,
): Promise<SubmitVacatingResult> {
  const [booking] = await db
    .select({
      id: bookings.id,
      customerId: bookings.customerId,
      status: bookings.status,
      durationMode: bookings.durationMode,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  if (!booking) return { ok: false, kind: 'no_booking' };

  if (
    booking.status !== 'confirmed' ||
    !['monthly', 'open_ended'].includes(booking.durationMode)
  ) {
    return { ok: false, kind: 'not_monthly' };
  }

  const noticeGivenDate = formatDate(parseDate(input.noticeGivenDate ?? new Date()));
  const vacatingDate = formatDate(parseDate(input.vacatingDate));
  if (vacatingDate < noticeGivenDate) {
    return {
      ok: false,
      kind: 'invalid_input',
      message: 'vacatingDate must be on or after noticeGivenDate',
    };
  }

  const noticeCompliant = input.waiveDeduction
    ? true
    : isNoticeCompliant({ noticeGivenDate, vacatingDate });
  const monthlyRent = monthlyRentFromBooking(
    booking.pricingSnapshot as PricingSnapshot | null,
  );
  const deduction =
    input.waiveDeduction || noticeCompliant ? 0 : vacatingPenalty(monthlyRent);

  try {
    const [row] = await db
      .insert(vacatingRequests)
      .values({
        bookingId: booking.id,
        customerId: booking.customerId,
        noticeGivenDate,
        vacatingDate,
        noticeCompliant,
        deductionPaise: deduction,
        depositRefundPaise: 0, // computed at completion time
        monthlyRentPaiseSnapshot: monthlyRent,
        status: 'pending',
        notes: input.notes ?? null,
      })
      .returning();

    const noticeDays =
      (parseDate(vacatingDate).getTime() - parseDate(noticeGivenDate).getTime()) /
      86_400_000;

    await db.insert(auditLog).values({
      actorType: input.resolvedByAdminId ? 'admin' : 'system',
      actorId: input.resolvedByAdminId ?? null,
      entity: 'vacating_request',
      entityId: row.id,
      action: 'submitted',
      diff: {
        bookingId: booking.id,
        noticeGivenDate,
        vacatingDate,
        noticeDays,
        noticeCompliant,
        deductionPaise: deduction,
        monthlyRentPaise: monthlyRent,
        waiveDeduction: input.waiveDeduction ?? false,
        openBedForBooking: input.openBedForBookingFromVacatingDate ?? false,
      },
    });

    let request = row;
    if (input.waiveDeduction && deduction !== row.deductionPaise) {
      const [updated] = await db
        .update(vacatingRequests)
        .set({
          noticeCompliant: true,
          deductionPaise: 0,
          updatedAt: new Date(),
        })
        .where(eq(vacatingRequests.id, row.id))
        .returning();
      request = updated;
    }

    if (input.openBedForBookingFromVacatingDate) {
      const approved = await approveVacatingRequest({
        requestId: request.id,
        resolvedByAdminId: input.resolvedByAdminId ?? null,
      });
      if (approved.ok) request = approved.request;
    }

    const meta = await vacatingEmailMeta(booking.id);
    const { notifyVacatingUpdate } = await import('@/src/lib/email/notifications');
    notifyVacatingUpdate({
      customerId: booking.customerId,
      bookingCode: meta.bookingCode,
      status: 'submitted',
      vacatingDate,
    });

    return {
      ok: true,
      request,
      noticeDays,
      noticeCompliant,
      deductionPaise: request.deductionPaise,
    };
  } catch (err) {
    // Duplicate UNIQUE(booking_id) — already a vacating request open.
    if (pgErrorCode(err) === '23505') {
      const [existing] = await db
        .select({ id: vacatingRequests.id })
        .from(vacatingRequests)
        .where(eq(vacatingRequests.bookingId, booking.id))
        .limit(1);
      if (existing) {
        return { ok: false, kind: 'already_exists', existingRequestId: existing.id };
      }
    }
    throw err;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// approveVacatingRequest
// ───────────────────────────────────────────────────────────────────────────

export async function approveVacatingRequest(input: {
  requestId: string;
  resolvedByAdminId?: string | null;
}): Promise<
  | { ok: true; request: VacatingRequest }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'wrong_status'; status: VacatingRequest['status'] }
> {
  const [current] = await db
    .select()
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, input.requestId))
    .limit(1);
  if (!current) return { ok: false, kind: 'not_found' };
  if (current.status !== 'pending') {
    return { ok: false, kind: 'wrong_status', status: current.status };
  }

  const [updated] = await db
    .update(vacatingRequests)
    .set({
      status: 'approved',
      resolvedByAdminId: input.resolvedByAdminId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(vacatingRequests.id, input.requestId))
    .returning();

  if (shouldShortenStayOnVacatingApproval(updated.vacatingDate)) {
    await shortenBookingReservationsToDate(updated.bookingId, updated.vacatingDate);
  }

  await db.insert(auditLog).values({
    actorType: input.resolvedByAdminId ? 'admin' : 'system',
    actorId: input.resolvedByAdminId ?? null,
    entity: 'vacating_request',
    entityId: updated.id,
    action: 'approved',
    diff: { from: 'pending', to: 'approved' },
  });

  const meta = await vacatingEmailMeta(updated.bookingId);
  const { notifyVacatingUpdate } = await import('@/src/lib/email/notifications');
  notifyVacatingUpdate({
    customerId: updated.customerId,
    bookingCode: meta.bookingCode,
    status: 'approved',
    vacatingDate: updated.vacatingDate,
  });

  return { ok: true, request: updated };
}

export async function rejectVacatingRequest(input: {
  requestId: string;
  reason: string;
  resolvedByAdminId?: string | null;
}): Promise<
  | { ok: true; request: VacatingRequest }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'wrong_status'; status: VacatingRequest['status'] }
> {
  const [current] = await db
    .select()
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, input.requestId))
    .limit(1);
  if (!current) return { ok: false, kind: 'not_found' };
  if (!['pending', 'approved'].includes(current.status)) {
    return { ok: false, kind: 'wrong_status', status: current.status };
  }

  const [updated] = await db
    .update(vacatingRequests)
    .set({
      status: 'rejected',
      resolvedAt: new Date(),
      resolvedByAdminId: input.resolvedByAdminId ?? null,
      notes: input.reason,
      updatedAt: new Date(),
    })
    .where(eq(vacatingRequests.id, input.requestId))
    .returning();

  await db.insert(auditLog).values({
    actorType: input.resolvedByAdminId ? 'admin' : 'system',
    actorId: input.resolvedByAdminId ?? null,
    entity: 'vacating_request',
    entityId: updated.id,
    action: 'rejected',
    diff: { reason: input.reason },
  });

  const meta = await vacatingEmailMeta(updated.bookingId);
  const { notifyVacatingUpdate } = await import('@/src/lib/email/notifications');
  notifyVacatingUpdate({
    customerId: updated.customerId,
    bookingCode: meta.bookingCode,
    status: 'rejected',
    note: input.reason,
  });

  return { ok: true, request: updated };
}

// ───────────────────────────────────────────────────────────────────────────
// cancelVacatingRequestByCustomer — withdraw a pending notice
// ───────────────────────────────────────────────────────────────────────────

export async function cancelVacatingRequestByCustomer(input: {
  requestId: string;
  customerId: string;
}): Promise<CancelVacatingByCustomerResult> {
  const [current] = await db
    .select()
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, input.requestId))
    .limit(1);
  if (!current) return { ok: false, kind: 'not_found' };
  if (current.customerId !== input.customerId) return { ok: false, kind: 'forbidden' };
  if (current.status !== 'pending') {
    return { ok: false, kind: 'wrong_status', status: current.status };
  }

  await db.delete(vacatingRequests).where(eq(vacatingRequests.id, current.id));

  await db.insert(auditLog).values({
    actorType: 'customer',
    actorId: input.customerId,
    entity: 'vacating_request',
    entityId: current.id,
    action: 'cancelled_by_customer',
    diff: {
      bookingId: current.bookingId,
      vacatingDate: current.vacatingDate,
      fromStatus: 'pending',
    },
  });

  const meta = await vacatingEmailMeta(current.bookingId);
  const { notifyVacatingUpdate } = await import('@/src/lib/email/notifications');
  notifyVacatingUpdate({
    customerId: current.customerId,
    bookingCode: meta.bookingCode,
    status: 'rejected',
    vacatingDate: current.vacatingDate,
    note: 'You withdrew your vacating request. Your stay continues as before.',
  });

  return { ok: true, bookingId: current.bookingId };
}

// ───────────────────────────────────────────────────────────────────────────
// completeVacatingRequest — the heavy lifter
// ───────────────────────────────────────────────────────────────────────────

export async function completeVacatingRequest(
  input: CompleteVacatingInput,
): Promise<CompleteVacatingResult> {
  const [current] = await db
    .select()
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, input.requestId))
    .limit(1);
  if (!current) return { ok: false, kind: 'not_found' };
  if (!['pending', 'approved'].includes(current.status)) {
    return { ok: false, kind: 'wrong_status', status: current.status };
  }

  const occupiedToday = await bookingHasActiveStayToday(current.bookingId);
  const checkoutAlreadyShortened = canCompleteCheckoutWithoutActiveStayToday({
    vacatingDate: current.vacatingDate,
    vacatingStatus: current.status as 'pending' | 'approved',
  });

  if (!occupiedToday && !checkoutAlreadyShortened) {
    return {
      ok: false,
      kind: 'bed_not_occupied',
      message:
        'This bed is already vacant — no active stay to complete. Cancel the vacating notice instead.',
    };
  }

  // Compute refundable balance AT COMPLETION TIME (collected - deductions
  // already on file). We DEDUCT this request's penalty, then REFUND the
  // remaining balance via canonical settlement (locked + idempotent).
  const deductionPaise = current.deductionPaise;

  const settlement = await settleVacatingDepositRefund({
    requestId: current.id,
    bookingId: current.bookingId,
    customerId: current.customerId,
    adminId: input.resolvedByAdminId ?? null,
    deductionPaise,
    noticeCompliant: current.noticeCompliant,
  });
  if (!settlement.ok) {
    return { ok: false, kind: 'settlement_failed', message: settlement.error };
  }
  const refundablePaise = settlement.depositRefundPaise;
  //    isn't billed for months they've vacated.
  const futureRent = await cancelFutureRentInvoices(
    current.bookingId,
    `vacating completed on ${formatDate(parseDate(current.vacatingDate))}`,
  );
  const electricity = await cancelElectricityInvoicesForBooking(current.bookingId);

  // 4. Stamp the request as completed.
  const [updated] = await db
    .update(vacatingRequests)
    .set({
      status: 'completed',
      depositRefundPaise: refundablePaise,
      resolvedAt: new Date(),
      resolvedByAdminId: input.resolvedByAdminId ?? null,
      updatedAt: new Date(),
    })
    .where(eq(vacatingRequests.id, current.id))
    .returning();

  // 5. Mark the booking completed and close inventory holds.
  await db
    .update(bookings)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(
      and(
        eq(bookings.id, current.bookingId),
        eq(bookings.status, 'confirmed'),
      ),
    );

  await completeBookingReservations(current.bookingId);
  await reconcileBookingOccupancy(current.bookingId);

  await db.insert(auditLog).values({
    actorType: input.resolvedByAdminId ? 'admin' : 'system',
    actorId: input.resolvedByAdminId ?? null,
    entity: 'vacating_request',
    entityId: updated.id,
    action: 'completed',
    diff: {
      deductionPaise,
      depositRefundPaise: refundablePaise,
      futureRentCancelled: futureRent.cancelled,
      electricityCancelled: electricity.cancelled,
      rentInvoiceIds: futureRent.ids,
      electricityInvoiceIds: electricity.ids,
      previousVacatingStatus: current.status,
    },
  });

  const meta = await vacatingEmailMeta(updated.bookingId);
  const { notifyVacatingUpdate } = await import('@/src/lib/email/notifications');
  notifyVacatingUpdate({
    customerId: updated.customerId,
    bookingCode: meta.bookingCode,
    status: 'completed',
    vacatingDate: updated.vacatingDate,
  });

  return {
    ok: true,
    request: updated,
    deductionPaise,
    depositRefundPaise: refundablePaise,
    futureInvoicesCancelled: futureRent.cancelled,
    electricityInvoicesCancelled: electricity.cancelled,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Admin undo / withdraw — reverse mistaken vacating actions
// ───────────────────────────────────────────────────────────────────────────

async function primaryBedHasNewOccupant(bookingId: string): Promise<boolean> {
  const [ctx] = await db
    .select({ bedId: bedReservations.bedId })
    .from(bedReservations)
    .where(
      and(eq(bedReservations.bookingId, bookingId), eq(bedReservations.kind, 'primary')),
    )
    .orderBy(desc(bedReservations.updatedAt))
    .limit(1);
  if (!ctx) return false;

  const [conflict] = await db
    .select({ id: bedReservations.id })
    .from(bedReservations)
    .where(
      and(
        eq(bedReservations.bedId, ctx.bedId),
        sql`${bedReservations.bookingId} <> ${bookingId}`,
        sql`${bedReservations.status} IN ('active', 'hold')`,
        sql`CURRENT_DATE <@ ${bedReservations.stayRange}`,
      ),
    )
    .limit(1);
  return Boolean(conflict);
}

/** Undo a mistaken vacating completion — restores booking, bed hold, and ledger. */
export async function revertVacatingCompletion(input: {
  requestId: string;
  resolvedByAdminId?: string | null;
}): Promise<RevertVacatingCompletionResult> {
  const [current] = await db
    .select()
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, input.requestId))
    .limit(1);
  if (!current) return { ok: false, kind: 'not_found' };
  if (current.status !== 'completed') {
    return { ok: false, kind: 'wrong_status', status: current.status };
  }

  if (await primaryBedHasNewOccupant(current.bookingId)) {
    return {
      ok: false,
      kind: 'bed_reassigned',
      message: 'Someone else is on this bed now — undo is blocked.',
    };
  }

  const [completionLog] = await db
    .select({ diff: auditLog.diff })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entity, 'vacating_request'),
        eq(auditLog.entityId, current.id),
        eq(auditLog.action, 'completed'),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(1);

  const diff = (completionLog?.diff ?? {}) as {
    rentInvoiceIds?: string[];
    electricityInvoiceIds?: string[];
    previousVacatingStatus?: VacatingRequest['status'];
  };

  await db
    .delete(depositLedger)
    .where(eq(depositLedger.relatedVacatingId, current.id));

  const rentIds = diff.rentInvoiceIds ?? [];
  if (rentIds.length > 0) {
    await db
      .update(rentInvoices)
      .set({
        status: 'pending',
        cancelledAt: null,
        cancellationReason: null,
        updatedAt: new Date(),
      })
      .where(
        and(inArray(rentInvoices.id, rentIds), eq(rentInvoices.status, 'cancelled')),
      );
  }

  const elecIds = diff.electricityInvoiceIds ?? [];
  if (elecIds.length > 0) {
    await db
      .update(electricityInvoices)
      .set({ status: 'pending', cancelledAt: null, updatedAt: new Date() })
      .where(
        and(
          inArray(electricityInvoices.id, elecIds),
          eq(electricityInvoices.status, 'cancelled'),
        ),
      );
  }

  await db
    .update(bedReservations)
    .set({ status: 'active', updatedAt: new Date() })
    .where(
      and(
        eq(bedReservations.bookingId, current.bookingId),
        eq(bedReservations.status, 'completed'),
      ),
    );

  await db
    .update(bookings)
    .set({ status: 'confirmed', updatedAt: new Date() })
    .where(eq(bookings.id, current.bookingId));

  const restored = await restoreOpenEndedStay(current.bookingId, {
    includeCompletedReservations: true,
  });
  if (!restored.ok) {
    return { ok: false, kind: 'cannot_restore', message: restored.reason };
  }

  const restoreStatus =
    diff.previousVacatingStatus === 'pending' ? 'pending' : 'approved';

  const [updated] = await db
    .update(vacatingRequests)
    .set({
      status: restoreStatus,
      depositRefundPaise: 0,
      resolvedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(vacatingRequests.id, current.id))
    .returning();

  await db.insert(auditLog).values({
    actorType: input.resolvedByAdminId ? 'admin' : 'system',
    actorId: input.resolvedByAdminId ?? null,
    entity: 'vacating_request',
    entityId: updated.id,
    action: 'completion_reverted',
    diff: { restoredStatus: restoreStatus },
  });

  return { ok: true, request: updated };
}

/** Withdraw a pending or approved vacating notice before completion. */
export async function adminWithdrawVacatingRequest(input: {
  requestId: string;
  resolvedByAdminId?: string | null;
}): Promise<AdminWithdrawVacatingResult> {
  const [current] = await db
    .select()
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, input.requestId))
    .limit(1);
  if (!current) return { ok: false, kind: 'not_found' };
  if (!['pending', 'approved'].includes(current.status)) {
    return { ok: false, kind: 'wrong_status', status: current.status };
  }

  if (current.status === 'approved') {
    const restored = await restoreOpenEndedStay(current.bookingId);
    if (!restored.ok) {
      return { ok: false, kind: 'cannot_restore', message: restored.reason };
    }
    await recalculateBillingAfterVacatingRestore({
      bookingId: current.bookingId,
      adminId: input.resolvedByAdminId,
    });
  }

  await db.delete(vacatingRequests).where(eq(vacatingRequests.id, current.id));

  await db.insert(auditLog).values({
    actorType: input.resolvedByAdminId ? 'admin' : 'system',
    actorId: input.resolvedByAdminId ?? null,
    entity: 'vacating_request',
    entityId: current.id,
    action: 'withdrawn_by_admin',
    diff: {
      bookingId: current.bookingId,
      fromStatus: current.status,
      vacatingDate: current.vacatingDate,
    },
  });

  return { ok: true, bookingId: current.bookingId };
}

/** Undo an approval — notice goes back to pending and the bed is no longer pre-bookable. */
export async function revertVacatingApproval(input: {
  requestId: string;
  resolvedByAdminId?: string | null;
}): Promise<RevertVacatingApprovalResult> {
  const [current] = await db
    .select()
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, input.requestId))
    .limit(1);
  if (!current) return { ok: false, kind: 'not_found' };
  if (current.status !== 'approved') {
    return { ok: false, kind: 'wrong_status', status: current.status };
  }

  const restored = await restoreOpenEndedStay(current.bookingId);
  if (!restored.ok) {
    return { ok: false, kind: 'cannot_restore', message: restored.reason };
  }
  await recalculateBillingAfterVacatingRestore({
    bookingId: current.bookingId,
    adminId: input.resolvedByAdminId,
  });

  const [updated] = await db
    .update(vacatingRequests)
    .set({
      status: 'pending',
      resolvedByAdminId: null,
      updatedAt: new Date(),
    })
    .where(eq(vacatingRequests.id, current.id))
    .returning();

  await db.insert(auditLog).values({
    actorType: input.resolvedByAdminId ? 'admin' : 'system',
    actorId: input.resolvedByAdminId ?? null,
    entity: 'vacating_request',
    entityId: updated.id,
    action: 'approval_reverted',
    diff: { from: 'approved', to: 'pending' },
  });

  return { ok: true, request: updated };
}

/** Extend or shorten an active vacating date, or extend tenancy when no notice exists. */
export async function extendVacatingDate(input: {
  bookingId: string;
  newVacatingDate: DateLike;
  resolvedByAdminId?: string | null;
  fromExtensionRequest?: boolean;
}): Promise<{ ok: true; requestId?: string } | { ok: false; message: string }> {
  const newDate = formatDate(parseDate(input.newVacatingDate));
  const today = formatDate(new Date());
  if (newDate <= today) {
    return { ok: false, message: 'New end date must be after today.' };
  }

  const [vacating] = await db
    .select()
    .from(vacatingRequests)
    .where(
      and(
        eq(vacatingRequests.bookingId, input.bookingId),
        inArray(vacatingRequests.status, ['pending', 'approved']),
      ),
    )
    .limit(1);

  if (vacating) {
    const noticeCompliant = isNoticeCompliant({
      noticeGivenDate: vacating.noticeGivenDate,
      vacatingDate: newDate,
    });
    const monthlyRent = vacating.monthlyRentPaiseSnapshot;
    const deduction = noticeCompliant ? 0 : vacatingPenalty(monthlyRent);

    const [updated] = await db
      .update(vacatingRequests)
      .set({
        vacatingDate: newDate,
        noticeCompliant,
        deductionPaise: deduction,
        updatedAt: new Date(),
      })
      .where(eq(vacatingRequests.id, vacating.id))
      .returning();

    if (updated.status === 'approved') {
      await db.execute(sql`
        UPDATE bed_reservations
        SET
          stay_range = daterange(lower(stay_range), ${newDate}::date, '[)'),
          updated_at = now()
        WHERE booking_id = ${input.bookingId}
          AND status IN ('hold', 'active')
      `);
      await db
        .update(bookings)
        .set({ expectedCheckoutDate: newDate, updatedAt: new Date() })
        .where(eq(bookings.id, input.bookingId));
    }

    await db.insert(auditLog).values({
      actorType: input.resolvedByAdminId ? 'admin' : 'system',
      actorId: input.resolvedByAdminId ?? null,
      entity: 'vacating_request',
      entityId: updated.id,
      action: 'vacating_date_changed',
      diff: {
        fromDate: vacating.vacatingDate,
        toDate: newDate,
        fromExtensionRequest: input.fromExtensionRequest ?? false,
      },
    });

    return { ok: true, requestId: updated.id };
  }

  await db.execute(sql`
    UPDATE bed_reservations
    SET
      stay_range = daterange(lower(stay_range), ${newDate}::date, '[)'),
      updated_at = now()
    WHERE booking_id = ${input.bookingId}
      AND status IN ('hold', 'active')
  `);

  await db
    .update(bookings)
    .set({ expectedCheckoutDate: newDate, updatedAt: new Date() })
    .where(eq(bookings.id, input.bookingId));

  await db.insert(auditLog).values({
    actorType: input.resolvedByAdminId ? 'admin' : 'system',
    actorId: input.resolvedByAdminId ?? null,
    entity: 'booking',
    entityId: input.bookingId,
    action: 'stay_extended',
    diff: { newEndDate: newDate, fromExtensionRequest: input.fromExtensionRequest ?? false },
  });

  return { ok: true };
}

/** Admin bed map — release a tenant from a bed today (checkout + free the bed). */
export async function adminRemoveTenantFromBed(input: {
  bookingId: string;
  resolvedByAdminId: string;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [booking] = await db
    .select({
      id: bookings.id,
      bookingCode: bookings.bookingCode,
      status: bookings.status,
      durationMode: bookings.durationMode,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  if (!booking) return { ok: false, error: 'Booking not found.' };
  if (!['confirmed', 'pending_payment'].includes(booking.status)) {
    return {
      ok: false,
      error: `Cannot remove tenant — booking is ${booking.status.replace('_', ' ')}.`,
    };
  }

  const occupiedToday = await bookingHasActiveStayToday(booking.id);
  const today = todayString();

  if (!occupiedToday) {
    const { cancelBooking } = await import('./bookingLifecycle');
    const cancelled = await cancelBooking({
      bookingCode: booking.bookingCode,
      reason: input.reason ?? '[admin] Removed from bed — future reservation cancelled',
      actor: { kind: 'admin', adminId: input.resolvedByAdminId },
    });
    if (!cancelled.ok) {
      return { ok: false, error: cancelled.reason };
    }
    await reconcileBookingOccupancy(booking.id);
    return { ok: true };
  }

  if (!['monthly', 'open_ended'].includes(booking.durationMode)) {
    return {
      ok: false,
      error: 'Short-stay bookings must be cancelled from the booking detail page.',
    };
  }

  let requestId: string | undefined;

  const [existing] = await db
    .select()
    .from(vacatingRequests)
    .where(
      and(
        eq(vacatingRequests.bookingId, booking.id),
        inArray(vacatingRequests.status, ['pending', 'approved']),
      ),
    )
    .limit(1);

  if (existing) {
    requestId = existing.id;
    if (existing.vacatingDate !== today) {
      await db
        .update(vacatingRequests)
        .set({
          vacatingDate: today,
          noticeCompliant: true,
          deductionPaise: 0,
          updatedAt: new Date(),
        })
        .where(eq(vacatingRequests.id, existing.id));
      if (
        existing.status === 'approved' &&
        shouldShortenStayOnVacatingApproval(today)
      ) {
        await shortenBookingReservationsToDate(booking.id, today);
      }
    }
  } else {
    const submitted = await submitVacatingRequest({
      bookingId: booking.id,
      vacatingDate: today,
      waiveDeduction: true,
      openBedForBookingFromVacatingDate: false,
      resolvedByAdminId: input.resolvedByAdminId,
      notes: input.reason ?? 'Removed from bed via admin bed map',
    });
    if (!submitted.ok) {
      if (submitted.kind === 'already_exists' && submitted.existingRequestId) {
        requestId = submitted.existingRequestId;
      } else {
        const msg =
          submitted.kind === 'invalid_input'
            ? submitted.message
            : `Could not start checkout (${submitted.kind}).`;
        return { ok: false, error: msg };
      }
    } else {
      requestId = submitted.request.id;
    }
  }

  if (!requestId) {
    return { ok: false, error: 'Could not resolve vacating request.' };
  }

  const [fresh] = await db
    .select({ status: vacatingRequests.status })
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, requestId))
    .limit(1);

  if (fresh?.status === 'pending') {
    const approved = await approveVacatingRequest({
      requestId,
      resolvedByAdminId: input.resolvedByAdminId,
    });
    if (!approved.ok) {
      return { ok: false, error: 'Could not approve checkout.' };
    }
  }

  const completed = await completeVacatingRequest({
    requestId,
    resolvedByAdminId: input.resolvedByAdminId,
  });
  if (!completed.ok) {
    const msg =
      completed.kind === 'bed_not_occupied'
        ? completed.message
        : `Could not complete checkout (${completed.kind}).`;
    return { ok: false, error: msg };
  }

  return { ok: true };
}

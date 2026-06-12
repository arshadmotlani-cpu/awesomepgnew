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
import { formatDate, parseDate, type DateLike } from '../lib/dates';
import { isNoticeCompliant, vacatingPenalty } from './billing';
import { recordDepositDeducted, recordDepositRefunded, getDepositSummaryForBooking } from './deposits';
import { cancelFutureRentInvoices } from './rentInvoices';
import { cancelElectricityInvoicesForBooking } from './electricityBilling';

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
  | { ok: false; kind: 'bed_not_occupied'; message: string };

export type RevertVacatingCompletionResult =
  | { ok: true; request: VacatingRequest }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'wrong_status'; status: VacatingRequest['status'] }
  | { ok: false; kind: 'bed_reassigned'; message: string };

export type AdminWithdrawVacatingResult =
  | { ok: true; bookingId: string }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'wrong_status'; status: VacatingRequest['status'] };

export type RevertVacatingApprovalResult =
  | { ok: true; request: VacatingRequest }
  | { ok: false; kind: 'not_found' }
  | { ok: false; kind: 'wrong_status'; status: VacatingRequest['status'] };

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

async function restoreOpenEndedStay(bookingId: string) {
  await db.execute(sql`
    UPDATE bed_reservations
    SET
      stay_range = daterange(lower(stay_range), ${LONG_TERM_END}::date, '[)'),
      updated_at = now()
    WHERE booking_id = ${bookingId}
      AND status IN ('active', 'hold', 'completed')
      AND kind = 'primary'
  `);

  await db
    .update(bookings)
    .set({ expectedCheckoutDate: LONG_TERM_END, updatedAt: new Date() })
    .where(eq(bookings.id, bookingId));
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

  await shortenBookingReservationsToDate(updated.bookingId, updated.vacatingDate);

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
  if (!occupiedToday) {
    return {
      ok: false,
      kind: 'bed_not_occupied',
      message:
        'This bed is already vacant — no active stay to complete. Cancel the vacating notice instead.',
    };
  }

  // Compute refundable balance AT COMPLETION TIME (collected - deductions
  // already on file). We DEDUCT this request's penalty, then REFUND the
  // remaining balance.
  const summaryBefore = await getDepositSummaryForBooking(current.bookingId);
  if (!summaryBefore) return { ok: false, kind: 'not_found' };

  const deductionPaise = current.deductionPaise;

  // 1. Write the deduction (if any).
  if (deductionPaise > 0) {
    await recordDepositDeducted({
      bookingId: current.bookingId,
      customerId: current.customerId,
      amountPaise: deductionPaise,
      reason: `vacating notice ${
        current.noticeCompliant ? 'compliant' : 'short'
      } — 5-day rent penalty`,
      relatedVacatingId: current.id,
      createdByAdminId: input.resolvedByAdminId ?? null,
    });
  }

  // 2. Compute refundable balance and write the refund (if any).
  const refundablePaise = Math.max(
    0,
    summaryBefore.refundableBalancePaise - deductionPaise,
  );
  if (refundablePaise > 0) {
    await recordDepositRefunded({
      bookingId: current.bookingId,
      customerId: current.customerId,
      amountPaise: refundablePaise,
      reason: 'vacating refund',
      relatedVacatingId: current.id,
      createdByAdminId: input.resolvedByAdminId ?? null,
    });
  }

  // 3. Cancel forward-dated rent + electricity invoices so the resident
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

  await restoreOpenEndedStay(current.bookingId);

  await db
    .update(bookings)
    .set({ status: 'confirmed', updatedAt: new Date() })
    .where(eq(bookings.id, current.bookingId));

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
    await restoreOpenEndedStay(current.bookingId);
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

  await restoreOpenEndedStay(current.bookingId);

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

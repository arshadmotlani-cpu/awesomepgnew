/**
 * Phase 5.5 — vacating workflow.
 *
 *   submitVacatingRequest()  — resident or admin files a vacating notice
 *   approveVacatingRequest() — admin acknowledges
 *   rejectVacatingRequest()  — admin denies (rare)
 *   completeVacatingRequest()— admin marks done; writes deposit ledger
 *                               entries (deducted + refunded), cancels
 *                               future rent + electricity invoices
 *
 * Policy (spec):
 *   - If notice >= 15 days: no deposit deduction.
 *   - If notice < 15 days: deduct exactly 5 days' worth of rent
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

import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import {
  auditLog,
  bookings,
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

  const noticeCompliant = isNoticeCompliant({ noticeGivenDate, vacatingDate });
  const monthlyRent = monthlyRentFromBooking(
    booking.pricingSnapshot as PricingSnapshot | null,
  );
  const deduction = noticeCompliant ? 0 : vacatingPenalty(monthlyRent);

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
      actorType: 'system',
      actorId: null,
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
      },
    });

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
      request: row,
      noticeDays,
      noticeCompliant,
      deductionPaise: deduction,
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

  // 5. (Optional) Mark the booking itself as completed.
  await db
    .update(bookings)
    .set({ status: 'completed', updatedAt: new Date() })
    .where(
      and(
        eq(bookings.id, current.bookingId),
        // Only flip from confirmed — leave cancelled/refunded alone.
        eq(bookings.status, 'confirmed'),
      ),
    );

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

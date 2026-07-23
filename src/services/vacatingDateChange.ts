/**
 * Resident-initiated vacating date change — admin approval required.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bookings,
  checkoutSettlements,
  vacatingDateChangeRequests,
  vacatingRequests,
} from '@/src/db/schema';
import { formatDate, normalizeIsoDateOnly, parseDate } from '@/src/lib/dates';
import { guardDepositPaise } from '@/src/lib/deposits/paiseSafety';
import { paiseToInr } from '@/src/lib/format';
import { isFixedStayDurationMode } from '@/src/lib/checkout/checkoutWorkflow';
import type { EstimatedSettlementPreview } from '@/src/lib/vacating/estimatedSettlementPreview';
import { buildEstimatedSettlementPreview } from '@/src/lib/vacating/estimatedSettlementPreview';
import { isNoticeCompliant, VACATING_NOTICE_MIN_DAYS } from '@/src/services/billing';
import { computeNoticeDeductionForBooking } from '@/src/services/noticeDeduction';
import { scheduleAdminNotificationSync } from '@/src/services/adminLiveSync';
import { reconcileBookingOccupancy } from '@/src/lib/occupancySync';
import type { NoticeDeductionBreakdown } from '@/src/lib/vacating/noticeDeductionEngine';

export type VacatingDateChangePreview = {
  currentVacatingDate: string;
  requestedVacatingDate: string;
  noticeCompliant: boolean;
  currentEstimatedSettlement: EstimatedSettlementPreview;
  requestedEstimatedSettlement: EstimatedSettlementPreview;
  currentEstimatedRefundPaise: number;
  requestedEstimatedRefundPaise: number;
  refundDeltaPaise: number;
  refundDeltaLabel: string;
};

async function loadActiveVacatingForDateChange(args: {
  vacatingRequestId?: string;
  bookingId?: string;
  customerId?: string;
}) {
  const where = args.vacatingRequestId
    ? eq(vacatingRequests.id, args.vacatingRequestId)
    : and(
        eq(vacatingRequests.bookingId, args.bookingId!),
        eq(vacatingRequests.status, 'approved'),
      );

  const [vacating] = await db
    .select()
    .from(vacatingRequests)
    .where(where)
    .limit(1);

  if (!vacating) return { ok: false as const, error: 'Move-out request not found.' };
  if (vacating.status !== 'approved') {
    return { ok: false as const, error: 'Leaving date can only be changed after move-out is approved.' };
  }
  if (args.customerId && vacating.customerId !== args.customerId) {
    return { ok: false as const, error: 'Not allowed.' };
  }

  const [booking] = await db
    .select({ durationMode: bookings.durationMode, stayType: bookings.stayType })
    .from(bookings)
    .where(eq(bookings.id, vacating.bookingId))
    .limit(1);

  if (isFixedStayDurationMode(booking?.durationMode)) {
    return { ok: false as const, error: 'Fixed-stay bookings cannot change leaving date this way.' };
  }

  const [anySettlement] = await db
    .select({ id: checkoutSettlements.id, status: checkoutSettlements.status })
    .from(checkoutSettlements)
    .where(
      and(
        eq(checkoutSettlements.vacatingRequestId, vacating.id),
        sql`${checkoutSettlements.status} <> 'archived'`,
      ),
    )
    .orderBy(desc(checkoutSettlements.updatedAt))
    .limit(1);

  if (anySettlement) {
    return {
      ok: false as const,
      error: 'Leaving date cannot be changed after checkout settlement has started.',
    };
  }

  return {
    ok: true as const,
    vacating,
    booking,
  };
}

async function buildPreviewForDate(
  vacating: typeof vacatingRequests.$inferSelect,
  booking: { stayType?: string | null; durationMode?: string | null },
  vacatingDate: string,
): Promise<EstimatedSettlementPreview | null> {
  return buildEstimatedSettlementPreview(
    {
      bookingId: vacating.bookingId,
      noticeGivenDate: String(vacating.noticeGivenDate),
      vacatingDate,
      monthlyRentPaiseSnapshot: vacating.monthlyRentPaiseSnapshot,
      noticeRentCoveredDays: vacating.noticeRentCoveredDays,
      noticeChargeableDays: vacating.noticeChargeableDays,
      deductionPaise: vacating.deductionPaise,
      noticeBreakdownJson: vacating.noticeBreakdownJson as Parameters<
        typeof buildEstimatedSettlementPreview
      >[0]['noticeBreakdownJson'],
      stayType: booking.stayType,
      durationMode: booking.durationMode,
    },
    { mode: 'estimate' },
  );
}

export async function previewVacatingDateChange(input: {
  vacatingRequestId?: string;
  bookingId?: string;
  customerId?: string;
  requestedVacatingDate: string;
}): Promise<{ ok: true; preview: VacatingDateChangePreview } | { ok: false; error: string }> {
  const loaded = await loadActiveVacatingForDateChange(input);
  if (!loaded.ok) return loaded;

  const currentDate = normalizeIsoDateOnly(String(loaded.vacating.vacatingDate));
  const requestedDate = normalizeIsoDateOnly(input.requestedVacatingDate);
  const today = formatDate(new Date());

  if (!requestedDate || requestedDate <= today) {
    return { ok: false, error: 'New leaving date must be after today.' };
  }
  if (requestedDate === currentDate) {
    return { ok: false, error: 'Choose a different leaving date.' };
  }

  const noticeCompliant = isNoticeCompliant({
    noticeGivenDate: loaded.vacating.noticeGivenDate,
    vacatingDate: requestedDate,
  });
  if (!noticeCompliant) {
    return {
      ok: false,
      error: `The new date must still give at least ${VACATING_NOTICE_MIN_DAYS} days notice from when you submitted (${formatDate(parseDate(String(loaded.vacating.noticeGivenDate)))}). Cancel this move-out and submit a new request instead.`,
    };
  }

  const [currentEstimated, requestedEstimated] = await Promise.all([
    buildPreviewForDate(loaded.vacating, loaded.booking, currentDate),
    buildPreviewForDate(loaded.vacating, loaded.booking, requestedDate),
  ]);

  if (!currentEstimated || !requestedEstimated) {
    return { ok: false, error: 'Could not calculate estimated settlement.' };
  }

  const currentRefund = guardDepositPaise(currentEstimated.estimatedRefundPaise);
  const requestedRefund = guardDepositPaise(requestedEstimated.estimatedRefundPaise);
  const delta = requestedRefund - currentRefund;
  const refundDeltaLabel =
    delta === 0
      ? 'No change to estimated refund'
      : delta > 0
        ? `Estimated refund increases by ${paiseToInr(delta)}`
        : `Estimated refund decreases by ${paiseToInr(Math.abs(delta))}`;

  return {
    ok: true,
    preview: {
      currentVacatingDate: currentDate,
      requestedVacatingDate: requestedDate,
      noticeCompliant,
      currentEstimatedSettlement: currentEstimated,
      requestedEstimatedSettlement: requestedEstimated,
      currentEstimatedRefundPaise: currentRefund,
      requestedEstimatedRefundPaise: requestedRefund,
      refundDeltaPaise: delta,
      refundDeltaLabel,
    },
  };
}

export async function submitVacatingDateChangeRequest(input: {
  bookingId: string;
  customerId: string;
  requestedVacatingDate: string;
  residentNotes?: string | null;
}): Promise<
  | { ok: true; requestId: string }
  | { ok: false; error: string }
> {
  const loaded = await loadActiveVacatingForDateChange({
    bookingId: input.bookingId,
    customerId: input.customerId,
  });
  if (!loaded.ok) return loaded;

  const [pending] = await db
    .select({ id: vacatingDateChangeRequests.id })
    .from(vacatingDateChangeRequests)
    .where(
      and(
        eq(vacatingDateChangeRequests.vacatingRequestId, loaded.vacating.id),
        eq(vacatingDateChangeRequests.status, 'pending'),
      ),
    )
    .limit(1);
  if (pending) {
    return { ok: false, error: 'A date change request is already waiting for admin approval.' };
  }

  const previewRes = await previewVacatingDateChange({
    vacatingRequestId: loaded.vacating.id,
    customerId: input.customerId,
    requestedVacatingDate: input.requestedVacatingDate,
  });
  if (!previewRes.ok) return previewRes;

  const [created] = await db
    .insert(vacatingDateChangeRequests)
    .values({
      vacatingRequestId: loaded.vacating.id,
      bookingId: loaded.vacating.bookingId,
      customerId: input.customerId,
      currentVacatingDate: previewRes.preview.currentVacatingDate,
      requestedVacatingDate: previewRes.preview.requestedVacatingDate,
      currentEstimatedRefundPaise: previewRes.preview.currentEstimatedRefundPaise,
      requestedEstimatedRefundPaise: previewRes.preview.requestedEstimatedRefundPaise,
      refundDeltaPaise: previewRes.preview.refundDeltaPaise,
      previewSnapshot: previewRes.preview,
      residentNotes: input.residentNotes?.trim() || null,
      status: 'pending',
    })
    .returning({ id: vacatingDateChangeRequests.id });

  await db.insert(auditLog).values({
    actorType: 'customer',
    actorId: input.customerId,
    entity: 'vacating_date_change_request',
    entityId: created.id,
    action: 'submitted',
    diff: {
      vacatingRequestId: loaded.vacating.id,
      fromDate: previewRes.preview.currentVacatingDate,
      toDate: previewRes.preview.requestedVacatingDate,
      refundDeltaPaise: previewRes.preview.refundDeltaPaise,
    },
  });

  scheduleAdminNotificationSync();
  return { ok: true, requestId: created.id };
}

export async function applyApprovedVacatingDateChange(args: {
  vacating: typeof vacatingRequests.$inferSelect;
  newVacatingDate: string;
  resolvedByAdminId?: string | null;
  fromDateChangeRequestId?: string;
  syncRent?: boolean;
}): Promise<void> {
  const newDate = normalizeIsoDateOnly(args.newVacatingDate);
  const noticeBreakdown = await computeNoticeDeductionForBooking({
    bookingId: args.vacating.bookingId,
    noticeGivenDate: String(args.vacating.noticeGivenDate),
    vacatingDate: newDate,
    monthlyRentPaise: args.vacating.monthlyRentPaiseSnapshot,
  });

  const [updated] = await db
    .update(vacatingRequests)
    .set({
      vacatingDate: newDate,
      noticeCompliant: isNoticeCompliant({
        noticeGivenDate: args.vacating.noticeGivenDate,
        vacatingDate: newDate,
      }),
      deductionPaise: noticeBreakdown.noticeDeductionPaise,
      noticeRentCoveredDays: noticeBreakdown.rentCoveredDays,
      noticeChargeableDays: noticeBreakdown.chargeableNoticeDays,
      noticeBreakdownJson: noticeBreakdown as unknown as Partial<NoticeDeductionBreakdown>,
      updatedAt: new Date(),
    })
    .where(eq(vacatingRequests.id, args.vacating.id))
    .returning();

  await db.execute(sql`
    UPDATE bed_reservations
    SET
      stay_range = daterange(lower(stay_range), ${newDate}::date, '[)'),
      updated_at = now()
    WHERE booking_id = ${updated.bookingId}::uuid
      AND status IN ('hold', 'active')
  `);

  await db
    .update(bookings)
    .set({ expectedCheckoutDate: newDate, updatedAt: new Date() })
    .where(eq(bookings.id, updated.bookingId));

  if (args.syncRent !== false) {
    const { syncVacatingCheckoutRentBilling } = await import('@/src/services/vacatingCheckoutBilling');
    await syncVacatingCheckoutRentBilling({
      bookingId: updated.bookingId,
      vacatingDate: newDate,
      actorId: args.resolvedByAdminId ?? null,
      actorType: args.resolvedByAdminId ? 'admin' : 'system',
    }).catch((err) => console.error('[vacatingDateChange] rent sync failed', err));
  }

  await reconcileBookingOccupancy(updated.bookingId);

  await db.insert(auditLog).values({
    actorType: args.resolvedByAdminId ? 'admin' : 'system',
    actorId: args.resolvedByAdminId ?? null,
    entity: 'vacating_request',
    entityId: updated.id,
    action: 'vacating_date_changed',
    diff: {
      fromDate: args.vacating.vacatingDate,
      toDate: newDate,
      dateChangeRequestId: args.fromDateChangeRequestId ?? null,
    },
  });
}

export async function approveVacatingDateChangeRequest(input: {
  requestId: string;
  resolvedByAdminId?: string | null;
  adminNotes?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db
    .select()
    .from(vacatingDateChangeRequests)
    .where(eq(vacatingDateChangeRequests.id, input.requestId))
    .limit(1);
  if (!row) return { ok: false, error: 'Date change request not found.' };
  if (row.status !== 'pending') return { ok: false, error: 'This request is no longer pending.' };

  const [vacating] = await db
    .select()
    .from(vacatingRequests)
    .where(eq(vacatingRequests.id, row.vacatingRequestId))
    .limit(1);
  if (!vacating || vacating.status !== 'approved') {
    return { ok: false, error: 'Move-out request is no longer active.' };
  }

  await applyApprovedVacatingDateChange({
    vacating,
    newVacatingDate: String(row.requestedVacatingDate),
    resolvedByAdminId: input.resolvedByAdminId,
    fromDateChangeRequestId: row.id,
  });

  await db
    .update(vacatingDateChangeRequests)
    .set({
      status: 'approved',
      adminNotes: input.adminNotes?.trim() || null,
      reviewedByAdminId: input.resolvedByAdminId ?? null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(vacatingDateChangeRequests.id, row.id));

  await db.insert(auditLog).values({
    actorType: input.resolvedByAdminId ? 'admin' : 'system',
    actorId: input.resolvedByAdminId ?? null,
    entity: 'vacating_date_change_request',
    entityId: row.id,
    action: 'approved',
    diff: {
      fromDate: row.currentVacatingDate,
      toDate: row.requestedVacatingDate,
      refundDeltaPaise: row.refundDeltaPaise,
    },
  });

  scheduleAdminNotificationSync();
  return { ok: true };
}

export async function rejectVacatingDateChangeRequest(input: {
  requestId: string;
  resolvedByAdminId?: string | null;
  adminNotes?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db
    .select()
    .from(vacatingDateChangeRequests)
    .where(eq(vacatingDateChangeRequests.id, input.requestId))
    .limit(1);
  if (!row) return { ok: false, error: 'Date change request not found.' };
  if (row.status !== 'pending') return { ok: false, error: 'This request is no longer pending.' };

  await db
    .update(vacatingDateChangeRequests)
    .set({
      status: 'rejected',
      adminNotes: input.adminNotes?.trim() || null,
      reviewedByAdminId: input.resolvedByAdminId ?? null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(vacatingDateChangeRequests.id, row.id));

  await db.insert(auditLog).values({
    actorType: input.resolvedByAdminId ? 'admin' : 'system',
    actorId: input.resolvedByAdminId ?? null,
    entity: 'vacating_date_change_request',
    entityId: row.id,
    action: 'rejected',
    diff: { adminNotes: input.adminNotes ?? null },
  });

  scheduleAdminNotificationSync();
  return { ok: true };
}

export async function cancelVacatingDateChangeRequest(input: {
  requestId: string;
  customerId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db
    .select()
    .from(vacatingDateChangeRequests)
    .where(eq(vacatingDateChangeRequests.id, input.requestId))
    .limit(1);
  if (!row) return { ok: false, error: 'Date change request not found.' };
  if (row.customerId !== input.customerId) return { ok: false, error: 'Not allowed.' };
  if (row.status !== 'pending') return { ok: false, error: 'This request can no longer be cancelled.' };

  await db
    .update(vacatingDateChangeRequests)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(vacatingDateChangeRequests.id, row.id));

  await db.insert(auditLog).values({
    actorType: 'customer',
    actorId: input.customerId,
    entity: 'vacating_date_change_request',
    entityId: row.id,
    action: 'cancelled',
    diff: {
      vacatingRequestId: row.vacatingRequestId,
      fromDate: row.currentVacatingDate,
      toDate: row.requestedVacatingDate,
    },
  });

  return { ok: true };
}

export async function getPendingVacatingDateChangeForBooking(bookingId: string) {
  const [row] = await db
    .select()
    .from(vacatingDateChangeRequests)
    .where(
      and(
        eq(vacatingDateChangeRequests.bookingId, bookingId),
        eq(vacatingDateChangeRequests.status, 'pending'),
      ),
    )
    .orderBy(desc(vacatingDateChangeRequests.createdAt))
    .limit(1);
  return row ?? null;
}

export async function listPendingVacatingDateChanges(limit = 50) {
  return db
    .select()
    .from(vacatingDateChangeRequests)
    .where(eq(vacatingDateChangeRequests.status, 'pending'))
    .orderBy(desc(vacatingDateChangeRequests.createdAt))
    .limit(limit);
}

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
import { enrichVacatingDateChangePreview } from '@/src/lib/vacating/moveOutStateModel';
import { stayRangeExclusiveEnd } from '@/src/lib/vacating/vacatingBedSemantics';

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
  direction?: 'earlier' | 'later';
  additionalStayDays?: number;
  additionalRentPaise?: number;
  unusedPrepaidRentPaise?: number;
  noticeGivenDate?: string;
  originalNoticeSubmittedAt?: string | null;
  originalVacatingDate?: string;
  noticeComplianceLabel?: string;
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
    .select({
      id: checkoutSettlements.id,
      status: checkoutSettlements.status,
      amountsLocked: checkoutSettlements.amountsLocked,
    })
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
    const blocked =
      anySettlement.amountsLocked ||
      anySettlement.status === 'refund_pending' ||
      anySettlement.status === 'completed' ||
      anySettlement.status === 'refund_paid' ||
      anySettlement.status === 'awaiting_admin_review';
    if (blocked) {
      return {
        ok: false as const,
        error: 'Leaving date cannot be changed after checkout settlement has started.',
      };
    }
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

  if (!requestedDate || requestedDate < today) {
    return { ok: false, error: 'Final stay date cannot be in the past.' };
  }
  if (requestedDate === currentDate) {
    return { ok: false, error: 'Choose a different leaving date.' };
  }

  const noticeCompliant = isNoticeCompliant({
    noticeGivenDate: loaded.vacating.noticeGivenDate,
    vacatingDate: requestedDate,
  });

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
    preview: enrichVacatingDateChangePreview(
      {
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
      loaded.vacating,
    ),
  };
}

export async function previewAdminVacatingDateChange(input: {
  bookingId: string;
  requestedVacatingDate: string;
}): Promise<{ ok: true; preview: VacatingDateChangePreview } | { ok: false; error: string }> {
  const [vacating] = await db
    .select()
    .from(vacatingRequests)
    .where(
      and(
        eq(vacatingRequests.bookingId, input.bookingId),
        sql`${vacatingRequests.status} IN ('pending', 'approved')`,
      ),
    )
    .limit(1);

  if (!vacating) {
    return { ok: false, error: 'No active move-out request on this booking.' };
  }

  const [booking] = await db
    .select({ durationMode: bookings.durationMode, stayType: bookings.stayType })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);

  if (isFixedStayDurationMode(booking?.durationMode)) {
    return { ok: false, error: 'Fixed-stay bookings cannot change leaving date this way.' };
  }

  const currentDate = normalizeIsoDateOnly(String(vacating.vacatingDate));
  const requestedDate = normalizeIsoDateOnly(input.requestedVacatingDate);
  const today = formatDate(new Date());

  if (!requestedDate || requestedDate <= today) {
    return { ok: false, error: 'New final stay date must be after today.' };
  }
  if (requestedDate === currentDate) {
    return { ok: false, error: 'Choose a different final stay date.' };
  }

  const noticeCompliant = isNoticeCompliant({
    noticeGivenDate: vacating.noticeGivenDate,
    vacatingDate: requestedDate,
  });

  const [currentEstimated, requestedEstimated] = await Promise.all([
    buildPreviewForDate(vacating, booking ?? {}, currentDate),
    buildPreviewForDate(vacating, booking ?? {}, requestedDate),
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
    preview: enrichVacatingDateChangePreview(
      {
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
      vacating,
    ),
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
    return { ok: false, error: 'A date change is already in progress. Refresh and try again.' };
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
      noticeCompliant: previewRes.preview.noticeCompliant,
      direction: previewRes.preview.direction,
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
      stay_range = daterange(lower(stay_range), ${stayRangeExclusiveEnd(newDate)}::date, '[)'),
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
    const rentSync = await syncVacatingCheckoutRentBilling({
      bookingId: updated.bookingId,
      vacatingDate: newDate,
      actorId: args.resolvedByAdminId ?? null,
      actorType: args.resolvedByAdminId ? 'admin' : 'system',
    });
    if ('ok' in rentSync) {
      throw new Error(`Checkout rent sync failed after date change: ${rentSync.error}`);
    }
    if (
      rentSync.charge?.billingAction === 'adjust_existing' &&
      rentSync.invoiceUpdated !== true
    ) {
      throw new Error(
        'Checkout rent liability was not reconciled to the new move-out date.',
      );
    }
  }

  const [bookingRow] = await db
    .select({ stayType: bookings.stayType, durationMode: bookings.durationMode })
    .from(bookings)
    .where(eq(bookings.id, updated.bookingId))
    .limit(1);

  const { recomputeCheckoutSettlementV2ForVacating } = await import(
    '@/src/services/checkoutSettlement'
  );
  await recomputeCheckoutSettlementV2ForVacating({
    vacatingRequestId: updated.id,
    stayCheckoutDate: newDate,
    stayType: bookingRow?.stayType,
    durationMode: bookingRow?.durationMode,
  }).catch((err) => console.error('[vacatingDateChange] settlement recompute failed', err));

  await reconcileBookingOccupancy(updated.bookingId);

  const { syncExitBrainCheckoutDate } = await import('@/src/lib/exit/activateResidentExitBrain');
  await syncExitBrainCheckoutDate({
    bookingId: updated.bookingId,
    expectedCheckoutDate: newDate,
    noticeGivenDate: String(updated.noticeGivenDate),
    frozenNoticePenaltyPaise: updated.deductionPaise,
  }).catch((err) => console.error('[vacatingDateChange] exit brain sync failed', err));

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

  const [bookingRow] = await db
    .select({ bookingCode: bookings.bookingCode })
    .from(bookings)
    .where(eq(bookings.id, row.bookingId))
    .limit(1);

  const { notifyVacatingUpdate } = await import('@/src/lib/email/notifications');
  notifyVacatingUpdate({
    customerId: row.customerId,
    bookingCode: bookingRow?.bookingCode ?? row.bookingId,
    status: 'approved',
    vacatingDate: String(row.requestedVacatingDate),
    note: `Your move-out date has been updated to ${String(row.requestedVacatingDate)}.`,
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

  scheduleAdminNotificationSync();
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
  if (!row) return null;
  const preview = row.previewSnapshot as VacatingDateChangePreview | null;
  return {
    ...row,
    preview: preview ?? null,
  };
}

export async function listPendingVacatingDateChanges(limit = 50) {
  return db
    .select()
    .from(vacatingDateChangeRequests)
    .where(eq(vacatingDateChangeRequests.status, 'pending'))
    .orderBy(desc(vacatingDateChangeRequests.createdAt))
    .limit(limit);
}

export type PendingVacatingDateChangeOpsRow = {
  requestId: string;
  vacatingRequestId: string;
  bookingId: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  bookingCode: string;
  pgId: string;
  pgName: string;
  roomNumber: string;
  bedCode: string;
  noticeGivenDate: string;
  currentVacatingDate: string;
  requestedVacatingDate: string;
  refundDeltaPaise: number;
  preview: VacatingDateChangePreview | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Pending date-change requests with booking context for Operations queue. */
export async function listPendingVacatingDateChangesForOps(
  limit = 50,
): Promise<PendingVacatingDateChangeOpsRow[]> {
  const rows = await db.execute<{
    request_id: string;
    vacating_request_id: string;
    booking_id: string;
    customer_id: string;
    customer_name: string;
    customer_phone: string | null;
    booking_code: string;
    pg_id: string;
    pg_name: string;
    room_number: string;
    bed_code: string;
    notice_given_date: string;
    current_vacating_date: string;
    requested_vacating_date: string;
    refund_delta_paise: number;
    preview_snapshot: VacatingDateChangePreview | null;
    created_at: Date;
    updated_at: Date;
  }>(sql`
    SELECT
      vdcr.id AS request_id,
      vdcr.vacating_request_id,
      vdcr.booking_id,
      vdcr.customer_id,
      c.full_name AS customer_name,
      c.phone AS customer_phone,
      b.booking_code,
      p.id AS pg_id,
      p.name AS pg_name,
      r.room_number::text AS room_number,
      bed.bed_code,
      vr.notice_given_date::text AS notice_given_date,
      vdcr.current_vacating_date::text AS current_vacating_date,
      vdcr.requested_vacating_date::text AS requested_vacating_date,
      vdcr.refund_delta_paise,
      vdcr.preview_snapshot AS preview_snapshot,
      vdcr.created_at,
      vdcr.updated_at
    FROM vacating_date_change_requests vdcr
    INNER JOIN vacating_requests vr ON vr.id = vdcr.vacating_request_id
    INNER JOIN bookings b ON b.id = vdcr.booking_id
    INNER JOIN customers c ON c.id = vdcr.customer_id
    INNER JOIN bed_reservations br ON br.booking_id = b.id AND br.kind = 'primary'
    INNER JOIN beds bed ON bed.id = br.bed_id
    INNER JOIN rooms r ON r.id = bed.room_id
    INNER JOIN floors f ON f.id = r.floor_id
    INNER JOIN pgs p ON p.id = f.pg_id
    WHERE vdcr.status = 'pending'
    ORDER BY vdcr.created_at DESC
    LIMIT ${limit}
  `);

  return rows.map((row) => ({
    requestId: row.request_id,
    vacatingRequestId: row.vacating_request_id,
    bookingId: row.booking_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    bookingCode: row.booking_code,
    pgId: row.pg_id,
    pgName: row.pg_name,
    roomNumber: row.room_number,
    bedCode: row.bed_code,
    noticeGivenDate: row.notice_given_date,
    currentVacatingDate: row.current_vacating_date,
    requestedVacatingDate: row.requested_vacating_date,
    refundDeltaPaise: Number(row.refund_delta_paise),
    preview: (row.preview_snapshot as VacatingDateChangePreview | null) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

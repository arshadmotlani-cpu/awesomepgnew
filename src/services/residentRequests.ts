/**
 * Resident-initiated requests: deposit refund and stay extension.
 * Syncs to action_items for Take Action queue + sidebar badges.
 */

import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  auditLog,
  bedReservations,
  beds,
  bookings,
  customers,
  floors,
  pgs,
  residentRequests,
  rooms,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { adminCanAccessPg } from '@/src/lib/auth/roles';
import { formatDate, parseDate } from '@/src/lib/dates';
import { getDepositSummaryForBooking } from '@/src/services/deposits';
import { getDepositRefundEligibility } from '@/src/lib/vacating/depositRefundEligibility';
import { getVacatingForBooking } from '@/src/db/queries/customer';
import { settleDepositWithDeductions, settleDepositRefund } from '@/src/services/depositSettlement';
import { syncResidentRequestActionItems } from '@/src/services/residentRequestActions';
import { refreshAdminNotificationsFromActionItems } from '@/src/services/actionItems';
import { writeAuditLogNonBlocking } from '@/src/lib/audit/writeAuditLog';
import {
  computeRefundDeductions,
  type RefundCompletionInput,
} from '@/src/lib/refundDeductions';
import {
  validateDepositRefundSubmission,
  DEPOSIT_REFUND_MISSING_DETAILS_MESSAGE,
} from '@/src/lib/billing/depositRefundRequirements';
import {
  assertPrepaidRentRefundRequestAmountPaise,
  computePrepaidRentRefundCeiling,
  getPrepaidRentRefundCeilingForBooking,
} from '@/src/lib/billing/prepaidRentRefundCeiling';
import {
  assertCombinedRefundRequestAmountPaise,
  getResidentRefundableNowForBooking,
} from '@/src/lib/billing/residentRefundableNow';
import { validatePayoutQrRefundSubmission } from '@/src/lib/billing/prepaidRentRefundRequirements';
import {
  prepaidRentRefundPayoutDebitReason,
  recordResidentCreditDebit,
} from '@/src/services/residentCreditLedger';
import {
  assertDepositRefundRequestAmountPaise,
  getDepositRefundCeilingForBooking,
  isMidStayDepositExcessRefundRequest,
} from '@/src/lib/deposits/depositRefundCeiling';

export type { RefundCompletionInput } from '@/src/lib/refundDeductions';
export { computeRefundDeductions } from '@/src/lib/refundDeductions';

async function bookingContext(bookingId: string) {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      customerId: bookings.customerId,
      pgId: pgs.id,
      pgName: pgs.name,
      roomNumber: rooms.roomNumber,
      bedId: beds.id,
      roomId: rooms.id,
      customerName: customers.fullName,
      customerPhone: customers.phone,
    })
    .from(bookings)
    .innerJoin(customers, eq(customers.id, bookings.customerId))
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(
        eq(bookings.id, bookingId),
        eq(bedReservations.kind, 'primary'),
        inArray(bedReservations.status, ['active', 'hold']),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function submitDepositRefundRequest(input: {
  customerId: string;
  bookingId: string;
  notes?: string;
  meterReadingPhotoUrl?: string | null;
  useAverageBillingFallback?: boolean;
  payoutUpiId?: string | null;
  payoutQrUrl?: string | null;
  /** Paise requested — must not exceed server-computed available ceiling. */
  requestedAmountPaise?: number;
}) {
  const ctx = await bookingContext(input.bookingId);
  if (!ctx || ctx.customerId !== input.customerId) {
    return { ok: false as const, error: 'Booking not found.' };
  }

  const summary = await getDepositSummaryForBooking(input.bookingId);
  if (!summary || summary.collectedPaise <= 0) {
    return { ok: false as const, error: 'No refundable deposit balance on this booking.' };
  }

  const ceiling = await getDepositRefundCeilingForBooking(input.bookingId);
  if (!ceiling || ceiling.availableToRequestPaise <= 0) {
    return {
      ok: false as const,
      error: 'No refundable deposit excess is available on this booking.',
    };
  }

  const requestedAmountPaise =
    input.requestedAmountPaise != null && input.requestedAmountPaise > 0
      ? input.requestedAmountPaise
      : ceiling.availableToRequestPaise;
  const amountCheck = assertDepositRefundRequestAmountPaise(requestedAmountPaise, ceiling);
  if (!amountCheck.ok) {
    return { ok: false as const, error: amountCheck.error };
  }

  const [bookingRow] = await db
    .select({
      status: bookings.status,
      durationMode: bookings.durationMode,
      expectedCheckoutDate: bookings.expectedCheckoutDate,
      createdAt: bookings.createdAt,
      depositPaise: bookings.depositPaise,
      pricingSnapshot: bookings.pricingSnapshot,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);

  const vacatingRes = await getVacatingForBooking(input.bookingId);
  const monthlyRentPaise =
    bookingRow?.pricingSnapshot &&
    typeof bookingRow.pricingSnapshot === 'object' &&
    'perBed' in bookingRow.pricingSnapshot
      ? (bookingRow.pricingSnapshot.perBed as Array<{ monthlyRatePaise?: number }>).reduce(
          (sum, bed) => sum + (bed.monthlyRatePaise ?? 0),
          0,
        )
      : undefined;

  const refundEligibility = getDepositRefundEligibility({
    vacating: vacatingRes.ok ? vacatingRes.data : null,
    booking: bookingRow
      ? {
          status: bookingRow.status,
          durationMode: bookingRow.durationMode,
          expectedCheckoutDate: bookingRow.expectedCheckoutDate,
          createdAt: bookingRow.createdAt,
        }
      : null,
    monthlyRentPaise,
  });
  if (!refundEligibility.canRequestRefund) {
    const midStayExcessOnly =
      requestedAmountPaise > 0 &&
      requestedAmountPaise <= ceiling.availableToRequestPaise &&
      ceiling.refundableDepositPaise > 0;
    if (!midStayExcessOnly) {
      return {
        ok: false as const,
        error: refundEligibility.lockReason ?? 'Deposit refund is not available yet.',
      };
    }
  }

  const midStayExcessOnly =
    !refundEligibility.canRequestRefund &&
    requestedAmountPaise <= ceiling.availableToRequestPaise;

  if (midStayExcessOnly) {
    const { validatePayoutQrRefundSubmission } = await import(
      '@/src/lib/billing/prepaidRentRefundRequirements'
    );
    const payout = validatePayoutQrRefundSubmission({ payoutQrUrl: input.payoutQrUrl });
    if (!payout.ok) return { ok: false as const, error: payout.error };
  } else {
    const submission = validateDepositRefundSubmission({
      meterReadingPhotoUrl: input.meterReadingPhotoUrl,
      payoutUpiId: input.payoutUpiId,
      payoutQrUrl: input.payoutQrUrl,
    });
    if (!submission.ok) {
      return { ok: false as const, error: submission.error };
    }
  }

  try {
    const [row] = await db
      .insert(residentRequests)
      .values({
        customerId: input.customerId,
        bookingId: input.bookingId,
        pgId: ctx.pgId,
        type: 'deposit_refund',
        status: 'submitted',
        amountPaise: requestedAmountPaise,
        notes: input.notes ?? null,
        meterReadingPhotoUrl: input.meterReadingPhotoUrl?.trim() || null,
        useAverageBillingFallback: Boolean(input.useAverageBillingFallback),
        payoutUpiId: input.payoutUpiId?.trim() || null,
        payoutQrUrl: input.payoutQrUrl?.trim() || null,
      })
      .returning();

    await db.insert(auditLog).values({
      actorType: 'customer',
      actorId: input.customerId,
      entity: 'resident_request',
      entityId: row.id,
      action: 'deposit_refund_submitted',
      diff: { bookingId: input.bookingId, amountPaise: requestedAmountPaise },
    });

    const { linkResidentUpload } = await import('@/src/services/residentUploadEvents');
    if (input.meterReadingPhotoUrl?.trim()) {
      await linkResidentUpload({
        storagePath: input.meterReadingPhotoUrl.trim(),
        adminQueue: 'requests',
        linkedEntity: 'resident_request',
        linkedEntityId: row.id,
        bookingId: input.bookingId,
        pgId: ctx.pgId,
      }).catch(() => undefined);
    }
    if (input.payoutQrUrl?.trim()) {
      await linkResidentUpload({
        storagePath: input.payoutQrUrl.trim(),
        adminQueue: 'requests',
        linkedEntity: 'resident_request',
        linkedEntityId: row.id,
        bookingId: input.bookingId,
        pgId: ctx.pgId,
      }).catch(() => undefined);
    }

    await syncResidentRequestActionItems();
    await refreshAdminNotificationsFromActionItems();

    return { ok: true as const, request: row };
  } catch {
    return { ok: false as const, error: 'A refund request is already open for this booking.' };
  }
}

async function linkRefundRequestUploads(input: {
  customerId: string;
  bookingId: string;
  pgId: string;
  requestId: string;
  payoutQrUrl?: string | null;
  meterReadingPhotoUrl?: string | null;
}) {
  const { linkResidentUpload } = await import('@/src/services/residentUploadEvents');
  if (input.meterReadingPhotoUrl?.trim()) {
    await linkResidentUpload({
      storagePath: input.meterReadingPhotoUrl.trim(),
      adminQueue: 'requests',
      linkedEntity: 'resident_request',
      linkedEntityId: input.requestId,
      bookingId: input.bookingId,
      pgId: input.pgId,
    }).catch(() => undefined);
  }
  if (input.payoutQrUrl?.trim()) {
    await linkResidentUpload({
      storagePath: input.payoutQrUrl.trim(),
      adminQueue: 'requests',
      linkedEntity: 'resident_request',
      linkedEntityId: input.requestId,
      bookingId: input.bookingId,
      pgId: input.pgId,
    }).catch(() => undefined);
  }
}

export async function submitPrepaidRentRefundRequest(input: {
  customerId: string;
  bookingId: string;
  notes?: string;
  payoutQrUrl?: string | null;
  requestedAmountPaise?: number;
}) {
  const ctx = await bookingContext(input.bookingId);
  if (!ctx || ctx.customerId !== input.customerId) {
    return { ok: false as const, error: 'Booking not found.' };
  }

  const payout = validatePayoutQrRefundSubmission({ payoutQrUrl: input.payoutQrUrl });
  if (!payout.ok) return { ok: false as const, error: payout.error };

  const ceiling = await getPrepaidRentRefundCeilingForBooking({
    customerId: input.customerId,
    bookingId: input.bookingId,
  });
  if (ceiling.availableToRequestPaise <= 0) {
    return {
      ok: false as const,
      error: 'No unused prepaid rent is available to refund right now.',
    };
  }

  const requestedAmountPaise =
    input.requestedAmountPaise != null && input.requestedAmountPaise > 0
      ? input.requestedAmountPaise
      : ceiling.availableToRequestPaise;
  const amountCheck = assertPrepaidRentRefundRequestAmountPaise(requestedAmountPaise, ceiling);
  if (!amountCheck.ok) {
    return { ok: false as const, error: amountCheck.error };
  }

  try {
    const [row] = await db
      .insert(residentRequests)
      .values({
        customerId: input.customerId,
        bookingId: input.bookingId,
        pgId: ctx.pgId,
        type: 'prepaid_rent_refund',
        status: 'submitted',
        amountPaise: requestedAmountPaise,
        notes: input.notes ?? null,
        payoutQrUrl: input.payoutQrUrl?.trim() || null,
      })
      .returning();

    await db.insert(auditLog).values({
      actorType: 'customer',
      actorId: input.customerId,
      entity: 'resident_request',
      entityId: row.id,
      action: 'prepaid_rent_refund_submitted',
      diff: { bookingId: input.bookingId, amountPaise: requestedAmountPaise },
    });

    await linkRefundRequestUploads({
      customerId: input.customerId,
      bookingId: input.bookingId,
      pgId: ctx.pgId,
      requestId: row.id,
      payoutQrUrl: input.payoutQrUrl,
    });

    await syncResidentRequestActionItems();
    await refreshAdminNotificationsFromActionItems();

    return { ok: true as const, request: row };
  } catch {
    return {
      ok: false as const,
      error: 'A prepaid rent refund request is already open for this booking.',
    };
  }
}

/**
 * Single resident UX — server splits into prepaid_rent_refund + deposit_refund rows.
 * Allocation: unused prepaid rent first, then deposit excess (see residentRefundableNow).
 */
export async function submitResidentRefundNowRequest(input: {
  customerId: string;
  bookingId: string;
  notes?: string;
  payoutQrUrl?: string | null;
  meterReadingPhotoUrl?: string | null;
  requestedTotalPaise: number;
}) {
  const ctx = await bookingContext(input.bookingId);
  if (!ctx || ctx.customerId !== input.customerId) {
    return { ok: false as const, error: 'Booking not found.' };
  }

  const refundable = await getResidentRefundableNowForBooking({
    customerId: input.customerId,
    bookingId: input.bookingId,
  });
  if (!refundable || refundable.totalRefundableNowPaise <= 0) {
    return { ok: false as const, error: 'No refundable balance is available right now.' };
  }

  const combined = assertCombinedRefundRequestAmountPaise(
    input.requestedTotalPaise,
    refundable,
  );
  if (!combined.ok) {
    return { ok: false as const, error: combined.error };
  }

  const { prepaidRentPaise, depositPaise } = combined.allocation;
  if (prepaidRentPaise <= 0 && depositPaise <= 0) {
    return { ok: false as const, error: 'Refund amount must be greater than zero.' };
  }

  const payout = validatePayoutQrRefundSubmission({ payoutQrUrl: input.payoutQrUrl });
  if (!payout.ok) return { ok: false as const, error: payout.error };

  if (depositPaise > 0 && prepaidRentPaise <= 0) {
    return submitDepositRefundRequest({
      customerId: input.customerId,
      bookingId: input.bookingId,
      notes: input.notes,
      payoutQrUrl: input.payoutQrUrl,
      meterReadingPhotoUrl: input.meterReadingPhotoUrl,
      requestedAmountPaise: depositPaise,
    });
  }

  if (prepaidRentPaise > 0 && depositPaise <= 0) {
    return submitPrepaidRentRefundRequest({
      customerId: input.customerId,
      bookingId: input.bookingId,
      notes: input.notes,
      payoutQrUrl: input.payoutQrUrl,
      requestedAmountPaise: prepaidRentPaise,
    });
  }

  try {
    const requests = await db.transaction(async (tx) => {
      const created: Array<typeof residentRequests.$inferSelect> = [];
      const [prepaidRow] = await tx
        .insert(residentRequests)
        .values({
          customerId: input.customerId,
          bookingId: input.bookingId,
          pgId: ctx.pgId,
          type: 'prepaid_rent_refund',
          status: 'submitted',
          amountPaise: prepaidRentPaise,
          notes: input.notes ?? null,
          payoutQrUrl: input.payoutQrUrl?.trim() || null,
        })
        .returning();
      created.push(prepaidRow);

      const [depositRow] = await tx
        .insert(residentRequests)
        .values({
          customerId: input.customerId,
          bookingId: input.bookingId,
          pgId: ctx.pgId,
          type: 'deposit_refund',
          status: 'submitted',
          amountPaise: depositPaise,
          notes: input.notes ?? null,
          meterReadingPhotoUrl: input.meterReadingPhotoUrl?.trim() || null,
          payoutQrUrl: input.payoutQrUrl?.trim() || null,
        })
        .returning();
      created.push(depositRow);

      return created;
    });

    for (const row of requests) {
      await db.insert(auditLog).values({
        actorType: 'customer',
        actorId: input.customerId,
        entity: 'resident_request',
        entityId: row.id,
        action:
          row.type === 'prepaid_rent_refund'
            ? 'prepaid_rent_refund_submitted'
            : 'deposit_refund_submitted',
        diff: {
          bookingId: input.bookingId,
          amountPaise: row.amountPaise,
          bundle: true,
          prepaidRentPaise,
          depositPaise,
        },
      });
      await linkRefundRequestUploads({
        customerId: input.customerId,
        bookingId: input.bookingId,
        pgId: ctx.pgId,
        requestId: row.id,
        payoutQrUrl: input.payoutQrUrl,
        meterReadingPhotoUrl: input.meterReadingPhotoUrl,
      });
    }

    await syncResidentRequestActionItems();
    await refreshAdminNotificationsFromActionItems();

    return { ok: true as const, requests };
  } catch {
    return {
      ok: false as const,
      error: 'Could not submit refund — an open request may already exist for this booking.',
    };
  }
}

export { getResidentRefundableNowForBooking } from '@/src/lib/billing/residentRefundableNow';

export async function submitDepositDueExtensionRequest(input: {
  customerId: string;
  bookingId: string;
  requestedDueDate: string;
  notes?: string;
}) {
  const ctx = await bookingContext(input.bookingId);
  if (!ctx || ctx.customerId !== input.customerId) {
    return { ok: false as const, error: 'Booking not found.' };
  }

  const [booking] = await db
    .select({
      depositDuePaise: bookings.depositDuePaise,
      depositCollectionStatus: bookings.depositCollectionStatus,
    })
    .from(bookings)
    .where(eq(bookings.id, input.bookingId))
    .limit(1);
  if (
    !booking ||
    !['partial', 'overdue'].includes(booking.depositCollectionStatus) ||
    (booking.depositDuePaise ?? 0) <= 0
  ) {
    return { ok: false as const, error: 'No outstanding deposit due on this booking.' };
  }

  const dueDate = formatDate(parseDate(input.requestedDueDate));
  const today = formatDate(new Date());
  if (dueDate <= today) {
    return { ok: false as const, error: 'New due date must be in the future.' };
  }

  try {
    const [row] = await db
      .insert(residentRequests)
      .values({
        customerId: input.customerId,
        bookingId: input.bookingId,
        pgId: ctx.pgId,
        type: 'deposit_due_extension',
        status: 'submitted',
        requestedEndDate: dueDate,
        amountPaise: booking.depositDuePaise,
        notes: input.notes ?? null,
      })
      .returning();

    await db.insert(auditLog).values({
      actorType: 'customer',
      actorId: input.customerId,
      entity: 'resident_request',
      entityId: row.id,
      action: 'deposit_due_extension_submitted',
      diff: { bookingId: input.bookingId, requestedDueDate: dueDate },
    });

    await syncResidentRequestActionItems();
    await refreshAdminNotificationsFromActionItems();

    return { ok: true as const, request: row };
  } catch {
    return {
      ok: false as const,
      error: 'A deposit extension request is already open for this booking.',
    };
  }
}

export async function submitStayExtensionRequest(_input: {
  customerId: string;
  bookingId: string;
  requestedEndDate: string;
  notes?: string;
}) {
  return {
    ok: false as const,
    error:
      'Stay extensions are no longer supported. To continue living here, ask admin to cancel your vacating notice.',
  };
}

export async function listOpenRequestsForCustomer(customerId: string) {
  return db
    .select()
    .from(residentRequests)
    .where(
      and(
        eq(residentRequests.customerId, customerId),
        inArray(residentRequests.status, ['submitted', 'under_review', 'approved']),
      ),
    )
    .orderBy(residentRequests.createdAt);
}

export async function adminReviewResidentRequest(input: {
  requestId: string;
  adminId: string;
  action: 'under_review' | 'approve' | 'reject' | 'complete';
  adminNotes?: string;
  refundCompletion?: RefundCompletionInput;
}) {
  const [current] = await db
    .select()
    .from(residentRequests)
    .where(eq(residentRequests.id, input.requestId))
    .limit(1);
  if (!current) return { ok: false as const, error: 'Request not found.' };

  if (input.action === 'under_review') {
    const [updated] = await db
      .update(residentRequests)
      .set({ status: 'under_review', adminNotes: input.adminNotes ?? current.adminNotes, updatedAt: new Date() })
      .where(eq(residentRequests.id, input.requestId))
      .returning();
    void writeAuditLogNonBlocking(db, {
      actorType: 'admin',
      actorId: input.adminId,
      entity: 'resident_request',
      entityId: input.requestId,
      action: 'under_review',
      diff: { type: current.type, adminNotes: input.adminNotes ?? null },
    });
    await syncResidentRequestActionItems();
    return { ok: true as const, request: updated };
  }

  if (input.action === 'reject') {
    const [updated] = await db
      .update(residentRequests)
      .set({
        status: 'rejected',
        adminNotes: input.adminNotes ?? null,
        resolvedByAdminId: input.adminId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(residentRequests.id, input.requestId))
      .returning();
    void writeAuditLogNonBlocking(db, {
      actorType: 'admin',
      actorId: input.adminId,
      entity: 'resident_request',
      entityId: input.requestId,
      action: 'reject',
      diff: { type: current.type, adminNotes: input.adminNotes ?? null },
    });
    await syncResidentRequestActionItems();
    return { ok: true as const, request: updated };
  }

  if (input.action === 'approve') {
    if (current.type === 'stay_extension') {
      return {
        ok: false as const,
        error:
          'Stay extensions are disabled. Cancel the resident vacating notice instead so tenancy continues.',
      };
    }

    if (current.type === 'deposit_refund') {
      const depositCeiling = await getDepositRefundCeilingForBooking(current.bookingId);
      const requestPaise = current.amountPaise ?? 0;
      const midStayExcessOnly =
        depositCeiling != null &&
        isMidStayDepositExcessRefundRequest(
          requestPaise,
          depositCeiling,
          Boolean(current.meterReadingPhotoUrl?.trim()),
        );

      if (midStayExcessOnly) {
        const payout = validatePayoutQrRefundSubmission({ payoutQrUrl: current.payoutQrUrl });
        if (!payout.ok) {
          return { ok: false as const, error: payout.error };
        }
      } else {
        const submission = validateDepositRefundSubmission(current);
        if (!submission.ok) {
          return { ok: false as const, error: DEPOSIT_REFUND_MISSING_DETAILS_MESSAGE };
        }
      }
    }

    if (current.type === 'prepaid_rent_refund') {
      const payout = validatePayoutQrRefundSubmission({ payoutQrUrl: current.payoutQrUrl });
      if (!payout.ok) {
        return { ok: false as const, error: payout.error };
      }
    }

    if (current.type === 'deposit_due_extension' && current.requestedEndDate) {
      const { extendDepositDueDate } = await import('./depositCollection');
      const ext = await extendDepositDueDate({
        bookingId: current.bookingId,
        newDueDate: current.requestedEndDate,
        adminId: input.adminId,
        fromResidentRequest: true,
      });
      if (!ext.ok) {
        return { ok: false as const, error: ext.error };
      }
    }

    const [updated] = await db
      .update(residentRequests)
      .set({
        status: 'approved',
        adminNotes: input.adminNotes ?? current.adminNotes,
        updatedAt: new Date(),
      })
      .where(eq(residentRequests.id, input.requestId))
      .returning();

    void writeAuditLogNonBlocking(db, {
      actorType: 'admin',
      actorId: input.adminId,
      entity: 'resident_request',
      entityId: input.requestId,
      action: 'approve',
      diff: { type: current.type, adminNotes: input.adminNotes ?? null },
    });
    await syncResidentRequestActionItems();
    return { ok: true as const, request: updated };
  }

  if (input.action === 'complete') {
    if (current.type === 'prepaid_rent_refund') {
      const payout = validatePayoutQrRefundSubmission({ payoutQrUrl: current.payoutQrUrl });
      if (!payout.ok) {
        return { ok: false as const, error: payout.error };
      }

      const ceiling = await getPrepaidRentRefundCeilingForBooking({
        customerId: current.customerId,
        bookingId: current.bookingId,
      });
      const payoutPaise = current.amountPaise ?? 0;
      const adjustedCeiling = computePrepaidRentRefundCeiling({
        netUnusedPrepaidRentPaise: ceiling.netUnusedPrepaidRentPaise,
        pendingRefundPaise: Math.max(0, ceiling.pendingRefundPaise - payoutPaise),
      });
      const amountCheck = assertPrepaidRentRefundRequestAmountPaise(payoutPaise, adjustedCeiling);
      if (!amountCheck.ok) {
        return { ok: false as const, error: amountCheck.error };
      }

      await recordResidentCreditDebit({
        customerId: current.customerId,
        bookingId: current.bookingId,
        amountPaise: payoutPaise,
        reason: prepaidRentRefundPayoutDebitReason(input.requestId),
        createdByAdminId: input.adminId,
      });

      const [updated] = await db
        .update(residentRequests)
        .set({
          status: 'completed',
          adminNotes: input.adminNotes ?? current.adminNotes,
          finalRefundPaise: payoutPaise,
          refundMethod: input.refundCompletion?.refundMethod ?? null,
          refundPaidAt: new Date(),
          resolvedByAdminId: input.adminId,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(residentRequests.id, input.requestId))
        .returning();

      void writeAuditLogNonBlocking(db, {
        actorType: 'admin',
        actorId: input.adminId,
        entity: 'resident_request',
        entityId: input.requestId,
        action: 'complete',
        diff: { type: current.type, finalRefundPaise: payoutPaise },
      });
      await syncResidentRequestActionItems();
      return { ok: true as const, request: updated };
    }

    if (current.type === 'deposit_refund') {
      const requestPaise = current.amountPaise ?? 0;
      const depositCeiling = await getDepositRefundCeilingForBooking(current.bookingId);
      const midStayExcessOnly =
        depositCeiling != null &&
        requestPaise > 0 &&
        requestPaise <= depositCeiling.refundableDepositPaise &&
        !current.meterReadingPhotoUrl?.trim();

      if (midStayExcessOnly) {
        const payout = validatePayoutQrRefundSubmission({ payoutQrUrl: current.payoutQrUrl });
        if (!payout.ok) {
          return { ok: false as const, error: payout.error };
        }
      } else {
        const submission = validateDepositRefundSubmission(current);
        if (!submission.ok) {
          return { ok: false as const, error: DEPOSIT_REFUND_MISSING_DETAILS_MESSAGE };
        }
      }

      const legacyGuard = await import('@/src/lib/deposits/depositRefundGuard').then((m) =>
        m.assertLegacyDepositRefundAllowed(current.bookingId),
      );
      if (!legacyGuard.ok) {
        return { ok: false as const, error: legacyGuard.error };
      }

      const midStayPartial =
        depositCeiling != null &&
        requestPaise > 0 &&
        requestPaise <= depositCeiling.refundableDepositPaise;

      let settlement:
        | Awaited<ReturnType<typeof settleDepositWithDeductions>>
        | Awaited<ReturnType<typeof settleDepositRefund>>;

      if (midStayPartial) {
        settlement = await settleDepositRefund({
          bookingId: current.bookingId,
          customerId: current.customerId,
          idempotencyKey: `resident_request:${input.requestId}`,
          source: 'resident_request',
          sourceId: input.requestId,
          adminId: input.adminId,
          refundPaise: requestPaise,
          reason: `Deposit excess refund — resident request ${input.requestId}`,
          markBookingRefunded: false,
          refundAudit: {
            refundMethod: input.refundCompletion?.refundMethod ?? null,
          },
        });
      } else {
        settlement = await settleDepositWithDeductions({
          bookingId: current.bookingId,
          customerId: current.customerId,
          idempotencyKey: `resident_request:${input.requestId}`,
          source: 'resident_request',
          sourceId: input.requestId,
          adminId: input.adminId,
          refundCompletion: input.refundCompletion,
          refundAudit: {
            refundMethod: input.refundCompletion?.refundMethod ?? null,
          },
          markBookingRefunded: true,
        });
      }
      if (!settlement.ok) {
        return { ok: false as const, error: settlement.error };
      }

      const summary = await getDepositSummaryForBooking(current.bookingId);
      const refundDeductions = summary
        ? computeRefundDeductions(summary.refundableBalancePaise, input.refundCompletion ?? {})
        : null;

      const [updated] = await db
        .update(residentRequests)
        .set({
          status: 'completed',
          adminNotes: input.adminNotes ?? current.adminNotes,
          refundDeductions,
          finalRefundPaise: settlement.refundPaise,
          refundMethod: input.refundCompletion?.refundMethod ?? null,
          refundPaidAt: new Date(),
          resolvedByAdminId: input.adminId,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(residentRequests.id, input.requestId))
        .returning();

      void writeAuditLogNonBlocking(db, {
        actorType: 'admin',
        actorId: input.adminId,
        entity: 'resident_request',
        entityId: input.requestId,
        action: 'complete',
        diff: { type: current.type, finalRefundPaise: settlement.refundPaise },
      });
      await syncResidentRequestActionItems();
      return { ok: true as const, request: updated };
    }

    const [updated] = await db
      .update(residentRequests)
      .set({
        status: 'completed',
        adminNotes: input.adminNotes ?? current.adminNotes,
        resolvedByAdminId: input.adminId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(residentRequests.id, input.requestId))
      .returning();

    void writeAuditLogNonBlocking(db, {
      actorType: 'admin',
      actorId: input.adminId,
      entity: 'resident_request',
      entityId: input.requestId,
      action: 'complete',
      diff: { type: current.type },
    });
    await syncResidentRequestActionItems();
    return { ok: true as const, request: updated };
  }

  return { ok: false as const, error: 'Invalid action.' };
}

export async function getOpenDepositRefundRequestForBooking(bookingId: string) {
  const [row] = await db
    .select()
    .from(residentRequests)
    .where(
      and(
        eq(residentRequests.bookingId, bookingId),
        eq(residentRequests.type, 'deposit_refund'),
        inArray(residentRequests.status, ['submitted', 'under_review', 'approved']),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listPendingResidentRequestsForAdmin(_session: AdminSession) {
  return db
    .select({
      id: residentRequests.id,
      type: residentRequests.type,
      status: residentRequests.status,
      amountPaise: residentRequests.amountPaise,
      requestedEndDate: residentRequests.requestedEndDate,
      createdAt: residentRequests.createdAt,
      customerName: customers.fullName,
      customerPhone: customers.phone,
      customerId: residentRequests.customerId,
      bookingId: residentRequests.bookingId,
      bookingCode: bookings.bookingCode,
      pgName: pgs.name,
      meterReadingPhotoUrl: residentRequests.meterReadingPhotoUrl,
      useAverageBillingFallback: residentRequests.useAverageBillingFallback,
      payoutUpiId: residentRequests.payoutUpiId,
      payoutQrUrl: residentRequests.payoutQrUrl,
      notes: residentRequests.notes,
    })
    .from(residentRequests)
    .innerJoin(customers, eq(customers.id, residentRequests.customerId))
    .innerJoin(bookings, eq(bookings.id, residentRequests.bookingId))
    .innerJoin(pgs, eq(pgs.id, residentRequests.pgId))
    .where(inArray(residentRequests.status, ['submitted', 'under_review', 'approved']))
    .orderBy(residentRequests.createdAt);
}

export async function resolveAdminResidentRequestImageUrl(
  session: AdminSession,
  requestId: string,
  kind: 'meter' | 'refund_qr',
): Promise<string | null> {
  const [row] = await db
    .select({
      pgId: residentRequests.pgId,
      meterReadingPhotoUrl: residentRequests.meterReadingPhotoUrl,
      payoutQrUrl: residentRequests.payoutQrUrl,
    })
    .from(residentRequests)
    .where(eq(residentRequests.id, requestId))
    .limit(1);
  if (!row) return null;
  if (!adminCanAccessPg({ role: session.role, pgScope: session.pgScope }, row.pgId)) {
    return null;
  }
  const url = kind === 'meter' ? row.meterReadingPhotoUrl : row.payoutQrUrl;
  return url?.trim() || null;
}

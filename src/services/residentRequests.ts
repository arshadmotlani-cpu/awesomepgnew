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
import { formatDate, parseDate } from '@/src/lib/dates';
import { getDepositSummaryForBooking, recordDepositDeducted, recordDepositRefunded } from '@/src/services/deposits';
import { syncResidentRequestActionItems } from '@/src/services/residentRequestActions';
import {
  computeRefundDeductions,
  type RefundCompletionInput,
} from '@/src/lib/refundDeductions';

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
}) {
  const ctx = await bookingContext(input.bookingId);
  if (!ctx || ctx.customerId !== input.customerId) {
    return { ok: false as const, error: 'Booking not found.' };
  }

  const summary = await getDepositSummaryForBooking(input.bookingId);
  if (!summary || summary.refundableBalancePaise <= 0) {
    return { ok: false as const, error: 'No refundable deposit balance on this booking.' };
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
        amountPaise: summary.refundableBalancePaise,
        notes: input.notes ?? null,
      })
      .returning();

    await db.insert(auditLog).values({
      actorType: 'customer',
      actorId: input.customerId,
      entity: 'resident_request',
      entityId: row.id,
      action: 'deposit_refund_submitted',
      diff: { bookingId: input.bookingId, amountPaise: summary.refundableBalancePaise },
    });

    await syncResidentRequestActionItems();

    return { ok: true as const, request: row };
  } catch {
    return { ok: false as const, error: 'A refund request is already open for this booking.' };
  }
}

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

    await syncResidentRequestActionItems();
    return { ok: true as const, request: updated };
  }

  if (input.action === 'complete') {
    if (current.type === 'deposit_refund') {
      const summary = await getDepositSummaryForBooking(current.bookingId);
      if (!summary || summary.refundableBalancePaise <= 0) {
        return { ok: false as const, error: 'No refundable deposit balance.' };
      }

      const calc = computeRefundDeductions(
        summary.refundableBalancePaise,
        input.refundCompletion ?? {},
      );

      if (calc.electricityDeductionPaise && calc.electricityDeductionPaise > 0) {
        await recordDepositDeducted({
          bookingId: current.bookingId,
          customerId: current.customerId,
          amountPaise: calc.electricityDeductionPaise,
          reason: `Electricity: ${input.refundCompletion?.electricityUnits ?? 0} units @ ₹${((input.refundCompletion?.electricityUnitCostPaise ?? 0) / 100).toFixed(2)}/unit`,
          createdByAdminId: input.adminId,
        });
      }

      const otherDeductions =
        (calc.damageChargePaise ?? 0) +
        (calc.cleaningChargePaise ?? 0) +
        (calc.penaltyChargePaise ?? 0) +
        (calc.customChargePaise ?? 0);
      if (otherDeductions > 0) {
        const parts: string[] = [];
        if (calc.damageChargePaise) parts.push(`Damage ₹${calc.damageChargePaise / 100}`);
        if (calc.cleaningChargePaise) parts.push(`Cleaning ₹${calc.cleaningChargePaise / 100}`);
        if (calc.penaltyChargePaise) parts.push(`Penalty ₹${calc.penaltyChargePaise / 100}`);
        if (calc.customChargePaise) {
          parts.push(`${calc.customChargeLabel ?? 'Custom'} ₹${calc.customChargePaise / 100}`);
        }
        await recordDepositDeducted({
          bookingId: current.bookingId,
          customerId: current.customerId,
          amountPaise: otherDeductions,
          reason: `Refund deductions: ${parts.join(', ')}`,
          createdByAdminId: input.adminId,
        });
      }

      if (calc.finalRefundPaise > 0) {
        await recordDepositRefunded({
          bookingId: current.bookingId,
          customerId: current.customerId,
          amountPaise: calc.finalRefundPaise,
          reason: 'Resident deposit refund request completed',
          createdByAdminId: input.adminId,
        });
      }

      await db
        .update(bookings)
        .set({ adminDepositRefundStatus: 'refunded', updatedAt: new Date() })
        .where(eq(bookings.id, current.bookingId));

      const [updated] = await db
        .update(residentRequests)
        .set({
          status: 'completed',
          adminNotes: input.adminNotes ?? current.adminNotes,
          refundDeductions: calc,
          finalRefundPaise: calc.finalRefundPaise,
          refundMethod: input.refundCompletion?.refundMethod ?? null,
          refundPaidAt: new Date(),
          resolvedByAdminId: input.adminId,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(residentRequests.id, input.requestId))
        .returning();

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

    await syncResidentRequestActionItems();
    return { ok: true as const, request: updated };
  }

  return { ok: false as const, error: 'Invalid action.' };
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
      pgName: pgs.name,
    })
    .from(residentRequests)
    .innerJoin(customers, eq(customers.id, residentRequests.customerId))
    .innerJoin(pgs, eq(pgs.id, residentRequests.pgId))
    .where(inArray(residentRequests.status, ['submitted', 'under_review', 'approved']))
    .orderBy(residentRequests.createdAt);
}

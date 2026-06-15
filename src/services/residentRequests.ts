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
import { getDepositSummaryForBooking, recordDepositRefunded } from '@/src/services/deposits';
import { extendVacatingDate } from '@/src/services/vacating';
import { syncResidentRequestActionItems } from '@/src/services/residentRequestActions';

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

export async function submitStayExtensionRequest(input: {
  customerId: string;
  bookingId: string;
  requestedEndDate: string;
  notes?: string;
}) {
  const ctx = await bookingContext(input.bookingId);
  if (!ctx || ctx.customerId !== input.customerId) {
    return { ok: false as const, error: 'Booking not found.' };
  }

  const endDate = formatDate(parseDate(input.requestedEndDate));
  const today = formatDate(new Date());
  if (endDate <= today) {
    return { ok: false as const, error: 'Extension date must be in the future.' };
  }

  try {
    const [row] = await db
      .insert(residentRequests)
      .values({
        customerId: input.customerId,
        bookingId: input.bookingId,
        pgId: ctx.pgId,
        type: 'stay_extension',
        status: 'submitted',
        requestedEndDate: endDate,
        notes: input.notes ?? null,
      })
      .returning();

    await db.insert(auditLog).values({
      actorType: 'customer',
      actorId: input.customerId,
      entity: 'resident_request',
      entityId: row.id,
      action: 'extension_submitted',
      diff: { bookingId: input.bookingId, requestedEndDate: endDate },
    });

    await syncResidentRequestActionItems();

    return { ok: true as const, request: row };
  } catch {
    return { ok: false as const, error: 'An extension request is already open for this booking.' };
  }
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
    if (current.type === 'stay_extension' && current.requestedEndDate) {
      const ext = await extendVacatingDate({
        bookingId: current.bookingId,
        newVacatingDate: current.requestedEndDate,
        resolvedByAdminId: input.adminId,
        fromExtensionRequest: true,
      });
      if (!ext.ok) {
        return { ok: false as const, error: ext.message ?? 'Could not extend stay.' };
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
    if (current.type === 'deposit_refund' && current.amountPaise && current.amountPaise > 0) {
      await recordDepositRefunded({
        bookingId: current.bookingId,
        customerId: current.customerId,
        amountPaise: current.amountPaise,
        reason: 'Resident deposit refund request completed',
        createdByAdminId: input.adminId,
      });
      await db
        .update(bookings)
        .set({ adminDepositRefundStatus: 'refunded', updatedAt: new Date() })
        .where(eq(bookings.id, current.bookingId));
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

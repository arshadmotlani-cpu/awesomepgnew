/**
 * Legacy resident-request electricity preview for refund approval.
 *
 * MUST NOT create mid-cycle room electricity bills or advance the room meter
 * baseline. Move-out electricity belongs on checkout_settlements only.
 * Month-end bills are the sole writers of continuous previous reading.
 */

import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/src/db/client';
import {
  bedReservations,
  beds,
  bookings,
  electricityBills,
  electricityInvoices,
  floors,
  pgs,
  rooms,
} from '@/src/db/schema';
import type { AdminSession } from '@/src/lib/auth/session';
import { assertAdminCanAccessPg } from '@/src/lib/auth/pgAccess';

export type RefundElectricityPreview =
  | {
      ok: true;
      billingMonth: string;
      units: number;
      ratePerUnitPaise: number;
      amountPaise: number;
      invoiceId: string;
      invoiceNumber: string;
      usedAverage: boolean;
      message: string;
    }
  | { ok: false; error: string };

async function bookingRoomContext(bookingId: string) {
  const [row] = await db
    .select({
      bookingId: bookings.id,
      pgId: pgs.id,
      roomId: beds.roomId,
    })
    .from(bookings)
    .innerJoin(bedReservations, eq(bedReservations.bookingId, bookings.id))
    .innerJoin(beds, eq(beds.id, bedReservations.bedId))
    .innerJoin(rooms, eq(rooms.id, beds.roomId))
    .innerJoin(floors, eq(floors.id, rooms.floorId))
    .innerJoin(pgs, eq(pgs.id, floors.pgId))
    .where(
      and(eq(bookings.id, bookingId), eq(bedReservations.kind, 'primary')),
    )
    .limit(1);
  return row ?? null;
}

async function pendingInvoiceForBooking(bookingId: string) {
  const [row] = await db
    .select({
      invoiceId: electricityInvoices.id,
      invoiceNumber: electricityInvoices.invoiceNumber,
      amountPaise: electricityInvoices.amountPaise,
      unitsShare: electricityInvoices.unitsShare,
      billingMonth: electricityInvoices.billingMonth,
      ratePerUnitPaise: electricityBills.ratePerUnitPaise,
    })
    .from(electricityInvoices)
    .innerJoin(electricityBills, eq(electricityBills.id, electricityInvoices.electricityBillId))
    .where(
      and(
        eq(electricityInvoices.bookingId, bookingId),
        eq(electricityInvoices.status, 'pending'),
      ),
    )
    .orderBy(desc(electricityInvoices.billingMonth))
    .limit(1);
  return row ?? null;
}

function toPreview(
  row: {
    invoiceId: string;
    invoiceNumber: string;
    amountPaise: number;
    unitsShare: string | null;
    billingMonth: string;
    ratePerUnitPaise: number;
  },
  usedAverage: boolean,
  message: string,
): Extract<RefundElectricityPreview, { ok: true }> {
  const units = row.unitsShare ? Number(row.unitsShare) : 0;
  return {
    ok: true,
    billingMonth: row.billingMonth,
    units,
    ratePerUnitPaise: row.ratePerUnitPaise,
    amountPaise: row.amountPaise,
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoiceNumber,
    usedAverage,
    message,
  };
}

export async function calculateRefundElectricityForBooking(
  session: AdminSession,
  input: { bookingId: string },
): Promise<RefundElectricityPreview> {
  const ctx = await bookingRoomContext(input.bookingId);
  if (!ctx) {
    return { ok: false, error: 'Booking or room not found.' };
  }

  try {
    assertAdminCanAccessPg(session, ctx.pgId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Access denied for this PG.',
    };
  }

  const existing = await pendingInvoiceForBooking(input.bookingId);
  if (existing) {
    return toPreview(
      existing,
      false,
      `Using pending invoice ${existing.invoiceNumber} for ${existing.billingMonth}.`,
    );
  }

  return {
    ok: false,
    error:
      'No pending electricity invoice for this booking. ' +
      'Move-out electricity must be settled on the checkout settlement ' +
      '(final meter reading) — that path does not create a room monthly bill or change the room previous meter reading. ' +
      'Use Admin → Move-out / Checkout Settlements.',
  };
}

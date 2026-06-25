/**
 * Room-level billing configuration — private room = one monthly invoice per room.
 */

import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/src/db/client';
import { beds, rentInvoices, rooms } from '@/src/db/schema';

export type RoomBillingConfig = {
  roomId: string;
  roomNumber: string;
  billingMode: 'per_bed' | 'private_room';
  privateRoomMonthlyRentPaise: number | null;
};

export async function getRoomBillingConfig(roomId: string): Promise<RoomBillingConfig | null> {
  const [row] = await db
    .select({
      roomId: rooms.id,
      roomNumber: rooms.roomNumber,
      billingMode: rooms.billingMode,
      privateRoomMonthlyRentPaise: rooms.privateRoomMonthlyRentPaise,
    })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);

  if (!row) return null;
  return {
    roomId: row.roomId,
    roomNumber: row.roomNumber,
    billingMode: row.billingMode,
    privateRoomMonthlyRentPaise: row.privateRoomMonthlyRentPaise,
  };
}

export async function getRoomBillingConfigForBed(bedId: string): Promise<RoomBillingConfig | null> {
  const [row] = await db
    .select({ roomId: beds.roomId })
    .from(beds)
    .where(eq(beds.id, bedId))
    .limit(1);
  if (!row) return null;
  return getRoomBillingConfig(row.roomId);
}

/** True when another non-cancelled invoice already exists for this room + billing month. */
export async function privateRoomInvoiceExists(
  roomId: string,
  billingMonth: string,
  excludeBookingId?: string,
): Promise<boolean> {
  const conditions = [
    eq(rentInvoices.billingMonth, billingMonth),
    eq(rentInvoices.isAdhoc, false),
    ne(rentInvoices.status, 'cancelled'),
    sql`${beds.roomId} = ${roomId}::uuid`,
  ];
  if (excludeBookingId) {
    conditions.push(ne(rentInvoices.bookingId, excludeBookingId));
  }

  const [row] = await db
    .select({ id: rentInvoices.id })
    .from(rentInvoices)
    .innerJoin(beds, eq(beds.id, rentInvoices.bedId))
    .where(and(...conditions))
    .limit(1);

  return Boolean(row);
}

export async function shouldSkipPrivateRoomDuplicate(input: {
  roomId: string;
  billingMonth: string;
  bookingId: string;
  bedId: string;
}): Promise<{ skip: boolean; reason?: string }> {
  const config = await getRoomBillingConfig(input.roomId);
  if (!config || config.billingMode !== 'private_room') {
    return { skip: false };
  }

  if (await privateRoomInvoiceExists(input.roomId, input.billingMonth, input.bookingId)) {
    return { skip: true, reason: 'private_room_invoice_exists' };
  }

  const [bedRow] = await db
    .select({ manualOccupied: beds.manualOccupied })
    .from(beds)
    .where(eq(beds.id, input.bedId))
    .limit(1);

  if (bedRow?.manualOccupied) {
    return { skip: true, reason: 'manual_occupied_inventory_bed' };
  }

  return { skip: false };
}

export function resolvePrivateRoomRentPaise(
  config: RoomBillingConfig,
  profileRentPaise: number,
): number {
  if (config.billingMode === 'private_room' && config.privateRoomMonthlyRentPaise) {
    return config.privateRoomMonthlyRentPaise;
  }
  return profileRentPaise;
}

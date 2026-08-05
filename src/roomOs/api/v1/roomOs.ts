/**
 * room-os/v1 read APIs — Wave 1 live-read Bed Brain, Room shared electricity, booking ledger.
 */

import { buildBookingLedgerSnapshot } from '@/src/roomOs/engines/ledger';
import { buildRoomSharedSnapshot } from '@/src/roomOs/engines/electricity';
import { buildBedBrainSnapshot } from '@/src/roomOs/engines/occupancy';
import { buildBookingContextSnapshot } from '@/src/roomOs/engines/occupancy/resolveBookingContext';
import type { BookingContextSnapshot } from '@/src/roomOs/engines/occupancy/resolveBookingContext';
import type {
  BedBrainSnapshot,
  BookingLedgerSnapshot,
  RoomOsSharedSnapshot,
} from '@/src/roomOs/types';

export type LoadRoomSharedInput = {
  roomId: string;
  billingMonth: string;
  asOf?: string;
};

export type LoadBedInput = {
  bedId: string;
  asOf?: string;
};

export type LoadLedgerInput = {
  bookingId: string;
  asOf?: string;
};

export async function loadRoomShared(
  input: LoadRoomSharedInput,
): Promise<{ apiVersion: 'room-os/v1'; snapshot: RoomOsSharedSnapshot | null; status: 'not_materialized' | 'ready' }> {
  const snapshot = await buildRoomSharedSnapshot({
    roomId: input.roomId,
    billingMonth: input.billingMonth,
    asOf: input.asOf,
  });
  if (!snapshot) {
    return { apiVersion: 'room-os/v1', status: 'not_materialized', snapshot: null };
  }
  return { apiVersion: 'room-os/v1', status: 'ready', snapshot };
}

export async function loadBed(
  input: LoadBedInput,
): Promise<{ apiVersion: 'room-os/v1'; snapshot: BedBrainSnapshot | null; status: 'not_materialized' | 'ready' }> {
  const snapshot = await buildBedBrainSnapshot({
    bedId: input.bedId,
    asOf: input.asOf,
  });
  if (!snapshot) {
    return { apiVersion: 'room-os/v1', status: 'not_materialized', snapshot: null };
  }
  return { apiVersion: 'room-os/v1', status: 'ready', snapshot };
}

export async function loadLedger(
  input: LoadLedgerInput,
): Promise<{ apiVersion: 'room-os/v1'; snapshot: BookingLedgerSnapshot | null; status: 'not_materialized' | 'ready' }> {
  const snapshot = await buildBookingLedgerSnapshot({
    bookingId: input.bookingId,
    asOf: input.asOf,
  });
  if (!snapshot) {
    return { apiVersion: 'room-os/v1', status: 'not_materialized', snapshot: null };
  }
  return { apiVersion: 'room-os/v1', status: 'ready', snapshot };
}

export { loadRoomBrainSnapshot, type RoomBrainSnapshot } from '@/src/roomOs/api/v1/loadRoomBrainSnapshot';

export async function loadBookingContext(input: {
  bookingId: string;
  asOf?: string;
}): Promise<{
  apiVersion: 'room-os/v1';
  bookingContext: BookingContextSnapshot | null;
  status: 'not_materialized' | 'ready';
}> {
  const snapshot = await buildBookingContextSnapshot({
    bookingId: input.bookingId,
    asOf: input.asOf,
  });
  if (!snapshot) {
    return { apiVersion: 'room-os/v1', status: 'not_materialized', bookingContext: null };
  }
  return { apiVersion: 'room-os/v1', status: 'ready', bookingContext: snapshot };
}

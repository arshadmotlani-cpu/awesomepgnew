/**
 * room-os/v1 read API stubs — Wave 0.
 */

import type { BedBrainSnapshot, RoomOsSharedSnapshot } from '@/src/roomOs/types';

export type LoadRoomSharedInput = {
  roomId: string;
  billingMonth: string;
  asOf?: string;
};

export type LoadBedInput = {
  bedId: string;
  asOf?: string;
};

export async function loadRoomShared(
  input: LoadRoomSharedInput,
): Promise<{ apiVersion: 'room-os/v1'; snapshot: RoomOsSharedSnapshot | null; status: 'not_materialized' | 'ready' }> {
  return {
    apiVersion: 'room-os/v1',
    status: 'not_materialized',
    snapshot: null,
  };
}

export async function loadBed(
  input: LoadBedInput,
): Promise<{ apiVersion: 'room-os/v1'; snapshot: BedBrainSnapshot | null; status: 'not_materialized' | 'ready' }> {
  return {
    apiVersion: 'room-os/v1',
    status: 'not_materialized',
    snapshot: null,
  };
}

export async function loadBookingContext(_bookingId: string) {
  return {
    apiVersion: 'room-os/v1' as const,
    bookingContext: null,
    status: 'not_materialized' as const,
  };
}

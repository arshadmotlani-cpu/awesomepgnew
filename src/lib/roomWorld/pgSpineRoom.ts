import type { BedSelectorBed } from '@/src/components/customer/customerBedTypes';

/** Room payload for PG DNA spine + detail sheet (presentation only). */
export type PgSpineRoom = {
  roomId: string;
  roomNumber: string;
  roomType: string;
  floorNumber: number;
  floorLabel: string;
  capacity: number;
  hasAc: boolean;
  availableBeds: number;
  totalBeds: number;
  beds: BedSelectorBed[];
  imageUrl?: string | null;
  videoUrl?: string | null;
};

export type FloorGroup<T extends PgSpineRoom = PgSpineRoom> = {
  floorNumber: number;
  floorLabel: string;
  shortLabel: string;
  rooms: T[];
};

/** @deprecated Use PgSpineRoom — kept for RoomTheater module compatibility. */
export type RoomTheaterRoom = PgSpineRoom;

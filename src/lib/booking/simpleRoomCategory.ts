import type { CustomerRoomCard } from '@/src/db/queries/customer';
import type { CustomerRoomBedMap } from '@/src/components/customer/CustomerBedMap';
import type { BedSelectorBed } from '@/src/components/customer/customerBedTypes';
import { resolveFromSelectorBed } from '@/src/lib/bedOccupancyResolve';
import { paiseToInr } from '@/src/lib/format';

export type SimpleRoomCategoryId = 'single' | 'shared' | 'dormitory';

export const SIMPLE_CATEGORY_META: Record<
  SimpleRoomCategoryId,
  { title: string; description: string }
> = {
  single: {
    title: 'Single Room',
    description: 'Private room for you',
  },
  shared: {
    title: 'Shared Room',
    description: 'Room with 2–4 people',
  },
  dormitory: {
    title: 'Dormitory',
    description: 'Cheapest option, many people in one room',
  },
};

export function roomCategoryFromCapacity(capacity: number): SimpleRoomCategoryId {
  if (capacity <= 1) return 'single';
  if (capacity <= 4) return 'shared';
  return 'dormitory';
}

export type SimpleCategoryOption = {
  id: SimpleRoomCategoryId;
  title: string;
  description: string;
  priceLabel: string;
  dailyRatePaise: number;
  available: boolean;
  roomId: string | null;
  bed: BedSelectorBed | null;
};

export function buildSimpleCategoryOptions(
  rooms: CustomerRoomCard[],
  bedMapRooms: CustomerRoomBedMap[],
): SimpleCategoryOption[] {
  const order: SimpleRoomCategoryId[] = ['single', 'shared', 'dormitory'];
  const bedRoomById = new Map(bedMapRooms.map((r) => [r.roomId, r]));

  return order.map((id) => {
    const meta = SIMPLE_CATEGORY_META[id];
    const matchingRooms = rooms.filter(
      (r) => roomCategoryFromCapacity(r.capacity) === id && r.availableBeds > 0,
    );

    let bestDaily = 0;
    let pickedRoom: CustomerRoomCard | null = null;
    let pickedBed: BedSelectorBed | null = null;

    for (const room of matchingRooms) {
      const bedRoom = bedRoomById.get(room.roomId);
      if (!bedRoom) continue;
      const bed = bedRoom.beds.find(
        (b) => b.status === 'available' && resolveFromSelectorBed(b).isOpenNow,
      );
      if (!bed) continue;
      if (!pickedRoom || room.dailyRatePaise < bestDaily || bestDaily === 0) {
        pickedRoom = room;
        pickedBed = bed;
        bestDaily = room.dailyRatePaise;
      }
    }

    return {
      id,
      title: meta.title,
      description: meta.description,
      priceLabel: bestDaily > 0 ? `${paiseToInr(bestDaily)}/day` : 'Not available',
      dailyRatePaise: bestDaily,
      available: Boolean(pickedBed),
      roomId: pickedRoom?.roomId ?? null,
      bed: pickedBed,
    };
  });
}

export function lowestDailyRatePaise(rooms: CustomerRoomCard[]): number {
  const rates = rooms.map((r) => r.dailyRatePaise).filter((p) => p > 0);
  return rates.length > 0 ? Math.min(...rates) : 0;
}

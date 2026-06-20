'use client';

import { useCallback, useMemo, useState } from 'react';
import Image from 'next/image';
import { BedBookingPanel } from '@/src/components/customer/BedBookingPanel';
import { PgBillingRulesBox } from '@/src/components/customer/block/PgBillingRulesBox';
import type { CustomerRoomBedMap } from '@/src/components/customer/CustomerBedMap';
import type { BedSelectorBed } from '@/src/components/customer/customerBedTypes';
import { canBookBed } from '@/src/components/customer/customerBedUi';
import {
  lowestDailyRatePaise,
  roomCategoryFromCapacity,
  SIMPLE_CATEGORY_META,
  type SimpleRoomCategoryId,
} from '@/src/lib/booking/simpleRoomCategory';
import type { CustomerRoomCard } from '@/src/db/queries/customer';
import { paiseToInr } from '@/src/lib/format';

type Props = {
  pgName: string;
  locationLine: string;
  images: string[];
  rooms: CustomerRoomCard[];
  bedMapRooms: CustomerRoomBedMap[];
};

const CATEGORY_ORDER: SimpleRoomCategoryId[] = ['single', 'shared', 'dormitory'];

function categoryLabel(id: SimpleRoomCategoryId): string {
  if (id === 'shared') return 'Sharing Room';
  return SIMPLE_CATEGORY_META[id].title;
}

function roomOccupancy(room: CustomerRoomBedMap) {
  const total = room.beds.length;
  const available = room.beds.filter((b) => b.isAvailableNow && b.status === 'available').length;
  const filled = total - available;
  const status = available === 0 ? 'Full' : 'Available';
  return { filled, total, available, status };
}

function BlockBedSlot({
  bed,
  selected,
  onSelect,
}: {
  bed: BedSelectorBed;
  selected: boolean;
  onSelect: () => void;
}) {
  const bookable = canBookBed(bed);
  const occupied = !bookable && bed.status !== 'maintenance';

  return (
    <button
      type="button"
      disabled={!bookable}
      onClick={onSelect}
      className={
        'flex min-h-[3.25rem] min-w-[3.25rem] flex-col items-center justify-center rounded-xl border px-2 py-2 text-center text-xs font-bold transition ' +
        (selected
          ? 'border-apg-orange bg-apg-orange/20 text-white ring-2 ring-apg-orange'
          : bookable
            ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-100 hover:border-emerald-400'
            : 'cursor-not-allowed border-rose-500/40 bg-rose-500/10 text-rose-200 opacity-90')
      }
      aria-pressed={selected}
      aria-label={`Bed ${bed.bedCode}, ${occupied ? 'occupied' : bookable ? 'available' : 'locked'}`}
    >
      <span>{bed.bedCode}</span>
      <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide opacity-90">
        {selected ? 'Selected' : bookable ? 'Free' : occupied ? 'Taken' : 'Locked'}
      </span>
    </button>
  );
}

function BlockRoomCard({
  room,
  categoryId,
  selectedBedId,
  onSelectBed,
}: {
  room: CustomerRoomBedMap;
  categoryId: SimpleRoomCategoryId;
  selectedBedId: string | null;
  onSelectBed: (bedId: string) => void;
}) {
  const occ = roomOccupancy(room);

  return (
    <article className="rounded-2xl border border-white/10 apg-glass-light p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-white">Room {room.roomNumber}</h3>
          <p className="text-sm text-apg-silver">{categoryLabel(categoryId)}</p>
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold text-white">
            {occ.filled}/{occ.total} occupied
          </p>
          <p
            className={
              'font-bold ' + (occ.status === 'Available' ? 'text-emerald-300' : 'text-rose-300')
            }
          >
            {occ.status}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {room.beds.map((bed) => (
          <BlockBedSlot
            key={bed.bedId}
            bed={bed}
            selected={selectedBedId === bed.bedId}
            onSelect={() => {
              if (canBookBed(bed)) onSelectBed(bed.bedId);
            }}
          />
        ))}
      </div>
    </article>
  );
}

/** Block-based PG booking — rooms, beds, one clear path to pay. */
export function PgBlockBooking({
  pgName,
  locationLine,
  images,
  rooms,
  bedMapRooms,
}: Props) {
  const [categoryFilter, setCategoryFilter] = useState<SimpleRoomCategoryId | 'all'>('all');
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);

  const startingPrice = lowestDailyRatePaise(rooms);
  const heroImage = images[0] ?? null;

  const bedRoomById = useMemo(
    () => new Map(bedMapRooms.map((r) => [r.roomId, r])),
    [bedMapRooms],
  );

  const roomCards = useMemo(() => {
    return rooms
      .map((room) => {
        const bedRoom = bedRoomById.get(room.roomId);
        if (!bedRoom || bedRoom.beds.length === 0) return null;
        const categoryId = roomCategoryFromCapacity(room.capacity);
        return { room: bedRoom, categoryId, dailyRatePaise: room.dailyRatePaise };
      })
      .filter(Boolean) as Array<{
      room: CustomerRoomBedMap;
      categoryId: SimpleRoomCategoryId;
      dailyRatePaise: number;
    }>;
  }, [rooms, bedRoomById]);

  const filteredRooms = useMemo(() => {
    if (categoryFilter === 'all') return roomCards;
    return roomCards.filter((r) => r.categoryId === categoryFilter);
  }, [roomCards, categoryFilter]);

  const selectedBed = useMemo(() => {
    if (!selectedBedId) return null;
    for (const { room } of roomCards) {
      const bed = room.beds.find((b) => b.bedId === selectedBedId);
      if (bed) return bed;
    }
    return null;
  }, [roomCards, selectedBedId]);

  const scrollToRooms = useCallback(() => {
    document.getElementById('pg-room-blocks')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const categoriesPresent = useMemo(() => {
    const set = new Set(roomCards.map((r) => r.categoryId));
    return CATEGORY_ORDER.filter((c) => set.has(c));
  }, [roomCards]);

  return (
    <>
      <header className="overflow-hidden rounded-3xl border border-white/10 apg-glass">
        {heroImage ? (
          <div className="relative aspect-[16/9] w-full">
            <Image src={heroImage} alt="" fill className="object-cover" priority sizes="100vw" />
          </div>
        ) : (
          <div className="flex aspect-[16/9] items-center justify-center bg-white/5 text-apg-muted">
            {pgName}
          </div>
        )}
        <div className="p-5 sm:p-6">
          <h1 className="text-3xl font-bold text-white sm:text-4xl">{pgName}</h1>
          <p className="mt-2 text-base text-apg-silver">{locationLine}</p>
          {startingPrice > 0 ? (
            <p className="mt-4 text-2xl font-bold text-apg-orange sm:text-3xl">
              From {paiseToInr(startingPrice)}/day
            </p>
          ) : null}
          <button
            type="button"
            onClick={scrollToRooms}
            className="mt-6 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-apg-orange text-lg font-bold text-white hover:brightness-110 sm:w-auto sm:px-10"
          >
            View Rooms
          </button>
        </div>
      </header>

      <div className="mt-6">
        <PgBillingRulesBox />
      </div>

      {categoriesPresent.length > 0 ? (
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={
              'rounded-full px-4 py-2 text-sm font-semibold ' +
              (categoryFilter === 'all'
                ? 'bg-apg-orange text-white'
                : 'border border-white/15 text-apg-silver hover:text-white')
            }
          >
            All rooms
          </button>
          {categoriesPresent.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setCategoryFilter(id)}
              className={
                'rounded-full px-4 py-2 text-sm font-semibold ' +
                (categoryFilter === id
                  ? 'bg-apg-orange text-white'
                  : 'border border-white/15 text-apg-silver hover:text-white')
              }
            >
              {categoryLabel(id)}
            </button>
          ))}
        </div>
      ) : null}

      <section id="pg-room-blocks" className="mt-8 scroll-mt-6">
        <h2 className="text-xl font-bold text-white">Pick a room and bed</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Green = free · Red = taken · Tap one bed, then continue.
        </p>

        {filteredRooms.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-apg-silver">
            No rooms in this category right now.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {filteredRooms.map(({ room, categoryId }) => (
              <BlockRoomCard
                key={room.roomId}
                room={room}
                categoryId={categoryId}
                selectedBedId={selectedBedId}
                onSelectBed={setSelectedBedId}
              />
            ))}
          </div>
        )}
      </section>

      {selectedBed ? (
        <div className="sticky bottom-4 z-20 mt-8">
          <button
            type="button"
            onClick={() => setBookingOpen(true)}
            className="flex min-h-[56px] w-full items-center justify-center rounded-2xl bg-apg-orange text-lg font-bold text-white shadow-lg apg-glow-btn hover:brightness-110"
          >
            Continue to Booking
          </button>
          <p className="mt-2 text-center text-xs text-apg-muted">
            Bed {selectedBed.bedCode} selected
          </p>
        </div>
      ) : null}

      {bookingOpen && selectedBed ? (
        <BedBookingPanel beds={[selectedBed]} theme="dark" onClose={() => setBookingOpen(false)} />
      ) : null}
    </>
  );
}

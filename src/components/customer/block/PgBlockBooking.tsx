'use client';

import { useCallback, useMemo, useState } from 'react';
import { BedBookingPanel } from '@/src/components/customer/BedBookingPanel';
import { BedReservePanel } from '@/src/components/customer/BedReservePanel';
import { PgBillingRulesBox } from '@/src/components/customer/block/PgBillingRulesBox';
import { PgMobileHero } from '@/src/components/customer/block/PgMobileHero';
import { PgRoomTypeCards } from '@/src/components/customer/block/PgRoomTypeCards';
import type { CustomerRoomBedMap } from '@/src/components/customer/CustomerBedMap';
import {
  CUSTOMER_BED_KIND_CLASS,
  CustomerBedDetailSheet,
  CustomerBedTile,
} from '@/src/components/customer/customerBedUi';
import type { BedSelectorBed } from '@/src/components/customer/customerBedTypes';
import {
  lowestDailyRatePaise,
  roomCategoryFromCapacity,
  SIMPLE_CATEGORY_META,
  type SimpleRoomCategoryId,
} from '@/src/lib/booking/simpleRoomCategory';
import type { CustomerRoomCard } from '@/src/db/queries/customer';
import { dispatchRoachieReminder } from '@/src/lib/cockroach/roachieReminders';
import type { BedAvailabilityKind } from '@/src/lib/bedAvailabilityState';

type Props = {
  pgName: string;
  locationLine: string;
  images: string[];
  amenities: Record<string, unknown>;
  rooms: CustomerRoomCard[];
  bedMapRooms: CustomerRoomBedMap[];
};

const LEGEND: { label: string; kind: BedAvailabilityKind }[] = [
  { label: 'Available', kind: 'open_now' },
  { label: 'Notice', kind: 'notice' },
  { label: 'Reserved', kind: 'reserved' },
  { label: 'Occupied', kind: 'occupied' },
];

function categoryLabel(id: SimpleRoomCategoryId): string {
  if (id === 'shared') return 'Shared Room';
  return SIMPLE_CATEGORY_META[id].title;
}

function roomOccupancy(room: CustomerRoomBedMap) {
  const total = room.beds.length;
  const open = room.beds.filter((b) => b.isAvailableNow && b.status === 'available').length;
  const filled = total - open;
  return { filled, total, status: open === 0 ? 'Full' : 'Available' };
}

function BlockRoomCard({
  room,
  categoryId,
  selectedBedId,
  onSelectBed,
  mergeBed,
}: {
  room: CustomerRoomBedMap;
  categoryId: SimpleRoomCategoryId;
  selectedBedId: string | null;
  onSelectBed: (bedId: string) => void;
  mergeBed: (bed: BedSelectorBed) => BedSelectorBed;
}) {
  const occ = roomOccupancy(room);

  return (
    <article className="overflow-hidden rounded-2xl border border-white/10 apg-glass-light">
      <div className="flex items-start justify-between gap-3 p-4">
        <div>
          <h3 className="text-lg font-bold text-white">
            Room {room.roomNumber}{' '}
            <span className="text-sm font-normal text-apg-silver">({categoryLabel(categoryId)})</span>
          </h3>
          <p className="mt-1 text-sm text-apg-silver">
            Occupancy: {occ.filled} / {occ.total}
          </p>
        </div>
        <p
          className={
            'text-sm font-bold ' + (occ.status === 'Available' ? 'text-emerald-300' : 'text-rose-300')
          }
        >
          {occ.status}
        </p>
      </div>

      <div className="border-t border-white/5 px-4 pb-4 pt-3">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-apg-silver">
          Beds — tap one to book
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]">
          {room.beds.map((bed) => {
            const viewBed = mergeBed(bed);
            return (
              <CustomerBedTile
                key={bed.bedId}
                bed={viewBed}
                isSelected={selectedBedId === bed.bedId}
                onSelect={() => onSelectBed(bed.bedId)}
              />
            );
          })}
        </div>
      </div>
    </article>
  );
}

/** Mobile-first PG booking — Airbnb clarity × hostel bed logic. */
export function PgBlockBooking({
  pgName,
  locationLine,
  images,
  amenities,
  rooms,
  bedMapRooms,
}: Props) {
  const [categoryFilter, setCategoryFilter] = useState<SimpleRoomCategoryId | 'all'>('all');
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);
  const [panelBeds, setPanelBeds] = useState<BedSelectorBed[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelOptions, setPanelOptions] = useState<{
    shortStayOnly?: boolean;
    reserveCheckIn?: string;
  }>({});
  const [reservePanelBed, setReservePanelBed] = useState<BedSelectorBed | null>(null);
  const [interestOverrides, setInterestOverrides] = useState<Record<string, number>>({});

  const startingPrice = lowestDailyRatePaise(rooms);

  const bedRoomById = useMemo(
    () => new Map(bedMapRooms.map((r) => [r.roomId, r])),
    [bedMapRooms],
  );

  const roomCards = useMemo(() => {
    return rooms
      .map((room) => {
        const bedRoom = bedRoomById.get(room.roomId);
        if (!bedRoom || bedRoom.beds.length === 0) return null;
        return {
          room: bedRoom,
          categoryId: roomCategoryFromCapacity(room.capacity),
        };
      })
      .filter(Boolean) as Array<{ room: CustomerRoomBedMap; categoryId: SimpleRoomCategoryId }>;
  }, [rooms, bedRoomById]);

  const filteredRooms = useMemo(() => {
    if (categoryFilter === 'all') return roomCards;
    return roomCards.filter((r) => r.categoryId === categoryFilter);
  }, [roomCards, categoryFilter]);

  const mergeBed = useCallback(
    (bed: BedSelectorBed): BedSelectorBed => {
      const count = interestOverrides[bed.bedId];
      return count !== undefined ? { ...bed, noticeInterestCount: count } : bed;
    },
    [interestOverrides],
  );

  const selectedBed = useMemo(() => {
    if (!selectedBedId) return null;
    for (const { room } of roomCards) {
      const bed = room.beds.find((b) => b.bedId === selectedBedId);
      if (bed) return { bed: mergeBed(bed), room };
    }
    return null;
  }, [roomCards, selectedBedId, mergeBed]);

  const scrollToRooms = useCallback(() => {
    document.getElementById('pg-room-blocks')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const pickCategory = useCallback((id: SimpleRoomCategoryId) => {
    setCategoryFilter(id);
    scrollToRooms();
  }, [scrollToRooms]);

  const openPanel = useCallback(
    (bed: BedSelectorBed, options?: { shortStayOnly?: boolean; reserveCheckIn?: string }) => {
      setPanelOptions(options ?? {});
      setPanelBeds([bed]);
      setPanelOpen(true);
      setSelectedBedId(null);
    },
    [],
  );

  const handleNoticeInterestUpdate = useCallback((bedId: string, count: number) => {
    setInterestOverrides((prev) => ({ ...prev, [bedId]: count }));
  }, []);

  return (
    <>
      <PgMobileHero
        pgName={pgName}
        locationLine={locationLine}
        images={images}
        startingDailyPaise={startingPrice}
        amenities={amenities}
        onViewRooms={scrollToRooms}
      />

      <PgRoomTypeCards rooms={rooms} active={categoryFilter} onSelect={pickCategory} />

      <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-apg-silver">
        {LEGEND.map((item) => (
          <span key={item.kind} className="inline-flex items-center gap-1">
            <span
              className={`inline-block h-3 w-4 rounded border ${CUSTOMER_BED_KIND_CLASS[item.kind].split(' ').slice(0, 2).join(' ')}`}
            />
            {item.label}
          </span>
        ))}
        <span className="text-apg-muted">· 🔵 = selected</span>
      </div>

      <section id="pg-room-blocks" className="mt-6 scroll-mt-4 pb-28">
        <h2 className="text-lg font-bold text-white">Rooms</h2>
        <p className="mt-1 text-sm text-apg-silver">
          Tap a bed for dates, interest count &amp; booking
        </p>

        {categoryFilter !== 'all' ? (
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className="mt-3 text-xs font-semibold text-apg-cyan"
          >
            Show all room types
          </button>
        ) : null}

        {filteredRooms.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-apg-silver">
            No rooms in this category right now.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {filteredRooms.map(({ room, categoryId }) => (
              <BlockRoomCard
                key={room.roomId}
                room={room}
                categoryId={categoryId}
                selectedBedId={selectedBedId}
                onSelectBed={setSelectedBedId}
                mergeBed={mergeBed}
              />
            ))}
          </div>
        )}
      </section>

      <div className="mt-8 pb-8">
        <PgBillingRulesBox />
      </div>

      {selectedBed ? (
        <CustomerBedDetailSheet
          bed={selectedBed.bed}
          roomLabel={`Room ${selectedBed.room.roomNumber} · ${categoryLabel(
            roomCategoryFromCapacity(selectedBed.room.capacity),
          )}`}
          onClose={() => setSelectedBedId(null)}
          onBook={(options) => openPanel(selectedBed.bed, options)}
          onPreBook={() => {
            dispatchRoachieReminder('pre-book');
            openPanel(selectedBed.bed);
          }}
          onReserve={() => {
            dispatchRoachieReminder('reserve');
            setReservePanelBed(selectedBed.bed);
            setSelectedBedId(null);
          }}
          onNoticeInterestUpdate={handleNoticeInterestUpdate}
        />
      ) : null}

      {panelOpen && panelBeds.length > 0 ? (
        <BedBookingPanel
          beds={panelBeds}
          theme="dark"
          onClose={() => setPanelOpen(false)}
          shortStayOnly={panelOptions.shortStayOnly}
          reserveCheckInDate={panelOptions.reserveCheckIn}
        />
      ) : null}

      {reservePanelBed ? (
        <BedReservePanel bed={reservePanelBed} onClose={() => setReservePanelBed(null)} />
      ) : null}
    </>
  );
}

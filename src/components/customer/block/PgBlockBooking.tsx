'use client';

import { useCallback, useMemo, useState } from 'react';
import { BedBookingPanel } from '@/src/components/customer/BedBookingPanel';
import { BedReservePanel } from '@/src/components/customer/BedReservePanel';
import { PgBillingRulesBox } from '@/src/components/customer/block/PgBillingRulesBox';
import { PgCompactBedSlot } from '@/src/components/customer/block/PgCompactBedSlot';
import { PgMobileHero } from '@/src/components/customer/block/PgMobileHero';
import { PgRoomTypeCards } from '@/src/components/customer/block/PgRoomTypeCards';
import {
  matchesPgCategoryFilter,
  pgDisplayCategory,
  PG_CATEGORY_META,
  type PgDisplayCategory,
} from '@/src/components/customer/block/pgDisplayCategory';
import type { CustomerRoomBedMap } from '@/src/components/customer/CustomerBedMap';
import { CustomerBedDetailSheet } from '@/src/components/customer/customerBedUi';
import type { BedSelectorBed } from '@/src/components/customer/customerBedTypes';
import { lowestDailyRatePaise } from '@/src/lib/booking/simpleRoomCategory';
import type { CustomerRoomCard } from '@/src/db/queries/customer';
import { dispatchRoachieReminder } from '@/src/lib/cockroach/roachieReminders';

type Props = {
  pgName: string;
  locationLine: string;
  images: string[];
  amenities: Record<string, unknown>;
  rooms: CustomerRoomCard[];
  bedMapRooms: CustomerRoomBedMap[];
};

function roomOccupancy(room: CustomerRoomBedMap) {
  const total = room.beds.length;
  const open = room.beds.filter((b) => b.isAvailableNow && b.status === 'available').length;
  const filled = total - open;
  return { filled, total, status: open === 0 ? 'Full' : 'Available' };
}

function BlockRoomCard({
  room,
  selectedBedId,
  onSelectBed,
  mergeBed,
}: {
  room: CustomerRoomBedMap;
  selectedBedId: string | null;
  onSelectBed: (bedId: string) => void;
  mergeBed: (bed: BedSelectorBed) => BedSelectorBed;
}) {
  const occ = roomOccupancy(room);

  return (
    <article className="overflow-hidden rounded-[16px] border border-white/10 bg-white/[0.03] shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <div>
          <h3 className="text-[17px] font-semibold text-white">Room {room.roomNumber}</h3>
          <p className="mt-0.5 text-xs text-apg-muted">
            {occ.filled}/{occ.total} occupied
          </p>
        </div>
        <span
          className={
            'rounded-full px-2.5 py-1 text-[11px] font-semibold ' +
            (occ.status === 'Available'
              ? 'bg-emerald-500/15 text-emerald-200'
              : 'bg-white/8 text-apg-silver')
          }
        >
          {occ.status}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 border-t border-white/5 px-4 pb-4 pt-3">
        {room.beds.map((bed) => {
          const viewBed = mergeBed(bed);
          return (
            <PgCompactBedSlot
              key={bed.bedId}
              bed={viewBed}
              selected={selectedBedId === bed.bedId}
              onSelect={() => onSelectBed(bed.bedId)}
            />
          );
        })}
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
  const [categoryFilter, setCategoryFilter] = useState<PgDisplayCategory | 'all'>('all');
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
        return { room: bedRoom, capacity: room.capacity };
      })
      .filter(Boolean) as Array<{ room: CustomerRoomBedMap; capacity: number }>;
  }, [rooms, bedRoomById]);

  const filteredRooms = useMemo(() => {
    if (categoryFilter === 'all') return roomCards;
    return roomCards.filter((r) => matchesPgCategoryFilter(r.capacity, categoryFilter));
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

  const pickCategory = useCallback(
    (id: PgDisplayCategory) => {
      setCategoryFilter(id);
      scrollToRooms();
    },
    [scrollToRooms],
  );

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

  const categoryLabel = selectedBed
    ? PG_CATEGORY_META[pgDisplayCategory(selectedBed.room.capacity)].title
    : '';

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

      <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-apg-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[4px] border border-emerald-500/40 bg-emerald-500/20" />
          Available
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[4px] border border-white/10 bg-white/[0.06]" />
          Occupied
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-[4px] border border-sky-400/50 bg-sky-500/25" />
          Selected
        </span>
      </div>

      <section id="pg-room-blocks" className="mt-5 scroll-mt-4 pb-24">
        <h2 className="text-[17px] font-semibold text-white">Rooms</h2>

        {categoryFilter !== 'all' ? (
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className="mt-2 text-xs font-medium text-apg-cyan"
          >
            Show all rooms
          </button>
        ) : null}

        {filteredRooms.length === 0 ? (
          <p className="mt-5 rounded-[16px] border border-dashed border-white/10 px-5 py-10 text-center text-sm text-apg-silver">
            No rooms in this category right now.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {filteredRooms.map(({ room }) => (
              <BlockRoomCard
                key={room.roomId}
                room={room}
                selectedBedId={selectedBedId}
                onSelectBed={setSelectedBedId}
                mergeBed={mergeBed}
              />
            ))}
          </div>
        )}
      </section>

      <div className="mt-6 pb-10">
        <PgBillingRulesBox />
      </div>

      {selectedBed ? (
        <CustomerBedDetailSheet
          presentation="bottomSheet"
          bed={selectedBed.bed}
          roomLabel={`Room ${selectedBed.room.roomNumber} · ${categoryLabel}`}
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
          presentation="bottomSheet"
          onClose={() => setPanelOpen(false)}
          shortStayOnly={panelOptions.shortStayOnly}
          reserveCheckInDate={panelOptions.reserveCheckIn}
        />
      ) : null}

      {reservePanelBed ? (
        <BedReservePanel
          bed={reservePanelBed}
          presentation="bottomSheet"
          onClose={() => setReservePanelBed(null)}
        />
      ) : null}
    </>
  );
}

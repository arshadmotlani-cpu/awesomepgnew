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
import type { PgRoomTypeSummary } from '@/src/lib/booking/pgRoomTypeSummaries';
import { pgRoomTypeFilterKey } from '@/src/lib/booking/pgRoomTypeSummaries';
import { lowestDailyRatePaise } from '@/src/lib/booking/simpleRoomCategory';
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
  roomTypeSummaries: PgRoomTypeSummary[];
};

const LEGEND: { label: string; kind: BedAvailabilityKind }[] = [
  { label: 'Available', kind: 'open_now' },
  { label: 'Notice', kind: 'notice' },
  { label: 'Reserved', kind: 'reserved' },
  { label: 'Occupied', kind: 'occupied' },
];

type PgRoomRow = {
  bedRoom: CustomerRoomBedMap;
  roomCard: CustomerRoomCard;
};

function BlockRoomCard({
  row,
  selectedBedId,
  onSelectBed,
  mergeBed,
}: {
  row: PgRoomRow;
  selectedBedId: string | null;
  onSelectBed: (bedId: string) => void;
  mergeBed: (bed: BedSelectorBed) => BedSelectorBed;
}) {
  const { bedRoom, roomCard } = row;

  return (
    <article className="overflow-hidden rounded-[16px] border border-white/10 bg-white/[0.03] shadow-sm">
      <div className="flex items-start justify-between gap-3 px-4 py-3.5">
        <div>
          <h3 className="text-[17px] font-semibold text-white">
            Room {roomCard.roomNumber}
          </h3>
          <p className="mt-0.5 text-xs text-apg-muted">{roomCard.roomType}</p>
          <p className="mt-1 text-xs text-apg-silver">
            Occupancy: {roomCard.availableBeds}/{roomCard.totalBeds}
          </p>
        </div>
        <span className="shrink-0 text-xs text-apg-muted">
          {roomCard.availableBeds > 0 ? `${roomCard.availableBeds} open` : '—'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 border-t border-white/5 px-4 pb-4 pt-3 sm:grid-cols-[repeat(auto-fill,minmax(7rem,1fr))]">
        {bedRoom.beds.map((bed) => {
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
    </article>
  );
}

/** Bed-centric PG booking — renders API room + bed payloads only. */
export function PgBlockBooking({
  pgName,
  locationLine,
  images,
  amenities,
  rooms,
  bedMapRooms,
  roomTypeSummaries,
}: Props) {
  const [categoryFilter, setCategoryFilter] = useState<string | 'all'>('all');
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

  const roomRows = useMemo((): PgRoomRow[] => {
    const cardById = new Map(rooms.map((r) => [r.roomId, r]));
    return bedMapRooms
      .map((bedRoom) => {
        const roomCard = cardById.get(bedRoom.roomId);
        if (!roomCard || bedRoom.beds.length === 0) return null;
        return { bedRoom, roomCard };
      })
      .filter(Boolean) as PgRoomRow[];
  }, [rooms, bedMapRooms]);

  const filteredRooms = useMemo(() => {
    if (categoryFilter === 'all') return roomRows;
    return roomRows.filter(
      (row) => pgRoomTypeFilterKey(row.roomCard.roomType, row.roomCard.capacity) === categoryFilter,
    );
  }, [roomRows, categoryFilter]);

  const mergeBed = useCallback(
    (bed: BedSelectorBed): BedSelectorBed => {
      const count = interestOverrides[bed.bedId];
      return count !== undefined ? { ...bed, noticeInterestCount: count } : bed;
    },
    [interestOverrides],
  );

  const selectedBed = useMemo(() => {
    if (!selectedBedId) return null;
    for (const { bedRoom, roomCard } of roomRows) {
      const bed = bedRoom.beds.find((b) => b.bedId === selectedBedId);
      if (bed) return { bed: mergeBed(bed), bedRoom, roomCard };
    }
    return null;
  }, [roomRows, selectedBedId, mergeBed]);

  const scrollToRooms = useCallback(() => {
    document.getElementById('pg-room-blocks')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const pickCategory = useCallback(
    (roomTypeKey: string) => {
      setCategoryFilter(roomTypeKey);
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

      <PgRoomTypeCards
        summaries={roomTypeSummaries}
        active={categoryFilter}
        onSelect={pickCategory}
      />

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
            {filteredRooms.map((row) => (
              <BlockRoomCard
                key={row.bedRoom.roomId}
                row={row}
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
          roomLabel={`Room ${selectedBed.bedRoom.roomNumber} · ${selectedBed.roomCard.roomType}`}
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

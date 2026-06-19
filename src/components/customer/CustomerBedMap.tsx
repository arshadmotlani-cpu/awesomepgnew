'use client';

import { useCallback, useMemo, useState } from 'react';
import { dispatchRoachieReminder } from '@/src/lib/cockroach/roachieReminders';
import { BedBookingPanel } from './BedBookingPanel';
import { BedReservePanel } from './BedReservePanel';
import {
  CUSTOMER_BED_KIND_CLASS,
  CustomerBedDetailSheet,
  CustomerBedTile,
} from './customerBedUi';
import type { BedSelectorBed } from './customerBedTypes';

export type { BedSelectorBed } from './customerBedTypes';

export type CustomerRoomBedMap = {
  roomId: string;
  roomNumber: string;
  roomType: string;
  capacity: number;
  hasAc: boolean;
  floorLabel: string;
  floorNumber: number;
  beds: BedSelectorBed[];
};

const LEGEND = [
  { label: 'Available', kind: 'open_now' as const },
  { label: 'Notice', kind: 'notice' as const },
  { label: 'Reserved', kind: 'reserved' as const },
  { label: 'Occupied', kind: 'occupied' as const },
  { label: 'Booked', kind: 'booked' as const },
  { label: 'Available soon', kind: 'pre_bookable' as const },
  { label: 'Maintenance', kind: 'maintenance' as const },
];

function RoomBedCard({
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
  const openCount = room.beds.filter((b) => b.isAvailableNow && b.status === 'available').length;
  const occupiedCount = room.beds.filter(
    (b) =>
      (!b.isAvailableNow && b.status === 'available' && !b.reservedFrom && !b.activeBedReserveCheckIn) ||
      b.manualOccupied,
  ).length;

  return (
    <article className="rounded-2xl border border-white/10 apg-glass-light p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-apg-orange">
            {room.floorLabel} · Room {room.roomNumber}
          </p>
          <h3 className="mt-0.5 text-base font-semibold text-white">{room.roomType}</h3>
          <p className="text-xs text-apg-silver">
            {room.capacity}-sharing · {room.hasAc ? 'AC' : 'Non-AC'}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-200">
          {openCount} open · {occupiedCount}/{room.beds.length} in
        </span>
      </div>
      <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-3">
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
    </article>
  );
}

export function CustomerBedMap({
  rooms,
  filterRoomId,
}: {
  rooms: CustomerRoomBedMap[];
  /** When set, only render beds for this room (Room World flow). */
  filterRoomId?: string | null;
}) {
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null);
  const [panelBeds, setPanelBeds] = useState<BedSelectorBed[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelOptions, setPanelOptions] = useState<{
    shortStayOnly?: boolean;
    reserveCheckIn?: string;
  }>({});
  const [reservePanelBed, setReservePanelBed] = useState<BedSelectorBed | null>(null);
  const [interestOverrides, setInterestOverrides] = useState<Record<string, number>>({});

  const mergeBed = useCallback(
    (bed: BedSelectorBed): BedSelectorBed => {
      const count = interestOverrides[bed.bedId];
      return count !== undefined ? { ...bed, noticeInterestCount: count } : bed;
    },
    [interestOverrides],
  );

  const visibleRooms = useMemo(() => {
    if (!filterRoomId) return rooms;
    return rooms.filter((r) => r.roomId === filterRoomId);
  }, [rooms, filterRoomId]);

  const floors = useMemo(() => {
    const map = new Map<number, { label: string; rooms: CustomerRoomBedMap[] }>();
    for (const room of visibleRooms) {
      const cur = map.get(room.floorNumber) ?? { label: room.floorLabel, rooms: [] };
      cur.rooms.push(room);
      map.set(room.floorNumber, cur);
    }
    return [...map.entries()].sort(([a], [b]) => a - b);
  }, [visibleRooms]);

  const selectedBed = useMemo(() => {
    if (!selectedBedId) return null;
    for (const room of visibleRooms) {
      const bed = room.beds.find((b) => b.bedId === selectedBedId);
      if (bed) return { bed: mergeBed(bed), room };
    }
    return null;
  }, [visibleRooms, selectedBedId, mergeBed]);

  const handleNoticeInterestUpdate = useCallback((bedId: string, count: number) => {
    setInterestOverrides((prev) => ({ ...prev, [bedId]: count }));
  }, []);

  const openPanel = useCallback(
    (bed: BedSelectorBed, options?: { shortStayOnly?: boolean; reserveCheckIn?: string }) => {
      setPanelOptions(options ?? {});
      setPanelBeds([bed]);
      setPanelOpen(true);
      setSelectedBedId(null);
    },
    [],
  );

  return (
    <>
      <div
        className="mb-4 flex flex-wrap gap-2 text-[11px] text-apg-silver"
        data-roachie-tour="bed-map-legend"
      >
        {LEGEND.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <span
              className={`h-3 w-5 rounded border ${CUSTOMER_BED_KIND_CLASS[item.kind].split(' ').slice(0, 2).join(' ')}`}
            />
            {item.label}
          </span>
        ))}
      </div>

      <div className="space-y-8" data-roachie-tour="bed-map">
        {floors.map(([floorNumber, floor]) => (
          <section key={floorNumber}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-apg-silver">
              {floor.label}
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {floor.rooms.map((room) => (
                <RoomBedCard
                  key={room.roomId}
                  room={room}
                  selectedBedId={selectedBedId}
                  onSelectBed={setSelectedBedId}
                  mergeBed={mergeBed}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {selectedBed ? (
        <CustomerBedDetailSheet
          bed={selectedBed.bed}
          roomLabel={`${selectedBed.room.floorLabel} · Room ${selectedBed.room.roomNumber}`}
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

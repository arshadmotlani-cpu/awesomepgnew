'use client';

import Link from 'next/link';
import { useRoomStore } from '@/src/stores/useRoomStore';
import type { CustomerRoomBedMap } from '@/src/components/customer/CustomerBedMap';
import { CustomerBedMap } from '@/src/components/customer/CustomerBedMap';

type Props = {
  pgSlug: string;
  rooms: CustomerRoomBedMap[];
};

/** Bed map gated behind room selection — enforces Room World → Bed Map flow. */
export function PgFilteredBedMapSection({ pgSlug, rooms }: Props) {
  const selectedRoomId = useRoomStore((s) => s.selectedRoomId);
  const selectedRoom = selectedRoomId
    ? rooms.find((r) => r.roomId === selectedRoomId) ?? null
    : null;

  if (!selectedRoomId || !selectedRoom) {
    return (
      <div className="rounded-2xl border border-dashed border-apg-cyan/25 bg-apg-cyan/5 p-8 text-center">
        <p className="text-sm font-medium text-white">Choose a room first</p>
        <p className="mt-2 text-sm text-apg-silver">
          Select a glowing room node above to unlock the bed map for that room.
        </p>
        <Link
          href="#room-world"
          className="mt-4 inline-block text-sm font-semibold text-apg-orange hover:brightness-110"
        >
          ↑ Back to Room World
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-apg-cyan">
            Bed map · Room {selectedRoom.roomNumber}
          </p>
          <p className="mt-1 text-sm text-apg-silver">
            Pick a bed in this room, then continue to booking.
          </p>
        </div>
        <Link
          href={`/pgs/${pgSlug}/rooms/${selectedRoom.roomId}#bed-selector`}
          className="rounded-lg border border-apg-orange/40 bg-apg-orange/10 px-4 py-2 text-sm font-semibold text-apg-orange transition hover:bg-apg-orange/20"
        >
          Open full room view →
        </Link>
      </div>
      <CustomerBedMap rooms={[selectedRoom]} filterRoomId={selectedRoom.roomId} />
    </div>
  );
}

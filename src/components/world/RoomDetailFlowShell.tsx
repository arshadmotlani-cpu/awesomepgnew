'use client';

import Link from 'next/link';
import { useRoomDetailFlowGuard } from '@/src/lib/roomWorld/roomWorldFlow';

type Props = {
  pgId: string;
  pgSlug: string;
  roomId: string;
  floorNumber: number;
  children: React.ReactNode;
};

/** Syncs room selection store from route — presentation-only flow guard. */
export function RoomDetailFlowShell({ pgId, pgSlug, roomId, floorNumber, children }: Props) {
  useRoomDetailFlowGuard({ pgId, pgSlug, roomId, floorNumber });
  return <>{children}</>;
}

type CtaProps = {
  roomNumber: string;
};

export function RoomBedMapCta({ roomNumber }: CtaProps) {
  return (
    <section className="mt-8 rounded-2xl border border-apg-orange/30 bg-apg-orange/5 p-5 sm:p-6">
      <h2 className="text-lg font-semibold text-white">Choose your bed in this room</h2>
      <p className="mt-1 text-sm text-apg-silver">
        Room {roomNumber} is locked in — pick a bed below to enter the booking tunnel.
      </p>
      <Link
        href="#bed-selector"
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-apg-orange px-5 py-2.5 text-sm font-semibold text-white apg-glow-btn transition hover:brightness-110"
      >
        Go to Bed Map →
      </Link>
    </section>
  );
}

import Link from 'next/link';
import { paiseToInr } from '@/src/lib/format';
import type { CustomerRoomCard } from '@/src/db/queries/customer';

type Props = {
  room: CustomerRoomCard;
  pgSlug: string;
};

export function RoomCard({ room, pgSlug }: Props) {
  const href = `/pgs/${pgSlug}/rooms/${room.roomId}`;
  const allBooked = room.availableBeds === 0;

  return (
    <Link
      href={href}
      data-roachie-focus="room-pick"
      className={
        'group flex flex-col gap-3 rounded-2xl border p-5 transition-all apg-glass ' +
        (allBooked ? 'opacity-70' : 'hover:-translate-y-1 hover:border-apg-orange/35')
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-apg-orange">
            {room.floorLabel} · Room {room.roomNumber}
          </div>
          <h3 className="mt-0.5 text-base font-semibold text-white">{room.roomType}</h3>
          <p className="text-xs text-apg-silver">
            {room.capacity}-bed · {room.hasAc ? 'AC' : 'Non-AC'} ·{' '}
            {room.hasAttachedBath ? 'Attached bath' : 'Shared bath'}
          </p>
        </div>
        <span
          className={
            'shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ' +
            (allBooked
              ? 'bg-white/5 text-apg-muted ring-white/10'
              : 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30')
          }
        >
          {allBooked && room.totalBeds > 0
            ? 'Occupied today'
            : `${room.availableBeds} of ${room.totalBeds} free now`}
        </span>
      </div>

      <div className="flex items-end justify-between border-t border-white/5 pt-3">
        <div className="flex gap-4 text-xs text-apg-silver">
          <span>
            <span className="block text-[10px] uppercase tracking-wide text-apg-muted">/day</span>
            {room.dailyRatePaise > 0 ? paiseToInr(room.dailyRatePaise) : '—'}
          </span>
          <span>
            <span className="block text-[10px] uppercase tracking-wide text-apg-muted">/week</span>
            {room.weeklyRatePaise > 0 ? paiseToInr(room.weeklyRatePaise) : '—'}
          </span>
          <span>
            <span className="block text-[10px] uppercase tracking-wide text-apg-muted">/month</span>
            {room.monthlyRatePaise > 0 ? paiseToInr(room.monthlyRatePaise) : '—'}
          </span>
        </div>
        <span className="text-xs font-semibold text-apg-orange group-hover:translate-x-0.5 transition-transform">
          {allBooked ? 'View beds →' : 'Pick a bed →'}
        </span>
      </div>
    </Link>
  );
}

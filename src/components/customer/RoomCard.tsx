import Link from 'next/link';
import { paiseToInr } from '@/src/lib/format';
import type { CustomerRoomCard } from '@/src/db/queries/customer';

type Props = {
  room: CustomerRoomCard;
  pgSlug: string;
  startDate: string;
  endDate: string;
  durationMode: string;
};

export function RoomCard({ room, pgSlug, startDate, endDate, durationMode }: Props) {
  const href = `/pgs/${pgSlug}/rooms/${room.roomId}?start=${startDate}&end=${endDate}&mode=${durationMode}`;
  const allBooked = room.availableBeds === 0;
  return (
    <Link
      href={href}
      className={`group flex flex-col gap-3 rounded-xl border bg-white p-4 transition-all hover:-translate-y-0.5 ${
        allBooked
          ? 'border-zinc-200 opacity-70'
          : 'border-zinc-200 hover:border-indigo-300 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
            {room.floorLabel} · Room {room.roomNumber}
          </div>
          <h3 className="mt-0.5 text-base font-semibold text-zinc-900">
            {room.roomType}
          </h3>
          <p className="text-xs text-zinc-500">
            {room.capacity}-bed room · {room.hasAc ? 'AC' : 'Non-AC'} ·{' '}
            {room.hasAttachedBath ? 'Attached bath' : 'Shared bath'}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
            allBooked
              ? 'bg-zinc-100 text-zinc-500 ring-zinc-200'
              : 'bg-emerald-50 text-emerald-700 ring-emerald-200'
          }`}
        >
          {room.availableBeds} of {room.totalBeds} free
        </span>
      </div>

      <div className="flex items-end justify-between border-t border-zinc-100 pt-3">
        <div className="flex gap-4 text-xs text-zinc-600">
          <span>
            <span className="block text-[10px] uppercase tracking-wide text-zinc-400">
              /day
            </span>
            {room.dailyRatePaise > 0 ? paiseToInr(room.dailyRatePaise) : '—'}
          </span>
          <span>
            <span className="block text-[10px] uppercase tracking-wide text-zinc-400">
              /week
            </span>
            {room.weeklyRatePaise > 0 ? paiseToInr(room.weeklyRatePaise) : '—'}
          </span>
          <span>
            <span className="block text-[10px] uppercase tracking-wide text-zinc-400">
              /month
            </span>
            {room.monthlyRatePaise > 0 ? paiseToInr(room.monthlyRatePaise) : '—'}
          </span>
        </div>
        <span className="text-xs font-semibold text-indigo-600">
          {allBooked ? 'View room →' : 'Select beds →'}
        </span>
      </div>
    </Link>
  );
}

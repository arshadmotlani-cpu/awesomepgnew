import Link from 'next/link';
import type { RoomMissingElectricityRow } from '@/src/services/electricityBilling';

export function ElectricityRoomsPendingPanel({
  rooms,
  billingMonth,
}: {
  rooms: RoomMissingElectricityRow[];
  billingMonth: string;
}) {
  const monthLabel = billingMonth.slice(0, 7);

  if (rooms.length === 0) {
    return (
      <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
        All rooms with monthly residents have an electricity bill for {monthLabel}.
      </div>
    );
  }

  return (
    <section className="mb-4 space-y-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4">
      <header>
        <h2 className="text-sm font-semibold text-amber-100">
          {rooms.length} room{rooms.length === 1 ? '' : 's'} need electricity bill
        </h2>
        <p className="mt-1 text-xs text-amber-200/90">
          Pick a room, enter the current meter reading (previous reading is filled automatically),
          then generate. One bill per room per month.
        </p>
      </header>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => (
          <li key={room.roomId}>
            <Link
              href={`/admin/billing/electricity/generate?month=${monthLabel}&wizard=1&pgId=${room.pgId}&roomId=${room.roomId}`}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-[#1A1F27] px-3 py-2 text-sm hover:border-[#FF5A1F]/40"
            >
              <span className="text-white">
                {room.pgName} · R{room.roomNumber}
              </span>
              <span className="text-xs font-semibold text-[#FF5A1F]">Create bill →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

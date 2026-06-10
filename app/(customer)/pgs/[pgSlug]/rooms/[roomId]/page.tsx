import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  BedSelector,
  type BedSelectorBed,
} from '@/src/components/customer/BedSelector';
import { DateRangeBar } from '@/src/components/customer/DateRangeBar';
import { getRoomDetail } from '@/src/db/queries/customer';
import { normalizeBrowseStay } from '@/src/lib/dateDefaults';

export const dynamic = 'force-dynamic';

type SearchParams = {
  start?: string;
  end?: string;
  mode?: string;
};

export default async function RoomDetailPage(
  props: PageProps<'/pgs/[pgSlug]/rooms/[roomId]'>,
) {
  const { pgSlug, roomId } = await props.params;
  const sp = (await props.searchParams) as SearchParams;
  const stay = normalizeBrowseStay(sp);

  const detail = await getRoomDetail(pgSlug, roomId, stay.start, stay.end);

  if (!detail.ok) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          <p className="font-semibold">Couldn&apos;t reach the database.</p>
          <p className="mt-1">{detail.error}</p>
        </div>
      </div>
    );
  }
  if (!detail.data) {
    notFound();
  }
  const room = detail.data;

  const beds: BedSelectorBed[] = room.beds.map((b) => ({
    bedId: b.bedId,
    bedCode: b.bedCode,
    status: b.status,
    isAvailableForRange: b.isAvailableForRange,
    nextAvailableDate: b.nextAvailableDate,
    dailyRatePaise: b.dailyRatePaise,
    weeklyRatePaise: b.weeklyRatePaise,
    monthlyRatePaise: b.monthlyRatePaise,
    securityDepositPaise: b.securityDepositPaise,
  }));

  const availableCount = beds.filter(
    (b) => b.status === 'available' && b.isAvailableForRange,
  ).length;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <nav className="text-xs text-zinc-500">
        <Link href="/pgs" className="hover:text-indigo-600">
          PGs
        </Link>{' '}
        ·{' '}
        <Link
          href={`/pgs/${room.pgSlug}?start=${stay.start}&end=${stay.end}&mode=${stay.mode}`}
          className="hover:text-indigo-600"
        >
          {room.pgName}
        </Link>{' '}
        · <span className="text-zinc-700">Room {room.roomNumber}</span>
      </nav>

      <header className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">
            {room.floorLabel}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            Room {room.roomNumber} · {room.roomType}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {room.capacity}-bed {room.hasAc ? 'AC' : 'Non-AC'} room ·{' '}
            {room.hasAttachedBath ? 'Attached bath' : 'Shared bath'}
          </p>
        </div>
        <span className="self-start rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 sm:self-end">
          {availableCount} of {beds.length} beds free for these dates
        </span>
      </header>

      <section className="mt-6">
        <DateRangeBar
          action={`/pgs/${room.pgSlug}/rooms/${room.roomId}`}
          startDate={stay.start}
          endDate={stay.end}
          durationMode={stay.mode}
        />
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">
          Pick the bed(s) you want
        </h2>
        {beds.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
            This room has no beds configured yet.
          </p>
        ) : (
          <BedSelector
            beds={beds}
            startDate={stay.start}
            endDate={stay.end}
            durationMode={stay.mode}
            pgSlug={room.pgSlug}
          />
        )}
      </section>
    </div>
  );
}

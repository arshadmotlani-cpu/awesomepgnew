import { notFound } from 'next/navigation';
import { AmenityList } from '@/src/components/customer/AmenityList';
import { DateRangeBar } from '@/src/components/customer/DateRangeBar';
import { GenderBadge } from '@/src/components/customer/GenderBadge';
import { RoomCard } from '@/src/components/customer/RoomCard';
import {
  getPgBySlug,
  listRoomsForPg,
} from '@/src/db/queries/customer';
import { normalizeBrowseStay } from '@/src/lib/dateDefaults';
import { ElectricityMeterNotice } from '@/src/components/customer/ElectricityMeterNotice';

export const dynamic = 'force-dynamic';

type SearchParams = {
  start?: string;
  end?: string;
  mode?: string;
};

export default async function PgDetailPage(props: PageProps<'/pgs/[pgSlug]'>) {
  const { pgSlug } = await props.params;
  const sp = (await props.searchParams) as SearchParams;
  const stay = normalizeBrowseStay(sp);

  const pgResult = await getPgBySlug(pgSlug);

  if (!pgResult.ok) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <ErrorState message={pgResult.error} />
      </div>
    );
  }
  if (!pgResult.data) {
    notFound();
  }
  const pg = pgResult.data;

  const roomsResult = await listRoomsForPg(pg.id, stay.start, stay.end);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <ElectricityMeterNotice />
      </div>
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="relative aspect-[2.4/1] w-full overflow-hidden bg-gradient-to-br from-indigo-100 via-zinc-100 to-emerald-100">
          {pg.images.length > 0 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={pg.images[0]}
              alt={pg.name}
              className="h-full w-full object-cover"
            />
          ) : null}
          <div className="absolute left-4 top-4">
            <GenderBadge policy={pg.genderPolicy} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-[1.6fr_1fr] sm:p-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
              {pg.name}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              {pg.addressLine1}
              {pg.addressLine2 ? `, ${pg.addressLine2}` : ''} · {pg.city},{' '}
              {pg.state} {pg.pincode}
            </p>
            {pg.description ? (
              <p className="mt-3 max-w-2xl text-sm text-zinc-700">
                {pg.description}
              </p>
            ) : null}
          </div>
          <div className="self-start rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              Amenities
            </p>
            <div className="mt-2">
              <AmenityList amenities={pg.amenities} />
            </div>
          </div>
        </div>
      </section>

      {/* Date bar */}
      <section className="mt-6">
        <DateRangeBar
          action={`/pgs/${pg.slug}`}
          startDate={stay.start}
          endDate={stay.end}
          durationMode={stay.mode}
        />
      </section>

      {/* Rooms */}
      <section className="mt-6">
        <div className="flex flex-col items-start justify-between gap-1 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              Rooms & beds
            </h2>
            <p className="text-sm text-zinc-500">
              Per-room availability for{' '}
              <span className="font-medium text-zinc-700">
                {stay.start} → {stay.mode === 'open_ended' ? '—' : stay.end}
              </span>
              . Click any room to pick specific beds.
            </p>
          </div>
        </div>

        <div className="mt-4">
          {!roomsResult.ok ? (
            <ErrorState message={roomsResult.error} />
          ) : roomsResult.data.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
              No rooms have been added to this PG yet.
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {roomsResult.data.map((room) => (
                <li key={room.roomId}>
                  <RoomCard
                    room={room}
                    pgSlug={pg.slug}
                    startDate={stay.start}
                    endDate={stay.end}
                    durationMode={stay.mode}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
      <p className="font-semibold">Couldn&apos;t reach the database.</p>
      <p className="mt-1">{message}</p>
    </div>
  );
}

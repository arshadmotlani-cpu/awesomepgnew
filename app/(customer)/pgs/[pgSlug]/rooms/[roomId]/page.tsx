import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  BedSelector,
  type BedSelectorBed,
} from '@/src/components/customer/BedSelector';
import { getRoomDetail } from '@/src/db/queries/customer';

export const dynamic = 'force-dynamic';

export default async function RoomDetailPage(
  props: PageProps<'/pgs/[pgSlug]/rooms/[roomId]'>,
) {
  const { pgSlug, roomId } = await props.params;

  const detail = await getRoomDetail(pgSlug, roomId);

  if (!detail.ok) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 text-sm text-amber-100">
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
    isAvailableNow: b.isAvailableNow,
    nextAvailableDate: b.nextAvailableDate,
    dailyRatePaise: b.dailyRatePaise,
    weeklyRatePaise: b.weeklyRatePaise,
    monthlyRatePaise: b.monthlyRatePaise,
    securityDepositPaise: b.securityDepositPaise,
    dailySecurityDepositPaise: b.dailySecurityDepositPaise,
    weeklySecurityDepositPaise: b.weeklySecurityDepositPaise,
    monthlySecurityDepositPaise: b.monthlySecurityDepositPaise,
  }));

  const availableNowCount = beds.filter((b) => b.status === 'available' && b.isAvailableNow).length;
  const bookableCount = beds.filter(
    (b) => b.status === 'available' && (b.isAvailableNow || b.nextAvailableDate),
  ).length;

  return (
    <div className="apg-aurora mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <nav className="text-xs text-apg-silver">
        <Link href="/pgs" className="hover:text-apg-orange">
          Browse
        </Link>
        <span className="mx-2 opacity-40">/</span>
        <Link href={`/pgs/${room.pgSlug}`} className="hover:text-apg-orange">
          {room.pgName}
        </Link>
        <span className="mx-2 opacity-40">/</span>
        <span className="text-white">Room {room.roomNumber}</span>
      </nav>

      <header
        className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
        data-roachie-tour="room"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-apg-orange">
            {room.floorLabel}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-4xl">
            Room {room.roomNumber} · {room.roomType}
          </h1>
          <p className="mt-2 text-sm text-apg-silver">
            {room.capacity}-bed {room.hasAc ? 'AC' : 'Non-AC'} ·{' '}
            {room.hasAttachedBath ? 'Attached bath' : 'Shared bath'}
          </p>
        </div>
        <span className="self-start rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200 sm:self-end">
          {availableNowCount} free now · {bookableCount} of {beds.length} bookable
        </span>
      </header>

      <section className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-white">Pick your bed, then choose dates</h2>
        {beds.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 apg-glass-light p-8 text-center text-sm text-apg-silver">
            This room has no beds configured yet.
          </p>
        ) : (
          <BedSelector beds={beds} theme="dark" />
        )}
      </section>
    </div>
  );
}

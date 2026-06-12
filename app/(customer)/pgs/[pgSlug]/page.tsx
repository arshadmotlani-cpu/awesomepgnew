import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AmenityList } from '@/src/components/customer/AmenityList';
import { GenderBadge } from '@/src/components/customer/GenderBadge';
import { PgImageGallery } from '@/src/components/customer/PgImageGallery';
import {
  CustomerBedMap,
  type CustomerRoomBedMap,
} from '@/src/components/customer/CustomerBedMap';
import { getPgBySlug, getRoomDetail, listRoomsForPg } from '@/src/db/queries/customer';
import { ElectricityMeterNotice } from '@/src/components/customer/ElectricityMeterNotice';

export const dynamic = 'force-dynamic';

export default async function PgDetailPage(props: PageProps<'/pgs/[pgSlug]'>) {
  const { pgSlug } = await props.params;

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

  const roomsResult = await listRoomsForPg(pg.id);
  const roomList = roomsResult.ok ? roomsResult.data : [];

  const roomDetails = (
    await Promise.all(roomList.map((r) => getRoomDetail(pg.slug, r.roomId)))
  ).flatMap((d) => (d.ok && d.data ? [d.data] : []));

  const bedMapRooms: CustomerRoomBedMap[] = roomDetails.map((room) => ({
    roomId: room.roomId,
    roomNumber: room.roomNumber,
    roomType: room.roomType,
    capacity: room.capacity,
    hasAc: room.hasAc,
    floorLabel: room.floorLabel,
    floorNumber: room.floorNumber,
    beds: room.beds.map((b) => ({
      bedId: b.bedId,
      bedCode: b.bedCode,
      status: b.status,
      isAvailableNow: b.isAvailableNow,
      nextAvailableDate: b.nextAvailableDate,
      interestCount: b.interestCount,
      noticeInterestCount: b.noticeInterestCount,
      vacatingDate: b.vacatingDate ?? null,
      vacatingStatus: b.vacatingStatus ?? null,
      reservedFrom: b.reservedFrom ?? null,
      activeBedReserveCheckIn: b.activeBedReserveCheckIn ?? null,
      manualOccupied: b.manualOccupied ?? false,
      dailyRatePaise: b.dailyRatePaise,
      weeklyRatePaise: b.weeklyRatePaise,
      monthlyRatePaise: b.monthlyRatePaise,
      securityDepositPaise: b.securityDepositPaise,
      dailySecurityDepositPaise: b.dailySecurityDepositPaise,
      weeklySecurityDepositPaise: b.weeklySecurityDepositPaise,
      monthlySecurityDepositPaise: b.monthlySecurityDepositPaise,
    })),
  }));

  const totalBeds = bedMapRooms.reduce((n, r) => n + r.beds.length, 0);
  const availableBeds = bedMapRooms.reduce(
    (n, r) => n + r.beds.filter((b) => b.isAvailableNow && b.status === 'available').length,
    0,
  );
  const fullyOccupied = totalBeds > 0 && availableBeds === 0;

  return (
    <div className="apg-aurora mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <nav className="mb-4 text-xs text-apg-silver">
        <Link href="/pgs" className="hover:text-apg-orange">
          Browse PGs
        </Link>
        <span className="mx-2 opacity-40">/</span>
        <span className="text-white">{pg.name}</span>
      </nav>

      <div className="mb-6">
        <ElectricityMeterNotice />
      </div>

      <section className="overflow-hidden rounded-3xl border border-white/10 apg-glass">
        <div className="relative p-4 sm:p-6">
          <div className="absolute left-6 top-6 z-10">
            <GenderBadge policy={pg.genderPolicy} />
          </div>
          <PgImageGallery images={pg.images} name={pg.name} />
        </div>
        <div className="grid grid-cols-1 gap-6 border-t border-white/5 p-5 sm:grid-cols-[1.6fr_1fr] sm:p-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-4xl">
              {pg.name}
            </h1>
            <p className="mt-2 text-sm text-apg-silver">
              {pg.addressLine1}
              {pg.addressLine2 ? `, ${pg.addressLine2}` : ''} · {pg.city}, {pg.state}{' '}
              {pg.pincode}
            </p>
            {pg.description ? (
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-apg-silver/90">
                {pg.description}
              </p>
            ) : (
              <p className="mt-4 text-sm text-apg-silver/70">
                Premium PG living with daily cleaning, free laundry, high-speed WiFi, and bed-first
                booking.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-apg-silver">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">
                {availableBeds} of {totalBeds} beds free right now
              </span>
            </div>
          </div>
          <div className="self-start rounded-2xl border border-white/10 apg-glass-light p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-apg-orange">
              Amenities
            </p>
            <div className="mt-3">
              <AmenityList amenities={pg.amenities} variant="dark" />
            </div>
          </div>
        </div>
      </section>

      {fullyOccupied ? (
        <section className="mt-6 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <strong>Fully occupied today</strong> — all beds are taken right now. Notice-period beds
          may still be pre-bookable; tap any bed for details.
        </section>
      ) : null}

      <section className="mt-8" data-roachie-tour="pg-beds">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-white">Rooms & beds</h2>
          <p className="text-sm text-apg-silver">
            Tap any bed for rent, availability, and booking. Orange = notice (someone leaving soon).
          </p>
        </div>

        {!roomsResult.ok ? (
          <ErrorState message={roomsResult.error} />
        ) : bedMapRooms.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 apg-glass-light p-8 text-center text-sm text-apg-silver">
            No rooms have been added to this PG yet.
          </p>
        ) : (
          <CustomerBedMap rooms={bedMapRooms} />
        )}
      </section>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5 text-sm text-amber-100">
      <p className="font-semibold">Couldn&apos;t reach the database.</p>
      <p className="mt-1">{message}</p>
    </div>
  );
}

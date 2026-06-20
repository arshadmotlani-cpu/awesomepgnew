import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PgBlockBooking } from '@/src/components/customer/block/PgBlockBooking';
import type { CustomerRoomBedMap } from '@/src/components/customer/CustomerBedMap';
import { AnalyticsMountEvent } from '@/src/components/analytics/AnalyticsMountEvent';
import { getPgBySlug, getRoomDetail, listRoomsForPg } from '@/src/db/queries/customer';
import { trackAnalyticsEvent } from '@/src/services/visitorAnalytics';

export const dynamic = 'force-dynamic';

export default async function PgDetailPage(props: PageProps<'/pgs/[pgSlug]'>) {
  const { pgSlug } = await props.params;

  const pgResult = await getPgBySlug(pgSlug);

  if (!pgResult.ok) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 sm:px-6">
        <p className="text-sm text-rose-200">Could not load this PG. Please try again.</p>
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

  void trackAnalyticsEvent({
    eventType: 'pg_viewed',
    metadata: { pgSlug: pg.slug, pgId: pg.id },
  });

  const locationLine = [
    pg.addressLine1,
    pg.addressLine2,
    pg.city,
    pg.state,
    pg.pincode,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="apg-aurora mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <AnalyticsMountEvent eventType="pg_viewed" metadata={{ pgSlug: pg.slug, pgId: pg.id }} />
      <nav className="mb-6 text-xs text-apg-silver">
        <Link href="/pgs" className="hover:text-apg-orange">
          ← All PGs
        </Link>
      </nav>

      <PgBlockBooking
        pgName={pg.name}
        locationLine={locationLine}
        images={pg.images ?? []}
        rooms={roomList}
        bedMapRooms={bedMapRooms}
      />
    </div>
  );
}

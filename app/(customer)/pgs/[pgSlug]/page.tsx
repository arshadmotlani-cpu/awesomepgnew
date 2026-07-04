import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PgBlockBooking } from '@/src/components/customer/block/PgBlockBooking';
import { BookingFunnelShell } from '@/src/components/customer/checkout/BookingFunnelShell';
import type { CustomerRoomBedMap } from '@/src/components/customer/CustomerBedMap';
import { AnalyticsMountEvent } from '@/src/components/analytics/AnalyticsMountEvent';
import { getPgBySlug, getRoomDetail, listRoomsForPg } from '@/src/db/queries/customer';
import { buildSingleSharedSummaries } from '@/src/lib/booking/pgRoomTypeSummaries';
import { enrichBedsWithQuotedMonthlyDeposit } from '@/src/lib/booking/publicQuote';
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
  const roomTypeSummaries = buildSingleSharedSummaries(roomList);

  const roomDetails = (
    await Promise.all(roomList.map((r) => getRoomDetail(pg.slug, r.roomId)))
  ).flatMap((d) => (d.ok && d.data ? [d.data] : []));

  const bedMapRooms: CustomerRoomBedMap[] = await Promise.all(
    roomDetails.map(async (room) => {
      const enriched = await enrichBedsWithQuotedMonthlyDeposit(room.beds);
      const enrichedById = new Map(enriched.map((b) => [b.bedId, b]));
      return {
        roomId: room.roomId,
        roomNumber: room.roomNumber,
        roomType: room.roomType,
        capacity: room.capacity,
        hasAc: room.hasAc,
        floorLabel: room.floorLabel,
        floorNumber: room.floorNumber,
        beds: room.beds.map((b) => {
          const q = enrichedById.get(b.bedId);
          return {
            bedId: b.bedId,
            bedCode: b.bedCode,
            status: b.status,
            isAvailableNow: b.isAvailableNow,
            isOccupiedToday: b.isOccupiedToday,
            nextAvailableDate: b.nextAvailableDate,
            interestCount: b.interestCount,
            noticeInterestCount: b.noticeInterestCount,
            vacatingDate: b.vacatingDate ?? null,
            vacatingStatus: b.vacatingStatus ?? null,
            reservedFrom: b.reservedFrom ?? null,
            activeBedReserveCheckIn: b.activeBedReserveCheckIn ?? null,
            manualOccupied: b.manualOccupied ?? false,
            stayType: b.stayType,
            durationMode: b.durationMode,
            expectedCheckoutDate: b.expectedCheckoutDate,
            dailyRatePaise: b.dailyRatePaise,
            weeklyRatePaise: b.weeklyRatePaise,
            monthlyRatePaise: b.monthlyRatePaise,
            securityDepositPaise: b.securityDepositPaise,
            dailySecurityDepositPaise: b.dailySecurityDepositPaise,
            weeklySecurityDepositPaise: b.weeklySecurityDepositPaise,
            monthlySecurityDepositPaise: b.monthlySecurityDepositPaise,
            quotedMonthlyDepositPaise: q?.quotedMonthlyDepositPaise,
          };
        }),
      };
    }),
  );

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
    <div className="w-full px-4 py-6 sm:px-6 lg:py-8">
      <AnalyticsMountEvent eventType="pg_viewed" metadata={{ pgSlug: pg.slug, pgId: pg.id }} />
      <nav className="mb-6 text-xs text-apg-silver">
        <Link href="/pgs" className="hover:text-apg-orange">
          ← All PGs
        </Link>
      </nav>

      <BookingFunnelShell
        activeStep="pg"
        initialSummary={{ pgSlug: pg.slug, pgName: pg.name }}
      >
        <PgBlockBooking
          pgSlug={pg.slug}
          pgName={pg.name}
          locationLine={locationLine}
          images={pg.images ?? []}
          amenities={(pg.amenities ?? {}) as Record<string, unknown>}
          rooms={roomList}
          bedMapRooms={bedMapRooms}
          roomTypeSummaries={roomTypeSummaries}
        />
      </BookingFunnelShell>
    </div>
  );
}

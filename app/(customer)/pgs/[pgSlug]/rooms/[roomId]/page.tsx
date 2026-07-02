import Link from 'next/link';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { BookingFunnelShell } from '@/src/components/customer/checkout/BookingFunnelShell';
import {
  BedSelector,
  type BedSelectorBed,
} from '@/src/components/customer/BedSelector';
import { canBookBed } from '@/src/components/customer/customerBedUi';
import { resolveFromSelectorBed } from '@/src/lib/bedOccupancyResolve';
import { StickyBookCta } from '@/src/components/customer/marketing/StickyBookCta';
import { CountUpNumber } from '@/src/components/customer/design-system';
import { RoomDetailInsights } from '@/src/components/customer/RoomDetailInsights';
import { AnalyticsMountEvent } from '@/src/components/analytics/AnalyticsMountEvent';
import { RoomDetailFlowShell, RoomBedMapCta } from '@/src/components/world/RoomDetailFlowShell';
import { getRoomDetail } from '@/src/db/queries/customer';
import { getCustomerSession } from '@/src/lib/auth/session';
import { enrichBedsWithQuotedMonthlyDeposit } from '@/src/lib/booking/publicQuote';
import { displayMonthlyDepositPaise } from '@/src/lib/customerDepositDisplay';
import { isPublicAlwaysOccupiedPg } from '@/src/lib/publicPgAvailabilityOverrides';
import { getRoomActivityStats, recordRoomPageView } from '@/src/services/roomActivity';
import { trackAnalyticsEvent } from '@/src/services/visitorAnalytics';

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
  const forceOccupied = isPublicAlwaysOccupiedPg({ pgSlug: room.pgSlug, pgName: room.pgName });

  const [session, reqHeaders, activity] = await Promise.all([
    getCustomerSession(),
    headers(),
    getRoomActivityStats(room.roomId),
  ]);

  void recordRoomPageView({
    roomId: room.roomId,
    customerId: session?.customerId ?? null,
    ip: reqHeaders.get('x-forwarded-for') ?? reqHeaders.get('x-real-ip'),
    userAgent: reqHeaders.get('user-agent'),
  });
  void trackAnalyticsEvent({
    eventType: 'room_viewed',
    metadata: { roomId: room.roomId, pgSlug },
  });

  const beds: BedSelectorBed[] = room.beds.map((b) => ({
    bedId: b.bedId,
    bedCode: b.bedCode,
    forcePublicOccupied: forceOccupied,
    status: b.status,
    isAvailableNow: forceOccupied ? false : b.isAvailableNow,
    isOccupiedToday: forceOccupied ? true : b.isOccupiedToday,
    nextAvailableDate: forceOccupied ? null : b.nextAvailableDate,
    interestCount: b.interestCount,
    noticeInterestCount: b.noticeInterestCount,
    vacatingDate: forceOccupied ? null : (b.vacatingDate ?? null),
    vacatingStatus: b.vacatingStatus ?? null,
    reservedFrom: forceOccupied ? null : (b.reservedFrom ?? null),
    activeBedReserveCheckIn: forceOccupied ? null : (b.activeBedReserveCheckIn ?? null),
    manualOccupied: forceOccupied ? true : (b.manualOccupied ?? false),
    stayType: forceOccupied ? null : (b.stayType ?? null),
    durationMode: forceOccupied ? null : (b.durationMode ?? null),
    expectedCheckoutDate: forceOccupied ? null : (b.expectedCheckoutDate ?? null),
    checkoutSettlement: forceOccupied ? null : (b.checkoutSettlement ?? null),
    dailyRatePaise: b.dailyRatePaise,
    weeklyRatePaise: b.weeklyRatePaise,
    monthlyRatePaise: b.monthlyRatePaise,
    securityDepositPaise: b.securityDepositPaise,
    dailySecurityDepositPaise: b.dailySecurityDepositPaise,
    weeklySecurityDepositPaise: b.weeklySecurityDepositPaise,
    monthlySecurityDepositPaise: b.monthlySecurityDepositPaise,
  }));

  const bedsWithQuotedDeposit = await enrichBedsWithQuotedMonthlyDeposit(beds);
  const bedsForSelector: BedSelectorBed[] = bedsWithQuotedDeposit.map((b) => ({
    ...b,
    quotedMonthlyDepositPaise: b.quotedMonthlyDepositPaise,
  }));

  const availableNowCount = bedsForSelector.filter((b) => resolveFromSelectorBed(b).isOpenNow).length;
  const bookableCount = bedsForSelector.filter((b) => canBookBed(b)).length;

  const rateSample = bedsForSelector.find((b) => b.monthlyRatePaise > 0) ?? bedsForSelector[0];

  return (
    <RoomDetailFlowShell
      pgId={room.pgId}
      pgSlug={room.pgSlug}
      roomId={room.roomId}
      floorNumber={room.floorNumber}
    >
    <div className="w-full px-4 py-6 sm:px-6 lg:py-8">
      <BookingFunnelShell
        activeStep="room"
        initialSummary={{
          pgSlug: room.pgSlug,
          pgName: room.pgName,
          roomId: room.roomId,
          roomNumber: room.roomNumber,
        }}
      >
      <AnalyticsMountEvent
        eventType="room_viewed"
        metadata={{ roomId: room.roomId, pgSlug: room.pgSlug }}
      />
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
            {room.capacity}-sharing · {room.hasAc ? 'AC' : 'Non-AC'} ·{' '}
            {room.hasAttachedBath ? 'Attached bath' : 'Shared bath'}
          </p>
        </div>
        <span className="self-start rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200 sm:self-end">
          <CountUpNumber value={availableNowCount} /> free now · {bookableCount} of {bedsForSelector.length}{' '}
          bookable
        </span>
      </header>

      <div
        className="mt-6 perspective-[1200px]"
        aria-hidden
      >
        <div className="apg-glass-light mx-auto max-w-md rotate-y-[-2deg] rounded-2xl border border-white/10 p-6 shadow-xl transition-transform hover:rotate-y-0 motion-reduce:transform-none">
          <p className="text-xs font-semibold uppercase tracking-wider text-apg-orange">Room preview</p>
          <p className="mt-2 text-lg font-semibold text-white">
            Room {room.roomNumber} · {room.hasAc ? 'AC' : 'Non-AC'} · {room.capacity}-sharing
          </p>
          <p className="mt-1 text-sm text-apg-silver">{room.floorLabel}</p>
        </div>
      </div>

      <RoomDetailInsights
        roomType={room.roomType}
        capacity={room.capacity}
        hasAc={room.hasAc}
        hasAttachedBath={room.hasAttachedBath}
        floorLabel={room.floorLabel}
        roomNumber={room.roomNumber}
        rates={{
          dailyRatePaise: rateSample?.dailyRatePaise ?? 0,
          weeklyRatePaise: rateSample?.weeklyRatePaise ?? 0,
          monthlyRatePaise: rateSample?.monthlyRatePaise ?? 0,
          monthlyDepositPaise: rateSample ? displayMonthlyDepositPaise(rateSample) : 0,
        }}
        activity={activity}
      />

      <RoomBedMapCta roomNumber={room.roomNumber} />

      <section className="mt-8" id="bed-selector">
        <h2 className="mb-4 text-lg font-semibold text-white">Pick your bed, then choose dates</h2>
        {bedsForSelector.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 apg-glass-light p-8 text-center text-sm text-apg-silver">
            This room has no beds configured yet.
          </p>
        ) : (
          <BedSelector
            beds={bedsForSelector}
            theme="dark"
            roomLabel={`${room.floorLabel} · Room ${room.roomNumber}`}
          />
        )}
      </section>
      <StickyBookCta href="#bed-selector" label="Pick a bed to continue" />
      </BookingFunnelShell>
    </div>
    </RoomDetailFlowShell>
  );
}

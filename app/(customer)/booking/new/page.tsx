import Link from 'next/link';
import { BookingFunnelShell } from '@/src/components/customer/checkout/BookingFunnelShell';
import { BookingReviewFlow } from '@/src/components/customer/checkout/BookingReviewFlow';
import type { BookingReviewData } from '@/src/components/customer/checkout/BookingReviewCard';
import { getBedsForCart } from '@/src/db/queries/customer';
import { normalizeBrowseStay } from '@/src/lib/dateDefaults';
import {
  bookingFunnelDatesFromParams,
  validateBookingFunnelDates,
} from '@/src/lib/booking/bookingFunnelDates';
import { computeNewBookingCheckoutTotals } from '@/src/lib/billing/bookingCheckoutTotals';
import { quoteBookingPrice } from '@/src/services/pricing';
import { getCustomerPriorOutstandingForCheckout } from '@/src/services/bookingPriorOutstanding';
import { getCustomerSession } from '@/src/lib/auth/session';
import { stayTypeLabel } from '@/src/lib/stayType';
import { paiseToInr } from '@/src/lib/format';

export const metadata = { title: 'Booking review' };

export const dynamic = 'force-dynamic';

type SearchParams = {
  start?: string;
  end?: string;
  mode?: string;
  stayType?: string;
  bed?: string | string[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asArray(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [value];
  return [];
}

export default async function NewBookingPage(props: PageProps<'/booking/new'>) {
  const sp = (await props.searchParams) as SearchParams;
  const session = await getCustomerSession();

  const bedIdsRaw = asArray(sp.bed).filter((id) => UUID_RE.test(id));
  const bedIds = Array.from(new Set(bedIdsRaw));

  if (bedIds.length === 0) {
    return <Empty />;
  }

  const stay = normalizeBrowseStay({
    start: sp.start,
    end: sp.end,
    mode: sp.mode,
    stayType: sp.stayType,
  });
  const { start, end, mode, stayType } = stay;
  const funnelDates = bookingFunnelDatesFromParams({
    start,
    end: mode === 'open_ended' ? null : end,
    stayType,
  });
  const dateError = validateBookingFunnelDates(funnelDates);

  if (dateError) {
    return (
      <main className="apg-aurora mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
        <h1 className="text-xl font-bold text-white">Dates need a quick fix</h1>
        <p className="mt-2 text-sm text-rose-200">{dateError}</p>
        <p className="mt-2 text-sm text-apg-silver">
          Go back to the bed page and pick your dates again — they must match through checkout and
          payment.
        </p>
        <Link
          href="/pgs"
          className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-apg-orange px-6 text-sm font-bold text-white"
        >
          Browse PGs
        </Link>
      </main>
    );
  }

  const cartBedsResult = await getBedsForCart(bedIds);
  if (!cartBedsResult.ok || cartBedsResult.data.length === 0) {
    return <Empty />;
  }
  const cartBeds = cartBedsResult.data;

  const pgIds = new Set(cartBeds.map((b) => b.pgId));
  if (pgIds.size > 1) {
    return <Empty />;
  }

  const pg = cartBeds[0]!;
  const primaryBed = cartBeds.find((b) => b.bedId === bedIds[0]) ?? cartBeds[0]!;

  let subtotalPaise = 0;
  let depositPaise = 0;
  let totalDuePaise = 0;
  let quoteError: string | null = null;
  let reviewLineItems: import('@/src/components/customer/checkout/BookingReviewCard').BookingReviewLineItem[] | undefined;

  try {
    const quote = await quoteBookingPrice({
      bedIds,
      startDate: start,
      endDate: mode === 'open_ended' ? null : end,
      durationMode: mode,
      includeDeposit: true,
    });
    subtotalPaise = quote.subtotalPaise;
    depositPaise = quote.depositPaise;

    let priorOutstanding = {
      totalPaise: 0,
      items: [] as import('@/src/lib/billing/bookingCheckoutTotals').PriorOutstandingItem[],
    };
    if (session) {
      priorOutstanding = await getCustomerPriorOutstandingForCheckout(session.customerId);
    }

    const checkoutTotals = computeNewBookingCheckoutTotals({
      rentSubtotalPaise: subtotalPaise,
      depositRequiredPaise: depositPaise,
      priorOutstanding,
    });
    totalDuePaise = checkoutTotals.totalToCollectTodayPaise;
    depositPaise = checkoutTotals.depositDueNowPaise;

    const lineItems: import('@/src/components/customer/checkout/BookingReviewCard').BookingReviewLineItem[] =
      [
        {
          label: `Rent · Room ${primaryBed.roomNumber} Bed ${primaryBed.bedCode}`,
          amountPaise: checkoutTotals.rentDuePaise,
          detail: 'From bed_prices for your selected dates',
        },
        {
          label: 'Security deposit',
          amountPaise: checkoutTotals.depositRequiredPaise,
          detail:
            checkoutTotals.depositCreditAppliedPaise > 0
              ? `Required ${paiseToInr(checkoutTotals.depositRequiredPaise)} · credit applied separately`
              : 'Required for this stay',
        },
      ];
    if (checkoutTotals.depositCreditAppliedPaise > 0) {
      lineItems.push({
        label: 'Deposit credit applied',
        amountPaise: checkoutTotals.depositCreditAppliedPaise,
        detail: 'Transferred from a prior booking by admin',
        tone: 'credit',
      });
    }
    for (const item of priorOutstanding.items) {
      lineItems.push({
        label: item.label,
        amountPaise: item.amountPaise,
        detail: 'Outstanding from a prior stay',
      });
    }

    reviewLineItems = lineItems;
  } catch (err) {
    quoteError = err instanceof Error ? err.message : String(err);
  }

  const review: BookingReviewData = {
    pgName: pg.pgName,
    roomNumber: primaryBed.roomNumber,
    bedCode: primaryBed.bedCode,
    stayType,
    stayTypeLabel: stayTypeLabel(stayType),
    checkIn: funnelDates.start,
    checkOut: funnelDates.end,
    stayNights: funnelDates.stayNights,
    rentPaise: subtotalPaise,
    depositPaise,
    totalDuePaise,
    lineItems: reviewLineItems,
  };

  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:py-8">
      <nav className="mb-4 text-xs text-apg-silver">
        <Link href={`/pgs/${pg.pgSlug}`} className="hover:text-apg-orange">
          ← Back
        </Link>
      </nav>

      <BookingFunnelShell activeStep="preview" showSummary={false}>
        {quoteError ? (
          <div className="mx-auto max-w-xl rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            {quoteError}
          </div>
        ) : (
          <BookingReviewFlow
            isLoggedIn={Boolean(session)}
            review={review}
            bedIds={bedIds}
            startDate={funnelDates.start}
            endDate={funnelDates.end}
            stayType={stayType}
            durationMode={mode}
          />
        )}
      </BookingFunnelShell>
    </main>
  );
}

function Empty() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
      <h1 className="text-xl font-bold text-white">No room picked yet.</h1>
      <p className="mt-2 text-sm text-apg-silver">Go back and tap Book this bed.</p>
      <Link
        href="/pgs"
        className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-apg-orange px-6 text-sm font-bold text-white"
      >
        Browse PGs
      </Link>
    </main>
  );
}

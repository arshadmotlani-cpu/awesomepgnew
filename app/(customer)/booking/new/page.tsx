import Link from 'next/link';
import {
  BookingCartForm,
  type CartLineItem,
} from '@/src/components/customer/BookingCartForm';
import { BookingFunnelShell } from '@/src/components/customer/checkout/BookingFunnelShell';
import { BookingInlineAuth } from '@/src/components/customer/checkout/BookingInlineAuth';
import { SimpleStayRules } from '@/src/components/customer/simple/SimpleStayRules';
import { getBedsForCart } from '@/src/db/queries/customer';
import { normalizeBrowseStay } from '@/src/lib/dateDefaults';
import { todayString } from '@/src/lib/dates';
import {
  bookingFunnelDatesFromParams,
  validateBookingFunnelDates,
} from '@/src/lib/booking/bookingFunnelDates';
import { computeNewBookingCheckoutTotals } from '@/src/lib/billing/bookingCheckoutTotals';
import { quoteBookingPrice } from '@/src/services/pricing';
import { getCustomerPriorOutstandingForCheckout } from '@/src/services/bookingPriorOutstanding';
import { getCustomerSession } from '@/src/lib/auth/session';

export const metadata = { title: 'Complete your booking' };

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
  let depositCreditAppliedPaise = 0;
  let additionalDepositDuePaise = 0;
  let totalPaise = 0;
  let quoteError: string | null = null;
  let breakdownLineItems: import('@/src/services/pricing').LineItem[] = [];
  let checkoutTotals: ReturnType<typeof computeNewBookingCheckoutTotals> | null = null;
  let lineItems: CartLineItem[] = [];
  let priorOutstanding = {
    totalPaise: 0,
    items: [] as import('@/src/lib/billing/bookingCheckoutTotals').PriorOutstandingItem[],
  };

  if (session) {
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
      additionalDepositDuePaise = depositPaise;
      priorOutstanding = await getCustomerPriorOutstandingForCheckout(session.customerId);
      checkoutTotals = computeNewBookingCheckoutTotals({
        rentSubtotalPaise: subtotalPaise,
        depositRequiredPaise: depositPaise,
        priorOutstanding,
      });
      totalPaise = checkoutTotals.totalToCollectTodayPaise;
      breakdownLineItems = quote.perBed.flatMap((q) =>
        q.lineItems.filter((li) => li.kind !== 'deposit'),
      );
      lineItems = quote.perBed.map((q) => {
        const bedMeta = cartBeds.find((c) => c.bedId === q.bedId);
        const bedLabel = bedMeta ? `Your room at ${pg.pgName}` : 'Your room';
        return {
          bedId: q.bedId,
          label: bedLabel,
          lineTotalPaise: q.subtotalPaise,
          unitsLabel: 'your stay',
        };
      });
    } catch (err) {
      quoteError = err instanceof Error ? err.message : String(err);
    }
  }

  const checkoutTiming = start > todayString() ? 'future_start' : 'available_now';

  const summary = {
    pgSlug: pg.pgSlug,
    pgName: pg.pgName,
    roomId: primaryBed.roomId,
    roomNumber: primaryBed.roomNumber,
    bedId: primaryBed.bedId,
    bedCode: primaryBed.bedCode,
    stayType,
    moveInDate: funnelDates.start,
    moveOutDate: funnelDates.end ?? undefined,
    stayNights: funnelDates.stayNights ?? undefined,
    rentPaise: subtotalPaise,
    depositPaise,
    totalDuePaise: checkoutTotals?.totalToCollectTodayPaise,
  };

  return (
    <main className="w-full px-4 py-6 sm:px-6 lg:py-8">
      <nav className="mb-4 text-xs text-apg-silver">
        <Link href={`/pgs/${pg.pgSlug}`} className="hover:text-apg-orange">
          ← Back
        </Link>
      </nav>

      <BookingFunnelShell activeStep="preview" initialSummary={summary}>
        <div>
          <h1 className="text-2xl font-bold text-white">Almost done!</h1>
          <p className="mt-2 text-base text-apg-silver">
            Confirm your details, then continue to payment.
          </p>

          <div className="mt-5">
            <SimpleStayRules />
          </div>

          {!session ? (
            <div className="mt-5">
              <BookingInlineAuth />
            </div>
          ) : null}

          {quoteError ? (
            <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
              {quoteError}
            </div>
          ) : session ? (
            <div className="mt-6 rounded-2xl border border-white/10 apg-glass-light p-4">
              <BookingCartForm
                bedIds={bedIds}
                startDate={funnelDates.start}
                endDate={funnelDates.end}
                stayType={stayType}
                durationMode={mode}
                lineItems={lineItems}
                subtotalPaise={subtotalPaise}
                depositPaise={depositPaise}
                depositCreditAppliedPaise={depositCreditAppliedPaise}
                additionalDepositDuePaise={additionalDepositDuePaise}
                totalPaise={totalPaise}
                defaultCustomer={{
                  fullName: session.fullName,
                  email: session.email,
                  phone: session.phone,
                }}
                showPs4Addon={false}
                checkoutTiming={checkoutTiming}
                breakdownLineItems={breakdownLineItems}
                simpleCheckout
              />
            </div>
          ) : (
            <p className="mt-5 text-sm text-apg-silver">
              Sign in above to see your total and continue to payment.
            </p>
          )}
        </div>
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

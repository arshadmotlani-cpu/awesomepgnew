import Link from 'next/link';
import {
  BookingCartForm,
  type CartLineItem,
} from '@/src/components/customer/BookingCartForm';
import { BookingPriceBreakdown } from '@/src/components/customer/BookingPriceBreakdown';
import { SimpleStayRules } from '@/src/components/customer/simple/SimpleStayRules';
import { getBedsForCart } from '@/src/db/queries/customer';
import { normalizeBrowseStay } from '@/src/lib/dateDefaults';
import { todayString } from '@/src/lib/dates';
import { computeNewBookingCheckoutTotals } from '@/src/lib/billing/bookingCheckoutTotals';
import { quoteBookingPrice } from '@/src/services/pricing';
import { getCustomerPriorOutstandingForCheckout } from '@/src/services/bookingPriorOutstanding';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import { getCustomerById, isProfileComplete } from '@/src/services/profile';
import {
  computeDepositDue,
  getCustomerDepositCredit,
} from '@/src/services/depositCredit';

export const metadata = { title: 'Pay for your room' };

export const dynamic = 'force-dynamic';

type SearchParams = {
  start?: string;
  end?: string;
  mode?: string;
  bed?: string | string[];
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asArray(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [value];
  return [];
}

function bookingReturnPath(sp: SearchParams): string {
  const params = new URLSearchParams();
  if (sp.start) params.set('start', sp.start);
  if (sp.end) params.set('end', sp.end);
  if (sp.mode) params.set('mode', sp.mode);
  for (const id of asArray(sp.bed)) params.append('bed', id);
  const qs = params.toString();
  return qs ? `/booking/new?${qs}` : '/booking/new';
}

export default async function NewBookingPage(props: PageProps<'/booking/new'>) {
  const sp = (await props.searchParams) as SearchParams;
  const session = await requireCustomerSession(bookingReturnPath(sp));
  const customer = await getCustomerById(session.customerId);
  const profileComplete = customer ? isProfileComplete(customer) : false;

  const bedIdsRaw = asArray(sp.bed).filter((id) => UUID_RE.test(id));
  const bedIds = Array.from(new Set(bedIdsRaw));

  if (bedIds.length === 0) {
    return <Empty />;
  }

  const stay = normalizeBrowseStay({
    start: sp.start,
    end: sp.end,
    mode: sp.mode,
  });
  const { start, end, mode } = stay;

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

  const profileReturnParams = new URLSearchParams();
  profileReturnParams.set('start', start);
  profileReturnParams.set('end', end);
  profileReturnParams.set('mode', mode);
  for (const id of bedIds) profileReturnParams.append('bed', id);
  const profileNextUrl = `/account/profile?next=${encodeURIComponent(`/booking/new?${profileReturnParams.toString()}`)}`;

  let lineItems: CartLineItem[] = [];
  let subtotalPaise = 0;
  let depositPaise = 0;
  let depositCreditAppliedPaise = 0;
  let additionalDepositDuePaise = 0;
  let totalPaise = 0;
  let quoteError: string | null = null;
  let breakdownLineItems: import('@/src/services/pricing').LineItem[] = [];
  let checkoutTotals: ReturnType<typeof computeNewBookingCheckoutTotals> | null = null;
  let priorOutstanding = { totalPaise: 0, items: [] as import('@/src/lib/billing/bookingCheckoutTotals').PriorOutstandingItem[] };

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
    const wallet = await getCustomerDepositCredit(session.customerId);
    const depositDue = computeDepositDue(depositPaise, wallet.availableCreditPaise);
    depositCreditAppliedPaise = depositDue.creditAppliedPaise;
    additionalDepositDuePaise = depositDue.additionalDuePaise;
    priorOutstanding = await getCustomerPriorOutstandingForCheckout(session.customerId);
    checkoutTotals = computeNewBookingCheckoutTotals({
      rentSubtotalPaise: subtotalPaise,
      depositRequiredPaise: depositPaise,
      depositCreditAppliedPaise,
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

  const checkoutTiming = start > todayString() ? 'future_start' : 'available_now';

  return (
    <main className="apg-aurora mx-auto max-w-lg px-4 py-10 sm:px-6">
      <nav className="mb-4 text-xs text-apg-silver">
        <Link href={`/pgs/${pg.pgSlug}`} className="hover:text-apg-orange">
          ← Back
        </Link>
      </nav>

      <h1 className="text-2xl font-bold text-white">Almost done!</h1>
      <p className="mt-2 text-base text-apg-silver">
        Check the price below, then tap continue to pay.
      </p>

      <div className="mt-5">
        <SimpleStayRules />
      </div>

      {!profileComplete ? (
        <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="font-semibold">First, add your name and phone.</p>
          <Link href={profileNextUrl} className="mt-2 inline-block font-bold text-apg-cyan">
            Go to profile →
          </Link>
        </div>
      ) : null}

      {quoteError ? (
        <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          {quoteError}
        </div>
      ) : (
        <div className="mt-6">
          {checkoutTotals ? (
            <BookingPriceBreakdown
              theme="dark"
              rentLineItems={breakdownLineItems}
              rentSubtotalPaise={subtotalPaise}
              depositRequiredPaise={depositPaise}
              depositDueNowPaise={checkoutTotals.depositDueNowPaise}
              depositCreditAppliedPaise={depositCreditAppliedPaise}
              priorOutstandingItems={priorOutstanding.items}
              newBookingTotalPaise={checkoutTotals.newBookingTotalPaise}
              totalToCollectTodayPaise={checkoutTotals.totalToCollectTodayPaise}
            />
          ) : null}
        </div>
      )}

      <div className="mt-6 rounded-2xl border border-white/10 apg-glass-light p-4">
        <BookingCartForm
          bedIds={bedIds}
          startDate={start}
          endDate={mode === 'open_ended' ? null : end}
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
    </main>
  );
}

function Empty() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
      <h1 className="text-xl font-bold text-white">No room picked yet.</h1>
      <p className="mt-2 text-sm text-apg-silver">Go back and tap Book a Room.</p>
      <Link
        href="/pgs"
        className="mt-6 inline-flex min-h-[48px] items-center justify-center rounded-xl bg-apg-orange px-6 text-sm font-bold text-white"
      >
        Browse PGs
      </Link>
    </main>
  );
}

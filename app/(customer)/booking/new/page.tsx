import Link from 'next/link';
import {
  BookingCartForm,
  type CartLineItem,
} from '@/src/components/customer/BookingCartForm';
import { getBedsForCart } from '@/src/db/queries/customer';
import { normalizeBrowseStay } from '@/src/lib/dateDefaults';
import { paiseToInr } from '@/src/lib/format';
import { quoteBookingPrice } from '@/src/services/pricing';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import { getCustomerById, isProfileComplete } from '@/src/services/profile';

export const metadata = {
  title: 'Confirm your booking',
};

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

export default async function NewBookingPage(
  props: PageProps<'/booking/new'>,
) {
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
  if (!cartBedsResult.ok) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          <p className="font-semibold">Couldn&apos;t load your selected beds.</p>
          <p className="mt-1">{cartBedsResult.error}</p>
        </div>
      </div>
    );
  }
  if (cartBedsResult.data.length === 0) {
    return <Empty />;
  }
  const cartBeds = cartBedsResult.data;

  // Block carts that mix beds from multiple PGs — gender policy / billing
  // context only makes sense within a single PG. (In practice this won't
  // happen via the UI, but a hand-typed URL could.)
  const pgIds = new Set(cartBeds.map((b) => b.pgId));
  if (pgIds.size > 1) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700">
          <p className="font-semibold">Beds from multiple PGs in one cart.</p>
          <p className="mt-1">
            Awesome PG only supports booking beds from one property at a time.
            Go back and pick again.
          </p>
          <Link
            href="/pgs"
            className="mt-3 inline-block text-sm font-semibold text-indigo-600 hover:underline"
          >
            Back to PG list
          </Link>
        </div>
      </div>
    );
  }

  const pg = cartBeds[0];

  const profileReturnParams = new URLSearchParams();
  profileReturnParams.set('start', start);
  profileReturnParams.set('end', end);
  profileReturnParams.set('mode', mode);
  for (const id of bedIds) profileReturnParams.append('bed', id);
  const profileNextUrl = `/account/profile?next=${encodeURIComponent(`/booking/new?${profileReturnParams.toString()}`)}`;

  // Live price quote. Wrap in try/catch so a missing price row surfaces as a
  // friendly UI message rather than a 500.
  let lineItems: CartLineItem[] = [];
  let subtotalPaise = 0;
  let depositPaise = 0;
  let totalPaise = 0;
  let quoteError: string | null = null;

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
    totalPaise = quote.totalPaise;
    lineItems = quote.perBed.map((q) => {
      const bedMeta = cartBeds.find((c) => c.bedId === q.bedId);
      const bedLabel = bedMeta
        ? `Bed ${bedMeta.bedCode} · Room ${bedMeta.roomNumber}`
        : `Bed ${q.bedId.slice(0, 8)}…`;
      const unitsLabel =
        mode === 'daily'
          ? `${q.units} night${q.units === 1 ? '' : 's'}`
          : mode === 'weekly'
            ? `${q.units} week${q.units === 1 ? '' : 's'}`
            : mode === 'monthly'
              ? `${q.units} month${q.units === 1 ? '' : 's'}${
                  q.lineItems.some((li) => li.kind === 'pro_rata_days')
                    ? ' + pro-rata days'
                    : ''
                }`
              : '1 month upfront (open-ended)';
      return {
        bedId: q.bedId,
        label: bedLabel,
        // Per-bed line shows RENT only (this bed's contribution to Subtotal).
        // The deposit is broken out separately below so the visible ledger
        // reads: per-bed lines → Subtotal → Refundable deposit → Total.
        // Without this the per-bed lines would silently include deposit and
        // visually mis-match the "Subtotal" row beneath them.
        lineTotalPaise: q.subtotalPaise,
        unitsLabel,
      };
    });
  } catch (err) {
    quoteError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <nav className="text-xs text-zinc-500">
        <Link href="/pgs" className="hover:text-indigo-600">
          PGs
        </Link>{' '}
        ·{' '}
        <Link
          href={`/pgs/${pg.pgSlug}?start=${start}&end=${end}&mode=${mode}`}
          className="hover:text-indigo-600"
        >
          {pg.pgName}
        </Link>{' '}
        · <span className="text-zinc-700">Confirm booking</span>
      </nav>

      <header className="mt-3 mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          Confirm your booking
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Review the {bedIds.length} bed{bedIds.length === 1 ? '' : 's'} you
          selected at <span className="font-medium text-zinc-700">{pg.pgName}</span>,
          enter your details, and continue to payment.
        </p>
      </header>

      {!profileComplete ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Complete your profile before booking.</p>
          <p className="mt-1">
            We need your full name, email, and mobile number.
          </p>
          <Link
            href={profileNextUrl}
            className="mt-2 inline-block font-semibold text-indigo-700 hover:underline"
          >
            Go to profile →
          </Link>
        </div>
      ) : null}

      {quoteError ? (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">Couldn&apos;t compute a price quote.</p>
          <p className="mt-1">{quoteError}</p>
        </div>
      ) : null}

      <BookingCartForm
        bedIds={bedIds}
        startDate={start}
        endDate={mode === 'open_ended' ? null : end}
        durationMode={mode}
        lineItems={lineItems}
        subtotalPaise={subtotalPaise}
        depositPaise={depositPaise}
        totalPaise={totalPaise}
        defaultCustomer={{
          fullName: session.fullName,
          email: session.email,
          phone: session.phone,
        }}
      />

      {/* Selected beds quick-reference */}
      <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Selected beds</h2>
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {cartBeds.map((b) => (
            <li
              key={b.bedId}
              className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs"
            >
              <div className="font-semibold text-zinc-900">{b.bedCode}</div>
              <div className="text-zinc-500">
                Room {b.roomNumber} · {b.floorLabel}
              </div>
              <div className="text-zinc-500">{b.roomType}</div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-zinc-500">
          Subtotal computed at the {mode.replace('_', '-')} rate. Deposit is fully
          refundable on check-out. All amounts are in Indian Rupees (₹).
        </p>
      </section>
    </div>
  );
}

function Empty() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
      <h1 className="text-xl font-semibold text-zinc-900">Your cart is empty.</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Pick a PG, choose your dates, and select one or more beds to continue.
      </p>
      <Link
        href="/pgs"
        className="mt-5 inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
      >
        Browse PGs
      </Link>
    </div>
  );
}

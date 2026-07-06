import Link from 'next/link';
import { ReserveConfirmForm } from '@/src/components/customer/ReserveConfirmForm';
import { UnfinishedReservationBanner } from '@/src/components/customer/UnfinishedReservationBanner';
import { getBedsForCart } from '@/src/db/queries/customer';
import { requireCustomerSession } from '@/src/lib/auth/guards';
import {
  getCustomerBedReserveDraft,
  quoteBedReserve,
} from '@/src/services/bedReserve';
import { getCustomerById, isProfileComplete } from '@/src/services/profile';
import { ReserveQuoteBreakdown } from '@/src/components/customer/ReserveQuoteBreakdown';
import { formatDate } from '@/src/lib/format';

export const dynamic = 'force-dynamic';

type SearchParams = {
  bed?: string;
  start?: string;
  checkIn?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewReservePage(props: PageProps<'/reserve/new'>) {
  const sp = (await props.searchParams) as SearchParams;
  const returnPath = `/reserve/new?bed=${sp.bed ?? ''}&start=${sp.start ?? ''}&checkIn=${sp.checkIn ?? ''}`;
  const session = await requireCustomerSession(returnPath);

  const bedId = sp.bed && UUID_RE.test(sp.bed) ? sp.bed : null;
  if (!bedId || !sp.start || !sp.checkIn) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <p className="text-sm text-rose-700">Missing reserve details. Pick a bed from the map.</p>
        <Link href="/pgs" className="mt-4 inline-block text-apg-orange">
          Browse PGs
        </Link>
      </main>
    );
  }

  const customer = await getCustomerById(session.customerId);
  if (!customer || !isProfileComplete(customer)) {
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Complete your profile before reserving a bed.
        </p>
        <Link
          href={`/account/profile?next=${encodeURIComponent(returnPath)}`}
          className="mt-4 inline-block text-apg-orange"
        >
          Complete profile
        </Link>
      </main>
    );
  }

  const existingDraft = await getCustomerBedReserveDraft(session.customerId, bedId);

  let quote;
  try {
    quote = await quoteBedReserve({
      bedId,
      reserveStart: sp.start,
      checkInDate: sp.checkIn,
      customerId: session.customerId,
    });
  } catch (err) {
    if (existingDraft) {
      return (
        <main className="mx-auto max-w-lg px-4 py-10 sm:px-6">
          <h1 className="text-2xl font-semibold text-zinc-900">Confirm bed reserve</h1>
          <div className="mt-6">
            <UnfinishedReservationBanner
              bookingCode={existingDraft.bookingCode}
              bookingId={existingDraft.id}
              variant="light"
            />
          </div>
        </main>
      );
    }
    return (
      <main className="mx-auto max-w-lg px-4 py-12">
        <p className="text-sm text-rose-700">
          {err instanceof Error ? err.message : 'Could not quote reserve.'}
        </p>
      </main>
    );
  }

  const beds = await getBedsForCart([bedId]);
  const bed = beds.ok ? beds.data[0] : null;
  const showDraftBanner =
    existingDraft?.bookingCode &&
    (quote.existingDraft || quote.resumePayment || existingDraft);

  return (
    <main className="mx-auto max-w-lg px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold text-zinc-900">Confirm bed reserve</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Bed {bed?.bedCode ?? '—'} · check-in {formatDate(quote.checkInDate)}
      </p>

      {showDraftBanner && existingDraft ? (
        <div className="mt-4">
          <UnfinishedReservationBanner
            bookingCode={existingDraft.bookingCode}
            bookingId={existingDraft.id}
            variant="light"
          />
        </div>
      ) : null}

      <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <ReserveQuoteBreakdown quote={quote} variant="light" />
        <p className="mt-4 text-xs text-rose-700">
          Non-refundable. Not credited toward your future rent or deposit. On{' '}
          {formatDate(quote.checkInDate)} you must complete a normal booking and pay full rent +
          deposit.
        </p>
      </div>

      <ReserveConfirmForm bedId={bedId} reserveStart={quote.reserveStart} checkInDate={quote.checkInDate} />
    </main>
  );
}

import Link from 'next/link';

const PRIMARY =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg bg-[#FF5A1F] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-110';
const SECONDARY =
  'inline-flex min-h-[44px] items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50';

export function ApplicationBookingPrimaryActions({
  bookingCode,
  status,
  payHref,
  identityHref,
  showIdentity,
  residentHomeHref,
}: {
  bookingCode: string;
  status: string;
  payHref?: string | null;
  identityHref: string;
  showIdentity: boolean;
  residentHomeHref: string;
}) {
  const isPending = status === 'pending_payment';
  const isConfirmed = status === 'confirmed';

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-900">What to do next</h2>
      <p className="mt-1 text-sm text-zinc-600">
        {isPending
          ? 'Complete payment to lock in your bed. Then upload identity documents before check-in.'
          : isConfirmed
            ? showIdentity
              ? 'Payment is done. Finish identity check so we can approve check-in.'
              : 'You are set for check-in. Use resident home for monthly rent and bills.'
            : 'This booking is no longer active. See details below or browse other PGs.'}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {isPending && payHref ? (
          <Link href={payHref} className={PRIMARY}>
            Pay now
          </Link>
        ) : null}
        {showIdentity ? (
          <Link href={identityHref} className={isPending ? SECONDARY : PRIMARY}>
            Complete identity check
          </Link>
        ) : null}
        {isConfirmed && !showIdentity ? (
          <Link href={residentHomeHref} className={PRIMARY}>
            Open resident home
          </Link>
        ) : null}
        <Link href="/account/bookings" className={SECONDARY}>
          All bookings
        </Link>
        <Link href={`/booking/${bookingCode}`} className={SECONDARY}>
          Refresh status
        </Link>
      </div>
    </section>
  );
}

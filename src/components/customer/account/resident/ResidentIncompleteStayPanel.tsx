import Link from 'next/link';
import { legacyResidentTabHref, residentTabHref } from '@/src/lib/accountNavigation';

/** Shown when a confirmed booking exists but resident detail rows cannot be loaded. */
export function ResidentIncompleteStayPanel({
  customerEmail,
  developerTestMode = false,
}: {
  customerEmail?: string | null;
  developerTestMode?: boolean;
}) {
  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 p-6">
      <p className="text-base font-semibold text-amber-950">Your stay details are still syncing</p>
      <p className="mt-2 text-sm text-amber-900">
        We found an active booking on your account, but some stay information (room assignment or
        check-in dates) is not ready yet. This usually resolves after the office confirms your bed.
      </p>
      <p className="mt-3 text-sm text-amber-900">
        You can still view{' '}
        <Link href="/account/bookings" className="font-semibold text-amber-950 underline">
          My bookings
        </Link>{' '}
        or contact the PG office if this message persists.
      </p>
      {developerTestMode ? (
        <p className="mt-4 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs text-violet-900">
          Developer test mode is on for {customerEmail ?? 'your account'}. Use the developer panel
          below once bed assignment data is present, or ask ops to attach a primary bed reservation.
        </p>
      ) : null}
      <Link
        href={legacyResidentTabHref('notifications')}
        className="mt-4 inline-flex rounded-lg bg-amber-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
      >
        Open notifications
      </Link>
    </div>
  );
}

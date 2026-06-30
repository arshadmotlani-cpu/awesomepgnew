import Link from 'next/link';
import { residentTabHref } from '@/src/lib/accountNavigation';

/** Shown when account context cannot be built but the session is valid. */
export function ResidentAccountIncompletePanel({
  title = 'Your account is almost ready',
  message = 'We found your sign-in, but some stay details are still syncing. This usually clears after the office confirms your bed assignment.',
}: {
  title?: string;
  message?: string;
}) {
  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/95 p-6">
      <p className="text-base font-semibold text-amber-950">{title}</p>
      <p className="mt-2 text-sm text-amber-900">{message}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/account/bookings"
          className="inline-flex rounded-lg bg-amber-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-800"
        >
          Open My bookings
        </Link>
        <Link
          href={residentTabHref('notifications')}
          className="inline-flex rounded-lg border border-amber-300 px-4 py-2.5 text-sm font-semibold text-amber-950 hover:bg-amber-100"
        >
          Notifications
        </Link>
      </div>
    </div>
  );
}

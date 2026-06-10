import Link from 'next/link';
import { customerHasConfirmedBooking } from '@/src/db/queries/customer';
import { getCustomerSession } from '@/src/lib/auth/session';
import { LogoutButton } from '@/src/components/auth/LogoutButton';

export async function SiteHeader() {
  const session = await getCustomerSession();
  let showResident = false;
  if (session) {
    const confirmed = await customerHasConfirmedBooking(session.customerId);
    showResident = confirmed.ok && confirmed.data;
  }

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight text-zinc-900"
        >
          <span
            aria-hidden
            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold text-white shadow-sm"
          >
            A
          </span>
          Awesome PG
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium text-zinc-700">
          <Link
            href="/pgs"
            className="rounded-md px-3 py-1.5 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          >
            Browse PGs
          </Link>
          {session ? (
            <>
              <Link
                href="/account/bookings"
                className="rounded-md px-3 py-1.5 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
              >
                My bookings
              </Link>
              <Link
                href="/account/profile"
                className="rounded-md px-3 py-1.5 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
              >
                Profile
              </Link>
              {showResident ? (
                <Link
                  href="/account/resident"
                  className="rounded-md px-3 py-1.5 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
                >
                  Resident
                </Link>
              ) : null}
              <LogoutButton scope="customer" label="Sign out" />
            </>
          ) : (
            <Link
              href="/login?next=/pgs"
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-500"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

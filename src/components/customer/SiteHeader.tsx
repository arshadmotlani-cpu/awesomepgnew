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
    <header className="sticky top-0 z-30 border-b border-white/5 bg-apg-charcoal/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-sm font-semibold tracking-tight text-white"
        >
          <span
            aria-hidden
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-apg-orange text-xs font-bold text-white apg-glow-btn"
          >
            A
          </span>
          <span className="hidden sm:inline">Awesome PG</span>
        </Link>
        <nav className="flex items-center gap-0.5 text-sm font-medium text-apg-silver">
          <Link
            href="/pgs"
            className="rounded-lg px-3 py-2 transition-colors hover:bg-white/5 hover:text-white"
          >
            Browse
          </Link>
          {session ? (
            <>
              <Link
                href="/account/bookings"
                className="hidden rounded-lg px-3 py-2 transition-colors hover:bg-white/5 hover:text-white sm:inline"
              >
                Bookings
              </Link>
              {showResident ? (
                <Link
                  href="/account/resident"
                  className="rounded-lg px-3 py-2 transition-colors hover:bg-white/5 hover:text-white"
                >
                  Resident
                </Link>
              ) : null}
              <Link
                href="/account/profile"
                className="hidden rounded-lg px-3 py-2 transition-colors hover:bg-white/5 hover:text-white md:inline"
              >
                Profile
              </Link>
              <LogoutButton scope="customer" label="Sign out" />
            </>
          ) : (
            <Link
              href="/login?next=/pgs"
              className="rounded-lg bg-apg-orange px-4 py-2 text-white apg-glow-btn hover:brightness-110"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

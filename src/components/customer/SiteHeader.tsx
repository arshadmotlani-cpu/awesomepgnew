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
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0B0F14]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white"
        >
          <span
            aria-hidden
            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#FF5A1F] text-xs font-bold text-white apg-glow-btn"
          >
            A
          </span>
          Awesome PG
        </Link>
        <nav className="flex items-center gap-1 text-sm font-medium text-apg-silver">
          <Link
            href="/pgs"
            className="rounded-md px-3 py-1.5 transition-colors hover:bg-white/5 hover:text-white"
          >
            Browse PGs
          </Link>
          {session ? (
            <>
              <Link
                href="/account/bookings"
                className="rounded-md px-3 py-1.5 transition-colors hover:bg-white/5 hover:text-white"
              >
                My bookings
              </Link>
              <Link
                href="/account/profile"
                className="rounded-md px-3 py-1.5 transition-colors hover:bg-white/5 hover:text-white"
              >
                Profile
              </Link>
              {showResident ? (
                <Link
                  href="/account/resident"
                  className="rounded-md px-3 py-1.5 transition-colors hover:bg-white/5 hover:text-white"
                >
                  Resident
                </Link>
              ) : null}
              <LogoutButton scope="customer" label="Sign out" />
            </>
          ) : (
            <Link
              href="/login?next=/pgs"
              className="rounded-md bg-[#FF5A1F] px-3 py-1.5 text-white apg-glow-btn hover:brightness-110"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

import Link from 'next/link';
import { getCustomerSession } from '@/src/lib/auth/session';
import { LogoutButton } from '@/src/components/auth/LogoutButton';

export async function SiteHeader({ theme = 'dark' }: { theme?: 'dark' | 'light' }) {
  const session = await getCustomerSession();

  const light = theme === 'light';

  return (
    <header
      className={
        light
          ? 'sticky top-0 z-30 border-b border-slate-200/90 bg-white/90 backdrop-blur-xl shadow-sm shadow-slate-200/40'
          : 'sticky top-0 z-30 border-b border-white/5 bg-apg-charcoal/85 backdrop-blur-xl'
      }
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className={
            light
              ? 'flex items-center gap-2.5 text-sm font-semibold tracking-tight text-slate-900'
              : 'flex items-center gap-2.5 text-sm font-semibold tracking-tight text-white'
          }
        >
          <span
            aria-hidden
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-apg-orange text-xs font-bold text-white shadow-md shadow-orange-500/30"
          >
            A
          </span>
          <span className="hidden sm:inline">Awesome PG</span>
        </Link>
        <nav
          className={
            light
              ? 'flex items-center gap-0.5 text-sm font-medium text-slate-600'
              : 'flex items-center gap-0.5 text-sm font-medium text-apg-silver'
          }
        >
          <Link
            href="/pgs"
            className={
              light
                ? 'rounded-lg px-3 py-2 transition-colors hover:bg-slate-100 hover:text-slate-900'
                : 'rounded-lg px-3 py-2 transition-colors hover:bg-white/5 hover:text-white'
            }
          >
            Browse
          </Link>
          <Link
            href="/pgs/compare"
            className={
              light
                ? 'hidden rounded-lg px-3 py-2 transition-colors hover:bg-slate-100 hover:text-slate-900 sm:inline'
                : 'hidden rounded-lg px-3 py-2 transition-colors hover:bg-white/5 hover:text-white sm:inline'
            }
          >
            Compare
          </Link>
          <Link
            href="/about"
            className={
              light
                ? 'hidden rounded-lg px-3 py-2 transition-colors hover:bg-slate-100 hover:text-slate-900 md:inline'
                : 'hidden rounded-lg px-3 py-2 transition-colors hover:bg-white/5 hover:text-white md:inline'
            }
          >
            Trust
          </Link>
          <Link
            href="/account/favorites"
            className={
              light
                ? 'hidden rounded-lg px-3 py-2 transition-colors hover:bg-slate-100 hover:text-slate-900 sm:inline'
                : 'hidden rounded-lg px-3 py-2 transition-colors hover:bg-white/5 hover:text-white sm:inline'
            }
          >
            Favorites
          </Link>
          {session ? (
            <>
              <Link
                href="/account/bookings"
                className={
                  light
                    ? 'hidden rounded-lg px-3 py-2 transition-colors hover:bg-slate-100 hover:text-slate-900 sm:inline'
                    : 'hidden rounded-lg px-3 py-2 transition-colors hover:bg-white/5 hover:text-white sm:inline'
                }
              >
                Bookings
              </Link>
              <Link
                href="/account/resident"
                className={
                  light
                    ? 'rounded-lg px-3 py-2 transition-colors hover:bg-slate-100 hover:text-slate-900'
                    : 'rounded-lg px-3 py-2 transition-colors hover:bg-white/5 hover:text-white'
                }
              >
                My stay
              </Link>
              <LogoutButton scope="customer" label="Sign out" tone={light ? 'light' : 'dark'} />
            </>
          ) : (
            <Link
              href="/login?next=/pgs"
              className="rounded-lg bg-apg-orange px-4 py-2 text-white shadow-md shadow-orange-500/25 hover:brightness-110"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

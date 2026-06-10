import { getPrimaryPgName } from '@/src/db/queries/admin';
import { getAdminSession } from '@/src/lib/auth/session';
import { LogoutButton } from '@/src/components/auth/LogoutButton';
import { IconBell, IconBuilding, IconSearch } from './icons';
import { MobileNav } from './MobileNav';

export async function TopNav() {
  const adminSession = await getAdminSession();
  const pgName = await getPrimaryPgName();
  const displayName =
    pgName.ok && pgName.data ? pgName.data : 'No PG configured';
  const showWarning = !pgName.ok;

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-zinc-200 bg-white/80 px-4 backdrop-blur lg:px-6">
      <MobileNav />

      <div className="hidden items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-sm text-zinc-600 lg:flex">
        <IconBuilding width={16} height={16} className="text-zinc-400" />
        <span className="font-medium text-zinc-800">{displayName}</span>
        {showWarning ? (
          <span
            className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
            title="Database unreachable"
          >
            offline
          </span>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <label className="relative hidden md:block">
          <span className="sr-only">Search</span>
          <IconSearch
            width={16}
            height={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="search"
            placeholder="Search bookings, residents…"
            disabled
            className="h-9 w-72 cursor-not-allowed rounded-md border border-zinc-200 bg-zinc-50 pl-8 pr-3 text-sm text-zinc-600 placeholder-zinc-400 focus:outline-none"
          />
        </label>

        <button
          type="button"
          aria-label="Notifications"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
          disabled
        >
          <IconBell />
        </button>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">
              {adminSession?.fullName?.charAt(0) ?? 'A'}
            </span>
            <div className="hidden text-xs leading-tight sm:block">
              <p className="font-medium text-zinc-900">
                {adminSession?.fullName ?? 'Admin'}
              </p>
              <p className="text-zinc-500 capitalize">
                {(adminSession?.role ?? 'viewer').replace('_', ' ')}
              </p>
            </div>
          </div>
          <LogoutButton scope="admin" />
        </div>
      </div>
    </header>
  );
}

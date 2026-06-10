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
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/5 bg-[#0B0F14]/90 px-4 backdrop-blur-xl lg:px-6">
      <MobileNav />

      <div className="hidden items-center gap-2 rounded-md border border-white/10 bg-[#1A1F27] px-2.5 py-1.5 text-sm text-apg-silver lg:flex">
        <IconBuilding width={16} height={16} className="text-apg-silver/70" />
        <span className="font-medium text-white">{displayName}</span>
        {showWarning ? (
          <span
            className="ml-1 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400"
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
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-apg-silver/50"
          />
          <input
            type="search"
            placeholder="Search bookings, residents…"
            disabled
            className="h-9 w-72 cursor-not-allowed rounded-md border border-white/10 bg-[#1A1F27] pl-8 pr-3 text-sm text-apg-silver placeholder-apg-silver/40 focus:outline-none"
          />
        </label>

        <button
          type="button"
          aria-label="Notifications"
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-apg-silver hover:bg-white/5"
          disabled
        >
          <IconBell />
        </button>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-md border border-white/10 bg-[#1A1F27] px-2 py-1">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#FF5A1F] text-xs font-semibold text-white">
              {adminSession?.fullName?.charAt(0) ?? 'A'}
            </span>
            <div className="hidden text-xs leading-tight sm:block">
              <p className="font-medium text-white">
                {adminSession?.fullName ?? 'Admin'}
              </p>
              <p className="text-apg-silver capitalize">
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

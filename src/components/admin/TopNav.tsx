import { getAdminSession } from '@/src/lib/auth/session';
import { LogoutButton } from '@/src/components/auth/LogoutButton';
import { MobileNav } from './MobileNav';

export async function TopNav() {
  const adminSession = await getAdminSession();

  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b border-white/5 bg-[#0B0F14]/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl sm:gap-3 sm:px-4 lg:px-6">
      <MobileNav />

      <div className="min-w-0 flex-1 lg:hidden">
        <p className="truncate text-sm font-semibold text-white">Awesome PG</p>
        <p className="truncate text-[11px] text-apg-silver">Admin console</p>
      </div>

      <p className="hidden text-sm font-medium text-apg-silver lg:block">
        Admin console
      </p>

      <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="flex max-w-[10rem] items-center gap-2 rounded-md border border-white/10 bg-[#1A1F27] px-2 py-1 sm:max-w-none">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FF5A1F] text-xs font-semibold text-white sm:h-7 sm:w-7">
              {adminSession?.fullName?.charAt(0) ?? 'A'}
            </span>
            <div className="hidden min-w-0 text-xs leading-tight sm:block">
              <p className="truncate font-medium text-white">
                {adminSession?.fullName ?? 'Admin'}
              </p>
              <p className="truncate text-apg-silver capitalize">
                {(adminSession?.role ?? 'viewer').replace('_', ' ')}
              </p>
            </div>
          </div>
          <LogoutButton
            scope="admin"
            className="min-h-10 rounded-md px-2.5 py-2 text-sm font-medium text-apg-silver hover:bg-white/10 hover:text-white disabled:opacity-50 sm:px-3"
          />
        </div>
      </div>
    </header>
  );
}

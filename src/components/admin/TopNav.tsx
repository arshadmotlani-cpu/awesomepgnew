import { getAdminSession } from '@/src/lib/auth/session';
import { LogoutButton } from '@/src/components/auth/LogoutButton';
import { MobileNav } from './MobileNav';

export async function TopNav() {
  const adminSession = await getAdminSession();

  return (
    <header className="sticky top-0 z-40 flex min-h-14 w-full max-w-[100vw] items-center gap-2 border-b border-white/5 bg-[#0B0F14] px-3 pt-[env(safe-area-inset-top)] sm:gap-3 sm:px-4 lg:px-6">
      <MobileNav />

      <div className="min-w-0 flex-1 lg:hidden">
        <p className="truncate text-sm font-semibold text-white">Awesome PG</p>
        <p className="truncate text-[11px] text-apg-silver">Admin console</p>
      </div>

      <p className="hidden text-sm font-medium text-apg-silver lg:block">
        Admin console
      </p>

      <div className="ml-auto flex shrink-0 items-center">
        <div className="flex items-center gap-1 sm:gap-2">
          <div
            className="hidden items-center gap-2 rounded-md border border-white/10 bg-[#1A1F27] px-2 py-1 sm:flex"
            title={adminSession?.fullName ?? 'Admin'}
          >
            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#FF5A1F] text-xs font-semibold text-white">
              {adminSession?.fullName?.charAt(0) ?? 'A'}
            </span>
            <div className="hidden min-w-0 max-w-[8rem] text-xs leading-tight md:block">
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
            label="Sign out"
            className="min-h-10 shrink-0 rounded-md px-2 py-2 text-xs font-medium text-apg-silver hover:bg-white/10 hover:text-white disabled:opacity-50 sm:px-3 sm:text-sm"
          />
        </div>
      </div>
    </header>
  );
}

import { getAdminSession } from '@/src/lib/auth/session';
import { LogoutButton } from '@/src/components/auth/LogoutButton';
import { MobileNav } from './MobileNav';

export async function TopNav() {
  const adminSession = await getAdminSession();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/5 bg-[#0B0F14]/90 px-4 backdrop-blur-xl lg:px-6">
      <MobileNav />

      <p className="hidden text-sm font-medium text-apg-silver lg:block">
        Admin console
      </p>

      <div className="ml-auto flex items-center gap-2">
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

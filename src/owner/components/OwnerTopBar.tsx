import { logoutAction } from '@/src/owner/actions/auth';
import { OwnerMobileNav } from '@/src/owner/components/OwnerMobileNav';
import { OWNER_OS } from '@/src/lib/brand/ownerOsMetadata';
import type { OwnerAdmin } from '@/src/owner/lib/auth/session';

export function OwnerTopBar({ admin }: { admin: OwnerAdmin }) {
  const displayName = admin.displayName ?? 'Owner';

  return (
    <header className="oo-app-header">
      <div className="oo-app-header-row">
        <OwnerMobileNav />
        <div className="oo-app-header-title">
          <p className="truncate text-xs uppercase tracking-wide text-[#FF5A1F] md:hidden">
            {OWNER_OS.name}
          </p>
          <p className="truncate text-sm font-semibold text-white md:hidden">{displayName}</p>
          <div className="hidden min-w-0 md:block">
            <p className="truncate text-sm font-medium text-white">{displayName}</p>
            <p className="truncate text-xs text-[color:var(--oo-muted)]">
              Personal operating system
            </p>
          </div>
        </div>
        <div className="oo-app-header-actions">
          <form action={logoutAction}>
            <button
              type="submit"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3 text-sm font-medium text-[#FF5A1F] underline-offset-4 hover:underline md:min-h-0 md:min-w-0"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

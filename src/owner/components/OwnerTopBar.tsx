import { logoutAction } from '@/src/owner/actions/auth';
import { OwnerMobileNav } from '@/src/owner/components/OwnerMobileNav';
import { OwnerMobileSectionTitle } from '@/src/owner/components/OwnerMobileSectionTitle';
import { OWNER_OS } from '@/src/lib/brand/ownerOsMetadata';
import type { OwnerAdmin } from '@/src/owner/lib/auth/session';

export function OwnerTopBar({ admin }: { admin: OwnerAdmin }) {
  const displayName = admin.displayName ?? 'Owner';

  return (
    <header className="oo-app-header">
      <div className="oo-app-header-row">
        <span className="shrink-0 text-xl font-extrabold tracking-tight text-[color:var(--oo-accent,#FF5A1F)] sm:text-2xl">
          Owner
        </span>
        <OwnerMobileNav />
        <OwnerMobileSectionTitle />
        <div className="oo-app-header-title hidden min-w-0 md:block">
          <p className="truncate text-sm font-medium text-white">{displayName}</p>
          <p className="truncate text-xs text-[color:var(--oo-text-secondary)]">
            {OWNER_OS.name}
          </p>
        </div>
        <div className="oo-app-header-actions">
          <form action={logoutAction}>
            <button
              type="submit"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3 text-sm font-semibold text-[#FF5A1F] hover:bg-white/5 md:min-h-0 md:min-w-0"
              aria-label="Sign out"
            >
              <span className="hidden md:inline">Sign out</span>
              <span className="md:hidden">Account</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

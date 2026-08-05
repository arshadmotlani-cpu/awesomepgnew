import { logoutAction } from '@/src/owner/actions/auth';
import type { OwnerAdmin } from '@/src/owner/lib/auth/session';

export function OwnerTopBar({ admin }: { admin: OwnerAdmin }) {
  return (
    <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-white">
          {admin.displayName ?? admin.email}
        </p>
        <p className="text-xs text-[color:var(--oo-muted)]">Personal operating system</p>
      </div>
      <form action={logoutAction}>
        <button type="submit" className="text-sm text-[#FF5A1F] underline">
          Sign out
        </button>
      </form>
    </header>
  );
}

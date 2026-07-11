import Link from 'next/link';
import { Search } from 'lucide-react';
import { logoutAction } from '@/src/capital/actions/auth';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import type { CapitalAdmin } from '@/src/capital/lib/auth/session';

type CapitalTopBarProps = {
  admin: CapitalAdmin;
};

export function CapitalTopBar({ admin }: CapitalTopBarProps) {
  return (
    <header className="flex h-14 items-center gap-4 border-b border-white/8 bg-ac-elevated/60 px-4 backdrop-blur-xl md:px-6">
      <form action="/search" method="get" className="relative hidden max-w-md flex-1 md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ac-text-muted" />
        <Input name="q" aria-label="Search assets and registrations" className="pl-9" />
      </form>
      <div className="ml-auto flex items-center gap-3">
        <Link href="/assets/new">
          <Button size="sm">New Asset</Button>
        </Link>
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium">{admin.displayName ?? 'Admin'}</p>
          <p className="text-xs text-ac-text-muted">{admin.email}</p>
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}

import Link from 'next/link';
import { Search } from 'lucide-react';
import { logoutAction } from '@/src/capital/actions/auth';
import { CapitalMobileNav } from '@/src/capital/components/CapitalMobileNav';
import { CapitalOsMark } from '@/src/components/brand/capital-os/CapitalOsMark';
import { Button } from '@/src/capital/components/ui/button';
import { Input } from '@/src/capital/components/ui/input';
import type { CapitalAdmin } from '@/src/capital/lib/auth/session';

type CapitalTopBarProps = {
  admin: CapitalAdmin;
};

export function CapitalTopBar({ admin }: CapitalTopBarProps) {
  return (
    <header className="ac-app-header">
      <div className="ac-app-header-row">
        <CapitalOsMark size={32} className="shrink-0" title="Automotive Capital" />
        <CapitalMobileNav />
        <form action="/assets" method="get" className="relative hidden max-w-md flex-1 md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ac-text-muted" />
          <Input
            name="search"
            aria-label="Search vehicles and registrations"
            placeholder="Search vehicles…"
            className="pl-9"
          />
        </form>
        <div className="ac-app-header-actions ml-auto md:ml-0">
          <Link href="/assets/new" className="hidden shrink-0 md:block">
            <Button size="sm" className="min-h-8">
              New Vehicle
            </Button>
          </Link>
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium">{admin.displayName ?? 'Admin'}</p>
            <p className="text-xs text-ac-text-muted">{admin.email}</p>
          </div>
          <form action={logoutAction} className="shrink-0">
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="min-h-11 min-w-11 px-3 md:min-h-8 md:min-w-0"
            >
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}

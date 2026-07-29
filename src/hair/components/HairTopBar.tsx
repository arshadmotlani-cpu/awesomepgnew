import Link from 'next/link';
import { logoutAction } from '@/src/hair/actions/auth';
import { ThemeToggle } from '@/src/hair/components/ThemeToggle';
import { HairGlobalSearch } from '@/src/hair/components/HairGlobalSearch';
import { HairNewRecordMenu } from '@/src/hair/components/HairNewRecordMenu';
import { HairQuickActionsMenu } from '@/src/hair/components/HairQuickActionsMenu';
import { Button } from '@/src/hair/components/ui/button';
import type { HairAdmin } from '@/src/hair/lib/auth/session';

type HairTopBarProps = {
  admin: HairAdmin;
  title?: string;
};

export function HairTopBar({ admin, title }: HairTopBarProps) {
  return (
    <header className="flex h-16 items-center gap-3 border-b border-[color:var(--fyh-border)] bg-fyh-elevated/50 px-4 backdrop-blur-xl md:gap-4 md:px-6">
      <div className="hidden min-w-0 shrink-0 lg:block lg:max-w-[12rem]">
        <p className="truncate text-sm font-medium text-fyh-text">
          {title ?? 'For Your Hair ERP'}
        </p>
        <p className="truncate text-xs text-fyh-text-muted">Luxury Forest · Premium Salon OS</p>
      </div>
      <HairQuickActionsMenu />
      <HairGlobalSearch />
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <HairNewRecordMenu />
        <ThemeToggle />
        <Link href="/profile" className="hidden text-right sm:block">
          <p className="text-sm font-medium text-fyh-text">{admin.displayName ?? 'Admin'}</p>
          <p className="text-xs text-fyh-text-muted">{admin.email}</p>
        </Link>
        <form action={logoutAction}>
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </header>
  );
}

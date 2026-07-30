import { HairAppHeader } from '@/src/hair/components/HairAppHeader';
import { HairSidebar } from '@/src/hair/components/HairSidebar';
import { requireHairAuthPage } from '@/src/hair/lib/auth/guards';
import { requirePagePermissionForPath } from '@/src/hair/lib/auth/permissions';
import { filterNavByPermissions, visibleHairNavEntries } from '@/src/hair/lib/nav';
import { headers } from 'next/headers';

export default async function HairAppLayout({ children }: { children: React.ReactNode }) {
  const hdrs = await headers();
  const pathname = hdrs.get('x-hair-pathname') ?? hdrs.get('x-invoke-path') ?? '';
  const admin = pathname
    ? await requirePagePermissionForPath(pathname)
    : await requireHairAuthPage();
  const navEntries = filterNavByPermissions(admin, visibleHairNavEntries());

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <HairSidebar entries={navEntries} />
      <div className="flex min-w-0 flex-1 flex-col">
        <HairAppHeader admin={admin} />
        <main className="relative z-0 flex-1 overflow-auto p-3 md:p-6">{children}</main>
      </div>
    </div>
  );
}

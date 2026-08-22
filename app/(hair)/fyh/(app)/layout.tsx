import { HairAppHeader } from '@/src/hair/components/HairAppHeader';
import { HairSidebar } from '@/src/hair/components/HairSidebar';
import { HairTenantContextBar } from '@/src/hair/components/HairTenantContextBar';
import { requireHairAuthPage } from '@/src/hair/lib/auth/guards';
import { requirePagePermissionForPath } from '@/src/hair/lib/auth/permissions';
import { canViewTeamManagement } from '@/src/hair/lib/auth/teamManagementAccess';
import { filterNavByPermissions, visibleHairNavEntries, type HairNavEntry } from '@/src/hair/lib/nav';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { isHairTenantExemptPath } from '@/src/hair/lib/host';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';
import { ensureSalonOwnerProvider } from '@/src/workforce/services/systemOwnerProvider';
import { headers } from 'next/headers';

export default async function HairAppLayout({ children }: { children: React.ReactNode }) {
  const hdrs = await headers();
  const pathname = hdrs.get('x-hair-pathname') ?? hdrs.get('x-invoke-path') ?? '';
  if (isHairTenantExemptPath(pathname)) {
    return children;
  }

  const admin = pathname
    ? await requirePagePermissionForPath(pathname)
    : await requireHairAuthPage();
  void getTenantContextForPage();
  let navEntries = filterNavByPermissions(admin, visibleHairNavEntries());
  if (isFyhSaasTenantEnabled() && (await canViewTeamManagement())) {
    const teamEntry: HairNavEntry = {
      type: 'link',
      href: '/team',
      label: 'Team',
      iconKey: 'users',
      permission: 'page:dashboard',
    };
    const staffIndex = navEntries.findIndex(
      (entry) => entry.type === 'link' && entry.href === '/staff',
    );
    if (staffIndex >= 0) {
      navEntries = [
        ...navEntries.slice(0, staffIndex + 1),
        teamEntry,
        ...navEntries.slice(staffIndex + 1),
      ];
    } else {
      navEntries = [...navEntries, teamEntry];
    }
  }

  if (isWorkforceEngineEnabled()) {
    void ensureSalonOwnerProvider('fyh_salon').catch(() => {
      /* best-effort bootstrap */
    });
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <HairSidebar entries={navEntries} />
      <div className="flex min-w-0 flex-1 flex-col">
        <HairAppHeader admin={admin} navEntries={navEntries} />
        <HairTenantContextBar />
        <main className="relative z-0 flex-1 overflow-auto p-[var(--fyh-space-page)] md:p-[var(--fyh-space-page-md)]">
          {children}
        </main>
      </div>
    </div>
  );
}

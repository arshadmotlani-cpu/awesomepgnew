import { HairAppHeader } from '@/src/hair/components/HairAppHeader';
import { HairSidebar } from '@/src/hair/components/HairSidebar';
import { HairTenantContextBar } from '@/src/hair/components/HairTenantContextBar';
import { requireHairAuthPage } from '@/src/hair/lib/auth/guards';
import { requirePagePermissionForPath } from '@/src/hair/lib/auth/permissions';
import { canViewTeamManagement } from '@/src/hair/lib/auth/teamManagementAccess';
import { filterNavByPermissions, resolveNavEntries, visibleHairNavEntries, type HairNavEntry } from '@/src/hair/lib/nav';
import { isFyhSaasTenantEnabled } from '@/src/hair/lib/tenant/flags';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { isHairTenantExemptPath } from '@/src/hair/lib/host';
import { getHairSession } from '@/src/hair/lib/auth/session';
import {
  getOrganizationSubscriptionStatus,
  isOrganizationSubscriptionLocked,
  isSubscriptionGracePeriod,
} from '@/src/platform/services/memberships';
import { redirect } from 'next/navigation';
import { isWorkforceEngineEnabled } from '@/src/workforce/types';
import { sessionHasPermission } from '@/src/workforce/permissions/guards';
import { listStaff } from '@/src/hair/services/staff';
import { ensureSalonOwnerProvider } from '@/src/workforce/services/systemOwnerProvider';
import { headers } from 'next/headers';

export default async function HairAppLayout({ children }: { children: React.ReactNode }) {
  const hdrs = await headers();
  const pathname = hdrs.get('x-hair-pathname') ?? hdrs.get('x-invoke-path') ?? '';
  if (isHairTenantExemptPath(pathname)) {
    return children;
  }

  if (isFyhSaasTenantEnabled()) {
    const session = await getHairSession();
    if (session?.organizationId) {
      if (await isOrganizationSubscriptionLocked(session.organizationId)) {
        redirect('/subscribe');
      }
    }
  }

  const admin = pathname
    ? await requirePagePermissionForPath(pathname)
    : await requireHairAuthPage();
  void getTenantContextForPage();
  let navEntries = resolveNavEntries(admin, visibleHairNavEntries());
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

  const canAddGeneralExpense = isWorkforceEngineEnabled()
    ? await sessionHasPermission('expenses.general.add')
    : false;
  const expenseQuickActionStaff =
    canAddGeneralExpense
      ? (await listStaff(false, await getTenantContextForPage())).map((s) => ({
          id: s.id,
          name: s.fullName,
        }))
      : [];

  return (
    <div className="fyh-app-shell flex min-w-0 flex-col lg:h-dvh lg:max-h-dvh lg:flex-row lg:overflow-hidden">
      <HairSidebar entries={navEntries} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:overflow-hidden">
        <HairAppHeader
          admin={admin}
          navEntries={navEntries}
          canAddGeneralExpense={canAddGeneralExpense}
          expenseQuickActionStaff={expenseQuickActionStaff}
        />
        <HairTenantContextBar />
        <main className="relative z-0 min-h-0 min-w-0 flex-1 overflow-x-clip overflow-y-auto p-[var(--fyh-space-page)] md:p-[var(--fyh-space-page-md)]">
          <PastDueBillingBanner />
          {children}
        </main>
      </div>
    </div>
  );
}


async function PastDueBillingBanner() {
  if (!isFyhSaasTenantEnabled()) return null;
  const session = await getHairSession();
  if (!session?.organizationId) return null;
  const status = await getOrganizationSubscriptionStatus(session.organizationId);
  if (!isSubscriptionGracePeriod(status)) return null;
  return (
    <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
      Billing past due — update payment on{' '}
      <a href="/subscribe" className="underline">
        Subscribe
      </a>
      .
    </div>
  );
}

import { StaffPerformanceCommandCenter } from '@/src/hair/components/dashboard/StaffPerformanceCommandCenter';
import { listTenantLocationOptions } from '@/src/hair/actions/tenant';
import { parseStaffPerformanceSearchParams } from '@/src/hair/lib/staffPerformancePeriod';
import { getStaffPerformanceCommandCenter } from '@/src/hair/services/staffPerformanceDashboard';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { getHairSession } from '@/src/hair/lib/auth/session';
import { resolveEffectiveGrantsForEmployee } from '@/src/workforce/brains/employeeBrain';
import { permissionSatisfied } from '@/src/workforce/permissions/aliases';
import { requireFyhPermission } from '@/src/workforce/permissions/guards';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function StaffPerformanceDashboardPage({ searchParams }: Props) {
  await requireFyhPermission({ permission: 'dashboard.revenue.personal', scope: 'org' });
  const session = await getHairSession();
  const grants =
    session?.workforceEmployeeId != null
      ? await resolveEffectiveGrantsForEmployee(session.workforceEmployeeId, 'fyh_salon')
      : null;
  const canSalonRevenue =
    session?.admin.role === 'super_admin' ||
    permissionSatisfied(grants?.permissions ?? [], 'dashboard.revenue.salon') ||
    permissionSatisfied(grants?.permissions ?? [], 'dashboard.full');
  const personalScopeStaffId =
    !canSalonRevenue && session?.workforceEmployeeId ? session.workforceEmployeeId : null;

  const sp = await searchParams;
  const parsed = parseStaffPerformanceSearchParams({
    period: first(sp.period),
    from: first(sp.from),
    to: first(sp.to),
    staff: first(sp.staff),
    category: first(sp.category),
    locations: first(sp.locations),
    compare: first(sp.compare),
  });

  const ctx = await getTenantContextForPage();
  const [data, locationOptions] = await Promise.all([
    getStaffPerformanceCommandCenter(
      {
        period: parsed.preset,
        from: parsed.from,
        to: parsed.to,
        staffIds: parsed.staffIds,
        category: parsed.category,
        locationIds: parsed.locationIds,
        comparisonMode: parsed.comparisonMode,
        personalScopeStaffId,
      },
      ctx,
    ),
    listTenantLocationOptions(),
  ]);

  return <StaffPerformanceCommandCenter data={data} locationOptions={locationOptions} />;
}

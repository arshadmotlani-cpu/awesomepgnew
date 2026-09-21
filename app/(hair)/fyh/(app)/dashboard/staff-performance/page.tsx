import { requirePermissionPage } from '@/src/hair/lib/auth/permissions';
import { StaffPerformanceCommandCenter } from '@/src/hair/components/dashboard/StaffPerformanceCommandCenter';
import { listTenantLocationOptions } from '@/src/hair/actions/tenant';
import { parseStaffPerformanceSearchParams } from '@/src/hair/lib/staffPerformancePeriod';
import { getStaffPerformanceCommandCenter } from '@/src/hair/services/staffPerformanceDashboard';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function StaffPerformanceDashboardPage({ searchParams }: Props) {
  await requirePermissionPage('page:dashboard_staff');
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
      },
      ctx,
    ),
    listTenantLocationOptions(),
  ]);

  return <StaffPerformanceCommandCenter data={data} locationOptions={locationOptions} />;
}

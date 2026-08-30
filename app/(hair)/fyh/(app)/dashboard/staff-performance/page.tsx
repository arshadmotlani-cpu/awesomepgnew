import { Suspense } from 'react';
import { requirePermissionPage } from '@/src/hair/lib/auth/permissions';
import { StaffPerformanceCommandCenter } from '@/src/hair/components/dashboard/StaffPerformanceCommandCenter';
import { parseStaffPerformanceSearchParams } from '@/src/hair/lib/staffPerformancePeriod';
import { getStaffPerformanceCommandCenter } from '@/src/hair/services/staffPerformanceDashboard';

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
  });

  const data = await getStaffPerformanceCommandCenter({
    period: parsed.preset,
    from: parsed.from,
    to: parsed.to,
    staffIds: parsed.staffIds,
    category: parsed.category,
  });

  return (
    <Suspense
      fallback={<div className="p-6 text-sm text-fyh-text-muted">Loading staff performance…</div>}
    >
      <StaffPerformanceCommandCenter data={data} />
    </Suspense>
  );
}

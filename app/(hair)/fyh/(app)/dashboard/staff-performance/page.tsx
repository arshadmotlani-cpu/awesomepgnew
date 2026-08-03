import { Suspense } from 'react';
import { StaffPerformanceDashboard } from '@/src/hair/components/dashboard/StaffPerformanceDashboard';
import { getStaffPerformanceDashboardSnapshot } from '@/src/hair/services/staffPerformanceDashboard';

export default async function StaffPerformanceDashboardPage() {
  const data = await getStaffPerformanceDashboardSnapshot();
  return (
    <Suspense fallback={<div className="p-6 text-sm text-fyh-text-muted">Loading staff performance…</div>}>
      <StaffPerformanceDashboard data={data} />
    </Suspense>
  );
}

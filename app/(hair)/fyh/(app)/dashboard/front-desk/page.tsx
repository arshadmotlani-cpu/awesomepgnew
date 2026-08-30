import { Suspense } from 'react';
import { FrontDeskDashboard } from '@/src/hair/components/dashboard/FrontDeskDashboard';
import { requirePermissionPage } from '@/src/hair/lib/auth/permissions';
import { getDashboardSnapshot } from '@/src/hair/services/dashboard';

export default async function FrontDeskDashboardPage() {
  await requirePermissionPage('page:dashboard');
  const data = await getDashboardSnapshot();

  return (
    <Suspense fallback={<div className="p-6 text-sm text-fyh-text-muted">Loading dashboard…</div>}>
      <FrontDeskDashboard data={data} />
    </Suspense>
  );
}

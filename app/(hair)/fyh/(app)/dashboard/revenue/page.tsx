import { requirePermissionPage } from '@/src/hair/lib/auth/permissions';
import { RevenueDashboard } from '@/src/hair/components/dashboard/RevenueDashboard';
import { getRevenueDashboardSnapshot } from '@/src/hair/services/revenueDashboard';

export default async function RevenueDashboardPage() {
  await requirePermissionPage('page:dashboard_revenue');
  const data = await getRevenueDashboardSnapshot();
  return <RevenueDashboard data={data} />;
}

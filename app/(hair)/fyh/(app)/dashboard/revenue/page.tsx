import { requirePermissionPage } from '@/src/hair/lib/auth/permissions';
import { RevenueDashboard } from '@/src/hair/components/dashboard/RevenueDashboard';
import { getTenantContextForPage } from '@/src/hair/lib/tenant/getTenantContext';
import { getRevenueDashboardSnapshot } from '@/src/hair/services/revenueDashboard';

export default async function RevenueDashboardPage() {
  await requirePermissionPage('page:dashboard_revenue');
  const ctx = await getTenantContextForPage();
  const data = await getRevenueDashboardSnapshot(ctx);
  return <RevenueDashboard data={data} />;
}

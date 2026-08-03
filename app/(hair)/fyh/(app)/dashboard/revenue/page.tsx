import { Suspense } from 'react';
import { RevenueDashboard } from '@/src/hair/components/dashboard/RevenueDashboard';
import { getRevenueDashboardSnapshot } from '@/src/hair/services/revenueDashboard';

export default async function RevenueDashboardPage() {
  const data = await getRevenueDashboardSnapshot();
  return (
    <Suspense fallback={<div className="p-6 text-sm text-fyh-text-muted">Loading revenue dashboard…</div>}>
      <RevenueDashboard data={data} />
    </Suspense>
  );
}

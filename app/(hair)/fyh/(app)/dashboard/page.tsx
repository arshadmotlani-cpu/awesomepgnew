import { SalonDashboard } from '@/src/hair/components/dashboard/SalonDashboard';
import { getDashboardSnapshot } from '@/src/hair/services/dashboard';

export default async function HairDashboardPage() {
  const snapshot = await getDashboardSnapshot();
  return <SalonDashboard snapshot={snapshot} />;
}

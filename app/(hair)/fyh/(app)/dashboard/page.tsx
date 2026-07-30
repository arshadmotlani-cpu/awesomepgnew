import { SalonDashboard } from '@/src/hair/components/dashboard/SalonDashboard';
import { getDashboardSnapshot } from '@/src/hair/services/dashboard';
import {
  getDailyClosingSnapshot,
  getFinancialDashboardSnapshot,
} from '@/src/hair/services/financialDashboard';

export default async function HairDashboardPage() {
  const [snapshot, financial, dailyClosing] = await Promise.all([
    getDashboardSnapshot(),
    getFinancialDashboardSnapshot(),
    getDailyClosingSnapshot(),
  ]);
  return (
    <SalonDashboard snapshot={snapshot} financial={financial} dailyClosing={dailyClosing} />
  );
}

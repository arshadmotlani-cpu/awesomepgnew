import { getOwnerOsSnapshot } from '@/src/owner/brains/ownerBrain';
import {
  OwnerDomainMetrics,
  pickFinanceMetrics,
} from '@/src/owner/components/OwnerDomainMetrics';

export default async function OwnerCashflowPage() {
  const snapshot = await getOwnerOsSnapshot().catch(() => null);
  if (!snapshot) {
    return <p className="text-sm text-[color:var(--oo-muted)]">Cashflow unavailable.</p>;
  }
  const metrics = pickFinanceMetrics(snapshot.finance, [
    'cashflow',
    'business_profit',
    'business_revenue',
    'business_expenses',
  ]);
  return (
    <OwnerDomainMetrics
      title="Cashflow"
      description="Inflows and outflows from connected Engine APIs."
      metrics={metrics}
    />
  );
}

import { getOwnerOsSnapshot } from '@/src/owner/brains/ownerBrain';
import {
  OwnerDomainMetrics,
  pickFinanceMetrics,
} from '@/src/owner/components/OwnerDomainMetrics';

export default async function OwnerWealthPage() {
  const snapshot = await getOwnerOsSnapshot().catch(() => null);
  if (!snapshot) {
    return <p className="text-sm text-[color:var(--oo-muted)]">Wealth metrics unavailable.</p>;
  }
  const metrics = pickFinanceMetrics(snapshot.finance, [
    'financial_independence_pct',
    'passive_income',
    'recurring_income',
  ]);
  return (
    <OwnerDomainMetrics
      title="Wealth"
      description="FI ratio and income mix from connected engines."
      metrics={metrics}
    />
  );
}

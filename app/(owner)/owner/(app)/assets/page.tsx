import { getOwnerOsSnapshot } from '@/src/owner/brains/ownerBrain';
import {
  OwnerDomainMetrics,
  pickFinanceMetrics,
} from '@/src/owner/components/OwnerDomainMetrics';

export default async function OwnerAssetsPage() {
  const snapshot = await getOwnerOsSnapshot().catch(() => null);
  if (!snapshot) {
    return <p className="text-sm text-[color:var(--oo-muted)]">Assets unavailable.</p>;
  }
  const metrics = pickFinanceMetrics(snapshot.finance, [
    'assets',
    'investment_value',
    'vehicle_portfolio',
  ]);
  return (
    <OwnerDomainMetrics
      title="Assets"
      description="Connected asset positions only."
      metrics={metrics}
      connectLaterNote="Bank balance and property value connect when Bank and Real Estate Engines ship."
    />
  );
}

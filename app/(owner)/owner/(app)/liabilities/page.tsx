import { getOwnerOsSnapshot } from '@/src/owner/brains/ownerBrain';
import {
  OwnerDomainMetrics,
  pickFinanceMetrics,
} from '@/src/owner/components/OwnerDomainMetrics';

export default async function OwnerLiabilitiesPage() {
  const snapshot = await getOwnerOsSnapshot().catch(() => null);
  if (!snapshot) {
    return <p className="text-sm text-[color:var(--oo-muted)]">Liabilities unavailable.</p>;
  }
  const metrics = pickFinanceMetrics(snapshot.finance, ['liabilities']);
  return (
    <OwnerDomainMetrics
      title="Liabilities"
      description="Payroll and connected obligations."
      metrics={metrics}
      connectLaterNote="Loans, EMIs, and insurance connect when Liability and Insurance Engines ship."
    />
  );
}

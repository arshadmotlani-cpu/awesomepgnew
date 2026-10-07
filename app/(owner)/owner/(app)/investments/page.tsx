import { getInvestmentSlice } from '@/src/owner/brains/investmentBrain';
import { OwnerDomainMetrics } from '@/src/owner/components/OwnerDomainMetrics';

export default async function OwnerInvestmentsPage() {
  const slice = await getInvestmentSlice().catch(() => null);
  if (!slice) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 p-5 text-sm text-[color:var(--oo-muted)]">
        No investment engines are connected yet. Add movable assets or other investments in Owner
        wealth settings when available.
      </div>
    );
  }
  return (
    <OwnerDomainMetrics
      title="Investments"
      description="Owner investment metrics from Personal Finance Brain."
      metrics={[slice.investmentValue, slice.vehiclePortfolio, slice.roiPct]}
    />
  );
}

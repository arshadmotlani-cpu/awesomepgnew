import { getInvestmentSlice } from '@/src/owner/brains/investmentBrain';
import { OwnerDomainMetrics } from '@/src/owner/components/OwnerDomainMetrics';

export default async function OwnerInvestmentsPage() {
  const slice = await getInvestmentSlice().catch(() => null);
  if (!slice) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 p-5 text-sm text-[color:var(--oo-muted)]">
        Investment Brain awaits Capital Engine inputs.
      </div>
    );
  }
  return (
    <OwnerDomainMetrics
      title="Investments"
      description="Vehicle portfolio via Capital Engine public KPIs."
      metrics={[slice.investmentValue, slice.vehiclePortfolio, slice.roiPct]}
    />
  );
}

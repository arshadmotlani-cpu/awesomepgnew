import { ExplainableMetricCard } from '@/src/owner/components/ExplainableMetricCard';
import { getOwnerOsSnapshot } from '@/src/owner/brains/ownerBrain';
import { NetWorthBreakdown } from '@/src/owner/components/NetWorthBreakdown';

export default async function OwnerNetWorthPage() {
  const snapshot = await getOwnerOsSnapshot().catch(() => null);

  if (!snapshot) {
    return (
      <div className="rounded-xl border border-white/10 p-5 text-sm text-[color:var(--oo-muted)]">
        Net Worth view unavailable — Engines offline or snapshot failed.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-[#FF5A1F]">Net Worth</p>
        <h1 className="text-lg font-semibold text-white">Assets − liabilities</h1>
        <p className="mt-1 text-sm text-[color:var(--oo-muted)]">
          Focused breakdown from Personal Finance Brain · as of{' '}
          {new Date(snapshot.asOf).toLocaleString('en-IN')}
        </p>
      </header>
      <NetWorthBreakdown snapshot={snapshot} />
    </div>
  );
}
